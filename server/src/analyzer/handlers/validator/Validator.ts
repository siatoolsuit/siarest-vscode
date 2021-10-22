import { JSONSchema, DiagnosticSeverity, LanguageService, getLanguageService } from 'vscode-json-languageservice';
import { InitializeParams, Diagnostic, CompletionItem, CancellationToken, CompletionParams, Hover, HoverParams } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Analyzer, SemanticError } from '../..';
import { connection, documents } from '../../../server';
import { ConfigValidator } from '../../config';
import { TYPE_TYPESCRIPT, TYPE_JSON, SIARC, PACKAGE_JSON } from '../../utils';
import { getOrCreateTempFile, IFile } from '../file/FileHandler';
import * as siaSchema from '../../config/config.schema.json';
import { AutoCompletionService as AutoCompletionService } from '../endpoint/autocompletion/autoCompletionService';
import { HoverInfoService as HoverInfoService } from '../endpoint/hoverInfo/hoverInfoService';
import { existsSync } from 'fs';
import { createDiagnostic, sendNotification } from '../../utils/helper';

const pendingValidations: { [uri: string]: NodeJS.Timer } = {};
const validationDelay = 300;

export class Validator {
  jsonLanguageService: LanguageService;
  configValidator: ConfigValidator;
  analyzer: Analyzer;
  autoCompletionService: AutoCompletionService;
  hoverInfoService: HoverInfoService;

  constructor(params: InitializeParams) {
    this.jsonLanguageService = getLanguageService({
      clientCapabilities: params.capabilities,
    });
    this.analyzer = new Analyzer();
    this.configValidator = new ConfigValidator();

    // Load package.json and .siarc.json, if they exists
    if (params.initializationOptions) {
      if (params.initializationOptions.list) {
        params.initializationOptions.list.forEach((obj: any) => {
          console.debug(obj);

          if (obj.siarcTextDoc) {
            const siarc = obj.siarcTextDoc;
            if (existsSync(siarc.uri)) {
              const textDoc = TextDocument.create(siarc.uri, siarc.languageId, siarc.version, siarc.content);
              this.validateConfig(textDoc);
            } else {
              sendNotification(connection, 'Could not find ' + siarc.uri);
            }
          }

          if (obj.packageJson) {
            this.loadPackageJson(obj.packageJson);
          }
        });
      }
    }

    this.autoCompletionService = new AutoCompletionService(
      this.analyzer.staticEndpointAnalyzerHandler.serviceName,
      this.analyzer.staticEndpointAnalyzerHandler.config,
    );

    this.hoverInfoService = new HoverInfoService(
      this.analyzer.staticEndpointAnalyzerHandler.serviceName,
      this.analyzer.staticEndpointAnalyzerHandler.config,
    );
  }

  public async validate(document: TextDocument) {
    if (this.allowValidation()) {
      this.checkForValidation(document);
    }
  }

  public generateCompletionItems() {
    if (this.allowValidation()) {
      this.autoCompletionService.generateCompletionItems();
    }
  }

  public getCompletionItems(params: CompletionParams, token: CancellationToken): CompletionItem[] {
    if (params.textDocument.uri.endsWith(TYPE_TYPESCRIPT.SUFFIX)) {
      if (this.allowValidation()) {
        return this.autoCompletionService.provideCompletionItems(params, token);
      }
    }
    return [];
  }

  public getHover(hoverParams: HoverParams): Hover | undefined {
    if (hoverParams.textDocument.uri.endsWith(TYPE_TYPESCRIPT.SUFFIX)) {
      if (this.allowValidation()) {
        if (hoverParams.textDocument.uri.endsWith(TYPE_TYPESCRIPT.SUFFIX)) {
          return this.hoverInfoService.getInfo(hoverParams, this.analyzer.getEndPointsForFileName(hoverParams.textDocument.uri));
        }
      }
    }
    return undefined;
  }

  protected async checkForValidation(document: TextDocument): Promise<void> {
    switch (document.languageId) {
      case TYPE_TYPESCRIPT.LANGUAGE_ID: {
        getOrCreateTempFile(document)
          .then((file) => {
            this.triggerTypescriptValidation(document, file);
          })
          .catch((reason) => {
            sendNotification(connection, reason);
            return;
          });
        break;
      }
      case TYPE_JSON.LANGUAGE_ID: {
        this.validateJson(document);
        break;
      }
      default: {
        return;
      }
    }
  }

  public cleanPendingValidations(uri: string): void {
    const request = pendingValidations[uri];
    if (request) {
      clearTimeout(request);
      delete pendingValidations[uri];
    }
  }

  private triggerConfValidation(document: TextDocument): void {
    this.cleanPendingValidations(document.uri);
    pendingValidations[document.uri] = setTimeout(async () => {
      delete pendingValidations[document.uri];
      await this.validateConfig(document);
    }, validationDelay);
  }

  private triggerTypescriptValidation(document: TextDocument, file: IFile): void {
    this.cleanPendingValidations(file.fileUri);
    pendingValidations[file.fileUri] = setTimeout(() => {
      delete pendingValidations[file.fileUri];
      this.validateTypescript(document, file);
    }, validationDelay);
  }

  private validateJson(document: TextDocument) {
    if (document.uri.endsWith(SIARC)) {
      this.triggerConfValidation(document);
    } else if (document.uri.endsWith(PACKAGE_JSON)) {
      this.loadPackageJson(document.getText());
      // Revalidate all typescript files
      documents.all().forEach((doc: TextDocument) => {
        this.checkForValidation(doc);
      });
    }
  }

  public async validateConfig(document: TextDocument): Promise<void> {
    const jsonDoc = this.jsonLanguageService.parseJSONDocument(document);

    const syntaxErrors = await this.jsonLanguageService.doValidation(
      document,
      jsonDoc,
      { schemaValidation: 'error', trailingCommas: 'error' },
      siaSchema as JSONSchema,
    );
    const semanticErrors = this.configValidator.validateConfigSemantic(document, jsonDoc);

    if (syntaxErrors.length === 0 && semanticErrors.length === 0) {
      this.analyzer.config = document.getText();
      connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
      documents.all().forEach(async (doc: TextDocument) => {
        if (doc.languageId === TYPE_TYPESCRIPT.LANGUAGE_ID) {
          this.checkForValidation(doc);
        }
      });
    } else {
      connection.sendDiagnostics({ uri: document.uri, diagnostics: semanticErrors });
    }

    this.autoCompletionService = new AutoCompletionService(
      this.analyzer.staticEndpointAnalyzerHandler.serviceName,
      this.analyzer.staticEndpointAnalyzerHandler.config,
    );

    this.hoverInfoService = new HoverInfoService(
      this.analyzer.staticEndpointAnalyzerHandler.serviceName,
      this.analyzer.staticEndpointAnalyzerHandler.config,
    );
  }

  public validateTypescript(document: TextDocument, file: IFile): void {
    const diagnostics: Diagnostic[] = [];

    const version = document.version;
    this.analyzer.analyzeEndpoints(file).forEach((error: SemanticError) => {
      diagnostics.push(createDiagnostic(document, error.message, error.position.start, error.position.end, DiagnosticSeverity.Error));
    });

    setImmediate(() => {
      // To be clear to send the correct diagnostics to the current document
      const currDoc = documents.get(document.uri);
      if (currDoc && currDoc.version === version) {
        connection.sendDiagnostics({ uri: document.uri, diagnostics, version: currDoc.version });
      }
    });
  }

  public loadPackageJson(json: string) {
    if (json) {
      const pack = JSON.parse(json);
      if (pack.name) {
        this.analyzer.currentService = pack.name;
      }
      this.analyzer.detectFrameworkOrLibrary(pack);
    }
  }

  private allowValidation(): boolean {
    if (this.jsonLanguageService && this.analyzer && this.analyzer.staticEndpointAnalyzerHandler) {
      return true;
    }
    return false;
  }
}

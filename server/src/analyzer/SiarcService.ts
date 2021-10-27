import { existsSync } from 'fs';
import { Diagnostic, DiagnosticSeverity, getLanguageService, JSONSchema, LanguageService } from 'vscode-json-languageservice';
import { CancellationToken } from 'vscode-jsonrpc';
import { CompletionItem, CompletionParams, Hover, HoverParams, InitializeParams } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { EndpointExpression } from '.';
import { ServiceConfig, validateConfigSemantic } from './config';
import { StaticExpressAnalyzer } from './handlers';
import { AutoCompletionService } from './handlers/endpoint/autocompletion/AutoCompletionService';
import { HoverInfoService } from './handlers/endpoint/hoverInfo/HoverInfoService';
import { getOrCreateTempFile, IFile } from './handlers/file';
import { SemanticError } from './types';
import * as siaSchema from './config/config.schema.json';
import { connection, documents } from '../server';
import { TYPE_TYPESCRIPT } from './utils';
import { createDiagnostic, sendNotification } from './utils/helper';
import { pendingValidations, validationDelay } from './handlers/siarcController';

export class SiarcService {
  private validConfig: ServiceConfig[] = [];

  private currentServiceName!: string;
  public staticExpressAnalyzer!: StaticExpressAnalyzer;

  private avaibaleEndpoints: Map<string, EndpointExpression[]> = new Map();

  private autoCompletionService: AutoCompletionService;
  private hoverInfoService: HoverInfoService;
  private jsonLanguageService: LanguageService;

  constructor(params: InitializeParams) {
    this.jsonLanguageService = getLanguageService({ clientCapabilities: params.capabilities });
    const initOptions = params.initializationOptions;
    // TODO
    if (initOptions) {
      if (initOptions.projects) {
        initOptions.projects.forEach((obj: any) => {
          console.debug('Project: ' + obj);
          if (obj.siarcTextDoc) {
            const siarc = obj.siarcTextDoc;
            if (existsSync(siarc.uri)) {
              const textDoc = TextDocument.create(siarc.uri, siarc.languageId, siarc.version, siarc.content);
              this.validateConfig(textDoc);
              console.debug('Found and loaded siarc');
            }
          }

          if (obj.packageJson) {
            this.loadPackageJson(obj.packageJson);
            console.debug('Found and loaded package.json');
          }
        });
      }
    }

    this.autoCompletionService = new AutoCompletionService('');
    this.hoverInfoService = new HoverInfoService('');
  }

  public init() {
    //TODO
    this.autoCompletionService = new AutoCompletionService('');
    this.hoverInfoService = new HoverInfoService('');
  }

  /**
   * Setter config
   * @param text as string (siarc.json)
   */
  set config(text: string) {
    this.validConfig = JSON.parse(text);
    // Load the config to all analyzer handler
    if (this.staticExpressAnalyzer) {
      let found = false;
      for (const config of this.validConfig) {
        if (config.name === this.staticExpressAnalyzer.serviceName) {
          this.staticExpressAnalyzer.config = config;
          found = true;
          break;
        }
      }
      // There is no configuration with the given service name
      if (!found) {
        this.staticExpressAnalyzer.config = undefined;
      }
    }
  }

  set currentService(name: string) {
    this.currentServiceName = name;
  }

  private getEndPointsForFileName(fileName: string): EndpointExpression[] | undefined {
    fileName = fileName.substring(fileName.lastIndexOf('/') + 1, fileName.length);
    return this.avaibaleEndpoints.get(fileName);
  }

  public getInfo(hoverParams: HoverParams): Hover | undefined {
    return this.hoverInfoService.getInfo(hoverParams, this.getEndPointsForFileName(hoverParams.textDocument.uri));
  }

  public provideCompletionItems(params: CompletionParams, token: CancellationToken): CompletionItem[] {
    return this.autoCompletionService.provideCompletionItems(params, token);
  }

  public generateCompletionItems() {
    // TODO
    throw new Error('Method not implemented.');
  }

  /**
   *
   * @param file Typescript file
   * @returns List of SemanticErrors
   */
  public analyzeEndpoints(file: IFile): SemanticError[] {
    if (this.staticExpressAnalyzer && file.tempFileUri) {
      const results = this.staticExpressAnalyzer.analyze(file.tempFileUri);

      if (results.endPointsAvaiable) {
        this.avaibaleEndpoints.set(file.tempFileName, results.endPointsAvaiable);
      }

      if (results.semanticErrors) {
        return results.semanticErrors;
      } else {
        return [];
      }
    } else {
      return [];
    }
  }

  public cleanPendingValidations(uri: string): void {
    const request = pendingValidations[uri];
    if (request) {
      clearTimeout(request);
      delete pendingValidations[uri];
    }
  }

  public triggerConfValidation(document: TextDocument): void {
    this.cleanPendingValidations(document.uri);
    pendingValidations[document.uri] = setTimeout(async () => {
      delete pendingValidations[document.uri];
      await this.validateConfig(document);
    }, validationDelay);
  }

  public triggerTypescriptValidation(document: TextDocument, file: IFile): void {
    this.cleanPendingValidations(file.fileUri);
    pendingValidations[file.fileUri] = setTimeout(() => {
      delete pendingValidations[file.fileUri];
      this.validateTypescript(document, file);
    }, validationDelay);
  }

  public validateTypescript(document: TextDocument, file: IFile): void {
    const diagnostics: Diagnostic[] = [];

    const version = document.version;
    this.analyzeEndpoints(file).forEach((error: SemanticError) => {
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

  public async validateConfig(document: TextDocument): Promise<void> {
    const jsonDoc = this.jsonLanguageService.parseJSONDocument(document);

    const syntaxErrors = await this.jsonLanguageService.doValidation(
      document,
      jsonDoc,
      { schemaValidation: 'error', trailingCommas: 'error' },
      siaSchema as JSONSchema,
    );
    const semanticErrors = validateConfigSemantic(document, jsonDoc);

    if (syntaxErrors.length === 0 && semanticErrors.length === 0) {
      this.config = document.getText();
      connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
      documents.all().forEach(async (doc: TextDocument) => {
        if (doc.languageId === TYPE_TYPESCRIPT.LANGUAGE_ID) {
          getOrCreateTempFile(document)
            .then((file) => {
              this.triggerTypescriptValidation(document, file);
            })
            .catch((reason) => {
              sendNotification(connection, reason);
              return;
            });
        }
      });
    } else {
      connection.sendDiagnostics({ uri: document.uri, diagnostics: semanticErrors });
    }

    this.init();
  }

  public loadPackageJson(json: string) {
    if (json) {
      const pack = JSON.parse(json);
      if (pack.name) {
        this.currentService = pack.name;
        console.log('Currently used backend: ' + this.currentServiceName);
      }
      this.detectFrameworkOrLibrary(pack);
    }
  }

  /**
   * detectFrameworkOrLibrary
   * @param packJ packageJson
   */
  public detectFrameworkOrLibrary(packJ: any): void {
    // Extract the list of all compile time dependencies and look for supported frameworks and libraries
    const deps = packJ.dependencies;
    for (const dep of Object.keys(deps)) {
      if (dep.includes('express')) {
        // Try to extract the configuration for this service by name
        let currentServiceConfig;
        currentServiceConfig = this.validConfig.find((config) => {
          config.name === this.currentServiceName;
        });

        this.staticExpressAnalyzer = new StaticExpressAnalyzer(this.currentServiceName, currentServiceConfig);
        break;
      }
    }
  }
}

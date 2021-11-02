import { existsSync } from 'fs';
import { Diagnostic, DiagnosticSeverity, getLanguageService, JSONSchema, LanguageService } from 'vscode-json-languageservice';
import { CancellationToken } from 'vscode-jsonrpc';
import { CompletionItem, CompletionParams, Hover, HoverParams, InitializeParams } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClientExpression, EndpointExpression, IResult } from '../..';
import { ServiceConfig, validateConfigSemantic } from '../../config';
import { analyze } from '../handlers';
import { AutoCompletionService } from '../handlers/endpoint/autocompletion/AutoCompletionService';
import { HoverInfoService } from '../handlers/endpoint/hoverInfo/HoverInfoService';
import { getOrCreateTempFile, IFile } from '../handlers/file';
import { IProject, SemanticError } from '../../types';
import * as siaSchema from '../../config/config.schema.json';
import { connection, documents } from '../../../server';
import { TYPE_TYPESCRIPT, VS_CODE_URI_BEGIN } from '../../utils';
import { createDiagnostic, getEndPointsForFileName, sendNotification } from '../../utils/helper';
import { pendingValidations, validationDelay } from '../controller';

export class SiarcService {
  public currentServiceName!: string;
  public currenServiceConfig: ServiceConfig | undefined = undefined;
  public currentProject: IProject | undefined = undefined;

  private validateFrontend: boolean = false;

  private projectsByProjectNames: Map<string, IProject> = new Map<string, IProject>();

  private avaibaleEndpoints: Map<string, ClientExpression[]> = new Map();

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
          const project: IProject = {
            rootPath: obj.rootPath,
            packageJson: obj.packageJson,
          };

          if (obj.siarcTextDoc) {
            project.siarcTextDoc = obj.siarcTextDoc;
          }

          console.debug('Project: ', project.rootPath);

          if (project.siarcTextDoc) {
            const siarc = project.siarcTextDoc;
            if (existsSync(siarc.uri)) {
              const textDoc = TextDocument.create(siarc.uri, siarc.languageId, siarc.version, siarc.content);
              this.validateConfig(textDoc, project);
              console.debug('Found and loaded siarc from Project: ' + project.rootPath);
            }
          }

          if (project.packageJson) {
            this.loadPackageJson(project.packageJson);
            console.debug('Found and loaded package.json from Project: ' + project.rootPath);
          }

          this.projectsByProjectNames.set(project.rootPath, project);
        });
      }
    }

    this.autoCompletionService = new AutoCompletionService(this.currentServiceName, this.currenServiceConfig);
    this.hoverInfoService = new HoverInfoService(this.currentServiceName, this.projectsByProjectNames, this.currenServiceConfig);
  }

  public init() {
    //TODO
    this.autoCompletionService = new AutoCompletionService(this.currentServiceName, this.currenServiceConfig);
    this.hoverInfoService = new HoverInfoService(this.currentServiceName, this.projectsByProjectNames, this.currenServiceConfig);
  }

  public getInfo(hoverParams: HoverParams): Hover | undefined {
    return this.hoverInfoService.getInfo(hoverParams, this.avaibaleEndpoints);
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
    if (file.tempFileUri) {
      const results = analyze(file.tempFileUri, this.currentServiceName, this.currenServiceConfig, this.validateFrontend);

      if (results.endPointsAvaiable) {
        this.avaibaleEndpoints.set(file.fileUri, results.endPointsAvaiable);
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
      await this.validateConfig(document, this.currentProject);
    }, validationDelay);
  }

  public async validateConfig(document: TextDocument, project?: IProject): Promise<void> {
    const jsonDoc = this.jsonLanguageService.parseJSONDocument(document);

    const syntaxErrors = await this.jsonLanguageService.doValidation(
      document,
      jsonDoc,
      { schemaValidation: 'error', trailingCommas: 'error' },
      siaSchema as JSONSchema,
    );
    const semanticErrors = validateConfigSemantic(document, jsonDoc);

    if (syntaxErrors.length === 0 && semanticErrors.length === 0) {
      // this.config = document.getText();
      if (project) {
        project.serviceConfig = JSON.parse(document.getText())[0];
      }

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
    const semanticErrors = this.analyzeEndpoints(file);
    semanticErrors.forEach((error: SemanticError) => {
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
        this.currentServiceName = pack.name;
        console.log('Currently using service: ' + this.currentServiceName);
      }
      this.detectFrameworkOrLibrary(pack);
    }
  }

  /**
   * detectFrameworkOrLibrary
   * @param packJ packageJson
   */
  private detectFrameworkOrLibrary(packJ: any): void {
    // Extract the list of all compile time dependencies and look for supported frameworks and libraries
    const deps = packJ.dependencies;
    for (const dep of Object.keys(deps)) {
      if (dep.includes('express')) {
        // Try to extract the configuration for this service by name
        let currentServiceConfig;
        this.projectsByProjectNames.forEach((project) => {
          if (project.serviceConfig?.name === this.currentServiceName) {
            this.currenServiceConfig = project.serviceConfig;
          }
        });

        // currentServiceConfig = this.validConfig.find((config) => {
        //   if (config.name === this.currentServiceName) return config;
        // });

        // this.currenServiceConfig = currentServiceConfig;
        this.validateFrontend = false;
        break;
      } else if (dep.includes('@angular/core')) {
        this.validateFrontend = true;
      }
    }
  }

  public setCurrentConfiguration(documentUri: string) {
    let uri = documentUri;

    if (uri.startsWith(VS_CODE_URI_BEGIN)) {
      uri = uri.substring(7);
    }

    if (this.currentProject) {
      if (uri.startsWith(this.currentProject.rootPath)) {
        // return;
      }
    }

    let foundKey: string | undefined = undefined;
    this.projectsByProjectNames.forEach((project: IProject, key: string) => {
      if (uri.startsWith(key)) {
        foundKey = key;
        console.debug('Found project! ', key, project);
      }
    });

    let foundProject: IProject | undefined = undefined;
    if (foundKey) {
      foundProject = this.projectsByProjectNames.get(foundKey);
    }

    if (foundProject) {
      this.currentProject = foundProject;
      if (foundProject.siarcTextDoc) {
        const siarc = foundProject.siarcTextDoc;
        if (existsSync(siarc.uri)) {
          const textDoc = TextDocument.create(siarc.uri, siarc.languageId, siarc.version, siarc.content);
          this.validateConfig(textDoc, this.currentProject);
          console.debug('loaded siarc for Project: ' + foundProject.rootPath);
        }
      }

      if (foundProject.packageJson) {
        this.loadPackageJson(foundProject.packageJson);
        console.debug('loaded package.json for Project: ' + foundProject.rootPath);
      }
    }
  }
}

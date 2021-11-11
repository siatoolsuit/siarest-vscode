import { existsSync } from 'fs';
import { Diagnostic, DiagnosticSeverity, getLanguageService, JSONSchema, LanguageService } from 'vscode-json-languageservice';
import { CancellationToken } from 'vscode-jsonrpc';
import { CompletionItem, CompletionParams, Hover, HoverParams, InitializeParams, ReferenceParams } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClientExpression } from '../..';
import { ServiceConfig, validateConfigSemantic } from '../../config';
import { analyze } from '../handlers';
import { AutoCompletionService } from '../handlers/endpoint/autocompletion/AutoCompletionService';
import { HoverInfoService } from '../handlers/endpoint/hoverInfo/HoverInfoService';
import { getAllFilesInProjectSync, getOrCreateTempFile, IFile } from '../handlers/file';
import { IProject, SemanticError } from '../../types';
import * as siaSchema from '../../config/config.schema.json';
import { connection, documents } from '../../../server';
import { TYPE_TYPESCRIPT, VS_CODE_URI_BEGIN } from '../../utils';
import { createDiagnostic, getProject, sendRequest } from '../../utils/helper';
import { pendingValidations, validationDelay } from '../controller';
import { CodeLocationResolver } from '../handlers/endpoint/codeLocationResolver';
import { DefinitionParams, Location, LocationLink } from 'vscode-languageserver/node';

export class SiarcService {
  private projectsByProjectNames: Map<string, IProject> = new Map<string, IProject>();

  private avaibaleEndpoints: Map<string, ClientExpression[]> = new Map();

  private autoCompletionService: AutoCompletionService;
  private hoverInfoService: HoverInfoService;
  private codeLocationResolver: CodeLocationResolver;
  private jsonLanguageService: LanguageService;

  constructor(params: InitializeParams) {
    this.jsonLanguageService = getLanguageService({ clientCapabilities: params.capabilities });
    const initOptions = params.initializationOptions;

    if (initOptions) {
      if (initOptions.projects) {
        initOptions.projects.forEach((obj: any) => {
          const project: IProject = {
            rootPath: obj.rootPath,
            packageJson: obj.packageJson,
            projectName: '',
          };

          if (obj.siarcTextDoc) {
            project.siarcTextDoc = obj.siarcTextDoc;
          }

          // console.debug('Project: ', project.rootPath);

          if (project.siarcTextDoc) {
            const siarc = project.siarcTextDoc;
            if (existsSync(siarc.uri)) {
              const textDoc = TextDocument.create(siarc.uri, siarc.languageId, siarc.version, siarc.content);
              this.validateConfig(textDoc, project, true);
              connection.console.log('Found and loaded siarc from Project: ' + project.rootPath);
            }
          }

          if (project.packageJson) {
            this.loadPackageJson(project.packageJson, project);
            connection.console.log('Found and loaded package.json from Project: ' + project.rootPath);
          }

          this.projectsByProjectNames.set(project.rootPath, project);
        });
      }
    }

    this.autoCompletionService = new AutoCompletionService();
    this.hoverInfoService = new HoverInfoService();
    this.codeLocationResolver = new CodeLocationResolver();
  }

  public getInfo(hoverParams: HoverParams): Hover | undefined {
    return this.hoverInfoService.getInfo(hoverParams, this.projectsByProjectNames, this.avaibaleEndpoints);
  }

  public provideCompletionItems(params: CompletionParams, token: CancellationToken): CompletionItem[] {
    this.generateCompletionItems();

    const serviceConfigs: ServiceConfig[] = [];
    this.projectsByProjectNames.forEach((project, key) => {
      if (project.serviceConfig) {
        serviceConfigs.push(project.serviceConfig);
      }
    });
    return this.autoCompletionService.provideCompletionItems(params, token, serviceConfigs);
  }

  public generateCompletionItems() {
    this.projectsByProjectNames.forEach((project, key) => {
      if (project.serviceConfig) {
        this.autoCompletionService.generateCompletionItems(project.serviceConfig);
      }
    });
  }

  public getDefintions(params: DefinitionParams, token: CancellationToken): LocationLink[] {
    return this.codeLocationResolver.resolve(params, token, this.projectsByProjectNames, this.avaibaleEndpoints);
  }

  public getLocations(params: ReferenceParams, token: CancellationToken): Location[] {
    return this.codeLocationResolver.resolveReferences(params, token, this.projectsByProjectNames, this.avaibaleEndpoints);
  }

  /**
   *
   * @param file Typescript file
   * @returns List of SemanticErrors
   */
  public analyzeEndpoints(file: IFile): SemanticError[] {
    if (file.tempFileUri) {
      const project = getProject(this.projectsByProjectNames, file.fileUri);

      if (project) {
        const results = analyze(file.tempFileUri, project.projectName || '', project.serviceConfig, project.serviceConfig ? false : true);

        if (results.endPointsAvaiable) {
          connection.console.log('Found endpoints in file: ' + file.fileUri + ' endpoints: ' + results.endPointsAvaiable.length);
          this.avaibaleEndpoints.set(file.fileUri, results.endPointsAvaiable);
        }

        if (results.semanticErrors) {
          return results.semanticErrors;
        }
      }

      return [];
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
      await this.validateConfig(document, getProject(this.projectsByProjectNames, document.uri));
    }, validationDelay);
  }

  public async validateConfig(document: TextDocument, project?: IProject, init: boolean = false): Promise<void> {
    const jsonDoc = this.jsonLanguageService.parseJSONDocument(document);

    const syntaxErrors = await this.jsonLanguageService.doValidation(
      document,
      jsonDoc,
      { schemaValidation: 'error', trailingCommas: 'error' },
      siaSchema as JSONSchema,
    );
    const semanticErrors = validateConfigSemantic(document, jsonDoc);

    if (syntaxErrors.length === 0 && semanticErrors.length === 0) {
      if (project) {
        project.serviceConfig = JSON.parse(document.getText())[0];
        this.projectsByProjectNames.set(project.rootPath, project);
      }

      connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });

      if (!init) {
        this.initFiles(getProject(this.projectsByProjectNames, document.uri).rootPath);
      }
    } else {
      connection.sendDiagnostics({ uri: document.uri, diagnostics: semanticErrors });
    }
  }

  public initFiles(pathUri: string) {
    const path = pathUri;
    if (path) {
      const docs = getAllFilesInProjectSync(path);

      docs.forEach(async (doc: TextDocument) => {
        if (doc.languageId === TYPE_TYPESCRIPT.LANGUAGE_ID) {
          getOrCreateTempFile(doc)
            .then((file) => {
              this.triggerTypescriptValidation(doc, file);
            })
            .catch((reason) => {
              sendRequest(connection, reason);
              return;
            });
        }
      });
    }
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
    // sendRequest(connection, 'Validate ' + file.fileUri);
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

  public loadPackageJson(packageJson: string, project?: IProject) {
    if (project) {
      if (project.packageJson) {
        const pack = JSON.parse(project.packageJson);
        project.projectName = pack.name;
        this.detectFrameworkOrLibrary(pack);
      }
    } else {
      if (packageJson) {
        const pack = JSON.parse(packageJson);
        this.detectFrameworkOrLibrary(pack);
      }
    }
  }

  /**
   * detectFrameworkOrLibrary
   * @param packJ packageJson
   */
  private detectFrameworkOrLibrary(packJ: any): void {
    // Extract the list of all compile time dependencies and look for supported frameworks and libraries
    const deps = packJ.dependencies;
    // TODO maybe need for further events
    // for (const dep of Object.keys(deps)) {
    //   if (dep.includes('express')) {
    //     // Try to extract the configuration for this service by name
    //     let currentServiceConfig;
    //     this.projectsByProjectNames.forEach((project) => {
    //       if (project.serviceConfig?.name === this.currentServiceName) {
    //         this.currenServiceConfig = project.serviceConfig;
    //       }
    //     });
    //     // currentServiceConfig = this.validConfig.find((config) => {
    //     //   if (config.name === this.currentServiceName) return config;
    //     // });
    //     // this.currenServiceConfig = currentServiceConfig;
    //     this.validateFrontend = false;
    //     break;
    //   } else if (dep.includes('@angular/core')) {
    //     this.validateFrontend = true;
    //   }
    // }
  }

  // public setCurrentConfiguration(documentUri: string) {
  //   let uri = documentUri;

  //   if (uri.startsWith(VS_CODE_URI_BEGIN)) {
  //     uri = uri.substring(7);
  //   }

  //   const foundProject = getProject(this.projectsByProjectNames, documentUri);

  //   if (foundProject) {
  //     if (foundProject.siarcTextDoc) {
  //       const siarc = foundProject.siarcTextDoc;
  //       if (existsSync(siarc.uri)) {
  //         const textDoc = TextDocument.create(siarc.uri, siarc.languageId, siarc.version, siarc.content);
  //         this.validateConfig(textDoc, foundProject);
  //         console.debug('loaded siarc for Project: ' + foundProject.rootPath);
  //       }
  //     }

  //     if (foundProject.packageJson) {
  //       this.loadPackageJson(foundProject.packageJson, foundProject);
  //       console.debug('loaded package.json for Project: ' + foundProject.rootPath);
  //     }
  //   }
  // }
}

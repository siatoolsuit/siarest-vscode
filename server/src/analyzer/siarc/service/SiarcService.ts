import { existsSync } from 'fs';
import { Diagnostic, DiagnosticSeverity, getLanguageService, JSONSchema, LanguageService } from 'vscode-json-languageservice';
import { CancellationToken } from 'vscode-jsonrpc';
import { CompletionItem, CompletionParams, Hover, HoverParams, InitializeParams, ReferenceParams } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClientExpression } from '../..';
import { ServiceConfig, validateConfigSemantic } from '../../config';
import { analyze } from '../handlers';
import { AutoCompletionService } from './AutoCompletionService';
import { getAllFilesInProjectSync, getOrCreateTempFile, IFile } from '../handlers/file';
import { IProject, SemanticError } from '../../types';
import * as siaSchema from '../../config/config.schema.json';
import { connection, documents } from '../../../server';
import { PACKAGE_JSON, SIARC, TYPE_JSON, TYPE_TYPESCRIPT } from '../../utils';
import { createDiagnostic, getProject } from '../../utils/helper';
import { CodeLocationResolver } from '../handlers/endpoint/codeLocationResolver';
import { DefinitionParams, Location, LocationLink } from 'vscode-languageserver/node';
import { HoverInfoService } from './HoverInfoService';

export const pendingValidations: { [uri: string]: NodeJS.Timer } = {};
export const validationDelay = 300;

/**
 * SiarcService provides functions for the server to get information
 * @class SiarcService
 */
export class SiarcService {
  // Contains all project saved by his name
  private projectsByProjectNames: Map<string, IProject> = new Map();

  // Contains the avaiable endpoints per filename
  private avaibaleEndpoints: Map<string, ClientExpression[]> = new Map();

  private autoCompletionService: AutoCompletionService;
  private hoverInfoService: HoverInfoService;
  private codeLocationResolver: CodeLocationResolver;
  private jsonLanguageService: LanguageService;

  /**
   * Init of the service.
   * Gets first called if the server ist started.
   */
  constructor(params: InitializeParams) {
    this.jsonLanguageService = getLanguageService({ clientCapabilities: params.capabilities });
    const initOptions = params.initializationOptions;

    if (initOptions) {
      if (initOptions.projects) {
        /**
         * Init each project and searches for npm/yarn projects and saves it.
         */
        initOptions.projects.forEach((obj: any) => {
          const project: IProject = {
            rootPath: obj.rootPath,
            packageJson: obj.packageJson,
            projectName: '',
          };

          if (obj.siarcTextDoc) {
            project.siarcTextDoc = obj.siarcTextDoc;
          }

          console.debug('Project: ', project.rootPath);

          if (project.siarcTextDoc) {
            console.log(project.siarcTextDoc.uri);
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

  /**
   * Calles the hoverInfo service to get more information.
   * @param hoverParams
   * @returns Information about the curren tcursor position.
   */
  public getInfo(hoverParams: HoverParams): Hover | undefined {
    return this.hoverInfoService.getInfo(hoverParams, this.projectsByProjectNames, this.avaibaleEndpoints);
  }

  /**
   * Calls the autoCompletionService to provide the server with infos about autocompletions.
   * @param params
   * @param token
   * @returns
   */
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

  /**
   * Generates completions items for alle siarc.jsons
   */
  public generateCompletionItems() {
    this.projectsByProjectNames.forEach((project, key) => {
      if (project.serviceConfig) {
        this.autoCompletionService.generateCompletionItems(project.serviceConfig);
      }
    });
  }

  /**
   * Calls the CodeLocaltionResolver to provide vscode with information about definitions tot he called item.
   * @param params
   * @param token
   * @returns
   */
  public getDefintions(params: DefinitionParams, token: CancellationToken): LocationLink[] {
    return this.codeLocationResolver.findDefinitions(params, token, this.projectsByProjectNames, this.avaibaleEndpoints);
  }

  /**
   * Calls the CodeLocaltionResolver to provide vscode with information about locations tot he called item.
   * @param params
   * @param token
   * @returns
   */
  public getReferences(params: ReferenceParams, token: CancellationToken): Location[] {
    return this.codeLocationResolver.findReferences(params, token, this.projectsByProjectNames, this.avaibaleEndpoints);
  }

  /**
   * Analyze the given typescript file.
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

  /**
   * Deletes the pending validation for a file/uri
   * @param uri
   */
  public cleanPendingValidations(uri: string): void {
    const request = pendingValidations[uri];
    if (request) {
      clearTimeout(request);
      delete pendingValidations[uri];
    }
  }

  /**
   * Triggers the config validation.
   * Deletes the old pending validation. And start the new one with a small timeout.
   * @param document
   */
  public triggerConfValidation(document: TextDocument): void {
    // clear old pending validations
    this.cleanPendingValidations(document.uri);
    // set a timeout for the new validation
    pendingValidations[document.uri] = setTimeout(async () => {
      // delete dthe old validation for this file
      delete pendingValidations[document.uri];
      // start validation
      await this.validateConfig(document, getProject(this.projectsByProjectNames, document.uri));
    }, validationDelay);
  }

  /**
   * Validates the config file. (siarc.json)
   * @param document a typescript document
   * @param project projec to the document
   * @param file file in our representation
   */
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

  /**
   * Init all files and analyzes them.
   * @param pathUri
   */
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
              connection.console.error(reason);
              return;
            });
        }
      });
    }
  }

  /**
   * Triggers the typescript validation.
   * @param document a typescript document
   * @param file file in our representation
   */
  public triggerTypescriptValidation(document: TextDocument, file: IFile): void {
    // clear old validations
    this.cleanPendingValidations(file.fileUri);
    // set a timeout for the new validation
    pendingValidations[file.fileUri] = setTimeout(() => {
      delete pendingValidations[file.fileUri];
      // start the validation
      this.validateTypescript(document, file);
    }, validationDelay);
  }

  /**
   * Analyses a typescript file and pushes errors to vscode.
   * Deletes the old pending validation. And start the new one with a small timeout.
   * @param document a typescript document
   * @param file file in our representation
   */
  public validateTypescript(document: TextDocument, file: IFile): void {
    // List for the analysed errors
    const diagnostics: Diagnostic[] = [];

    const version = document.version;
    // start analyzing the file
    const semanticErrors = this.analyzeEndpoints(file);
    // sendRequest(connection, 'Validate ' + file.fileUri);
    semanticErrors.forEach((error: SemanticError) => {
      // create a error in the format visual studio code can understand
      // add the error to the list
      diagnostics.push(createDiagnostic(document, error.message, error.position.start, error.position.end, DiagnosticSeverity.Error));
    });

    // async call for sending the errors to visual studio code
    setImmediate(() => {
      // To be clear to send the correct diagnostics to the current document
      const currDoc = documents.get(document.uri);
      if (currDoc && currDoc.version === version) {
        // send the errors to visualstudio code with the original uri
        connection.sendDiagnostics({ uri: document.uri, diagnostics, version: currDoc.version });
      }
    });
  }

  /**
   * Loads and inits the packagejson for each project
   * @param packageJson
   * @param project
   */
  public loadPackageJson(packageJson: string, project?: IProject) {
    if (project) {
      if (project.packageJson) {
        const pack = JSON.parse(project.packageJson);
        project.projectName = pack.name;
      }
    } else {
      if (packageJson) {
        const pack = JSON.parse(packageJson);
      }
    }
  }

  /**
   * Validates json files. Either a package.json or siarc.json
   * @param document
   */
  public validateJson(document: TextDocument) {
    if (document.uri.endsWith(SIARC + TYPE_JSON.SUFFIX)) {
      this.triggerConfValidation(document);
    } else if (document.uri.startsWith(PACKAGE_JSON) && document.uri.endsWith(TYPE_JSON.SUFFIX)) {
      this.loadPackageJson(document.getText());
    }
  }
}

import {
  InitializeParams,
  CompletionItem,
  CancellationToken,
  CompletionParams,
  Hover,
  HoverParams,
  DefinitionParams,
  LocationLink,
  ReferenceParams,
  Location,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SiarcService } from '../service';
import { connection } from '../../../server';
import { TYPE_TYPESCRIPT, TYPE_JSON, SIARC, PACKAGE_JSON } from '../../utils';
import { getAllFilesInProjectSync, getOrCreateTempFile } from '../handlers/file/FileHandler';

/**
 * Controller for analyzing typescript that calls the siarcService.
 */
export class SiarcController {
  siarcService: SiarcService;

  constructor(params: InitializeParams) {
    this.siarcService = new SiarcService(params);
    this.initFiles(params.initializationOptions.rootPath);
  }

  /**
   * Loads all files in a project and analyze typescript files.
   * @param pathUri
   */
  public initFiles(pathUri: string) {
    const path = pathUri;
    if (path) {
      const docs = getAllFilesInProjectSync(path);

      docs.forEach((doc) => {
        this.validate(doc);
      });
    }
  }

  /**
   * Checks if the validation is allowed.
   * @param document
   */
  public validate(document: TextDocument) {
    if (this.allowValidation()) {
      this.checkForValidation(document);
    }
  }

  /**
   * Checks which file type and calls the method for the type.
   * @param document
   * @param indexing
   */
  private checkForValidation(document: TextDocument, indexing: boolean = false) {
    switch (document.languageId) {
      case TYPE_TYPESCRIPT.LANGUAGE_ID: {
        getOrCreateTempFile(document)
          .then((file) => {
            this.siarcService.triggerTypescriptValidation(document, file);
          })
          .catch((reason) => {
            connection.console.error(reason);
          });
        break;
      }
      case TYPE_JSON.LANGUAGE_ID: {
        this.siarcService.validateJson(document);
        break;
      }
      default: {
      }
    }
  }

  /**
   * Get's completion items if a typescript file is calling the autocompletion.
   * @param params
   * @param token
   * @returns
   */
  public getCompletionItems(params: CompletionParams, token: CancellationToken): CompletionItem[] {
    if (params.textDocument.uri.endsWith(TYPE_TYPESCRIPT.SUFFIX)) {
      if (this.allowValidation()) {
        return this.siarcService.provideCompletionItems(params, token);
      }
    }
    return [];
  }

  /**
   * Gets a hover item if a typescript file is calling this.
   * @param hoverParams
   * @returns
   */
  public getHover(hoverParams: HoverParams): Hover | undefined {
    if (hoverParams.textDocument.uri.endsWith(TYPE_TYPESCRIPT.SUFFIX)) {
      if (this.allowValidation()) {
        if (hoverParams.textDocument.uri.endsWith(TYPE_TYPESCRIPT.SUFFIX)) {
          return this.siarcService.getInfo(hoverParams);
        }
      }
    }
    return undefined;
  }

  /**
   * Get's definitions for the server request.
   * @param params
   * @param token
   * @returns
   */
  public getDefintion(params: DefinitionParams, token: CancellationToken): LocationLink[] {
    if (this.allowValidation()) {
      return this.siarcService.getDefintions(params, token);
    }
    return [];
  }

  /**
   * Get's locations of references for the server request.
   * @param params
   * @param token
   * @returns
   */
  public getReferences(params: ReferenceParams, token: CancellationToken): Location[] {
    if (this.allowValidation()) {
      return this.siarcService.getReferences(params, token);
    }
    return [];
  }

  /**
   * Checks if siarcservice is set.
   * @returns
   */
  private allowValidation(): boolean {
    if (this.siarcService) {
      return true;
    }
    return false;
  }

  /**
   * Cleans the pending validations for an uri.
   * @param uri
   */
  public cleanPendingValidations(uri: string) {
    this.siarcService.cleanPendingValidations(uri);
  }
}

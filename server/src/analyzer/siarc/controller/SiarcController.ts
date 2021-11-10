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
import { connection, documents } from '../../../server';
import { TYPE_TYPESCRIPT, TYPE_JSON, SIARC, PACKAGE_JSON } from '../../utils';
import { getAllFilesInProjectSync, getOrCreateTempFile } from '../handlers/file/FileHandler';
import { sendRequest } from '../../utils/helper';

export const pendingValidations: { [uri: string]: NodeJS.Timer } = {};
export const validationDelay = 300;

export class SiarcController {
  siarcService: SiarcService;

  constructor(params: InitializeParams) {
    this.siarcService = new SiarcService(params);

    this.initFiles(params.initializationOptions.rootPath);
  }

  public initFiles(pathUri: string) {
    const path = pathUri;
    if (path) {
      const docs = getAllFilesInProjectSync(path);

      docs.forEach((doc) => {
        this.checkForValidation(doc, true);
      });

      sendRequest(connection, 'Finished analyzing all files');
    } else {
      // TODO error ?
    }
  }

  public validate(document: TextDocument) {
    if (this.allowValidation()) {
      this.checkForValidation(document);
    }
  }

  private checkForValidation(document: TextDocument, indexing: boolean = false) {
    switch (document.languageId) {
      case TYPE_TYPESCRIPT.LANGUAGE_ID: {
        getOrCreateTempFile(document)
          .then((file) => {
            this.siarcService.triggerTypescriptValidation(document, file);
          })
          .catch((reason) => {
            console.log(reason);
            sendRequest(connection, reason);
          });
        break;
      }
      case TYPE_JSON.LANGUAGE_ID: {
        this.validateJson(document);
        break;
      }
      default: {
      }
    }
  }

  public getCompletionItems(params: CompletionParams, token: CancellationToken): CompletionItem[] {
    if (params.textDocument.uri.endsWith(TYPE_TYPESCRIPT.SUFFIX)) {
      if (this.allowValidation()) {
        return this.siarcService.provideCompletionItems(params, token);
      }
    }
    return [];
  }

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

  public getDefintion(params: DefinitionParams, token: CancellationToken): LocationLink[] {
    if (this.allowValidation()) {
      return this.siarcService.getDefintions(params, token);
    }
    return [];
  }

  public getLocations(params: ReferenceParams, token: CancellationToken): Location[] {
    if (this.allowValidation()) {
      return this.siarcService.getLocations(params, token);
    }
    return [];
  }

  private validateJson(document: TextDocument) {
    if (document.uri.endsWith(SIARC + TYPE_JSON.SUFFIX)) {
      this.siarcService.triggerConfValidation(document);
    } else if (document.uri.startsWith(PACKAGE_JSON) && document.uri.endsWith(TYPE_JSON.SUFFIX)) {
      this.siarcService.loadPackageJson(document.getText());
    }
  }

  private allowValidation(): boolean {
    if (this.siarcService) {
      return true;
    }
    return false;
  }

  public cleanPendingValidations(uri: string) {
    this.siarcService.cleanPendingValidations(uri);
  }
}

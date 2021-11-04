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
import { sendNotification } from '../../utils/helper';

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
    }
  }

  public validate(document: TextDocument) {
    if (this.allowValidation()) {
      this.checkForValidation(document);
    }
  }

  private checkForValidation(document: TextDocument, indexing: boolean = false) {
    this.siarcService.setCurrentConfiguration(document.uri);
    switch (document.languageId) {
      case TYPE_TYPESCRIPT.LANGUAGE_ID: {
        getOrCreateTempFile(document)
          .then((file) => {
            this.siarcService.triggerTypescriptValidation(document, file);
          })
          .catch((reason) => {
            console.log(reason);
            sendNotification(connection, reason);
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
          this.siarcService.setCurrentConfiguration(hoverParams.textDocument.uri);
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
    if (document.uri.endsWith(SIARC)) {
      this.siarcService.triggerConfValidation(document);
    } else if (document.uri.endsWith(PACKAGE_JSON)) {
      this.siarcService.loadPackageJson(document.getText());
      // Revalidate all typescript files
      documents.all().forEach((doc: TextDocument) => {
        this.checkForValidation(doc);
      });
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

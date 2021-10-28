import { InitializeParams, CompletionItem, CancellationToken, CompletionParams, Hover, HoverParams } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SiarcService } from '../..';
import { connection, documents } from '../../../server';
import { TYPE_TYPESCRIPT, TYPE_JSON, SIARC, PACKAGE_JSON } from '../../utils';
import { getOrCreateTempFile } from '../file/FileHandler';
import { sendNotification } from '../../utils/helper';

export const pendingValidations: { [uri: string]: NodeJS.Timer } = {};
export const validationDelay = 300;

export class SiarcController {
  siarcService: SiarcService;

  constructor(params: InitializeParams) {
    this.siarcService = new SiarcService(params);
  }

  // constructor2(params: InitializeParams) {
  //   this.jsonLanguageService = getLanguageService({
  //     clientCapabilities: params.capabilities,
  //   });

  //   // Load package.json and .siarc.json, if they exists
  //   if (params.initializationOptions) {
  //     if (params.initializationOptions.list) {
  //       params.initializationOptions.list.forEach((obj: any) => {
  //         console.debug(obj);

  //         if (obj.siarcTextDoc) {
  //           const siarc = obj.siarcTextDoc;
  //           if (existsSync(siarc.uri)) {
  //             const textDoc = TextDocument.create(siarc.uri, siarc.languageId, siarc.version, siarc.content);
  //             this.validateConfig(textDoc);
  //           } else {
  //             sendNotification(connection, 'Could not find ' + siarc.uri);
  //           }
  //         }

  //         if (obj.packageJson) {
  //           this.loadPackageJson(obj.packageJson);
  //         }
  //       });
  //     }
  //   }
  // }

  public async validate(document: TextDocument) {
    if (this.allowValidation()) {
      this.checkForValidation(document);
    }
  }

  public generateCompletionItems() {
    if (this.allowValidation()) {
      this.siarcService.generateCompletionItems();
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

  private async checkForValidation(document: TextDocument): Promise<void> {
    // TODO get the right config
    this.siarcService.setCurrentConfiguration(document);
    switch (document.languageId) {
      case TYPE_TYPESCRIPT.LANGUAGE_ID: {
        getOrCreateTempFile(document)
          .then((file) => {
            this.siarcService.triggerTypescriptValidation(document, file);
          })
          .catch((reason) => {
            console.log(reason);
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
    //TODO
    if (this.siarcService) {
      return true;
    }
    // return false;
    return false;
  }

  public cleanPendingValidations(uri: string) {
    this.siarcService.cleanPendingValidations(uri);
  }
}

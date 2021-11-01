import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  InitializeParams,
  InitializeResult,
  CancellationToken,
  CompletionParams,
  CompletionItem,
  Hover,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { cleanTempFiles } from './analyzer/siarc/handlers/file/index';
import { TYPE_TYPESCRIPT } from './analyzer/utils';
import { SiarcController } from './analyzer/siarc/controller';

export const connection = createConnection(ProposedFeatures.all);
export const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let siarcController: SiarcController;

connection.onInitialize(async (params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      completionProvider: {
        resolveProvider: true,
        workDoneProgress: true,
      },
      hoverProvider: true,
    },
  };

  siarcController = new SiarcController(params);

  return result;
});

documents.onDidOpen((event) => {
  siarcController.validate(event.document);
});

documents.onDidSave((event) => {
  siarcController.validate(event.document);
});

documents.onDidChangeContent((event) => {
  siarcController.validate(event.document);
});

documents.onDidClose((event) => {
  siarcController.cleanPendingValidations(event.document.uri);
  if (event.document.languageId === TYPE_TYPESCRIPT.LANGUAGE_ID) {
    cleanTempFiles(event.document.uri)
      .then((fileUri) => {
        console.debug(`Removed file at ${fileUri}`);
      })
      .catch((error) => {
        console.debug(error);
      });
  }
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onCompletion((params: CompletionParams, token: CancellationToken): CompletionItem[] => {
  const completionItems: CompletionItem[] = siarcController.getCompletionItems(params, token);
  return completionItems;
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

connection.onHover((event): Hover | undefined => {
  return siarcController.getHover(event);
});

documents.listen(connection);
connection.listen();

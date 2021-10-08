import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  InitializeParams,
  InitializeResult,
  CancellationToken,
  HoverParams,
  CompletionParams,
  CompletionItem,
  Hover,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { cleanTempFiles } from './analyzer/handlers/file/index';
import { TYPE_TYPESCRIPT } from './analyzer/utils';

import { Validator } from './analyzer/handlers/validator';

export const connection = createConnection(ProposedFeatures.all);
export const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let validator: Validator;

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

  validator = new Validator(params);

  return result;
});

documents.onDidOpen((event) => {
  validator.validate(event.document);
});

documents.onDidSave((event) => {
  validator.validate(event.document);
});

documents.onDidChangeContent((event) => {
  validator.validate(event.document);
});

documents.onDidClose((event) => {
  validator.cleanPendingValidations(event.document.uri);
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
  const completionItems: CompletionItem[] = validator.getCompletionItems(params, token);
  return completionItems;
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

connection.onHover((event): Hover | undefined => {
  return validator.getHover(event);
});

documents.listen(connection);
connection.listen();

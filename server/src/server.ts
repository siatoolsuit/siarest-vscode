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
import { TYPESCRIPT } from './analyzer/utils';

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

//TODOs ab hier
documents.onDidClose((event) => {
  validator.cleanPendingValidations(event.document.uri);
  if (event.document.languageId === TYPESCRIPT.LANGUAGE_ID) {
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

connection.onHover((textDocument: HoverParams, token: CancellationToken): Hover | undefined => {
  // Create hover description for a typescript file
  const path = textDocument.textDocument.uri;
  return validator.getHover(textDocument, token);
});

documents.listen(connection);
connection.listen();

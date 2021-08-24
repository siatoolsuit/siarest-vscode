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
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { cleanTempFiles } from './analyzer/handlers/file/index';
import { TYPESCRIPT } from './analyzer/utils';

import { Validator } from './analyzer/handlers/validator';
import { AutoComplete } from './analyzer/handlers/endpoint/autocompletion/autoComplete';

export const connection = createConnection(ProposedFeatures.all);
export const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let validator: Validator;
let autoComplete: AutoComplete;

connection.onInitialize(async (params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      completionProvider: {
        resolveProvider: false,
      },
      hoverProvider: true,
    },
  };

  validator = new Validator(params);

  // Load package.json and .siarc.json, if they exists
  if (params.initializationOptions) {
    if (params.initializationOptions.siarcTextDoc) {
      const siarc = params.initializationOptions.siarcTextDoc;
      const textDoc = TextDocument.create(siarc.uri, siarc.languageId, siarc.version, siarc.content);
      await validator.validateConfig(textDoc);
    }
    if (params.initializationOptions.packageJson) {
      validator.loadPackageJson(params.initializationOptions.packageJson);
    }
  }
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
  const completionItems: CompletionItem[] = autoComplete.provideCompletionItems(params, token);
  return completionItems;
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

connection.onHover((textDocumentPosition: HoverParams, token: CancellationToken) => {
  // Create hover description for a typescript file
  const path = textDocumentPosition.textDocument.uri;
  if (path.endsWith(TYPESCRIPT.SUFFIX)) {
    return null; // TODO: Maybe give a documentation of the endpoint
  }
});

documents.listen(connection);
connection.listen();

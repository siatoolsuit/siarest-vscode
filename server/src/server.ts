import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  InitializeParams,
  InitializeResult,
  CancellationToken,
  HoverParams,
  CompletionParams,
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

documents.onDidOpen(async (event) => {
  validator.validate(event.document);
});

documents.onDidSave(async (event) => {
  validator.validate(event.document);
});

documents.onDidChangeContent(async (event) => {
  validator.validate(event.document);
});


//TODOs ab hier
documents.onDidClose(async (event) => {
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

connection.onCompletion(async (textDocumentPosition: CompletionParams, token: CancellationToken) => {
  // Create completion for a typescript file
  const path = textDocumentPosition.textDocument.uri;
  if (path.endsWith(TYPESCRIPT.SUFFIX)) {
    // TODO: Check if we have a valid config
    return [];
  }
  return null;
});

connection.onHover(async (textDocumentPosition: HoverParams, token: CancellationToken) => {
  // Create hover description for a typescript file
  const path = textDocumentPosition.textDocument.uri;
  if (path.endsWith(TYPESCRIPT.SUFFIX)) {
    return null; // TODO: Maybe give a documentation of the endpoint
  }
});

documents.listen(connection);
connection.listen();

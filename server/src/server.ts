import { getLanguageService, JSONSchema, LanguageService } from 'vscode-json-languageservice';
import { createConnection, ProposedFeatures, TextDocuments, InitializeParams, InitializeResult, TextDocumentSyncKind, CancellationToken, HoverParams, CompletionParams } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Analyzer } from './analyzer';

import * as siaSchema from './analyzer/config/config.schema.json';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let jsonLanguageService: LanguageService;

const analyzer: Analyzer = new Analyzer();


connection.onInitialize((params: InitializeParams) => {
  jsonLanguageService = getLanguageService({
    clientCapabilities: params.capabilities 
  });

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
      },
      hoverProvider: true
    }
  };

  return result;
});

connection.onCompletion(async (textDocumentPosition: CompletionParams, token: CancellationToken) => {
  // Create completion for the configuration file or a typescript file
  const path = textDocumentPosition.textDocument.uri;
  if (path.endsWith('.ts')) {
    // TODO: Check if we have a valid config, depending on the language / library create the corresponding completion
    return [];
  }
  return null;
});

connection.onHover(async (textDocumentPosition: HoverParams, token: CancellationToken) => {
  // Create hover description for the configuration file
  const path = textDocumentPosition.textDocument.uri;
  if (path.endsWith('.ts')) {
    return null; // TODO: Maybe give a documentation of the endpoint
  }
});

documents.onDidChangeContent(async (change) => {
  const textDoc = change.document;
  if (textDoc.languageId === 'json') {
    const jsonDoc = jsonLanguageService.parseJSONDocument(textDoc);
    const errors = await jsonLanguageService.doValidation(textDoc, jsonDoc, { schemaValidation: "error" }, siaSchema as JSONSchema);
    if (errors.length === 0) {
      analyzer.config = textDoc.getText();
    }
  }

  if (textDoc.languageId === 'typescript') {
    // TODO:
  }
});

documents.listen(connection);
connection.listen();

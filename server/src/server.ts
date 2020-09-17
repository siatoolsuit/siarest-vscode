import { DiagnosticSeverity, getLanguageService, JSONDocument, JSONSchema, LanguageService } from 'vscode-json-languageservice';
import { createConnection, ProposedFeatures, TextDocuments, InitializeParams, InitializeResult, TextDocumentSyncKind, TextDocumentPositionParams } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Analyzer } from './analyzer';

import * as siaSchema from './analyzer/config/config.schema.json';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let jsonLanguageService: LanguageService;

const documentMap: Map<string, JSONDocument> = new Map();
const analyzer: Analyzer = new Analyzer();


connection.onInitialize((params: InitializeParams) => {

  console.log(siaSchema);
  jsonLanguageService = getLanguageService({
    clientCapabilities: params.capabilities 
  });

  jsonLanguageService.configure({
    allowComments: true,
    validate: true,
    schemas: [{ uri: 'file:///analyzer/config/config.schema.json', fileMatch: [ '.siarc.json' ], schema: siaSchema as JSONSchema }]
  });

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
      }
    }
  };

  return result;
});

// TODO: Hier schauen warum der spast kein bock die descrption mit bei der completion anzuzeigen
connection.onCompletion(async (textDocumentPosition: TextDocumentPositionParams) => {
  // Create completion for the configuration file or a typescript file
  const path = textDocumentPosition.textDocument.uri;
  if (path.endsWith('.ts')) {
    // TODO: Check if we have a valid config, depending on the language / library create the corresponding completion
    return [];
  } else if (path.endsWith('.siarc.json')) {
    const textDoc = documents.get(path);
    const jsonDoc = documentMap.get(path);
    if (jsonDoc && textDoc) {
      return await jsonLanguageService.doComplete(textDoc, textDocumentPosition.position, jsonDoc);
    }
  }
});

documents.onDidChangeContent(async (change) => {
  const textDoc = change.document;
  if (textDoc.languageId === 'json') {
    const jsonDoc = jsonLanguageService.parseJSONDocument(textDoc);
    documentMap.set(textDoc.uri, jsonDoc);
  }

  if (textDoc.languageId === 'typescript') {
    // TODO:
  } else if (textDoc.uri.endsWith('.siarc.json')) {
    const jsonDoc = documentMap.get(textDoc.uri);
    if (jsonDoc) {
      const errors = await jsonLanguageService.doValidation(textDoc, jsonDoc);
      connection.sendDiagnostics({ uri: textDoc.uri, diagnostics: errors.map((d) => { d.severity = DiagnosticSeverity.Error; return d; }) });
    }
  }
});

documents.onDidClose((change) => {
  documentMap.delete(change.document.uri);
});

documents.listen(connection);
connection.listen();

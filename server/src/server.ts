import { createConnection, ProposedFeatures, TextDocuments, InitializeParams, InitializeResult, TextDocumentSyncKind, TextDocumentPositionParams, CompletionItem } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Analyzer } from './analyzer';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const analyzer: Analyzer = new Analyzer();

connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
      }
    }
  };

  return result;
});

connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
  // Create completion for the configuration file
  const path = textDocumentPosition.textDocument.uri;
  if (path.endsWith('.siarc.json')) {
    return analyzer.createConfigCompletion(textDocumentPosition);
  } else {
    // TODO: Check if we have a valid config, depending on the language / library create the corresponding completion
    return [];
  }
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

documents.onDidChangeContent((change) => {
  const doc = change.document;
  if (doc.languageId === 'typescript') {
    validateTypescript(doc);
  } else if (doc.languageId === 'json') {
    validateJsonConfig(doc);
  }
});

function validateTypescript(textDocument: TextDocument): void { 
  // TODO:
}

function validateJsonConfig(textDocument: TextDocument): void {
  const diagnostics = analyzer.validateAndLoadServiceConfig(textDocument);
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

documents.listen(connection);
connection.listen();

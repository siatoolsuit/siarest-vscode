import { createConnection, ProposedFeatures, TextDocuments, InitializeParams, InitializeResult, TextDocumentSyncKind } from 'vscode-languageserver';
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
        resolveProvider: true
      }
    }
  };

  return result;
});

documents.onDidChangeContent((change) => {
  const doc = change.document;
  if (doc.languageId === 'typescript') {
    //validateTypescript(doc);
  } else if (doc.languageId === 'json') {
    validateJsonConfig(doc);
  }
});

/*function validateTypescript(textDocument: TextDocument): void { 

}*/

function validateJsonConfig(textDocument: TextDocument): void {
  const diagnostics = analyzer.validateAndLoadServiceConfig(textDocument);
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

documents.listen(connection);
connection.listen();

import { createConnection, ProposedFeatures, TextDocuments, InitializeParams, InitializeResult, TextDocumentSyncKind, DidChangeWatchedFilesParams, DidChangeTextDocumentParams } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Analyzer } from './analyzer';

// hier mal weiter machen mit dem ondidchangetextdocument wir wollen wissen wie wir an die drecks config ran kommen

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const analyzer: Analyzer = new Analyzer();

connection.onInitialize((params: InitializeParams) => {
  analyzer.init();
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true
      }
    }
  }

  return result;
});

documents.onDidChangeContent((change) => {
  validateFile(change.document);
});

async function validateFile(textDocument: TextDocument): Promise<void> {
  console.log(textDocument);
}

connection.onDidChangeWatchedFiles((onChange: DidChangeWatchedFilesParams) => {
});

connection.onDidChangeTextDocument((params: DidChangeTextDocumentParams) => {
  console.log(params);
});

documents.listen(connection);
connection.listen();

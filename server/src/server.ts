import { DiagnosticSeverity, getLanguageService, JSONDocument, JSONSchema, LanguageService } from 'vscode-json-languageservice';
import { createConnection, ProposedFeatures, TextDocuments, InitializeParams, InitializeResult, TextDocumentSyncKind, CancellationToken, HoverParams, CompletionParams, Diagnostic } from 'vscode-languageserver';
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
    // TODO: Check if we have a valid config
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
    const syntaxErrors = await jsonLanguageService.doValidation(textDoc, jsonDoc, { schemaValidation: "error" }, siaSchema as JSONSchema);
    const semanticErrors = validateConfigSemantic(textDoc, jsonDoc);
    if (syntaxErrors.length === 0 && semanticErrors.length === 0) {
      analyzer.config = textDoc.getText();
    }
    connection.sendDiagnostics({ uri: textDoc.uri, diagnostics: semanticErrors });
  } else if (textDoc.languageId === 'typescript') {
    // TODO:
  }
});

function validateConfigSemantic(textDoc: TextDocument, jsonDoc: JSONDocument): Diagnostic[] {
  const result: Diagnostic[] = [];

  const rootArray = jsonDoc.root;

  // Check for duplicate service name or base paths, both need to bee unique
  // Further check whether there is a defined request if the method in an endpoint is set to POST or PUT
  const servicesNames: string[] = [];
  const baseUris: string[] = [];
  if (rootArray) {
    const children = rootArray.children;
    if (children) {
      for (const serviceNode of children) {
        if (serviceNode.type === 'object') {
          for (const property of serviceNode.properties) {
            if (property.keyNode.value === 'name' && property.valueNode) {
              const nameValue = property.valueNode.value as string;
              // We found a duplicate
              if (servicesNames.includes(nameValue)) {
                result.push({
                  message: 'Duplicate name, service name needs to be unique',
                  range: { start: textDoc.positionAt(property.valueNode.offset), end: textDoc.positionAt(property.valueNode.offset), },
                  severity: DiagnosticSeverity.Error
                });
              // Add the same to the name list
              } else if (nameValue) {
                servicesNames.push(nameValue);
              }
            } else if (property.keyNode.value === 'baseUri' && property.valueNode) {
              const baseURIValue = property.valueNode.value as string;
              // We found a duplicate
              if (baseUris.includes(baseURIValue)) {
                result.push({
                  message: 'Duplicate baseUri, service baseUri needs to be unique',
                  range: { start: textDoc.positionAt(property.valueNode.offset), end: textDoc.positionAt(property.valueNode.offset), },
                  severity: DiagnosticSeverity.Error
                });
              // Add the same to the name list
              } else if (baseURIValue) {
                baseUris.push(baseURIValue);
              }
            }
          }
        }
      }
    }
  }

  return result;
}

documents.listen(connection);
connection.listen();

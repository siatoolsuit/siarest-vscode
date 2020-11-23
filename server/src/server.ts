import { DiagnosticSeverity, getLanguageService, JSONDocument, JSONSchema, LanguageService } from 'vscode-json-languageservice';
import { createConnection, ProposedFeatures, TextDocuments, InitializeParams, InitializeResult, TextDocumentSyncKind, CancellationToken, HoverParams, CompletionParams, Diagnostic } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Analyzer, SemanticError } from './analyzer';

import * as siaSchema from './analyzer/config/config.schema.json';

// TODO: Timeouts hinzufügen um und ein delay um das validieren nach jedem tastenanschlag zu verhindern, holt performance raus 

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let jsonLanguageService: LanguageService;

const analyzer: Analyzer = new Analyzer();

connection.onInitialize(async (params: InitializeParams) => {
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

  // Load package.json and .siarc.json, if they exists
  if (params.initializationOptions) {
    if (params.initializationOptions.siarcTextDoc) {
      const siarc = params.initializationOptions.siarcTextDoc;
      const textDoc = TextDocument.create(siarc.uri, siarc.languageId, siarc.version, siarc.content);
      const JsonDoc = jsonLanguageService.parseJSONDocument(textDoc);
      await validateConfig(textDoc, JsonDoc);
    }
    if (params.initializationOptions.packageJson) {
      loadPackageJson(params.initializationOptions.packageJson);
    }
  }

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
    if (textDoc.uri.endsWith('.siarc.json')) {
      const jsonDoc = jsonLanguageService.parseJSONDocument(textDoc);
      const success: boolean = await validateConfig(textDoc, jsonDoc);
      if (success) {
        // Revalidate all typescript files
        documents.all().forEach(async (doc: TextDocument) => {
          if (doc.languageId === 'typescript') {
            await validateTypescript(doc);
          }
        });
      }
    } else if (textDoc.uri.endsWith('package.json')) {
      loadPackageJson(textDoc.getText());
      // Revalidate all typescript files
      documents.all().forEach(async (doc: TextDocument) => {
        if (doc.languageId === 'typescript') {
          await validateTypescript(doc);
        }
      });
    }
  } else if (textDoc.languageId === 'typescript') {
    await validateTypescript(textDoc);
  }
});

documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

async function validateConfig(textDoc: TextDocument, jsonDoc: JSONDocument): Promise<boolean> {
  const syntaxErrors = await jsonLanguageService.doValidation(textDoc, jsonDoc, { schemaValidation: "error", trailingCommas: 'error' }, siaSchema as JSONSchema);
  const semanticErrors = validateConfigSemantic(textDoc, jsonDoc);
  if (syntaxErrors.length === 0 && semanticErrors.length === 0) {
    analyzer.config = textDoc.getText();
    return true;
  }
  connection.sendDiagnostics({ uri: textDoc.uri, diagnostics: semanticErrors });
  return false;
}

async function validateTypescript(textDoc: TextDocument): Promise<void> {
  const diagnostics: Diagnostic[] = [];
  analyzer.analyzeEndpoints(textDoc.uri).forEach((error: SemanticError) => {
    diagnostics.push({
      message: error.message,
      range: { start: textDoc.positionAt(error.position.start), end: textDoc.positionAt(error.position.end) },
      severity: DiagnosticSeverity.Error
    });
  });
  connection.sendDiagnostics({ uri: textDoc.uri, diagnostics });
}

function loadPackageJson(text: string) {
  if (text) {  
    const pack = JSON.parse(text);
    if (pack.name) {
      analyzer.currentService = pack.name;
    }
    analyzer.detectFrameworkOrLibrary(pack);
  }
}

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
            } else if (property.keyNode.value === 'endpoints' && property.valueNode && property.valueNode.children) {
              // Check each endpoint whether a endpoint with method of POST or PUT has a request defined, and viceverse
              for (const endpoint of property.valueNode.children) {
                if (endpoint.type === 'object') {
                  let method, request;
                  for (const endpointProperty of endpoint.properties) {
                    if (!endpointProperty.valueNode) {
                      continue;
                    }
                    if (endpointProperty.keyNode.value === 'method') {
                      method = endpointProperty.valueNode.value;
                    } else if (endpointProperty.keyNode.value === 'request') {
                      request = endpointProperty.valueNode;
                    }
                  }
                  // There need to be the request field to be defined
                  if (method === 'POST' || method === 'PUT') {
                    if (!request) {
                      result.push({
                        message: 'Missing request field',
                        range: { start: textDoc.positionAt(endpoint.offset), end: textDoc.positionAt(endpoint.offset)},
                        severity: DiagnosticSeverity.Error
                      });
                    }
                  } else if (method === 'GET' || method === 'DELETE') {
                    if (request) {
                      result.push({
                        message: 'Unnecessary request field',
                        range: { start: textDoc.positionAt(request.offset), end: textDoc.positionAt(request.offset) },
                        severity: DiagnosticSeverity.Error
                      });
                    }
                  }
                }
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

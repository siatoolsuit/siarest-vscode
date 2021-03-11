import { DiagnosticSeverity, getLanguageService, JSONSchema, LanguageService } from 'vscode-json-languageservice';
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  InitializeParams,
  InitializeResult,
  CancellationToken,
  HoverParams,
  CompletionParams,
  Diagnostic,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Analyzer, SemanticError } from './analyzer';
import { ConfigValidator } from './analyzer/config';

import * as siaSchema from './analyzer/config/config.schema.json';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let jsonLanguageService: LanguageService;

const configValidator: ConfigValidator = new ConfigValidator();
const analyzer: Analyzer = new Analyzer();

const pendingValidations: { [uri: string]: NodeJS.Timer } = {};
const validationDelay = 300;

connection.onInitialize(async (params: InitializeParams) => {
  jsonLanguageService = getLanguageService({
    clientCapabilities: params.capabilities,
  });

  const result: InitializeResult = {
    capabilities: {
      completionProvider: {
        resolveProvider: false,
      },
      hoverProvider: true,
    },
  };

  // Load package.json and .siarc.json, if they exists
  if (params.initializationOptions) {
    if (params.initializationOptions.siarcTextDoc) {
      const siarc = params.initializationOptions.siarcTextDoc;
      const textDoc = TextDocument.create(siarc.uri, siarc.languageId, siarc.version, siarc.content);
      await validateConfig(textDoc);
    }
    if (params.initializationOptions.packageJson) {
      loadPackageJson(params.initializationOptions.packageJson);
    }
  }

  return result;
});

documents.onDidOpen((event) => {
  checkForValidation(event.document);
});

documents.onDidSave((event) => {
  if (event.document.uri.endsWith('.ts')) {
    checkForValidation(event.document);
  }
});

documents.onDidChangeContent((event) => {
  if (event.document.uri.endsWith('.json')) {
    checkForValidation(event.document)
  }
});

documents.onDidClose((event) => {
  cleanPendingValidations(event.document);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onCompletion((textDocumentPosition: CompletionParams, token: CancellationToken) => {
  // Create completion for a typescript file
  const path = textDocumentPosition.textDocument.uri;
  if (path.endsWith('.ts')) {
    // TODO: Check if we have a valid config
    return [];
  }
  return null;
});

connection.onHover((textDocumentPosition: HoverParams, token: CancellationToken) => {
  // Create hover description for a typescript file
  const path = textDocumentPosition.textDocument.uri;
  if (path.endsWith('.ts')) {
    return null; // TODO: Maybe give a documentation of the endpoint
  }
});

function cleanPendingValidations(textDoc: TextDocument): void {
  const request = pendingValidations[textDoc.uri];
  if (request) {
    clearTimeout(request);
    delete pendingValidations[textDoc.uri];
  }
}

function triggerConfValidation(textDoc: TextDocument): void {
  cleanPendingValidations(textDoc);
  pendingValidations[textDoc.uri] = setTimeout(async () => {
    delete pendingValidations[textDoc.uri];
    await validateConfig(textDoc);
  }, validationDelay);
}

function triggerTypescriptValidation(textDoc: TextDocument): void {
  cleanPendingValidations(textDoc);
  pendingValidations[textDoc.uri] = setTimeout(() => {
    delete pendingValidations[textDoc.uri];
    validateTypescript(textDoc);
  }, validationDelay);
}

function checkForValidation(textDoc: TextDocument): void {
  if (textDoc.languageId === 'json') {
    if (textDoc.uri.endsWith('.siarc.json')) {
      triggerConfValidation(textDoc);
    } else if (textDoc.uri.endsWith('package.json')) {
      loadPackageJson(textDoc.getText());
      // Revalidate all typescript files
      documents.all().forEach((doc: TextDocument) => {
        if (doc.languageId === 'typescript') {
          triggerTypescriptValidation(doc);
        }
      });
    }
  } else if (textDoc.languageId === 'typescript') {
    triggerTypescriptValidation(textDoc);
  }
}

async function validateConfig(textDoc: TextDocument): Promise<void> {
  const jsonDoc = jsonLanguageService.parseJSONDocument(textDoc);

  const syntaxErrors = await jsonLanguageService.doValidation(textDoc, jsonDoc, { schemaValidation: 'error', trailingCommas: 'error' }, siaSchema as JSONSchema);
  const semanticErrors = configValidator.validateConfigSemantic(textDoc, jsonDoc);

  if (syntaxErrors.length === 0 && semanticErrors.length === 0) {
    analyzer.config = textDoc.getText();
    connection.sendDiagnostics({ uri: textDoc.uri, diagnostics: [] });
    documents.all().forEach(async (doc: TextDocument) => {
      if (doc.languageId === 'typescript') {
        triggerTypescriptValidation(doc);
      }
    });
  } else {
    connection.sendDiagnostics({ uri: textDoc.uri, diagnostics: semanticErrors });
  }
}

function validateTypescript(textDoc: TextDocument): void {
  const diagnostics: Diagnostic[] = [];

  const version = textDoc.version;
  analyzer.analyzeEndpoints(textDoc.uri, textDoc.getText()).forEach((error: SemanticError) => {
    diagnostics.push({
      message: error.message,
      range: {
        start: textDoc.positionAt(error.position.start),
        end: textDoc.positionAt(error.position.end),
      },
      severity: DiagnosticSeverity.Error,
    });
  });

  setImmediate(() => {
    // To be clear to send the correct diagnostics to the current document
    const currDoc = documents.get(textDoc.uri);
    if (currDoc && currDoc.version === version) {
      connection.sendDiagnostics({ uri: textDoc.uri, diagnostics });
    }
  });
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

documents.listen(connection);
connection.listen();

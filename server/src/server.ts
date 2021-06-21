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

import { cleanTempFiles, IFile, getOrCreateTempFile } from "./analyzer/handlers/file/index";
import { JSONS, PACKAGE_JSON, SIARC, TYPESCRIPT } from './analyzer/utils';

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

// TODO konstanten auspacken
// TODO change rest to async stuff

documents.onDidOpen(async (event) => {
  checkForValidation(event.document);
});

documents.onDidSave(async (event) => {
  checkForValidation(event.document);
});

documents.onDidChangeContent(async (event) => {
  checkForValidation(event.document);
});

documents.onDidClose(async (event) => {
  cleanPendingValidations(event.document.uri);
  if (event.document.languageId === TYPESCRIPT.LANGUAGE_ID) {
    cleanTempFiles(event.document.uri).then((fileUri) => {
      console.debug(`Removed file at ${fileUri}`);
    }).catch((error) => {
      console.debug(error)
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

function cleanPendingValidations(uri: string): void {
  const request = pendingValidations[uri];
  if (request) {
    clearTimeout(request);
    delete pendingValidations[uri];
  }
}

function triggerConfValidation(document: TextDocument): void {
  cleanPendingValidations(document.uri);
  pendingValidations[document.uri] = setTimeout(async () => {
    delete pendingValidations[document.uri];
    await validateConfig(document);
  }, validationDelay);
}

function triggerTypescriptValidation(document: TextDocument, file: IFile): void {
  cleanPendingValidations(file.fileUri);
  pendingValidations[file.fileUri] = setTimeout(() => {
    delete pendingValidations[file.fileUri];
    validateTypescript(document, file);
  }, validationDelay);
}

async function checkForValidation(document: TextDocument): Promise<void> {
  switch (document.languageId) {
    case TYPESCRIPT.LANGUAGE_ID: {
      getOrCreateTempFile(document).then((file) => {
        triggerTypescriptValidation(document, file);
      }).catch((reason) => {
        return;
      });
      break;
    }
    case JSONS.LANGUAGE_ID: {
      validateJson(document);
      break;
    }
    default: {
      return;
    }
  }
}

function validateJson(document: TextDocument) {
  if (document.uri.endsWith(SIARC)) {
    triggerConfValidation(document);
  } else if (document.uri.endsWith(PACKAGE_JSON)) {
    loadPackageJson(document.getText());
    // Revalidate all typescript files
    documents.all().forEach((doc: TextDocument) => {
      checkForValidation(doc);
    });
  }
}

async function validateConfig(document: TextDocument): Promise<void> {
  const jsonDoc = jsonLanguageService.parseJSONDocument(document);

  const syntaxErrors = await jsonLanguageService.doValidation(document, jsonDoc, { schemaValidation: 'error', trailingCommas: 'error' }, siaSchema as JSONSchema);
  const semanticErrors = configValidator.validateConfigSemantic(document, jsonDoc);

  if (syntaxErrors.length === 0 && semanticErrors.length === 0) {
    analyzer.config = document.getText();
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    documents.all().forEach(async (doc: TextDocument) => {
      if (doc.languageId === TYPESCRIPT.LANGUAGE_ID) {
        checkForValidation(doc);
      }
    });
  } else {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: semanticErrors });
  }
}

function validateTypescript(document: TextDocument, file: IFile): void {
  const diagnostics: Diagnostic[] = [];

  const version = document.version;
  analyzer.analyzeEndpoints(file).forEach((error: SemanticError) => {
    diagnostics.push({
      message: error.message,
      range: {
        start: document.positionAt(error.position.start),
        end: document.positionAt(error.position.end),
      },
      severity: DiagnosticSeverity.Error,
    });
  });

  setImmediate(() => {
    // To be clear to send the correct diagnostics to the current document
    const currDoc = documents.get(document.uri);
    if (currDoc && currDoc.version === version) {
      connection.sendDiagnostics({ uri: document.uri, diagnostics });
    }
  });
}

function loadPackageJson(json: string) {
  if (json) {
    const pack = JSON.parse(json);
    if (pack.name) {
      analyzer.currentService = pack.name;
    }
    analyzer.detectFrameworkOrLibrary(pack);
  }
}

documents.listen(connection);
connection.listen();

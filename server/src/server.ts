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

import { Validator } from "./analyzer/handlers/validator";

export const connection = createConnection(ProposedFeatures.all);
export const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let jsonLanguageService: LanguageService;

const configValidator: ConfigValidator = new ConfigValidator();
const analyzer: Analyzer = new Analyzer();

let validator: Validator;

const pendingValidations: { [uri: string]: NodeJS.Timer } = {};

// TODO was macht bewirkt das?
const validationDelay = 300;

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

// TODO konstanten auspacken
// TODO change rest to async stuff

documents.onDidOpen(async (event) => {
  validator.checkForValidation(event.document);
});

documents.onDidSave(async (event) => {
  validator.checkForValidation(event.document);
});

documents.onDidChangeContent(async (event) => {
  validator.checkForValidation(event.document);
});

documents.onDidClose(async (event) => {
  validator.cleanPendingValidations(event.document.uri);
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

documents.listen(connection);
connection.listen();

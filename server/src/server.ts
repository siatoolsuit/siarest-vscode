import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  InitializeParams,
  InitializeResult,
  CancellationToken,
  CompletionParams,
  CompletionItem,
  Hover,
  LocationLink,
  ReferenceParams,
  Location,
  CodeActionParams,
  CodeAction,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { cleanTempFiles } from './analyzer/siarc/handlers/file/index';
import { TYPE_TYPESCRIPT } from './analyzer/utils';
import { SiarcController } from './analyzer/siarc/controller';
import { initializeResult } from './config';

export const connection = createConnection(ProposedFeatures.all);
export const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let siarcController: SiarcController;

connection.onInitialize(async (params: InitializeParams) => {
  connection.console.info('Starting init of siarc server');
  const result: InitializeResult = initializeResult;

  siarcController = new SiarcController(params);

  return result;
});

documents.onDidOpen((event) => {
  siarcController.validate(event.document);
});

documents.onDidSave((event) => {
  siarcController.validate(event.document);
});

documents.onDidChangeContent((event) => {
  siarcController.validate(event.document);
});

documents.onDidClose((event) => {
  siarcController.cleanPendingValidations(event.document.uri);
  if (event.document.languageId === TYPE_TYPESCRIPT.LANGUAGE_ID) {
    cleanTempFiles(event.document.uri)
      .then((fileUri) => {
        connection.console.log(`Removed file at ${fileUri}`);
      })
      .catch((error) => {
        connection.console.error(error);
      });
  }
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onDefinition((params, token): LocationLink[] => {
  const locationLinks = siarcController.getDefintion(params, token);
  return locationLinks;
});

connection.onReferences((params: ReferenceParams, token: CancellationToken): Location[] => {
  const locations = siarcController.getLocations(params, token);
  return locations;
});

connection.onCompletion((params: CompletionParams, token: CancellationToken): CompletionItem[] => {
  const completionItems: CompletionItem[] = siarcController.getCompletionItems(params, token);
  return completionItems;
});

connection.onHover((event): Hover | undefined => {
  return siarcController.getHover(event);
});

connection.onCodeAction((params: CodeActionParams, token: CancellationToken): CodeAction[] => {
  // TODO maybe add quickfix shit?

  return [];
});

documents.listen(connection);
connection.listen();
connection.console.info(`Siarc server running in node ${process.version}`);

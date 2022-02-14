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
  _Connection,
  TextDocumentChangeEvent,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { cleanTempFiles } from './analyzer/siarc/handlers/file/index';
import { TYPE_TYPESCRIPT } from './analyzer/utils';
import { SiarcController } from './analyzer/siarc/controller';
import { initializeResult } from './config';

/**
 * Const that resablmed the connection between client and server
 */
export const connection: _Connection = createConnection(ProposedFeatures.all);
/**
 * contains a list of documents that are open in the editor
 */
export const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let siarcController: SiarcController;

/**
 * Gets called from extensions.ts on start
 * @param InitializeParams contains information send by the extension to the server
 */
connection.onInitialize(async (params: InitializeParams) => {
  connection.console.info('Starting init of siarc server');
  const result: InitializeResult = initializeResult;

  siarcController = new SiarcController(params);

  return result;
});

/**
 * If a file is opened inside the editor this gets called.
 */
documents.onDidOpen((event: TextDocumentChangeEvent<TextDocument>) => {
  siarcController.validate(event.document);
});
/**
 * If a file is saved by editor this gets called.
 */
documents.onDidSave((event) => {
  siarcController.validate(event.document);
});

/**
 * If a file was recently written inside the editor this gets called.
 */
documents.onDidChangeContent((event) => {
  siarcController.validate(event.document);
});

/**
 * If a file is closed inside the editor this gets called.
 * Deletes all tempory files used by the extension
 */
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

/**
 * If the user start is looking for definition in his code this gets called.
 * @returns LocationLinks to the definition he is looking for
 */
connection.onDefinition((params, token): LocationLink[] => {
  const locationLinks = siarcController.getDefintion(params, token);
  return locationLinks;
});

/**
 * If the user start is looking for references in his code this gets called.
 * @returns References of the request
 */
connection.onReferences((params: ReferenceParams, token: CancellationToken): Location[] => {
  const locations = siarcController.getReferences(params, token);
  return locations;
});

/**
 * If the user uses vscodes autocompletion feature this gets called.
 * @returns AutoCompletion items
 */
connection.onCompletion((params: CompletionParams, token: CancellationToken): CompletionItem[] => {
  const completionItems: CompletionItem[] = siarcController.getCompletionItems(params, token);
  return completionItems;
});

/**
 * If the user hovers somewhere in his files this gets called.
 * @returns Return information at the hover location
 */
connection.onHover((event): Hover | undefined => {
  return siarcController.getHover(event);
});

/**
 * Not implemented
 */
connection.onCodeAction((params: CodeActionParams, token: CancellationToken): CodeAction[] => {
  // TODO maybe add quickfix?

  return [];
});

/**
 * documents and connection listens to the client/extension that it was started by.
 */
documents.listen(connection);
connection.listen();
connection.console.info(`Siarc server running in node ${process.version}`);

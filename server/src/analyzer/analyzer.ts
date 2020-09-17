import { Diagnostic, TextDocumentPositionParams, CompletionItem } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ServiceConfig } from './config';

/**
 * The {@link Analyzer} class is the entry point of the verification API.
 * Needs to be created as an object.
 *
 */
export class Analyzer {
  private validConfig!: ServiceConfig;

  /**
   * Validates and loads a configuration file, only loads if the file is valid
   *
   * @param textDocument The text document representation of the .siarc.json
   * @returns Return an array of errors
   */
  public validateAndLoadServiceConfig(textDocument: TextDocument): Diagnostic[] {
    return [];
  }
}

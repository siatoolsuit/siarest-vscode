import { Diagnostic, TextDocumentPositionParams, CompletionItem } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ConfigService, ServiceConfig } from './config';

/**
 * The {@link Analyzer} class is the entry point of the verification API.
 * Needs to be created as an object.
 *
 */
export class Analyzer {
  private configService: ConfigService;
  private validConfig!: ServiceConfig;

  constructor() {
    this.configService = new ConfigService();
   }

  /**
   * Validates and loads a configuration file, only loads if the file is valid
   *
   * @param textDocument The text document representation of the .siarc.json
   * @returns Return an array of errors
   */
  public validateAndLoadServiceConfig(textDocument: TextDocument): Diagnostic[] {
    const errors = this.configService.validate(textDocument);
    // If there are no errors (return of the function is void), the input can not be parsed, we only validate parsable inputs
    if (!errors) {
      return [];
    }
    if (errors.length > 0) {
      return errors;
    }
    this.validConfig = JSON.parse(textDocument.getText()) as ServiceConfig;
    return [];
  }

  /**
   * Calls the configuration service to create a completions list depending of the loaded text document
   * 
   * @param textDocumentPosition The text position in the current opened configuration file
   * @returns A list with possible completion items
   * 
   */
  public createConfigCompletion(textDocumentPosition: TextDocumentPositionParams): CompletionItem[] {
    return this.configService.createCompletion(textDocumentPosition);
  }
}

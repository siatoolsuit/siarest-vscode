import { Diagnostic } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ConfigService, ServiceConfig } from './config';

/**
 * The {@link Analyzer} class is the entry point of the verification API.
 * Needs to be created as an object.
 *
 */
export class Analyzer {
  private configValidator: ConfigService;
  private serviceConfig!: ServiceConfig;

  constructor() {
    this.configValidator = new ConfigService();
   }

  /**
   * Loads and validates a configuration file
   *
   * @param textDocument The text document representation of the .siarc.json
   * @returns Return an array of errors
   */
  public validateAndLoadServiceConfig(textDocument: TextDocument): Diagnostic[] {
    const errors = this.configValidator.validate(textDocument);
    // If there are no errors, the input can not be parsed, we only validate parsable inputs
    if (!errors) {
      return [];
    }
    if (errors.length > 0) {
      return errors;
    }
    this.serviceConfig = JSON.parse(textDocument.getText()) as ServiceConfig;
    return [];
  }
}

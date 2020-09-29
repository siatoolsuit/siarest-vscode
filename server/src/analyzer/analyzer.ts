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

  set config(text: string) {
    this.validConfig = JSON.parse(text);
  }
}

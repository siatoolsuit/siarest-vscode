import { CancellationToken, CompletionItem, CompletionParams } from 'vscode-languageserver';
import { ServiceConfig } from './config';

export interface SemanticError {
  position: { start: number; end: number };
  message: string;
}

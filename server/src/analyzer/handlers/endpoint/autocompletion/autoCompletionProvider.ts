import { CancellationToken, CompletionItem, CompletionParams } from 'vscode-languageserver/node';
import { ServiceConfig } from '../../../config';
import { SemanticError } from '../../../types';

export class AutoCompletionProvider {
  constructor(protected currentServiceName: string, protected currentConfig?: ServiceConfig) {}

  set config(newConfig: ServiceConfig | undefined) {
    this.currentConfig = newConfig;
  }

  get serviceName(): string {
    return this.currentServiceName;
  }
  /**
   * provideCompletionItems
   */
  public provideCompletionItems(params: CompletionParams, token: CancellationToken): CompletionItem[] {
    const completionItems: CompletionItem[] = [];
    return completionItems;
  }
}

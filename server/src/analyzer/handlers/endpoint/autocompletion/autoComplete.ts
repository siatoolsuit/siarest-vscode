import { CancellationToken, CompletionItem, CompletionParams } from 'vscode-languageserver/node';

export class AutoComplete {
  /**
   * provideCompletionItems
   */
  public provideCompletionItems(params: CompletionParams, token: CancellationToken): CompletionItem[] {
    const completionItems: CompletionItem[] = [];

    return completionItems;
  }
}

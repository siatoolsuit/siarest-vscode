import { CancellationToken, CompletionItem, CompletionParams, TextEdit } from 'vscode-languageserver/node';
import { Endpoint, ServiceConfig } from '../../../config';
import { SemanticError } from '../../../types';

export class AutoCompletionProvider {
  completionItems: CompletionItem[];

  constructor(protected currentServiceName: string, protected currentConfig?: ServiceConfig) {
    this.completionItems = this.generateCompletionItems();
  }

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
    console.debug(params);

    this.completionItems.forEach((completionItem) => {
      completionItem.textEdit = TextEdit.insert(params.position, 'ABC');
    });

    return this.completionItems;
  }

  generateCompletionItems(): CompletionItem[] {
    const completionItems: CompletionItem[] = [];

    this.currentConfig?.endpoints.forEach((endpoint) => {
      const completionItem = this.createEndpointCompletionItem(endpoint);

      completionItems.push(completionItem);
    });

    return completionItems;
  }

  private createEndpointCompletionItem(endpoint: Endpoint): CompletionItem {
    const label: string = endpoint.path.toUpperCase();

    let completionItem = CompletionItem.create(label);

    completionItem.detail = 'string';
    completionItem.documentation = `Path ${endpoint.path} for Service ${this.config?.name} with BaseURI ${this.config?.baseUri}`;

    return completionItem;
  }
}

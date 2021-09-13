import { Endpoint, ServiceConfig } from 'src/analyzer/config';
import { CancellationToken, CompletionItem, CompletionParams, MarkupContent, Position, TextEdit } from 'vscode-languageserver/node';

interface Compl extends CompletionItem {}

export class AutoCompletionService {
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
    this.completionItems.forEach((completionItem) => {
      let endpoint = this.currentConfig?.endpoints.find((endpoint) => {
        if (endpoint.path === completionItem.filterText) {
          return endpoint;
        }
      });

      if (endpoint) {
        completionItem.textEdit = TextEdit.insert(params.position, endpoint.path);
      }
    });

    return this.completionItems;
  }

  // TODO use this onConnection.onCompletionResolve()
  private generateCompletionItems(): CompletionItem[] {
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
    completionItem.documentation = {
      kind: 'markdown',
      value: ['## Service', `${this.currentConfig?.name}`, `${endpoint.path}`, '```typescript', `${this.currentConfig?.baseUri}`, '```'].join('\n'),
    };
    completionItem.filterText = endpoint.path;

    return completionItem;
  }
}

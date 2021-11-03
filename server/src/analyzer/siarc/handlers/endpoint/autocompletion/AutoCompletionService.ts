import { CancellationToken, CompletionItem, CompletionParams, TextEdit } from 'vscode-languageserver/node';
import { ServiceConfig, Endpoint } from '../../../../config';

export class AutoCompletionService {
  completionItems: CompletionItem[] = [];

  constructor() {}
  /**
   * provideCompletionItems
   */
  public provideCompletionItems(params: CompletionParams, token: CancellationToken, currentConfigs: ServiceConfig[]): CompletionItem[] {
    this.completionItems.forEach((completionItem) => {
      let endpoint: Endpoint | undefined;
      currentConfigs.forEach((serviceConfig) => {
        endpoint = serviceConfig?.endpoints.find((endpoint) => {
          if (endpoint.path === completionItem.filterText) {
            return endpoint;
          }
        });
      });

      if (endpoint) {
        completionItem.textEdit = TextEdit.insert(params.position, endpoint.path);
      }
    });

    return this.completionItems;
  }

  public generateCompletionItems(currentConfig: ServiceConfig): CompletionItem[] {
    const completionItems: CompletionItem[] = [];
    console.log('Generate completion ' + currentConfig.endpoints);
    currentConfig?.endpoints.forEach((endpoint) => {
      const completionItem = this.createEndpointCompletionItem(endpoint, currentConfig);
      this.completionItems.push(completionItem);
    });

    return completionItems;
  }

  private createEndpointCompletionItem(endpoint: Endpoint, currentConfig: ServiceConfig): CompletionItem {
    const label: string = endpoint.path.toUpperCase();

    let completionItem = CompletionItem.create(label);

    completionItem.detail = 'string';
    completionItem.documentation = {
      kind: 'markdown',
      value: ['## Service', `${currentConfig?.name}`, `${endpoint.path}`, '```typescript', `${currentConfig?.baseUri}`, '```'].join('\n'),
    };
    completionItem.filterText = endpoint.path;

    return completionItem;
  }
}

import { CancellationToken, CompletionItem, CompletionParams, TextEdit } from 'vscode-languageserver/node';
import { connection } from '../../../server';
import { ServiceConfig, Endpoint } from '../../config';

export class AutoCompletionService {
  completionItems: CompletionItem[] = [];

  constructor() {}

  /**
   * Provides the specific completionsitems for an backend.
   * @param params
   * @param token
   * @param currentConfigs siarc configs
   * @returns
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

    // return the entries
    return this.completionItems;
  }

  /**
   * Generates completion items from siarc.json.
   * @param currentConfig siarc.json config
   * @returns List of completion items
   */
  public generateCompletionItems(currentConfig: ServiceConfig): CompletionItem[] {
    const completionItems: CompletionItem[] = [];
    connection.console.log('Generate completion ' + currentConfig.endpoints);
    // for each endpoint create an entry and add them to all entries
    currentConfig?.endpoints.forEach((endpoint) => {
      const completionItem = this.createEndpointCompletionItem(endpoint, currentConfig);
      completionItems.push(completionItem);
    });

    this.completionItems = completionItems;
    return completionItems;
  }

  /**
   * Creates a completionItem
   * @param endpoint Endpoints
   * @param currentConfig Siarc.json
   * @returns A completionitem
   */
  private createEndpointCompletionItem(endpoint: Endpoint, currentConfig: ServiceConfig): CompletionItem {
    const label: string = endpoint.path.toString();

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

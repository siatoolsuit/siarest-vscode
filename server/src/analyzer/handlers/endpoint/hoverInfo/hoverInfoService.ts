import { ServiceConfig } from 'src/analyzer/config';
import { Hover, HoverParams } from 'vscode-languageserver';

export class HoverInfoService {
  constructor(protected currentServiceName: string, protected currentConfig?: ServiceConfig) {}

  getInfo(textDocumentPosition: HoverParams): Hover | undefined {
    let docu: string = ['## Service', `${this.currentConfig?.name}`, '```typescript', `${this.currentConfig?.baseUri}`, '```'].join('\n');
    let hoverInfo: Hover = {
      contents: {
        kind: 'markdown',
        language: 'typescript',
        value: docu,
      },
    };

    textDocumentPosition.position.line;

    return hoverInfo;
  }
}

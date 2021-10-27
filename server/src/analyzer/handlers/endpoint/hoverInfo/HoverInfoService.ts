import { ServiceConfig } from '../../../config';
import { Hover, HoverParams, MarkupContent, MarkupKind } from 'vscode-languageserver';
import { isBetween } from '../../../utils/helper';
import { EndpointExpression } from '../../../types';

export class HoverInfoService {
  constructor(protected currentServiceName: string, protected currentConfig?: ServiceConfig) {}

  getInfo(textDocumentPosition: HoverParams, endPointsForFile?: EndpointExpression[]): Hover | undefined {
    if (!endPointsForFile) return;
    if (endPointsForFile.length < 1) return;

    const matchedEnpoint = endPointsForFile.find((endPointExpression) => {
      if (
        endPointExpression.start.line === textDocumentPosition.position.line &&
        isBetween(endPointExpression.start.character, endPointExpression.end.character, textDocumentPosition.position.character)
      ) {
        return endPointExpression;
      }
    });

    if (matchedEnpoint) {
      const additionalInfo = this.currentConfig?.endpoints.find((endPoint) => {
        if (endPoint.path === matchedEnpoint.path && endPoint.method === matchedEnpoint.method) {
          return endPoint;
        }
      });

      if (!additionalInfo) return;

      const markdown: MarkupContent = {
        kind: MarkupKind.Markdown,
        value: [
          '### Service ' + this.currentConfig?.name,
          'Operation: ' + additionalInfo.method,
          '```typescript',
          '```',
          this.currentConfig?.baseUri + matchedEnpoint.path,
        ].join('\n'),
      };

      const hoverInfo: Hover = {
        contents: markdown,
      };

      return hoverInfo;
    } else {
      return;
    }
  }
}

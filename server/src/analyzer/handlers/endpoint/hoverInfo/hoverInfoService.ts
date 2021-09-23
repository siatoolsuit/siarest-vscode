import { ServiceConfig } from '../../../config';
import { Hover, HoverParams, MarkupContent, MarkupKind } from 'vscode-languageserver';
import { isBetween } from '../../../utils/helper';
import { EndpointExpression } from '../../../types';

export class HoverInfoService {
  constructor(protected currentServiceName: string, protected currentConfig?: ServiceConfig) {}

  getInfo(textDocumentPosition: HoverParams, endPointsForFile?: EndpointExpression[]): Hover | undefined {
    if (!endPointsForFile) return;
    if (endPointsForFile.length < 1) return;

    const endPoint = endPointsForFile.find((endPointExpression) => {
      if (
        endPointExpression.start.line === textDocumentPosition.position.line &&
        isBetween(endPointExpression.start.character, endPointExpression.end.character, textDocumentPosition.position.character)
      ) {
        return endPointExpression;
      }
    });

    //TODO refactor rename etc

    if (endPoint) {
      const additionalInfo = this.currentConfig?.endpoints.find((eP) => {
        if (eP.path === endPoint.path) {
          return eP;
        }
      });

      if (!additionalInfo) return;

      const markdown: MarkupContent = {
        kind: MarkupKind.Markdown,
        value: [
          '## Service',
          '### ' + this.currentConfig?.name,
          'Operation: ' + additionalInfo.method,
          '```typescript',
          'Example()',
          '```',
          this.currentConfig?.baseUri + endPoint.path,
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

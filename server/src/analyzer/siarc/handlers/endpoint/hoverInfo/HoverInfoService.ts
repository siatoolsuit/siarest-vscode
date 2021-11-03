import { ServiceConfig } from '../../../../config';
import { Hover, HoverParams, MarkupContent, MarkupKind } from 'vscode-languageserver';
import { isBetween } from '../../../../utils/helper';
import { ClientExpression, EndpointExpression } from '../../../../types';
import { IProject } from '../../../..';

export class HoverInfoService {
  constructor() {}

  getInfo(
    textDocumentPosition: HoverParams,
    projectsByName: Map<string, IProject>,
    avaibaleEndpointsPerFile: Map<string, ClientExpression[]>,
    currentConfig?: ServiceConfig,
  ): Hover | undefined {
    if (!avaibaleEndpointsPerFile) return;
    if (avaibaleEndpointsPerFile.size < 1) return;

    // SIARC backend

    let matchedEnpoint: EndpointExpression | ClientExpression | undefined = undefined;

    avaibaleEndpointsPerFile.forEach((value, key) => {
      const found = value.find((endPointExpression) => {
        if (
          endPointExpression.start.line === textDocumentPosition.position.line &&
          isBetween(endPointExpression.start.character, endPointExpression.end.character, textDocumentPosition.position.character)
        ) {
          return endPointExpression;
        }
      });
      if (found) {
        matchedEnpoint = found;
      }
    });

    // matchedEnpoint = avaibaleEndpoints.find((endPointExpression) => {
    //   if (
    //     endPointExpression.start.line === textDocumentPosition.position.line &&
    //     isBetween(endPointExpression.start.character, endPointExpression.end.character, textDocumentPosition.position.character)
    //   ) {
    //     return endPointExpression;
    //   }
    // });

    if (matchedEnpoint) {
      const additionalInfo = currentConfig?.endpoints.find((endPoint) => {
        if (endPoint.path === matchedEnpoint?.path && endPoint.method === matchedEnpoint?.method) {
          return endPoint;
        }
      });

      if (additionalInfo) {
        if (currentConfig) {
          const markdown: MarkupContent = {
            kind: MarkupKind.Markdown,
            value: [
              '### Service ' + currentConfig?.name,
              'Operation: ' + additionalInfo.method,
              '```typescript',
              '```',
              currentConfig?.baseUri + 'matchedEnpoint.path',
            ].join('\n'),
          };

          const hoverInfo: Hover = {
            contents: markdown,
          };

          return hoverInfo;
        }
      } /*FRONTED*/ else {
        // TODO find api path in backends!
        // TODO markdown machen
        // TODO profit?
        let allEndpoints: ClientExpression[] = [];
        projectsByName.forEach((project, key) => {
          if (project.serviceConfig) {
            avaibaleEndpointsPerFile.forEach((endpoints, key) => {
              if (key.includes(project.rootPath)) {
                allEndpoints = allEndpoints.concat(endpoints);
              }
            });
          }
        });

        const matchedBackendEndpoint = allEndpoints.find((endPoint) => {
          let searchValue: string = endPoint.path;
          if (endPoint.path.startsWith('/')) {
            searchValue = searchValue.substring(1);
          }

          if (matchedEnpoint?.path.includes(searchValue)) {
            return endPoint;
          }
        });

        if (matchedBackendEndpoint) {
          const markdown: MarkupContent = {
            kind: MarkupKind.Markdown,
            value: [
              '### Backend ' + currentConfig?.name,
              'Operation: ' + matchedBackendEndpoint.method,
              '```typescript',
              '```',
              currentConfig?.baseUri + matchedBackendEndpoint.path,
            ].join('\n'),
          };

          const hoverInfo: Hover = {
            contents: markdown,
          };

          return hoverInfo;
        }
      }
    } else {
      return;
    }
  }
}

import { Hover, HoverParams, MarkupContent, MarkupKind } from 'vscode-languageserver';
import { getMatchedEndpoint, getProject, isBetween } from '../../../../utils/helper';
import { ClientExpression, EndpointExpression } from '../../../../types';
import { IProject } from '../../../..';

export class HoverInfoService {
  constructor() {}

  getInfo(
    hoverParams: HoverParams,
    projectsByName: Map<string, IProject>,
    avaibaleEndpointsPerFile: Map<string, ClientExpression[]>,
  ): Hover | undefined {
    if (!avaibaleEndpointsPerFile) return;
    if (avaibaleEndpointsPerFile.size < 1) return;

    // SIARC backend

    const position = hoverParams.position;
    const uri = hoverParams.textDocument.uri;

    const { matchedEnpoint, matchedEndpointUri } = getMatchedEndpoint(avaibaleEndpointsPerFile, position, uri);

    if (matchedEnpoint) {
      const project = getProject(projectsByName, hoverParams.textDocument.uri);
      let currentConfig = project.serviceConfig;
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
              currentConfig?.baseUri + matchedEnpoint.path,
            ].join('\n'),
          };

          const hoverInfo: Hover = {
            contents: markdown,
          };

          return hoverInfo;
        }
      } /*FRONTED*/ else {
        let allEndpoints: { clientExpression: ClientExpression; uri: string }[] = [];
        projectsByName.forEach((project, projectKey) => {
          if (project.serviceConfig) {
            avaibaleEndpointsPerFile.forEach((endpoints, key) => {
              if (key.includes(project.rootPath)) {
                endpoints.forEach((endPoint) => {
                  allEndpoints.push({ clientExpression: endPoint, uri: projectKey });
                });
              }
            });
          }
        });

        const matchedBackendEndpoint = allEndpoints.find((endPoint) => {
          let searchValue: string = endPoint.clientExpression.path;
          if (endPoint.clientExpression.path.startsWith('/')) {
            searchValue = searchValue.substring(1);
          }

          const test = matchedEnpoint?.path.replace(/[\'\`\/]/gi, '');
          const splits = test.split(/[+\s]\s*/);

          if (splits.includes(searchValue)) {
            return endPoint;
          }
        });

        if (matchedBackendEndpoint) {
          const project = projectsByName.get(matchedBackendEndpoint?.uri);
          currentConfig = project?.serviceConfig;
          const markdown: MarkupContent = {
            kind: MarkupKind.Markdown,
            value: [
              '### Backend ' + currentConfig?.name,
              'Operation: ' + matchedBackendEndpoint.clientExpression.method,
              '```typescript',
              '```',
              currentConfig?.baseUri + matchedBackendEndpoint.clientExpression.path,
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
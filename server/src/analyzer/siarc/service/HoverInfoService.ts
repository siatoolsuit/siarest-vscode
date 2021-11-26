import { Hover, HoverParams, MarkupContent, MarkupKind } from 'vscode-languageserver';
import { IProject, ClientExpression } from '../..';
import { Endpoint, ServiceConfig } from '../../config';
import { getMatchedEndpoint, getProject, parseURL, replaceArrayInJson } from '../../utils/helper';

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
      const project = getProject(projectsByName, uri);
      let currentConfig = project.serviceConfig;

      if (currentConfig) {
        const additionalInfo = currentConfig?.endpoints.find((endPoint) => {
          if (endPoint.path === matchedEnpoint?.path && endPoint.method === matchedEnpoint?.method) {
            return endPoint;
          }
        });

        if (additionalInfo) {
          if (currentConfig) {
            const hoverInfo: Hover = {
              contents: createHoverMarkdown(additionalInfo, currentConfig),
            };

            return hoverInfo;
          }
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

        const matchedEndpointSplit: string[] = parseURL(matchedEnpoint.path);
        const matchedBackendEndpoint = allEndpoints.find((endpoint) => {
          let searchValue: string = endpoint.clientExpression.path;
          if (searchValue.startsWith('/')) {
            searchValue = searchValue.substring(1);
          }

          const searchValueSplit = parseURL(searchValue);

          // const test = matchedEnpoint?.path.replace(/[\'\`\/]/gi, '');
          // const splits = test.split(/[+\s]\s*/);

          let found: boolean = false;
          matchedEndpointSplit.forEach((url, index) => {
            if (index >= searchValueSplit.length) {
              return;
            }

            const url2 = searchValueSplit[index];
            if (url === url2) {
              found = true;
            } else if (url2.startsWith(':')) {
              found = true;
            } else {
              found = false;
            }

            if (!found) {
              return;
            }
          });

          if (found) {
            return endpoint;
          }
        });

        if (matchedBackendEndpoint) {
          const project = projectsByName.get(matchedBackendEndpoint?.uri);
          currentConfig = project?.serviceConfig;
          if (currentConfig) {
            const additionalInfo = currentConfig?.endpoints.find((endPoint) => {
              if (
                endPoint.path === matchedBackendEndpoint?.clientExpression.path &&
                endPoint.method === matchedBackendEndpoint?.clientExpression.method
              ) {
                return endPoint;
              }
            });

            if (additionalInfo) {
              const hoverInfo: Hover = {
                contents: createHoverMarkdown(additionalInfo, currentConfig),
              };

              return hoverInfo;
            }
          }
        }
      }
    } else {
      return;
    }
  }
}

const createHoverMarkdown = (endpoint: Endpoint, serviceConfig: ServiceConfig): MarkupContent => {
  let content: string[] = [];

  const lineBreak = '  ';

  content.push('### Backend ' + serviceConfig.name + lineBreak);
  content.push('');
  content.push('Method: ' + endpoint.method + lineBreak);
  content.push(serviceConfig.baseUri + endpoint.path + lineBreak);

  if (endpoint.response) {
    content.push('**Result:** ' + lineBreak);
    content.push('');
    content.push('```typescript');

    if (typeof endpoint.response === 'string') {
      content.push(endpoint.response);
    } else {
      const jsonStringResult = replaceArrayInJson(endpoint.response);
      content.push(jsonStringResult);
    }

    content.push('```');
  }

  if (endpoint.request) {
    content.push('**Request:** ' + lineBreak);
    content.push('');
    content.push('```typescript');

    if (typeof endpoint.request === 'string') {
      content.push(endpoint.request);
    } else {
      const jsonStringResult = replaceArrayInJson(endpoint.request);
      content.push(jsonStringResult);
    }

    content.push('```');
  }

  return {
    kind: MarkupKind.Markdown,
    value: content.join('\n'),
  };
};

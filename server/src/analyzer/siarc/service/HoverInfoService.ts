import { Hover, HoverParams } from 'vscode-languageserver';
import { IProject, ClientExpression } from '../..';
import { createHoverMarkdown, getMatchedEndpoint, getProject, parseURL } from '../../utils/helper';

export class HoverInfoService {
  /**
   * Returns a specific info about the current endpoint.
   * @param hoverParams Hoverparms contains infos about the hover that occured.
   * @param projectsByName All projects.
   * @param avaibaleEndpointsPerFile List of defined endpoints per file.
   * @returns
   */
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

      /**
       * If the current file is inside an backend search in the specifi projects config.
       * Otherwise search all backends and find the api call.
       */
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
      } else {
        /**
         * Collects allEndpoints over all projects.
         */
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
        /**
         * Returns the first occurance of the specific endpoint.
         */
        const matchedBackendEndpoint = allEndpoints.find((endpoint) => {
          let searchValue: string = endpoint.clientExpression.path;
          if (searchValue.startsWith('/')) {
            searchValue = searchValue.substring(1);
          }

          const searchValueSplit = parseURL(searchValue);

          // const test = matchedEnpoint?.path.replace(/[\'\`\/]/gi, '');
          // const splits = test.split(/[+\s]\s*/);

          let found: boolean = false;
          /**
           * Splits and url/api endpoint and compare it against endpoint uri
           */
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

        /**
         * If an endpoint was found in aboves comparison create an hoverinfo.
         */
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
    }
  }
}

import { Hover, HoverParams } from 'vscode-languageserver';
import { IProject, ClientExpression } from '../..';
import { createHoverMarkdown, getMatchedEndpoint, getProject, parseURL } from '../../utils/helper';
import { URI } from 'vscode-uri';

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

    // Position where the hover event occured
    const position = hoverParams.position;
    // uri of the file where the event happend
    const uri = URI.parse(hoverParams.textDocument.uri).path;

    // find the endpoints by the uri and the position
    const { matchedEnpoint, matchedEndpointUri } = getMatchedEndpoint(avaibaleEndpointsPerFile, position, uri);

    // if the endpoint was found
    if (matchedEnpoint) {
      //  get the project of the file
      const project = getProject(projectsByName, uri);
      let currentConfig = project.serviceConfig;

      // If the current file is inside an backend search in the specific projects config.
      if (currentConfig) {
        const additionalInfo = currentConfig?.endpoints.find((endPoint) => {
          if (endPoint.path === matchedEnpoint?.path && endPoint.method === matchedEnpoint?.method) {
            return endPoint;
          }
        });
        // if the information about the endpoint was found in the .siarc.json
        if (additionalInfo) {
          // create a Hover object with the information
          const hoverInfo: Hover = {
            contents: createHoverMarkdown(additionalInfo, currentConfig),
          };

          return hoverInfo;
        }
        // Else search all backends and find the api call.
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

          // Splits a url/api endpoint and compare it against endpoint uri
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


        // If an endpoint was found in aboves comparison create an hoverinfo.
        if (matchedBackendEndpoint) {
          // find the project from where the endpoint is actually configured
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

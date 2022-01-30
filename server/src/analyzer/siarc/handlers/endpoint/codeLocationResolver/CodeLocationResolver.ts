import { CancellationToken, DefinitionParams, Location, LocationLink, Range, ReferenceParams } from 'vscode-languageserver/node';
import { ClientExpression, EndpointExpression, EndpointMatch, IProject } from '../../../..';
import {
  createFunctionRangeFromClienexpression,
  createRangeFromClienexpression,
  getEndpointsPerFile,
  getMatchedEndpoint,
  getProject,
  parseURL,
} from '../../../../utils/helper';
import { URI } from 'vscode-uri';

export class CodeLocationResolver {
  public findDefinitions(
    params: DefinitionParams,
    token: CancellationToken,
    projectsByName: Map<string, IProject>,
    avaibaleEndpointsPerFile: Map<string, ClientExpression[]>,
  ): LocationLink[] {
    if (token.isCancellationRequested) {
      return [];
    }

    // position of the reference event
    const position = params.position;
    // in which file the event happend
    const uri = URI.parse(params.textDocument.uri).path;
    // array for definitions found
    const locationLinks: LocationLink[] = [];
    // get the endpoints where the event was thrown
    const { matchedEnpoint, matchedEndpointUri } = getMatchedEndpoint(avaibaleEndpointsPerFile, position, uri);

    if (matchedEnpoint && matchedEndpointUri) {
      let allEndpoints: EndpointMatch[] = [];
      // get all endpoints for all projects
      projectsByName.forEach((project, projectRootUri) => {
        if (project.serviceConfig) {
          allEndpoints = allEndpoints.concat(getEndpointsPerFile(project, avaibaleEndpointsPerFile));
        }
      });

      const matchedBackendEndpoints: EndpointMatch[] = [];
      // split the path of the endpoint by /
      const matchedEndpointSplit = parseURL(matchedEnpoint.path);
      allEndpoints.forEach((endpoint) => {
        let searchValue: string = endpoint.clientExpression.path;
        // remove the first slash
        if (endpoint.clientExpression.path.startsWith('/')) {
          searchValue = searchValue.substring(1);
        }

        // split the path of the endpoint by /
        const searchValueSplit = parseURL(searchValue);

        let found: boolean = false;
        // compare the found endpoint with the endpoint of the event
        matchedEndpointSplit.forEach((url, index) => {
          if (index >= searchValueSplit.length) {
            return;
          }

          const url2 = searchValueSplit[index];
          if (url === url2) {
            found = true;
          } else if (url2.startsWith(':')) {
            // check if a url parameter was used
            found = true;
          } else {
            found = false;
          }

          // if the first did not match return
          if (!found) {
            return;
          }
        });

        if (found) {
          matchedBackendEndpoints.push(endpoint);
        }
      });

      // for each matched endpoint create a LocationLink for Visual Studio Code
      matchedBackendEndpoints.forEach((matchedBackendEndpoint) => {
        if (matchedBackendEndpoint) {
          let targetRange: Range | undefined = undefined;
          let targetSelectionRange: Range | undefined = undefined;
          let targetUri: string | undefined = undefined;

          const endpointExpression = matchedBackendEndpoint.clientExpression as EndpointExpression;

          // targetRange and selectionRange hightlight the code for the range
          targetRange = createRangeFromClienexpression(endpointExpression);
          targetSelectionRange = createFunctionRangeFromClienexpression(endpointExpression);
          // location of the found definition
          targetUri = matchedBackendEndpoint.uri;

          if (targetRange && targetSelectionRange && targetUri) {
            const locationLink: LocationLink = {
              targetRange: targetRange,
              targetSelectionRange: targetSelectionRange,
              targetUri: targetUri.replace(/file:\/*/gm, ''),
            };

            locationLinks.push(locationLink);
          }
        }
      });
    }

    return locationLinks;
  }

  findReferences(
    params: ReferenceParams,
    token: CancellationToken,
    projectsByProjectNames: Map<string, IProject>,
    avaibaleEndpointsPerFile: Map<string, ClientExpression[]>,
  ): Location[] {
    if (token.isCancellationRequested) {
      return [];
    }

    // position of the reference event
    const position = params.position;
    // in which file the event happend
    const uri = URI.parse(params.textDocument.uri).path;
    // array for references found
    const locations: Location[] = [];

    const currentProject = getProject(projectsByProjectNames, uri);
    const frontendsAllowedToUse = currentProject.serviceConfig?.frontends;

    // Frontends
    const projectsWithoutConfig: IProject[] = [];

    // find all frontends
    if (frontendsAllowedToUse) {
      if (frontendsAllowedToUse.length > 0) {
        projectsByProjectNames.forEach((project, projectRoot) => {
          if (!project.serviceConfig && frontendsAllowedToUse.includes(JSON.parse(project.packageJson).name)) {
            projectsWithoutConfig.push(project);
          }
        });
      }
    } else {
      projectsByProjectNames.forEach((project, projectRoot) => {
        if (!project.serviceConfig) {
          projectsWithoutConfig.push(project);
        }
      });
    }

    // get the endpoints where the event was thrown
    const { matchedEnpoint, matchedEndpointUri } = getMatchedEndpoint(avaibaleEndpointsPerFile, position, uri);

    if (matchedEnpoint && matchedEndpointUri) {
      let frontendUsages: EndpointMatch[] = [];

      // collect all frontend endpoint ussages from analyzed endpoints
      projectsWithoutConfig.forEach((project) => {
        frontendUsages = frontendUsages.concat(getEndpointsPerFile(project, avaibaleEndpointsPerFile));
      });

      // split the path of the endpoint by /
      const matchedEnpointSplit = parseURL(matchedEnpoint.path.substring(1));
      const matchedFrontendUsages: EndpointMatch[] = [];
      frontendUsages.forEach((endpoint) => {
        let searchValue: string = endpoint.clientExpression.path;
        if (searchValue.startsWith('/')) {
          searchValue = searchValue.substring(1);
        }

        // split the path of the endpoint by /
        const searchValueSplit = parseURL(searchValue);

        let found: boolean = false;
        // compare the found endpoint with the endpoint of the event
        matchedEnpointSplit.forEach((url, index) => {
          if (index >= searchValueSplit.length) {
            return;
          }

          const url2 = searchValueSplit[index];
          if (url === url2) {
            found = true;
          } else if (url.startsWith(':')) {
            // check if a url parameter was used
            found = true;
          } else {
            found = false;
          }

          // if the first did not match return
          if (!found) {
            return;
          }
        });

        if (found) {
          matchedFrontendUsages.push(endpoint);
        }
      });

      // for each match create a location for vs code
      matchedFrontendUsages.forEach((matchedFrontendUsage) => {
        if (matchedFrontendUsage) {
          const range = createRangeFromClienexpression(matchedFrontendUsage.clientExpression);
          const location: Location = Location.create(matchedFrontendUsage?.uri, range);
          locations.push(location);
        }
      });
    }
    return locations;
  }
}

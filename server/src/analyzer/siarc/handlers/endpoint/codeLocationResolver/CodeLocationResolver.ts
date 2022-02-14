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
  /**
   * Compares the event location with the analysed files and provides a link to them
   * @param params Params that get provided by the event
   * @param token A token, which can interrupt the request
   * @param projectsByName List of all projects indexed
   * @param avaibaleEndpointsPerFile List of analyzed files
   * @returns A list of found definitions
   */
  public findDefinitions(
    params: DefinitionParams,
    token: CancellationToken,
    projectsByName: Map<string, IProject>,
    avaibaleEndpointsPerFile: Map<string, ClientExpression[]>,
  ): LocationLink[] {
    if (token.isCancellationRequested) {
      return [];
    }

    // Position of the definiton event
    const position = params.position;
    // In which file the event happend
    const uri = URI.parse(params.textDocument.uri).path;
    // Array for definitions found
    const locationLinks: LocationLink[] = [];
    // Get the endpoints where the event was thrown
    const { matchedEnpoint, matchedEndpointUri } = getMatchedEndpoint(avaibaleEndpointsPerFile, position, uri);

    if (matchedEnpoint && matchedEndpointUri) {
      let allEndpoints: EndpointMatch[] = [];
      // Get all endpoints for all projects
      projectsByName.forEach((project, projectRootUri) => {
        if (project.serviceConfig) {
          allEndpoints = allEndpoints.concat(getEndpointsPerFile(project, avaibaleEndpointsPerFile));
        }
      });

      const matchedBackendEndpoints: EndpointMatch[] = [];
      // Split the path of the endpoint by /
      const matchedEndpointSplit = parseURL(matchedEnpoint.path);
      allEndpoints.forEach((endpoint) => {
        let searchValue: string = endpoint.clientExpression.path;
        // Remove the first slash
        if (endpoint.clientExpression.path.startsWith('/')) {
          searchValue = searchValue.substring(1);
        }

        // Split the path of the endpoint by /
        const searchValueSplit = parseURL(searchValue);

        let found: boolean = false;
        // Compare the found endpoint with the endpoint of the event
        matchedEndpointSplit.forEach((url, index) => {
          if (index >= searchValueSplit.length) {
            return;
          }

          const url2 = searchValueSplit[index];
          if (url === url2) {
            found = true;
          } else if (url2.startsWith(':')) {
            // Check if a url parameter was used
            found = true;
          } else {
            found = false;
          }

          // If the first did not match return
          if (!found) {
            return;
          }
        });

        if (found) {
          matchedBackendEndpoints.push(endpoint);
        }
      });

      // For each matched endpoint create a LocationLink for Visual Studio Code
      matchedBackendEndpoints.forEach((matchedBackendEndpoint) => {
        if (matchedBackendEndpoint) {
          let targetRange: Range | undefined = undefined;
          let targetSelectionRange: Range | undefined = undefined;
          let targetUri: string | undefined = undefined;

          const endpointExpression = matchedBackendEndpoint.clientExpression as EndpointExpression;

          // TargetRange and selectionRange hightlight the code for the range
          targetRange = createRangeFromClienexpression(endpointExpression);
          targetSelectionRange = createFunctionRangeFromClienexpression(endpointExpression);
          // Location of the found definition
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

  /**
   * Compares the event location with the analysed files and provides a link to the references.
   * @param params Events provided by the event
   * @param token A cancelation token to stop the event request
   * @param projectsByName List of all projects indexed
   * @param avaibaleEndpointsPerFile List of analyzed files
   * @returns Returns a list of found referneces
   */
  public findReferences(
    params: ReferenceParams,
    token: CancellationToken,
    projectsByProjectNames: Map<string, IProject>,
    avaibaleEndpointsPerFile: Map<string, ClientExpression[]>,
  ): Location[] {
    if (token.isCancellationRequested) {
      return [];
    }

    // Position of the reference event
    const position = params.position;
    // In which file the event happend
    const uri = URI.parse(params.textDocument.uri).path;
    // Array for references found
    const locations: Location[] = [];

    const currentProject = getProject(projectsByProjectNames, uri);
    const frontendsAllowedToUse = currentProject.serviceConfig?.frontends;

    // Frontends
    const projectsWithoutConfig: IProject[] = [];

    // Find all frontends
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

    // Get the endpoints where the event was thrown
    const { matchedEnpoint, matchedEndpointUri } = getMatchedEndpoint(avaibaleEndpointsPerFile, position, uri);

    if (matchedEnpoint && matchedEndpointUri) {
      let frontendUsages: EndpointMatch[] = [];

      // Collect all frontend endpoint ussages from analyzed endpoints
      projectsWithoutConfig.forEach((project) => {
        frontendUsages = frontendUsages.concat(getEndpointsPerFile(project, avaibaleEndpointsPerFile));
      });

      // Split the path of the endpoint by /
      const matchedEnpointSplit = parseURL(matchedEnpoint.path.substring(1));
      const matchedFrontendUsages: EndpointMatch[] = [];
      frontendUsages.forEach((endpoint) => {
        let searchValue: string = endpoint.clientExpression.path;
        if (searchValue.startsWith('/')) {
          searchValue = searchValue.substring(1);
        }

        // Split the path of the endpoint by /
        const searchValueSplit = parseURL(searchValue);

        let found: boolean = false;
        // Compare the found endpoint with the endpoint of the event
        matchedEnpointSplit.forEach((url, index) => {
          if (index >= searchValueSplit.length) {
            return;
          }

          const url2 = searchValueSplit[index];
          if (url === url2) {
            found = true;
          } else if (url.startsWith(':')) {
            // Check if a url parameter was used
            found = true;
          } else {
            found = false;
          }

          // If the first did not match return
          if (!found) {
            return;
          }
        });

        if (found) {
          matchedFrontendUsages.push(endpoint);
        }
      });

      // For each match create a location for vs code
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

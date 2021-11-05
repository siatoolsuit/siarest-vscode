import { CancellationToken, DefinitionParams, Location, LocationLink, Position, Range, ReferenceParams } from 'vscode-languageserver/node';
import { ClientExpression, EndpointExpression, EndpointMatch, IProject } from '../../../..';
import { connection } from '../../../../../server';
import {
  createFunctionRangeFromClienexpression,
  createRangeFromClienexpression,
  getEndpointsPerFile,
  getMatchedEndpoint,
  getProject,
  isBetween,
  sendNotification,
} from '../../../../utils/helper';

export class CodeLocationResolver {
  public resolve(
    params: DefinitionParams,
    token: CancellationToken,
    projectsByName: Map<string, IProject>,
    avaibaleEndpointsPerFile: Map<string, ClientExpression[]>,
  ): LocationLink[] {
    if (token.isCancellationRequested) {
      return [];
    }

    const position = params.position;
    const uri = params.textDocument.uri;
    const locationLinks: LocationLink[] = [];

    const { matchedEnpoint, matchedEndpointUri } = getMatchedEndpoint(avaibaleEndpointsPerFile, position, uri);

    if (matchedEnpoint && matchedEndpointUri) {
      let allEndpoints: EndpointMatch[] = [];
      projectsByName.forEach((project, projectRootUri) => {
        if (project.serviceConfig) {
          allEndpoints = allEndpoints.concat(getEndpointsPerFile(project, avaibaleEndpointsPerFile));
        }
      });

      const matchedBackendEndpoints: EndpointMatch[] = [];
      allEndpoints.forEach((endpoint) => {
        let searchValue: string = endpoint.clientExpression.path;
        if (endpoint.clientExpression.path.startsWith('/')) {
          searchValue = searchValue.substring(1);
        }

        const cleanedEndpointPath = matchedEnpoint?.path.replace(/[\'\`\/]/gi, '');
        const splits = cleanedEndpointPath.split(/[+\s]\s*/);

        if (splits.includes(searchValue)) {
          matchedBackendEndpoints.push(endpoint);
        }
      });

      matchedBackendEndpoints.forEach((matchedBackendEndpoint) => {
        if (matchedBackendEndpoint) {
          let targetRange: Range | undefined = undefined;
          let targetSelectionRange: Range | undefined = undefined;
          let targetUri: string | undefined = undefined;

          const endpointExpression = matchedBackendEndpoint.clientExpression as EndpointExpression;

          targetRange = createRangeFromClienexpression(endpointExpression);
          // TODO whole function needs to be in targetSelection Range => StaticExpressAnalyzer

          targetSelectionRange = createFunctionRangeFromClienexpression(endpointExpression);

          targetUri = matchedBackendEndpoint.uri;

          if (targetRange && targetSelectionRange && targetUri) {
            const locationLink: LocationLink = {
              targetRange: targetRange,
              targetSelectionRange: targetSelectionRange,
              targetUri: targetUri,
            };

            locationLinks.push(locationLink);
          }
        }
      });
    }

    return locationLinks;
  }

  resolveReferences(
    params: ReferenceParams,
    token: CancellationToken,
    projectsByProjectNames: Map<string, IProject>,
    avaibaleEndpointsPerFile: Map<string, ClientExpression[]>,
  ): Location[] {
    if (token.isCancellationRequested) {
      return [];
    }

    const position = params.position;
    const uri = params.textDocument.uri;
    const locations: Location[] = [];

    const currentProject = getProject(projectsByProjectNames, uri);
    const frontendsAllowedToUse = currentProject.serviceConfig?.frontends;

    // Frontends
    const projectsWithoutConfig: IProject[] = [];

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

    const { matchedEnpoint, matchedEndpointUri } = getMatchedEndpoint(avaibaleEndpointsPerFile, position, uri);

    if (matchedEnpoint && matchedEndpointUri) {
      let frontendUsages: EndpointMatch[] = [];

      projectsWithoutConfig.forEach((project) => {
        frontendUsages = frontendUsages.concat(getEndpointsPerFile(project, avaibaleEndpointsPerFile));
      });

      const matchedFrontendUsages: EndpointMatch[] = [];
      frontendUsages.forEach((endpoint) => {
        let searchValue: string = matchedEnpoint?.path;
        if (searchValue.startsWith('/')) {
          searchValue = searchValue.substring(1);
        }

        // TODO split for params?
        const cleanedEndpointPath = endpoint.clientExpression.path.replace(/[\'\`\/]/gi, '');
        const splits = cleanedEndpointPath.split(/[+\s]\s*/);

        if (splits.includes(searchValue)) {
          matchedFrontendUsages.push(endpoint);
        }
      });

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

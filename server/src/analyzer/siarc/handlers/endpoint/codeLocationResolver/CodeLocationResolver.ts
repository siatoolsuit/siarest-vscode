import { CancellationToken, DefinitionParams, Location, LocationLink, Position, Range, ReferenceParams } from 'vscode-languageserver/node';
import { ClientExpression, EndpointExpression, IProject } from '../../../..';
import { createRangeFromClienexpression, getEndpointsPerFile, getMatchedEndpoint, getProject, isBetween } from '../../../../utils/helper';

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
      let allEndpoints: { clientExpression: ClientExpression; uri: string }[] = [];
      projectsByName.forEach((project, projectRootUri) => {
        if (project.serviceConfig) {
          allEndpoints = allEndpoints.concat(getEndpointsPerFile(project, avaibaleEndpointsPerFile));
        }
      });

      const matchedBackendEndpoint = allEndpoints.find((endPoint) => {
        let searchValue: string = endPoint.clientExpression.path;
        if (endPoint.clientExpression.path.startsWith('/')) {
          searchValue = searchValue.substring(1);
        }

        const cleanedEndpointPath = matchedEnpoint?.path.replace(/[\'\`\/]/gi, '');
        const splits = cleanedEndpointPath.split(/[+\s]\s*/);

        if (splits.includes(searchValue)) {
          return endPoint;
        }
      });

      if (matchedBackendEndpoint) {
        let targetRange: Range | undefined = undefined;
        let targetSelectionRange: Range | undefined = undefined;
        let targetUri: string | undefined = undefined;

        targetRange = createRangeFromClienexpression(matchedBackendEndpoint.clientExpression);
        // TODO whole function needs to be in targetSelection Range => StaticExpressAnalyzer
        targetSelectionRange = createRangeFromClienexpression(matchedBackendEndpoint.clientExpression);
        targetUri = matchedBackendEndpoint.uri;

        if (!targetRange || !targetSelectionRange || !targetUri) {
          return []; // TODO
        }

        const locationLink: LocationLink = {
          targetRange: targetRange,
          targetSelectionRange: targetSelectionRange,
          targetUri: targetUri,
        };

        locationLinks.push(locationLink);
      }
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

    // Frontends
    const projectsWithoutConfig: IProject[] = [];
    projectsByProjectNames.forEach((project, projectRoot) => {
      if (!project.serviceConfig) {
        projectsWithoutConfig.push(project);
      }
    });

    const { matchedEnpoint, matchedEndpointUri } = getMatchedEndpoint(avaibaleEndpointsPerFile, position, uri);

    if (matchedEnpoint && matchedEndpointUri) {
      let frontendUsages: { clientExpression: ClientExpression; uri: string }[] = [];

      projectsWithoutConfig.forEach((project) => {
        frontendUsages = frontendUsages.concat(getEndpointsPerFile(project, avaibaleEndpointsPerFile));
      });

      const matchedFrontendUsage = frontendUsages.find((endPoint) => {
        let searchValue: string = matchedEnpoint?.path;
        if (searchValue.startsWith('/')) {
          searchValue = searchValue.substring(1);
        }

        const cleanedEndpointPath = endPoint.clientExpression.path.replace(/[\'\`\/]/gi, '');
        const splits = cleanedEndpointPath.split(/[+\s]\s*/);

        if (splits.includes(searchValue)) {
          return endPoint;
        }
      });

      if (matchedFrontendUsage) {
        const range = createRangeFromClienexpression(matchedFrontendUsage.clientExpression);
        const location: Location = Location.create(matchedFrontendUsage?.uri, range);
        locations.push(location);
      }
    }
    return locations;
  }
}

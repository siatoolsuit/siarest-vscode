import { CancellationToken, DefinitionParams, Location, LocationLink, Range, ReferenceParams } from 'vscode-languageserver/node';
import { ClientExpression, EndpointExpression, IProject } from '../../../..';
import { getProject, isBetween } from '../../../../utils/helper';

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
    const uri = params.textDocument;
    const locationLinks: LocationLink[] = [];

    let matchedEnpoint!: EndpointExpression | ClientExpression;
    let matchedEndpointUri: string | undefined;

    avaibaleEndpointsPerFile.forEach((value, fileUri) => {
      const found = value.find((endPointExpression) => {
        if (
          endPointExpression.start.line === position.line &&
          isBetween(endPointExpression.start.character, endPointExpression.end.character, position.character)
        ) {
          return endPointExpression;
        }
      });

      if (found) {
        matchedEnpoint = found;
        matchedEndpointUri = fileUri;
      }
    });

    if (matchedEnpoint && matchedEndpointUri) {
      let allEndpoints: { clientExpression: ClientExpression; uri: string }[] = [];
      projectsByName.forEach((project, projectRootUri) => {
        if (project.serviceConfig) {
          avaibaleEndpointsPerFile.forEach((endpoints, fileUri) => {
            if (fileUri.includes(project.rootPath)) {
              endpoints.forEach((endPoint) => {
                allEndpoints.push({ clientExpression: endPoint, uri: fileUri });
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

        const test = matchedEnpoint?.path.replace(/[\'\`]/gi, '');
        const splits = test.split(/[+\s]\s*/);

        if (splits.includes(searchValue)) {
          return endPoint;
        }
      });

      if (matchedBackendEndpoint) {
        let targetRange: Range | undefined = undefined;
        let targetSelectionRange: Range | undefined = undefined;
        let targetUri: string | undefined = undefined;

        const startLine = matchedBackendEndpoint.clientExpression.start.line;
        const startChar = matchedBackendEndpoint.clientExpression.start.character;
        const endLine = matchedBackendEndpoint.clientExpression.end.line;
        const endChar = matchedBackendEndpoint.clientExpression.end.character;

        targetRange = Range.create(startLine, startChar, endLine, endChar);
        // TODO whole function needs to be in targetSelection Range => StaticExpressAnalyzer
        targetSelectionRange = Range.create(startLine, startChar, endLine, endChar);
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
    const uri = params.textDocument;
    const locations: Location[] = [];

    // Frontends
    const projectsWithoutConfig: IProject[] = [];
    projectsByProjectNames.forEach((project, projectRoot) => {
      if (!project.serviceConfig) {
        projectsWithoutConfig.push(project);
      }
    });

    let matchedEnpoint!: EndpointExpression | ClientExpression;
    let matchedEndpointUri: string | undefined;

    avaibaleEndpointsPerFile.forEach((value, fileUri) => {
      const found = value.find((endPointExpression) => {
        if (
          endPointExpression.start.line === position.line &&
          isBetween(endPointExpression.start.character, endPointExpression.end.character, position.character)
        ) {
          return endPointExpression;
        }
      });

      if (found) {
        matchedEnpoint = found;
        matchedEndpointUri = fileUri;
      }
    });

    if (matchedEnpoint && matchedEndpointUri) {
      const frontendUsages: { clientExpression: ClientExpression; uri: string }[] = [];

      projectsWithoutConfig.forEach((project) => {
        avaibaleEndpointsPerFile.forEach((endpoints, key) => {
          if (key.includes(project.rootPath)) {
            endpoints.forEach((endPoint) => {
              frontendUsages.push({ clientExpression: endPoint, uri: key });
            });
          }
        });
      });

      console.log(frontendUsages);

      const matchedFrontendUsage = frontendUsages.find((endPoint) => {
        let searchValue: string = matchedEnpoint?.path;
        if (searchValue.startsWith('/')) {
          searchValue = searchValue.substring(1);
        }

        const test = endPoint.clientExpression.path.replace(/[\'\`]/gi, '');
        const splits = test.split(/[+\s]\s*/);

        if (splits.includes(searchValue)) {
          return endPoint;
        }
      });

      if (matchedFrontendUsage) {
        const startLine = matchedFrontendUsage.clientExpression.start.line;
        const startChar = matchedFrontendUsage.clientExpression.start.character;
        const endLine = matchedFrontendUsage.clientExpression.end.line;
        const endChar = matchedFrontendUsage.clientExpression.end.character;

        const range: Range = Range.create(startLine, startChar, endLine, endChar);
        const location: Location = Location.create(matchedFrontendUsage?.uri, range);
        locations.push(location);
      }
    }
    return locations;
  }
}

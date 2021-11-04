import { CancellationToken, DefinitionParams, LocationLink, Range } from 'vscode-languageserver/node';
import { ClientExpression, EndpointExpression, IProject } from '../../../..';
import { getProject, isBetween } from '../../../../utils/helper';

export class DefinitionResolver {
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
}

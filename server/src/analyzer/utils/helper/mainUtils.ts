import { Connection, Diagnostic, DiagnosticSeverity, Position, Range, _Connection } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IProject } from '../..';
import { Endpoint } from '../../config';
import { ClientExpression, EndpointExpression } from '../../types';

/**
 * Send a notification to vscode
 * @param connection
 * @param message
 */
export const sendNotification = (connection: Connection, message: any) => {
  // TODO Won't fix atm does not do anything atm
  // connection.sendNotification(message);
};

/**
 * Checks if the API path is defined
 * @param path API path
 * @returns
 */
export const findEndpointForPath = (path: string, endpoints: Endpoint[]): Endpoint | undefined => {
  return endpoints.find((endpoints) => endpoints.path === path);
};

export const isBetween = (lower: number, upper: number, between: Number): Boolean => {
  return between >= lower && between <= upper ? true : false;
};

export const removeLastSymbol = (stringToRemove: string, symbol: string): string => {
  const temp = stringToRemove.split('');
  temp[stringToRemove.lastIndexOf(symbol)] = '';
  return temp.join('');
};

export const createDiagnostic = (
  document: TextDocument,
  message: string,
  start: number,
  end: number,
  diagnosticLevel: DiagnosticSeverity,
): Diagnostic => {
  return {
    message: message,
    range: {
      start: document.positionAt(start),
      end: document.positionAt(end),
    },
    severity: diagnosticLevel,
    source: 'Siarc-Toolkit',
  };
};

export const getEndPointsForFileName = (fileName: string, map: Map<any, any>): EndpointExpression[] | undefined => {
  // fileName = fileName.substring(fileName.lastIndexOf('/') + 1, fileName.length);
  return map.get(fileName);
};

export const getProject = (projectsByProjectNames: Map<string, IProject>, fileUri: string): IProject => {
  let project!: IProject;
  projectsByProjectNames.forEach((value, key) => {
    if (fileUri.includes(key)) {
      project = value;
    }
  });

  return project;
};

export const getMatchedEndpoint = (avaibaleEndpointsPerFile: Map<string, ClientExpression[]>, position: Position, uri: string) => {
  let matchedEnpoint!: EndpointExpression | ClientExpression;
  let matchedEndpointUri: string | undefined;

  avaibaleEndpointsPerFile.forEach((value, fileUri) => {
    const found = value.find((endPointExpression) => {
      if (
        endPointExpression.start.line === position.line &&
        isBetween(endPointExpression.start.character, endPointExpression.end.character, position.character) &&
        fileUri === uri
      ) {
        return endPointExpression;
      }
    });

    if (found) {
      matchedEnpoint = found;
      matchedEndpointUri = fileUri;
    }
  });
  return { matchedEnpoint, matchedEndpointUri };
};

export const createRangeFromClienexpression = (clientExpression: ClientExpression) => {
  const startLine = clientExpression.start.line;
  const startChar = clientExpression.start.character;
  const endLine = clientExpression.end.line;
  const endChar = clientExpression.end.character;

  return Range.create(startLine, startChar, endLine, endChar);
};

export const createFunctionRangeFromClienexpression = (endpointExpression: EndpointExpression) => {
  const startLine = endpointExpression.start.line;
  const startChar = endpointExpression.start.character;
  const endLine = endpointExpression.inlineFunction.end.line;
  const endChar = endpointExpression.inlineFunction.end.character;

  return Range.create(startLine, startChar, endLine, endChar);
};

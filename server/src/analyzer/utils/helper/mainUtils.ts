import { Connection, Diagnostic, DiagnosticSeverity, MarkupContent, MarkupKind, Position, Range, _Connection } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { InfoWindowRequest, InfoWindowsMessage, IProject } from '../..';
import { Endpoint, ServiceConfig } from '../../config';
import { ClientExpression, EndpointExpression } from '../../types';
import { replaceArrayInJson } from '.';

/**
 * Send a request to vscode.
 * @param connection
 * @param message
 */
export const sendRequest = (connection: Connection, message: any) => {
  // TODO Won't fix atm does not do anything atm
  // connection.sendNotification(message);
  const params: InfoWindowsMessage = { message: message };
  connection.sendRequest(InfoWindowRequest.type, params).catch((reason) => {
    console.error(reason);
  });
};

/**
 * Checks if the API path is present in the list.
 * @param path API path
 * @returns
 */
export const findEndpointForPath = (path: string, endpoints: Endpoint[]): Endpoint | undefined => {
  return endpoints.find((endpoints) => endpoints.path === path);
};

/**
 * Helper function that evalutes lower >= x <= upper.
 * @param lower lower boundry
 * @param upper uper boundry
 * @param between value to check
 * @returns boolean
 */
export const isBetween = (lower: number, upper: number, between: Number): Boolean => {
  return between >= lower && between <= upper ? true : false;
};

/**
 * Removes the last occurance of the symbol in a string.
 * @param stringToRemove String to remove the symbol from
 * @param symbol symbol to remove from string
 * @returns
 */
export const removeLastSymbol = (stringToRemove: string, symbol: string): string => {
  const temp = stringToRemove.split('');
  temp[stringToRemove.lastIndexOf(symbol)] = '';
  return temp.join('');
};

/**
 * Creates a diagnostic, which is used by vscode die display a message in a file at the given position.
 * @param document Document to to create a diagnostic for
 * @param message message to display
 * @param start start of the message
 * @param end end of the message
 * @param diagnosticLevel Level to display (info, warn or error)
 * @returns Diagnostic
 */
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

/**
 * Returns the project for a given file path.
 * @param projectsByProjectNames projects
 * @param fileUri uri
 * @returns Project
 */
export const getProject = (projectsByProjectNames: Map<string, IProject>, fileUri: string): IProject => {
  let project!: IProject;
  projectsByProjectNames.forEach((value, key) => {
    if (fileUri.includes(key)) {
      project = value;
    }
  });

  return project;
};

/**
 * Returns an endpoint in a file at a given position.
 * @param avaibaleEndpointsPerFile Map contains endpoints per uri/filename
 * @param position position inside the file
 * @param uri Filename uri
 * @returns
 */
export const getMatchedEndpoint = (avaibaleEndpointsPerFile: Map<string, ClientExpression[]>, position: Position, uri: string) => {
  let matchedEnpoint!: EndpointExpression | ClientExpression;
  let matchedEndpointUri: string | undefined;

  /**
   * Checks if the position is between the defined endpoint in a file.
   * And checks if the uri/apiEndpoint is the same.
   * And returns the found element.
   */
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

/**
 * Creates a range. A range is a line from/to and character from/to.
 * @param clientExpression
 * @returns Range from to
 */
export const createRangeFromClienexpression = (clientExpression: ClientExpression) => {
  const startLine = clientExpression.start.line;
  const startChar = clientExpression.start.character;
  const endLine = clientExpression.end.line;
  const endChar = clientExpression.end.character;

  return Range.create(startLine, startChar, endLine, endChar);
};

/**
 * Creates a range. A range is a line from/to and character from/to.
 * @param clientExpression
 * @returns Range from to
 */
export const createFunctionRangeFromClienexpression = (endpointExpression: EndpointExpression) => {
  const startLine = endpointExpression.start.line;
  const startChar = endpointExpression.start.character;
  const endLine = endpointExpression.inlineFunction.end.line;
  const endChar = endpointExpression.inlineFunction.end.character;

  return Range.create(startLine, startChar, endLine, endChar);
};

export const createHoverMarkdown = (endpoint: Endpoint, serviceConfig: ServiceConfig): MarkupContent => {
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

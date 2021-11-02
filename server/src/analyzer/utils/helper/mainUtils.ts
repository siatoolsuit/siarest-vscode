import { Connection, Diagnostic, DiagnosticSeverity, _Connection } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Endpoint } from '../../config';
import { EndpointExpression } from '../../types';

/**
 * Send a notification to vscode
 * @param connection
 * @param message
 */
export const sendNotification = (connection: Connection, message: any) => {
  // TODO Won't fix atm does not do anything atm
  connection.sendNotification(message);
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

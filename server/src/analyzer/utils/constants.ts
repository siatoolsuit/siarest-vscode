/**
 * This file contains just some constants used throughout the project.
 */

export const TYPE_TYPESCRIPT = {
  SUFFIX: '.ts',
  LANGUAGE_ID: 'typescript',
};

export const TYPE_JSON = {
  SUFFIX: '.json',
  LANGUAGE_ID: 'json',
};

export const SIARC = `.siarc`;
export const PACKAGE_JSON = `package`;

// EXPRESS import Statements
export const expressImportByName: Map<String, String> = new Map([
  ['express', 'express'],
  ['Router', 'Router'],
]);

export const httpLibsByName: Map<String, String> = new Map([
  ['HttpClient', 'HttpClient'], // ANGULAR
  ['api', 'api'], //REACT
]);

export const httpMethods: string[] = ['get', 'post', 'put', 'delete'];
export const sendMethods: string[] = ['send', 'json'];

export const VS_CODE_URI_BEGIN = 'file:///';

export const TYPESCRIPT = {
  SUFFIX: '.ts',
  LANGUAGE_ID: 'typescript',
};

// TODO rename
export const JSONS = {
  SUFFIX: '.json',
  LANGUAGE_ID: 'json',
};

export const SIARC = `.siarc.json`;
export const PACKAGE_JSON = `package.json`;

// EXPRESS import Statements

export const expressImportByName: Map<String, String> = new Map([
  ['express', 'express'],
  ['Router', 'Router'],
]);

export const httpMethods: string[] = ['get', 'post', 'put', 'delete'];
export const sendMethods: string[] = ['send', 'json'];

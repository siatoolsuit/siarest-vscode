export interface Parameter {
  type: object;
  name: string;
}

export interface Endpoint {
  path: string,
  method: string,
  response: object,
  parameters?: Parameter[]
}

export interface ServiceConfig {
  name: string,
  baseUri: string,
  language: string,
  lib: string,
  endpoints: Endpoint[],
}

export interface Parameter {
  type: Record<string, unknown>;
  name: string;
}

export interface Endpoint {
  path: string,
  method: string,
  response: Record<string, unknown>,
  parameters?: Parameter[]
}

export interface ServiceConfig {
  name: string,
  baseUri: string,
  language: string,
  lib: string,
  endpoints: Endpoint[],
}

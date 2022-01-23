export interface Endpoint {
  path: string;
  method: string;
  response: Record<string, string> | string;
  request?: Record<string, string>;
}

export interface ServiceConfig {
  name: string;
  baseUri: string;
  frontends: string[];
  endpoints: Endpoint[];
}

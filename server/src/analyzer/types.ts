import { ArrowFunction, CallExpression, LineAndCharacter } from 'typescript';
import { RequestType } from 'vscode-languageserver/node';
import { ServiceConfig } from './config';

/**
 * Interface for a message to show in vscode ui.
 */
export interface InfoWindowsMessage {
  message: string;
}

export namespace InfoWindowRequest {
  /**
   * Type for sending things to the client.
   */
  export const type = new RequestType<InfoWindowsMessage, void, void>('siarc/infoWindowRequest');
}

/**
 * @interface SemanticError is used to show error messages in the editor.
 */
export interface SemanticError {
  position: { start: number; end: number };
  message: string;
}

/**
 * @interface ExpressPathAndFunction contains information about the endpoint.
 */
export interface ExpressPathAndFunction {
  path: string;
  start: LineAndCharacter;
  end: LineAndCharacter;
  inlineFunction: IInlineFunction;
}

/**
 * @interface IResult Holds data about errors and avaiable endpoints for a file.
 */
export interface IResult {
  semanticErrors?: SemanticError[];
  endPointsAvaiable?: ClientExpression[];
}

/**
 * @interface IInlineFunction Holds data about an inlinefunction of an express call.
 */
export interface IInlineFunction {
  inlineFunction: ArrowFunction | undefined;
  start: LineAndCharacter;
  end: LineAndCharacter;
}

/**
 * @interface EndpointExpression Datainterface that holds information about the endpoint.
 * Derived from clientexpression to provide information specific to an express endpoint.
 */
export interface EndpointExpression extends ClientExpression {
  readonly expressEndpoint: boolean;
  readonly inlineFunction: IInlineFunction;
}

/**
 * @interface ClientExpression Datainterface that holds data about the analyzed endpoint.
 * Can be an call from Frondend or an express endpoint
 */
export interface ClientExpression {
  readonly expr: CallExpression;
  readonly method: string;
  readonly path: string;
  readonly start: LineAndCharacter;
  readonly end: LineAndCharacter;
}

/**
 * @interface IProject Datainterace that represents an project that is opened by vscode
 */
export interface IProject {
  rootPath: string;
  projectName: string;
  packageJson: string;
  siarcTextDoc?: {
    content: string;
    languageId: string;
    uri: string;
    version: number;
  };
  serviceConfig?: ServiceConfig;
}

/**
 * @type A type for an endpoint used by the analyzer
 */
export type EndpointMatch = {
  clientExpression: ClientExpression;
  uri: string;
};

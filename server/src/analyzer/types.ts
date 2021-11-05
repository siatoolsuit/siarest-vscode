import { ArrowFunction, CallExpression, LineAndCharacter } from 'typescript';
import { ServiceConfig } from './config';

export interface SemanticError {
  position: { start: number; end: number };
  message: string;
}

export interface ExpressPathAndFunction {
  path: string;
  start: LineAndCharacter;
  end: LineAndCharacter;
  inlineFunction: any;
}

export interface IResult {
  semanticErrors?: SemanticError[];
  endPointsAvaiable?: ClientExpression[];
}

export interface EndpointExpression extends ClientExpression {
  readonly expressEndpoint: boolean;
  readonly inlineFunction: ArrowFunction;
}

export interface ClientExpression {
  readonly expr: CallExpression;
  readonly method: string;
  readonly path: string;
  readonly start: LineAndCharacter;
  readonly end: LineAndCharacter;
}

export interface IProject {
  rootPath: string;
  packageJson: string;
  siarcTextDoc?: {
    content: string;
    languageId: string;
    uri: string;
    version: number;
  };
  serviceConfig?: ServiceConfig;
}

export type EndpointMatch = {
  clientExpression: ClientExpression;
  uri: string;
};

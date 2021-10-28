import { ArrowFunction, CallExpression, LineAndCharacter } from 'typescript';

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
  endPointsAvaiable?: EndpointExpression[];
}

export interface EndpointExpression {
  readonly expr: CallExpression;
  readonly method: string;
  readonly path: string;
  readonly start: LineAndCharacter;
  readonly end: LineAndCharacter;
  readonly inlineFunction: ArrowFunction;
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
}

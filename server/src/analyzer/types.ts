import { ServiceConfig } from './config';

export interface SemanticError {
  offset: number;
  message: string;
}

export abstract class StaticAnalyzer {
  constructor(protected currentServiceName: string, protected currentConfig?: ServiceConfig) { }

  abstract analyze(text: string): SemanticError[];
}
  
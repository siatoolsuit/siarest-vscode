import { ServiceConfig } from './config';

export interface SemanticError {
  position: { start: number; end: number };
  message: string;
}

export abstract class StaticAnalyzer {
  constructor(protected currentServiceName: string, protected currentConfig?: ServiceConfig) {}
  
  public abstract analyze(uri: string): SemanticError[];

  set config(newConfig: ServiceConfig | undefined) {
    this.currentConfig = newConfig;
  }

  get serviceName(): string {
    return this.currentServiceName;
  }
}

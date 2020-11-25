import { Program } from 'typescript';
import { ServiceConfig } from './config';

export interface SemanticError {
  position: { start: number; end: number };
  message: string;
}

export abstract class StaticAnalyzer {
  protected openFiles: { [uri: string]: Program } = {};

  constructor(protected currentServiceName: string, protected currentConfig?: ServiceConfig) {}

  public abstract analyze(uri: string): SemanticError[];
  public abstract fileClosed(uri: string): void;

  set config(newConfig: ServiceConfig) {
    this.currentConfig = newConfig;
  }

  get serviceName(): string {
    return this.currentServiceName;
  }
}

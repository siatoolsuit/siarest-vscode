import { ServiceConfig } from './config';
import { SemanticError, StaticAnalyzer, StaticExpressAnalyzer } from './handlers';

const enum SupportedFrameworksLibraries {
  Express,
  None
}

export class Analyzer {
  private staticEndpointAnalyzerHandlers: Record<string, StaticAnalyzer>;

  private validConfig!: ServiceConfig;
  private currentServiceName!: string;

  constructor() {
    this.staticEndpointAnalyzerHandlers = {};
    this.staticEndpointAnalyzerHandlers[SupportedFrameworksLibraries.Express] = new StaticExpressAnalyzer();
  }

  set config(text: string) {
    this.validConfig = JSON.parse(text);
  }

  set currentService(name: string) {
    this.currentServiceName = name;
  }

  public analyzeEndpoints(text: string): SemanticError[] {
    const framLib = this.detectFrameworkOrLibrary(text);
    if (framLib !== SupportedFrameworksLibraries.None) {
      return this.staticEndpointAnalyzerHandlers[framLib].analyze(text);
    } else {
      return [];
    }
  }

  private detectFrameworkOrLibrary(text: string): SupportedFrameworksLibraries {
    if (text.includes("from 'express'")) {
      return SupportedFrameworksLibraries.Express;
    } else {
      return SupportedFrameworksLibraries.None;
    }
  } 
}

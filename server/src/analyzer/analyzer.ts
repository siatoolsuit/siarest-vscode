import { ServiceConfig } from './config';
import { StaticExpressAnalyzer } from './handlers';
import { SemanticError, StaticAnalyzer } from './types';

export class Analyzer {
  private validConfig: ServiceConfig[] = [];

  private currentServiceName!: string;
  private staticEndpointAnalyzerHandler!: StaticAnalyzer;

  set config(text: string) {
    this.validConfig = JSON.parse(text);
  }

  set currentService(name: string) {
    this.currentServiceName = name;
  }

  public analyzeEndpoints(text: string): SemanticError[] {
    if (this.staticEndpointAnalyzerHandler) {
      return this.staticEndpointAnalyzerHandler.analyze(text);
    } else {
      return [];
    }
  }

  public detectFrameworkOrLibrary(packJ: any): void {
    // Extract the list of all compile time dependencies and look for supported frameworks and libraries
    const deps = packJ.dependencies;
    for (const dep of Object.keys(deps)) {
      if (dep.includes('express')) {
        // Try to extract the configuration for this service by name
        let currentServiceConfig;
        for (const config of this.validConfig) {
          if (config.name === this.currentServiceName) {
            currentServiceConfig = config;
            break;
          }
        }
        this.staticEndpointAnalyzerHandler = new StaticExpressAnalyzer(this.currentServiceName, currentServiceConfig);
        break;
      }
    }
  } 
}

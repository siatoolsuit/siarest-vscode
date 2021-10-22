import { EndpointExpression } from '.';
import { ServiceConfig } from './config';
import { StaticExpressAnalyzer } from './handlers';
import { IFile } from './handlers/file';
import { SemanticError } from './types';

export class Analyzer {
  private validConfig: ServiceConfig[] = [];

  private currentServiceName!: string;
  public staticEndpointAnalyzerHandler!: StaticExpressAnalyzer;

  private avaibaleEndpoints: Map<string, EndpointExpression[]> = new Map();

  public getEndPointsForFileName(fileName: string): EndpointExpression[] | undefined {
    fileName = fileName.substring(fileName.lastIndexOf('/') + 1, fileName.length);
    return this.avaibaleEndpoints.get(fileName);
  }

  /**
   * Setter config
   * @param text as string (siarc.json)
   */
  set config(text: string) {
    this.validConfig = JSON.parse(text);
    // Load the config to all analyzer handler
    if (this.staticEndpointAnalyzerHandler) {
      let found = false;
      for (const config of this.validConfig) {
        if (config.name === this.staticEndpointAnalyzerHandler.serviceName) {
          this.staticEndpointAnalyzerHandler.config = config;
          found = true;
          break;
        }
      }
      // There is no configuration with the given service name
      if (!found) {
        this.staticEndpointAnalyzerHandler.config = undefined;
      }
    }
  }

  set currentService(name: string) {
    this.currentServiceName = name;
  }

  /**
   *
   * @param file Typescript file
   * @returns List of SemanticErrors
   */
  public analyzeEndpoints(file: IFile): SemanticError[] {
    if (this.staticEndpointAnalyzerHandler && file.tempFileUri) {
      const results = this.staticEndpointAnalyzerHandler.analyze(file.tempFileUri);

      if (results.endPointsAvaiable) {
        this.avaibaleEndpoints.set(file.tempFileName, results.endPointsAvaiable);
      }

      if (results.semanticErrors) {
        return results.semanticErrors;
      } else {
        return [];
      }
    } else {
      return [];
    }
  }

  /**
   * detectFrameworkOrLibrary
   * @param packJ packageJson
   */
  public detectFrameworkOrLibrary(packJ: any): void {
    // Extract the list of all compile time dependencies and look for supported frameworks and libraries
    const deps = packJ.dependencies;
    for (const dep of Object.keys(deps)) {
      if (dep.includes('express')) {
        // Try to extract the configuration for this service by name
        let currentServiceConfig;
        currentServiceConfig = this.validConfig.find((config) => {
          config.name === this.currentServiceName;
        });

        this.staticEndpointAnalyzerHandler = new StaticExpressAnalyzer(this.currentServiceName, currentServiceConfig);
        break;
      }
    }
  }
}

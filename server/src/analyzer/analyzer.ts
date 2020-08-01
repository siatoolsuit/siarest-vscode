import { ConfigService, ServiceConfig } from './config';
import { ErrorObject } from 'ajv';

/**
 * The {@link Analyzer} class is the entry point of the verification API.
 * Needs to be created as an object.
 *
 */
export class Analyzer {
  private configValidator: ConfigService;
  private serviceConfig!: ServiceConfig;

  constructor() {
    this.configValidator = new ConfigService();
   }

  /**
   * Initialize this analyzer
   */
  public init(): void {
    this.configValidator.init();
  }

  /**
   * Loads and validates a configuration file
   *
   * @param configFilePath The path to the configuration file to validate
   * @returns True if valid, errors otherwise
   */
  public validateAndLoadServiceConfig(configFilePath: string): ErrorObject[] | void {
    // this.serviceConfig = this.configValidator.loadConfig(configFilePath);
  }
}

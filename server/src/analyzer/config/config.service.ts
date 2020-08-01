import Ajv, { ValidateFunction, Ajv as AJV, ErrorObject } from 'ajv';

import * as fs from 'fs';

export class ConfigService {
  private readonly schemaPath: string = `${__dirname}/config.schema.json`;

  private ajv: AJV;
  private validator!: ValidateFunction;

  constructor() {
    this.ajv = new Ajv();
  }

  // initialize the config validator with the config schema
  public init(): void {
    const schema = fs.readFileSync(this.schemaPath).toString();
    this.validator = this.ajv.compile(JSON.parse(schema));
  }

  // loads a sia config file and validates it against our schema
  public validate(configFileObject: string): ErrorObject[] | void {
    const valid = this.validator(configFileObject);
    if (!valid && this.validator.errors) {
      return this.validator.errors;
    }
  }
}

import { Diagnostic, DiagnosticSeverity, TextDocumentPositionParams, CompletionItem, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

const URI_REG = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
const PATH_REG = /\/(.+)/;

export class ConfigService {
  private textDocument!: TextDocument;
  private textContent!: string;

  /**
   * Validates the .siarc.json file. The file should fulfill the following grammar:
   * [
   *   ({
   *     "name": string,
   *     "baseUri": string,
   *     "language": "Typescript" | "Java",
   *     "lib": ("NestJS") | ("JavaSpark"),
   *     "endpoints": [
   *       ({
   *          "method": "GET" | "POST" | "DELETE" | "PUT",
   *          "path": string,
   *          "response": string | object,
   *          "request": object
   *       })*
   *     ]
   *   })*
   * ]
   *
   * @param @param textDocument The text document representation of the .siarc.json
   * @returns Returns a list with errors or nothing if the input can not be parsed
   */
  public validate(textDocument: TextDocument): Diagnostic[] | void {
    this.textDocument = textDocument;
    this.textContent = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    let json;
    try {
      json = JSON.parse(this.textContent);
    } catch (err) {
      // We only validate parsable inputs
      return;
    }

    // check if the wrapping structure is an array
    if (!(Array.isArray(json))) {
      diagnostics.push(this.createErrorMessage(textDocument, 'The wrapping structure needs to be an array', 0, this.textContent.length));
    }

    // We need at least one other service to validate against
    if (json.length === 0) {
      diagnostics.push(this.createErrorMessage(textDocument, 'There needs to be defined a single service at least', 0, this.textContent.length));
    }

    // Validates each service definition
    let currentBlockStartIndex = 0;
    let currentBlockEndIndex = 0;
    for (const service of json) {
      // Check whether the current service is an object or not
      if (typeof service !== 'object' || Array.isArray(service)) {
        if (typeof service === 'string' || typeof service === 'number' || typeof service === 'boolean') {
          if (typeof service === 'string' && service === '') {
            currentBlockStartIndex = this.textContent.indexOf('""', currentBlockEndIndex);
            currentBlockEndIndex = currentBlockStartIndex + 2;
          } else if (typeof service === 'string') {
            const thing = `"${String(service)}"`;
            currentBlockStartIndex = this.textContent.indexOf(thing, currentBlockEndIndex);
            currentBlockEndIndex = currentBlockStartIndex + thing.length;
          } else {
            const thing = String(service);
            currentBlockStartIndex = this.textContent.indexOf(thing, currentBlockEndIndex);
            currentBlockEndIndex = currentBlockStartIndex + thing.length;
          }
        } else if (Array.isArray(service)) {
          currentBlockStartIndex = this.textContent.indexOf('[', currentBlockEndIndex);
          currentBlockEndIndex = this.findIndexOfClosingArray(this.textContent, currentBlockStartIndex);
        }
        diagnostics.push(this.createErrorMessage(textDocument, 'Service needs to be an object', currentBlockStartIndex, currentBlockEndIndex));
        continue;
      }
      currentBlockStartIndex = this.textContent.indexOf('{', currentBlockEndIndex);
      currentBlockEndIndex = this.findIndexOfClosingBlock(this.textContent, currentBlockStartIndex);
      // Check the name
      if (!service.name) {
        diagnostics.push(this.createErrorMessage(textDocument, 'Missing "name" property', currentBlockStartIndex, currentBlockEndIndex));
      } else if (typeof service.name !== 'string') {
        currentBlockStartIndex = this.textContent.indexOf('"name":', currentBlockStartIndex);
        currentBlockEndIndex = this.textContent.indexOf(',', currentBlockStartIndex);
        diagnostics.push(this.createErrorMessage(textDocument, 'Property "name" needs to be a string', currentBlockStartIndex, currentBlockEndIndex));
      }
      // Check the base uri
      if (!service.baseUri) {
        diagnostics.push(this.createErrorMessage(textDocument, 'Missing "baseUri" property', currentBlockStartIndex, currentBlockEndIndex));
      } else {
        // Check the uri against the uri pattern
        const regEex = new RegExp(URI_REG);
        if (!regEex.test(service.baseUri)) {
          const uriIndex = this.textContent.indexOf('"baseUri":', currentBlockStartIndex);
          diagnostics.push(this.createErrorMessage(textDocument, 'Wrong uri pattern, expected http(s)://xxxx:xxxx/xxx/yy', uriIndex, uriIndex));
        }
      }
      // Check the language
      if (!service.language) {
        diagnostics.push(this.createErrorMessage(textDocument, 'Missing "language" property', currentBlockStartIndex, currentBlockEndIndex));
      } else {
        // Check the language is set to Typescript or Java
        if (service.language !== 'Typescript' && service.language !== 'Java') {
          const languageIndex = this.textContent.indexOf('"language":', currentBlockStartIndex);
          diagnostics.push(this.createErrorMessage(textDocument, 'Language needs to be one of the following: [ "Typescript", "Java" ]', languageIndex, languageIndex));
        }
      }
      // Check the lib
      if (!service.lib) {
        diagnostics.push(this.createErrorMessage(textDocument, 'Missing "lib" property', currentBlockStartIndex, currentBlockEndIndex));
      } else {
        // Check the used lib, depends on chosen language "Typescript" -> "NestJS", "Java" -> "JavaSpark"
        const libIndex = this.textContent.indexOf('"lib":', currentBlockStartIndex);
        if (service.language) {
          if (service.language === 'Typescript' && service.lib !== 'NestJS') {
            diagnostics.push(this.createErrorMessage(textDocument, 'For Typescript use one of the following libs: [ "NestJS" ]', libIndex, libIndex));
          } else if (service.language === 'Java' && service.lib !== 'JavaSpark') {
            diagnostics.push(this.createErrorMessage(textDocument, 'For Java use one of the following libs: [ "JavaSpark" ]', libIndex, libIndex));
          } else if (service.language !== 'Typescript' && service.language !== 'Java') {
            diagnostics.push(this.createErrorMessage(textDocument, 'Unsupported language/library pair', libIndex, libIndex));
          }
        } else {
          diagnostics.push(this.createErrorMessage(textDocument, 'Missing "language" property', libIndex, libIndex));
        }
      }
      // Check the endpoints
      if (!service.endpoints) {
        diagnostics.push(this.createErrorMessage(textDocument, 'Missing "endpoints" property', currentBlockStartIndex, currentBlockEndIndex));
      }
      if (service.endpoints && !Array.isArray(service.endpoints)) {
        const endpointsIndexStart = this.textContent.indexOf(`"endpoints":`, currentBlockStartIndex);
        diagnostics.push(this.createErrorMessage(textDocument, 'Endpoints needs to be an array', endpointsIndexStart, endpointsIndexStart));
      }
      if (service.endpoints && service.endpoints.length === 0) {
        const endpointsIndexStart = this.textContent.indexOf(`"endpoints":`, currentBlockStartIndex);
        const endpointsIndexEnd = this.textContent.indexOf(']', endpointsIndexStart);
        diagnostics.push(this.createErrorMessage(textDocument, 'There needs to be defined a single endpoint at least', endpointsIndexStart, endpointsIndexEnd));
      }
      if (service.endpoints && Array.isArray(service.endpoints)) {
        // Skip the first open bracket
        let endpointStartIndex = this.textContent.indexOf('[', currentBlockStartIndex) + 1;
        let endpointEndIndex = endpointStartIndex;
        for (const endpoint of service.endpoints) {
          // Check whether the current endpoint is an object or not
          if (typeof endpoint !== 'object' || Array.isArray(endpoint)) {
            if (typeof endpoint === 'string' || typeof endpoint === 'number' || typeof endpoint === 'boolean') {
              if (typeof endpoint === 'string' && endpoint === '') {
                endpointStartIndex = this.textContent.indexOf('""', endpointEndIndex);
                endpointEndIndex = endpointStartIndex + 2;
              } else if (typeof endpoint === 'string') {
                const thing = `"${String(endpoint)}"`;
                endpointStartIndex = this.textContent.indexOf(thing, endpointEndIndex);
                endpointEndIndex = endpointStartIndex + thing.length;
              } else {
                const thing = String(endpoint);
                endpointStartIndex = this.textContent.indexOf(thing, endpointEndIndex);
                endpointEndIndex = endpointStartIndex + thing.length;
              }
            } else if (Array.isArray(endpoint)) {
              endpointStartIndex = this.textContent.indexOf('[', endpointEndIndex);
              endpointEndIndex = this.findIndexOfClosingArray(this.textContent, endpointStartIndex);
            }
            diagnostics.push(this.createErrorMessage(textDocument, 'Endpoint needs to be an object', endpointStartIndex, endpointEndIndex));
            continue;
          }
          endpointStartIndex = this.textContent.indexOf('{', endpointEndIndex);
          endpointEndIndex = this.findIndexOfClosingBlock(this.textContent, endpointStartIndex);
          // Check the method
          if (!endpoint.method) {
            diagnostics.push(this.createErrorMessage(textDocument, 'Missing "method" property', endpointStartIndex, endpointEndIndex));
          } else {
            // Check the method is set to GET, POST, PUT or DELETE
            if (endpoint.method !== 'GET' && endpoint.method !== 'POST' && endpoint.method !== 'PUT' && endpoint.method !== 'DELETE') {
                endpointStartIndex = this.textContent.indexOf('"method":', endpointStartIndex);
                diagnostics.push(this.createErrorMessage(textDocument, 'Method needs to be one of the following: [ "GET", "POST", "PUT", "DELETE" ]', endpointStartIndex, endpointStartIndex));
            }
          }
          // Check the path
          if (!endpoint.path) {
            diagnostics.push(this.createErrorMessage(textDocument, 'Missing "path", property', endpointStartIndex, endpointEndIndex));
          } else {
            // Check the path against the path pattern
            const regEex = new RegExp(PATH_REG);
            if (!regEex.test(endpoint.path)) {
              const pathIndex = this.textContent.indexOf('"path":', endpointStartIndex);
              diagnostics.push(this.createErrorMessage(textDocument, 'Wrong path pattern, expected /xxx/yy', pathIndex, pathIndex));
            }
          }
          // Check the response
          if (!endpoint.response) {
            diagnostics.push(this.createErrorMessage(textDocument, 'Missing "response" property', endpointStartIndex, endpointEndIndex));
          } else {
            // Check whether the response is a simple type string or a complex object
            const responseStartIndex = this.textContent.indexOf('"response":', endpointStartIndex);
            if (typeof endpoint.response === 'string') {
              // Check the response is set to "string", "number" or "boolean"
              if (endpoint.response !== 'string' && endpoint.response !== 'number' && endpoint.response !== 'boolean') {
                diagnostics.push(this.createErrorMessage(textDocument, 'Response needs to be one of the following: [ "string", "number", "boolean" ]', responseStartIndex, responseStartIndex));
              }
            } else if(typeof endpoint.response === 'object' && !Array.isArray(endpoint.response)) {
              // The object need to be simple "key": "value" pairs, the key is the name of an attribute and the values its type. Allowed types are [ "string", "number", "boolean" ]
              const attrs = Object.getOwnPropertyNames(endpoint.response);
              if (attrs.length === 0) {
                diagnostics.push(this.createErrorMessage(textDocument, 'Response as object needs at least a single attribute pair like { "name": "string" }', responseStartIndex, responseStartIndex));
              }
              for (const attr of attrs) {
                const val = endpoint.response[attr];
                const attrIndex = this.textContent.indexOf(attr, responseStartIndex);
                if (typeof val === 'object' && !Array.isArray(val)) {
                  diagnostics.push(this.createErrorMessage(textDocument, 'Response attribute may not be an object', attrIndex, attrIndex));
                } else if (Array.isArray(val)) {
                  diagnostics.push(this.createErrorMessage(textDocument, 'Response attribute may not be an array', attrIndex, attrIndex)); 
                } else if (typeof val === 'string') {
                  if (val !== 'string' && val !== 'number' && val !== 'boolean') {
                    diagnostics.push(this.createErrorMessage(textDocument, 'Response attribute value needs to one of the following: [ "string", "number", "boolean" ]',  attrIndex, attrIndex));
                  }
                } else {
                  diagnostics.push(this.createErrorMessage(textDocument, 'Response attribute value needs to be a string', attrIndex, attrIndex)); 
                }
              }
            } else {
              diagnostics.push(this.createErrorMessage(textDocument, 'Response needs to be an object or one of the following: [ "string", "number", "boolean" ]',  responseStartIndex, responseStartIndex));
            }
          }
          // Check the request
          if (!endpoint.request) {
            diagnostics.push(this.createErrorMessage(textDocument, 'Missing "request" property', endpointStartIndex, endpointEndIndex));
          } else {
            // Check whether the request is a complex object
            const requestStartIndex = this.textContent.indexOf('"request":', endpointStartIndex);
            if (typeof endpoint.request !== 'object' || Array.isArray(endpoint.request)) {
              diagnostics.push(this.createErrorMessage(textDocument, 'Response needs to be an object with key value pairs like { "name": "string" }',  requestStartIndex, requestStartIndex));
            } else {
              // The object need to be simple "key": "value" pairs, the key is the name of an attribute and the values its type. Allowed types are [ "string", "number", "boolean" ]
              const attrs = Object.getOwnPropertyNames(endpoint.request);
              if (attrs.length === 0) {
                diagnostics.push(this.createErrorMessage(textDocument, 'Request as object needs at least a single attribute pair like { "name": "string" }', requestStartIndex, requestStartIndex));
              }
              for (const attr of attrs) {
                const val = endpoint.request[attr];
                const attrIndex = this.textContent.indexOf(attr, requestStartIndex);
                if (typeof val === 'object' && !Array.isArray(val)) {
                  diagnostics.push(this.createErrorMessage(textDocument, 'Request attribute may not be an object', attrIndex, attrIndex));
                } else if (Array.isArray(val)) {
                  diagnostics.push(this.createErrorMessage(textDocument, 'Request attribute may not be an array', attrIndex, attrIndex)); 
                } else if (typeof val === 'string') {
                  if (val !== 'string' && val !== 'number' && val !== 'boolean') {
                    diagnostics.push(this.createErrorMessage(textDocument, 'Request attribute value needs to one of the following: [ "string", "number", "boolean" ]',  attrIndex, attrIndex));
                  }
                } else {
                  diagnostics.push(this.createErrorMessage(textDocument, 'Request attribute value needs to be a string', attrIndex, attrIndex)); 
                }
              }
            }
          }
        }
      }
    }

    return diagnostics;
  }

  /**
   * Create a list of possible completion items for current opened configuration file
   * 
   * @param textDocumentPosition The text position in the current opened configuration file
   * @returns A list with possible completion items
   * 
   */
  public createCompletion(textDocumentPosition: TextDocumentPositionParams): CompletionItem[] {
    const completions: CompletionItem[] = [];
    // Only create completions of there is a text
    if (this.textContent && this.textDocument) {
      const index = this.textDocument.offsetAt(textDocumentPosition.position);
      // TODO: Hier gehts weiter 
    }
    return completions;
  }

  private createErrorMessage(doc: TextDocument, message: string, startIndex: number, endIndex: number): Diagnostic {
    return {
      severity: DiagnosticSeverity.Error,
      message,
      range: {
        start: doc.positionAt(startIndex),
        end: doc.positionAt(endIndex),
      },
      source: 'sia-rest'
    };
  }

  private findIndexOfClosingBlock(text: string, start: number): number {
    let brackets = 1;
    // Skip the opening '{' of the current block
    let currentPos = start + 1;
    while(currentPos < text.length) {
      const currentChar = text.charAt(currentPos);
      if (currentChar === '{') {
        brackets++;
      } else if (currentChar === '}') {
        brackets--;
      }
      if (brackets === 0) {
        return currentPos + 1;
      }
      currentPos++;
    }
    return -1;
  }

  
  private findIndexOfClosingArray(text: string, start: number): number {
    let brackets = 1;
    // Skip the opening '[' of the current array
    let currentPos = start + 1;
    while(currentPos < text.length) {
      const currentChar = text.charAt(currentPos);
      if (currentChar === '[') {
        brackets++;
      } else if (currentChar === ']') {
        brackets--;
      }
      if (brackets === 0) {
        return currentPos + 1;
      }
      currentPos++;
    }
    return -1;
  }
}

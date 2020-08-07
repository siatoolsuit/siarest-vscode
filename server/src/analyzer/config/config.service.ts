import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

const URI_REG = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;

export class ConfigService {
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
   *          "response": {
   *            "type": string | object,
   *          },
   *          "parameters": [
   *            ({
   *               "type": string | object,
   *               "name": string
   *            })*
   *          ]
   *       })*
   *     ]
   *   })*
   * ]
   *
   * @param @param textDocument The text document representation of the .siarc.json
   * @returns Returns a list with errors or nothing if the input can not be parsed
   */
  public validate(textDocument: TextDocument): Diagnostic[] | void {
    const text = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      // We only validate parsable inputs
      return;
    }

    // check if the wrapping structure is an array
    if (!(Array.isArray(json))) {
      diagnostics.push(this.createErrorMessage(textDocument, 'The wrapping structure needs to be an array', 0, text.length));
    }

    // We need at least one other service to validate against
    if (json.length === 0) {
      diagnostics.push(this.createErrorMessage(textDocument, 'There needs to be defined a single service at least', 0, text.length));
    }

    // Validates each service definition
    let currentBlockStartIndex = 0;
    let currentBlockEndIndex = 0;
    for (const service of json) {
      // Check whether the current service is an object or not
      if (typeof service !== 'object' || Array.isArray(service)) {
        if (typeof service === 'string' || typeof service === 'number' || typeof service === 'boolean') {
          if (typeof service === 'string' && service === '') {
            currentBlockStartIndex = text.indexOf('""', currentBlockEndIndex);
            currentBlockEndIndex = currentBlockStartIndex + 2;
          } else if (typeof service === 'string') {
            const thing = `"${String(service)}"`;
            currentBlockStartIndex = text.indexOf(thing, currentBlockEndIndex);
            currentBlockEndIndex = currentBlockStartIndex + thing.length;
          } else {
            const thing = String(service);
            currentBlockStartIndex = text.indexOf(thing, currentBlockEndIndex);
            currentBlockEndIndex = currentBlockStartIndex + thing.length;
          }
        } else if (Array.isArray(service)) {
          currentBlockStartIndex = text.indexOf('[', currentBlockEndIndex);
          currentBlockEndIndex = this.findIndexOfClosingArray(text, currentBlockStartIndex);
        }
        diagnostics.push(this.createErrorMessage(textDocument, 'Service needs to be an object', currentBlockStartIndex, currentBlockEndIndex));
        continue;
      }
      currentBlockStartIndex = text.indexOf('{', currentBlockEndIndex);
      currentBlockEndIndex = this.findIndexOfClosingBlock(text, currentBlockStartIndex);
      // Check the name
      if (!service.name) {
        diagnostics.push(this.createErrorMessage(textDocument, 'Missing "name" property', currentBlockStartIndex, currentBlockEndIndex));
      }
      // Check the base uri
      if (!service.baseUri) {
        diagnostics.push(this.createErrorMessage(textDocument, 'Missing "baseUri" property', currentBlockStartIndex, currentBlockEndIndex));
      } else {
        // Check the uri against the uri pattern
        const regEex = new RegExp(URI_REG);
        if (!regEex.test(service.baseUri)) {
          const uriIndex = text.indexOf(`"baseUri":`, currentBlockStartIndex);
          diagnostics.push(this.createErrorMessage(textDocument, 'Wrong uri pattern, expected http(s)://xxxx:xxxx/xxx/yy', uriIndex, uriIndex));
        }
      }
      // Check the language
      if (!service.language) {
        diagnostics.push(this.createErrorMessage(textDocument, 'Missing "language" property', currentBlockStartIndex, currentBlockEndIndex));
      } else {
        // Check the language is set to Typescript or Java
        if (service.language !== 'Typescript' && service.language !== 'Java') {
          const languageIndex = text.indexOf(`"language":`, currentBlockStartIndex);
          diagnostics.push(this.createErrorMessage(textDocument, 'Language needs to be one of the following: [ "Typescript", "Java" ]', languageIndex, languageIndex));
        }
      }
      // Check the lib
      if (!service.lib) {
        diagnostics.push(this.createErrorMessage(textDocument, 'Missing "lib" property', currentBlockStartIndex, currentBlockEndIndex));
      } else {
        // Check the used lib, depends on chosen language "Typescript" -> "NestJS", "Java" -> "JavaSpark"
        const libIndex = text.indexOf(`"lib":`, currentBlockStartIndex);
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
      if (!Array.isArray(service.endpoints)) {
        const endpointsIndex = text.indexOf(`"endpoints":`, currentBlockStartIndex);
        diagnostics.push(this.createErrorMessage(textDocument, 'Endpoints needs to be an array', endpointsIndex, endpointsIndex));
      }
      if (service.endpoints && service.endpoints.length === 0) {
        const endpointsIndexStart = text.indexOf(`"endpoints":`, currentBlockStartIndex);
        const endpointsIndexEnd = text.indexOf(']', endpointsIndexStart);
        diagnostics.push(this.createErrorMessage(textDocument, 'There needs to be defined a single endpoint at least', endpointsIndexStart, endpointsIndexEnd));
      }
      if (Array.isArray(service.endpoints)) {
        for (const endpoint of service.endpoints) {
          // empty
        }
      }
    }

    return diagnostics;
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

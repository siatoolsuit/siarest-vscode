import { DiagnosticSeverity, JSONDocument, TextDocument } from 'vscode-json-languageservice';
import { Diagnostic } from 'vscode-languageserver';
import { createDiagnostic } from '../utils/helper';

export function validateConfigSemantic(textDoc: TextDocument, jsonDoc: JSONDocument): Diagnostic[] {
  const result: Diagnostic[] = [];

  const rootArray = jsonDoc.root;

  // Check for duplicate service name or base paths, both need to bee unique
  // Further check whether there is a defined request if the method in an endpoint is set to POST or PUT
  const servicesNames: string[] = [];
  const baseUris: string[] = [];
  if (rootArray) {
    const children = rootArray.children;
    if (children) {
      for (const serviceNode of children) {
        if (serviceNode.type === 'object') {
          for (const property of serviceNode.properties) {
            if (property.keyNode.value === 'name' && property.valueNode) {
              const nameValue = property.valueNode.value as string;
              // We found a duplicate
              if (servicesNames.includes(nameValue)) {
                result.push(
                  createDiagnostic(
                    textDoc,
                    'Duplicate name, service name needs to be unique',
                    property.valueNode.offset,
                    property.valueNode.offset,
                    DiagnosticSeverity.Error,
                  ),
                );
                // Add the same to the name list
              } else if (nameValue) {
                servicesNames.push(nameValue);
              }
            } else if (property.keyNode.value === 'baseUri' && property.valueNode) {
              const baseURIValue = property.valueNode.value as string;
              // We found a duplicate
              if (baseUris.includes(baseURIValue)) {
                result.push(
                  createDiagnostic(
                    textDoc,
                    'Duplicate baseUri, service baseUri needs to be unique',
                    property.valueNode.offset,
                    property.valueNode.offset,
                    DiagnosticSeverity.Error,
                  ),
                );
                // Add the same to the name list
              } else if (baseURIValue) {
                baseUris.push(baseURIValue);
              }
            } else if (property.keyNode.value === 'frontends' && property.valueNode && property.valueNode.children) {
              const frontends = property.valueNode.children;
              if (frontends?.length < 1) {
                result.push(
                  createDiagnostic(
                    textDoc,
                    'Please fill with frontend names',
                    property.valueNode.offset,
                    property.valueNode.offset,
                    DiagnosticSeverity.Warning,
                  ),
                );
              }
            } else if (property.keyNode.value === 'endpoints' && property.valueNode && property.valueNode.children) {
              // Check each endpoint whether a endpoint with method of POST or PUT has a request defined, and vice verse
              for (const endpoint of property.valueNode.children) {
                if (endpoint.type === 'object') {
                  let method, request;
                  for (const endpointProperty of endpoint.properties) {
                    if (!endpointProperty.valueNode) {
                      continue;
                    }
                    if (endpointProperty.keyNode.value === 'method') {
                      method = endpointProperty.valueNode.value;
                    } else if (endpointProperty.keyNode.value === 'request') {
                      request = endpointProperty.valueNode;
                    }
                  }
                  // There need to be the request field to be defined
                  if (method === 'POST' || method === 'PUT') {
                    if (!request) {
                      result.push(
                        createDiagnostic(
                          textDoc,
                          'Missing request field',
                          property.valueNode.offset,
                          property.valueNode.offset,
                          DiagnosticSeverity.Error,
                        ),
                      );
                    }
                  } else if (method === 'GET' || method === 'DELETE') {
                    if (request) {
                      result.push(
                        createDiagnostic(
                          textDoc,
                          'Missing request field',
                          property.valueNode.offset,
                          property.valueNode.offset,
                          DiagnosticSeverity.Error,
                        ),
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return result;
}

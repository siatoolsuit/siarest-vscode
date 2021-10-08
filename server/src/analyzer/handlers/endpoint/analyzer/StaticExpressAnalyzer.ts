import { resolve } from 'path/posix';
import {
  ArrowFunction,
  BindingName,
  Block,
  CallExpression,
  factory,
  createProgram,
  Expression,
  ExpressionStatement,
  ImportDeclaration,
  NodeArray,
  PropertyAccessExpression,
  Statement,
  SyntaxKind,
  Type,
  TypeChecker,
  VariableStatement,
  SourceFile,
  VariableDeclaration,
  Identifier,
  Symbol,
  PropertyAssignment,
  TypeFlags,
} from 'typescript';

import { Endpoint, ServiceConfig } from '../../../config';
import { EndpointExpression, IResult, SemanticError } from '../../../types';
import { httpMethods, sendMethods } from '../../../utils';
import {
  createSemanticError,
  extractExpressImport,
  extractExpressVariable,
  extractPathAndMethodImplementationFromArguments,
  findEndpointForPath,
  parseLastExpression,
  removeLastSymbol,
  simpleTypeError,
} from '../../../utils/helper';

export class StaticExpressAnalyzer {
  constructor(public serviceName: string, public config: ServiceConfig | undefined) {}

  /**
   *
   * @param uri to the pending file for validation
   * @returns
   */
  public analyze(uri: string): IResult {
    // Create a new program for type checking
    const program = createProgram([uri], {});
    const checker = program.getTypeChecker();
    let tsFile = program.getSourceFile(uri);
    if (!tsFile) {
      return {};
    }

    // Extract all higher functions like express import, app declarations and endpoint declarations
    const { expressImport, endpointExpressions } = this.extractExpressExpressions(tsFile);

    if (!expressImport) {
      return {};
    }

    const results: IResult = {};
    const result: SemanticError[] = [];

    if (this.config) {
      if (endpointExpressions.length > 0) {
        for (const endpointExprs of endpointExpressions) {
          const expr = endpointExprs.expr;
          const endpoint = findEndpointForPath(endpointExprs.path, this.config.endpoints);
          // Validates the defined endpoint with the service configuration
          if (endpoint) {
            if (endpoint.method !== endpointExprs.method) {
              result.push(createSemanticError(`Wrong HTTP method use ${endpoint.method} instead.`, expr.expression.getStart(), expr.expression.end));
            }

            const { resVal, reqVal } = this.extractReqResFromFunction(endpointExprs.inlineFunction);
            // Validate the return value of the inner function
            if (resVal) {
              const resConf = endpoint.response;
              let semanticError: any;
              switch (typeof resConf) {
                case 'string':
                  semanticError = simpleTypeError(resConf, resVal);
                  if (semanticError) result.push(semanticError);
                  break;
                case 'object':
                  semanticError = this.createComplexTypeError(endpoint, resVal, checker);
                  if (semanticError) result.push(semanticError);
                  break;
                default:
                  break;
              }
            } else {
              result.push(createSemanticError('Missing return value for endpoint.', expr.getStart(), expr.end));
            }

            // TODO ASK den SEB
            // Check the body, only if this function is a post or put
            if (endpoint.method === 'POST' || endpoint.method === 'PUT') {
              const reqType = endpoint.request;
              if (reqVal) {
                const symbol = checker.getSymbolAtLocation(reqVal);
                if (symbol && symbol.valueDeclaration) {
                  const type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration);
                  // Normalize type strings and compare them
                  const { fullString, normalString } = this.parseObject(type, checker);
                  const normalTypeInCodeString = normalString;
                  const normalTypeInConfigString = JSON.stringify(reqType).replace(/['",]/g, '');
                  if (normalTypeInCodeString !== normalTypeInConfigString) {
                    result.push(
                      createSemanticError(
                        `Wrong type.\nExpected:\n${JSON.stringify(reqType)}\nActual:\n${fullString}`,
                        reqVal.getStart(),
                        reqVal.end,
                      ),
                    );
                  }
                }
              } else {
                result.push(createSemanticError(`Endpoint with method "${endpoint.method}" has a missing body handling.`, expr.getStart(), expr.end));
              }
            }
          } else {
            result.push(createSemanticError('Endpoint is not defined for this service.', expr.getStart(), expr.end));
          }
        }
      }
    } else {
      result.push(createSemanticError(`Missing configuration for service ${this.serviceName} in .siarc.json.`, 0, 0));
    }

    results.semanticErrors = result;
    results.endPointsAvaiable = endpointExpressions;
    return results;
  }

  /**
   * Extracts the information of the express import statement and endpoint definitions from a ts-file
   * @param statements List of typescript Statements
   * @returns tuple of { Importdeclaration, ListOfEndPoints } of the current file
   */
  private extractExpressExpressions(sourceFile: SourceFile): {
    expressImport: ImportDeclaration | undefined;
    endpointExpressions: EndpointExpression[];
  } {
    const result: {
      expressImport: ImportDeclaration | undefined;
      endpointExpressions: EndpointExpression[];
    } = {
      expressImport: undefined,
      endpointExpressions: [],
    };

    // parse from top to down

    const statements = sourceFile.statements;
    // TODO replace with a list of e.g for express.Router etc
    let expressVarName;
    for (const statement of statements) {
      switch (statement.kind) {
        case SyntaxKind.ImportDeclaration:
          const importStatement = extractExpressImport(statement);
          if (importStatement) {
            result.expressImport = importStatement;
          }
          break;

        case SyntaxKind.VariableStatement:
          const expressVar = extractExpressVariable(statement);
          if (expressVar) {
            expressVarName = expressVar;
          }
          break;

        case SyntaxKind.ExpressionStatement:
          if (expressVarName) {
            const endPointExpressions = this.extractExpressStatement(statement, expressVarName, sourceFile);
            if (endPointExpressions) {
              result.endpointExpressions.push(endPointExpressions);
            }
          }
          break;
      }
    }

    return result;
  }

  /**
   * Extracts a whole statement of e.g. app.get(...) incl. the arrow function
   * @param statement (Simple node/typescript) state
   * @param expressVarName Name of the express/Router variable
   * @returns an EndpointExpression
   */
  private extractExpressStatement(statement: Statement, expressVarName: String, sourceFile: SourceFile): EndpointExpression | undefined {
    const expr = statement as ExpressionStatement;
    if (expr.expression.kind === SyntaxKind.CallExpression) {
      const callExpr = expr.expression as CallExpression;
      if (callExpr.expression.kind === SyntaxKind.PropertyAccessExpression) {
        // Check if the current expression is a express route declaration like app.get(...)
        const propAccExpr = callExpr.expression as PropertyAccessExpression;
        if (propAccExpr.expression.getText() === expressVarName && httpMethods.includes(propAccExpr.name.text)) {
          const { path, inlineFunction, start, end } = extractPathAndMethodImplementationFromArguments(callExpr.arguments, sourceFile);
          return {
            expr: callExpr,
            method: propAccExpr.name.text.toUpperCase(),
            path,
            inlineFunction,
            start: start,
            end: end,
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Analyzes and inlinefunction form epxress (res, req) => {...}
   * @param inlineFunction an inlineFunction (..) => {...}
   * @returns tuple of { res, req }
   */
  private extractReqResFromFunction(inlineFunction: ArrowFunction): { resVal: Expression | undefined; reqVal: BindingName | undefined } {
    const result: {
      resVal: Expression | undefined;
      reqVal: BindingName | undefined;
    } = {
      resVal: undefined,
      reqVal: undefined,
    };

    if (!inlineFunction) {
      return result;
    }
    const params = inlineFunction.parameters;
    if (params.length !== 2) {
      return result;
    }
    const reqVarName = params[0].getText();
    const resVarNAme = params[1].getText();
    const funcBody = inlineFunction.body;
    let statList: NodeArray<Statement> = factory.createNodeArray();
    switch (funcBody.kind) {
      case SyntaxKind.Block:
        statList = (funcBody as Block).statements;
        break;
    }

    for (const stat of statList) {
      switch (stat.kind) {
        case SyntaxKind.ExpressionStatement:
          const exprStat = stat as ExpressionStatement;
          if (exprStat.expression.kind === SyntaxKind.CallExpression) {
            const callExpr = exprStat.expression as CallExpression;
            if (callExpr.expression.kind === SyntaxKind.PropertyAccessExpression) {
              // Check if the current expression is a express send declaration like res.send(...) or res.json(...)
              // the last call of chained PropertyAccessExpression
              const propAccExpr = callExpr.expression as PropertyAccessExpression;
              if (sendMethods.includes(propAccExpr.name.text)) {
                const lastPropAcc: PropertyAccessExpression | undefined = parseLastExpression(propAccExpr);
                if (lastPropAcc && lastPropAcc.getText() === resVarNAme) {
                  result.resVal = callExpr.arguments[0];
                }
              }
            }
          }
          break;

        case SyntaxKind.VariableStatement:
          const varStat = stat as VariableStatement;
          for (const varDecl of varStat.declarationList.declarations) {
            if (varDecl.initializer && varDecl.initializer.kind === SyntaxKind.CallExpression) {
              const callExpr = varDecl.initializer as CallExpression;
              if (callExpr.expression.kind === SyntaxKind.PropertyAccessExpression) {
                // Check if the current expression is a express body declaration like req.body()
                const propAccExpr = callExpr.expression as PropertyAccessExpression;
                if (propAccExpr.expression.getText() === reqVarName && propAccExpr.name.text === 'body') {
                  result.reqVal = varDecl.name;
                }
              }
            }
          }
          break;
      }
    }

    return result;
  }

  /**
   * // TODO needs further implementation
   * @param endpoint
   * @param resVal
   * @param checker
   * @returns SemanticError or undefined
   */
  private createComplexTypeError(endpoint: Endpoint, resVal: Expression, checker: TypeChecker): SemanticError | undefined {
    const resType = endpoint.response;
    let result: { fullString: any; normalString: any } = {
      fullString: undefined,
      normalString: undefined,
    };

    if (resVal.kind === SyntaxKind.Identifier) {
      result = this.getTypeAtNodeLocation(resVal, checker);
    } else if (resVal.kind === SyntaxKind.ObjectLiteralExpression) {
      const type = checker.getTypeAtLocation(resVal);
      // Normalize type strings and compare them
      result = this.parseObject(type, checker);
    } else {
      return createSemanticError(`Wrong type.\nExpected:\n${JSON.stringify(resType)}\nActual:\n${resVal.getText()}`, resVal.getStart(), resVal.end);
    }

    if (result.fullString) {
      const actualObject = JSON.parse(result.fullString);
      const siarcObject = JSON.parse(JSON.stringify(resType));

      const missingTypesInTS: Map<string, string> = this.findMissingTypes(siarcObject, actualObject);

      // TODO vlt Seb fragen?!
      // const missingDeclarationInSiarc: Map<string, string> = this.findMissingTypes(actualObject, siarcObject);
      const missingDeclarationInSiarc: Map<string, string> = new Map();

      if (missingTypesInTS.size == 0 && missingDeclarationInSiarc.size == 0) {
        return undefined;
      }

      let errorString = '';
      missingTypesInTS.forEach((value, key) => {
        errorString += `Missing property: ${key}: ${value} \n`;
      });

      missingDeclarationInSiarc.forEach((value, key) => {
        errorString += `Missing decl in siarc: ${key}: ${value} \n`;
      });

      if (errorString !== '') {
        return createSemanticError(errorString, resVal.getStart(), resVal.end);
      }
    }

    return undefined;
  }

  /**
   * Compares two JSON objects and returns missing objects/types
   * @param actualObjects objects
   * @param objectsToCompare objects to compare to
   * @returns List of missing objects/types
   */
  private findMissingTypes(actualObjects: any, objectsToCompare: any): Map<string, string> {
    //TODO recursive machen

    let nameToTypeMap: Map<string, string> = new Map();
    for (let firstType in actualObjects) {
      let foundTypeInConfig: boolean = false;
      for (let secondType in objectsToCompare) {
        const x = actualObjects[firstType];
        const y = objectsToCompare[secondType];

        if (x === y && firstType === secondType) {
          foundTypeInConfig = true;
          break;
        } else if (typeof x === 'object' && typeof y === 'object') {
          const nestedTypesByName = this.findMissingTypes(x, y);
          if (nestedTypesByName.size < 1) {
            foundTypeInConfig = true;
          } else {
            nestedTypesByName.forEach((value, key) => {
              nameToTypeMap.set(key, value);
            });
            foundTypeInConfig = true;
          }
        }
      }

      if (!foundTypeInConfig) {
        nameToTypeMap.set(firstType.toString(), actualObjects[firstType]);
      }
    }
    return nameToTypeMap;
  }

  private getTypeAtNodeLocation(resVal: Expression, checker: TypeChecker): { fullString: string; normalString: string } {
    const result: { fullString: string; normalString: string } = {
      fullString: '',
      normalString: '',
    };

    const symbol = checker.getSymbolAtLocation(resVal);
    const typedString = this.getTypeAsStringOfSymbol(symbol);

    let fullString = '{';
    fullString += `"${resVal.getText()}":"${typedString}",`;

    fullString = removeLastSymbol(fullString, ',');
    fullString += '}';

    result.fullString = fullString;
    result.normalString = fullString.replace(/['",]/g, '');

    return result;
  }

  /**
   * // TODO
   * @param type
   * @param checker
   * @returns
   */
  private parseObject(type: Type, checker: TypeChecker): { fullString: string; normalString: string } {
    const result: { fullString: string; normalString: string } = {
      fullString: '',
      normalString: '',
    };

    //TODO Lösung für error === any lösen
    let fullString = '{';

    const members = type.symbol?.members;
    if (members && members.size > 0) {
      members.forEach((value, key) => {
        if (value.valueDeclaration) {
          const type = checker.getTypeAtLocation(value.valueDeclaration);

          let typedString = '';

          switch (type.flags) {
            case TypeFlags.Object:
              typedString = this.parsePropertiesRecursive(type, checker);
              fullString += `"${key.toString()}":${typedString},`;
              break;

            case TypeFlags.Number:
            case TypeFlags.String:
            case TypeFlags.Boolean:
              typedString = checker.typeToString(type);
              fullString += `"${key.toString()}":"${typedString}",`;
              break;
            case TypeFlags.Any:
              const variableDeclaration = value.getDeclarations()?.[0] as VariableDeclaration;
              if (variableDeclaration.initializer?.kind == SyntaxKind.Identifier) {
                const initializer = variableDeclaration.initializer as Identifier;
                const symbolOfInit = checker.getSymbolAtLocation(initializer);
                const undefString = this.getTypeAsStringOfSymbol(symbolOfInit);
                if (undefString) {
                  fullString += `"${key.toString()}":"${undefString}",`;
                }
              }
              break;

            default:
              break;
          }
        }
      });
    }

    fullString = removeLastSymbol(fullString, ',');
    fullString += '}';

    result.fullString = fullString;
    result.normalString = fullString.replace(/['",]/g, '');

    return result;
  }
  parsePropertiesRecursive(type: Type, checker: TypeChecker): string {
    const symbolsOfType: Symbol[] = type.getProperties();

    let jsonString: string = '{';

    symbolsOfType.forEach((symbol) => {
      if (symbol.valueDeclaration?.kind === SyntaxKind.PropertyAssignment) {
        const propertyAssignment = symbol.valueDeclaration as PropertyAssignment;
        const typeOfProp = checker.getTypeAtLocation(propertyAssignment);

        let resultString = '';

        switch (typeOfProp.getFlags()) {
          case TypeFlags.Object:
            resultString += `"${symbol.name}":${this.parsePropertiesRecursive(typeOfProp, checker)}`;
            break;
          case TypeFlags.Any:
            const string = this.getTypeAsStringOfSymbol(symbol, checker);
            resultString += `"${symbol.name}":"${string}"`;
            break;
          case TypeFlags.String:
          case TypeFlags.Number:
          case TypeFlags.Boolean:
            resultString += `"${symbol.name}":"${checker.typeToString(typeOfProp)}"`;
          default:
            break;
        }

        jsonString += resultString + ',';
      }
    });

    jsonString = removeLastSymbol(jsonString, ',');

    jsonString += '}';
    return jsonString;
  }

  /**
   * Parse the type of a symbol
   * @param symbol Symbol of an object
   * @returns Either undefined or the type of the object
   */
  private getTypeAsStringOfSymbol(symbol: Symbol | undefined, checker?: TypeChecker): string | undefined {
    let typedString: string | undefined;
    if (symbol) {
      const declarations = symbol.getDeclarations();
      if (declarations) {
        const firstDecl = declarations[0];

        let typeNode;
        switch (firstDecl.kind) {
          case SyntaxKind.VariableDeclaration:
            typeNode = (firstDecl as VariableDeclaration).type;
            if (typeNode) {
              typeNode.forEachChild((child) => {
                if (child.kind === SyntaxKind.Identifier) {
                  typedString = (child as Identifier).getText();
                }
              });
            }
            break;
          case SyntaxKind.PropertyAssignment:
            const propsAssignment = firstDecl as PropertyAssignment;
            const symbolRec = checker?.getSymbolAtLocation(propsAssignment.initializer);
            typedString = this.getTypeAsStringOfSymbol(symbolRec);
            console.log();
        }
      }
    }
    return typedString;
  }
}

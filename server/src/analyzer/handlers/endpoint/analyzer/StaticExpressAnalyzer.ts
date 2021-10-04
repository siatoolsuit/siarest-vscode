import { start } from 'repl';
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
  PropertySignature,
  Statement,
  SyntaxKind,
  Type,
  TypeChecker,
  VariableStatement,
  SourceFile,
  VariableDeclaration,
  Identifier,
  TypeNode,
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

            // Check the body, only if this function is a post or put
            if (endpoint.method === 'POST' || endpoint.method === 'PUT') {
              const reqType = endpoint.request;
              if (reqVal) {
                const symbol = checker.getSymbolAtLocation(reqVal);
                if (symbol && symbol.valueDeclaration) {
                  const type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration);
                  // Normalize type strings and compare them
                  const { fullString, normalString } = this.typeToString(type, checker);
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
      const symbol = checker.getSymbolAtLocation(resVal);
      if (symbol) {
        const declartions = symbol.getDeclarations();
        // TODO not empty?
        if (declartions) {
          const firstDecl = declartions[0];
          if (firstDecl.kind === SyntaxKind.VariableDeclaration) {
            const typeNode = (firstDecl as VariableDeclaration).type;
            // Normalize type strings and compare them
            if (typeNode) {
              result = this.typeNodeToString(typeNode, resVal, checker);
            }
          }
        }
      }
    } else if (resVal.kind === SyntaxKind.ObjectLiteralExpression) {
      const type = checker.getTypeAtLocation(resVal);
      // Normalize type strings and compare them
      result = this.typeToString(type, checker);
    } else {
      return createSemanticError(`Wrong type.\nExpected:\n${JSON.stringify(resType)}\nActual:\n${resVal.getText()}`, resVal.getStart(), resVal.end);
    }

    if (result.fullString) {
      const actualObject = JSON.parse(result.fullString);
      const siarcObject = JSON.parse(JSON.stringify(resType));

      const missingTypes: Map<string, string> = new Map();

      for (let firstType in siarcObject) {
        let foundTypeInConfig: boolean = false;
        for (let secondType in actualObject) {
          const x = siarcObject[firstType];
          const y = actualObject[secondType];

          if (x === y && firstType === secondType) {
            console.log(x + ' = ' + y);
            foundTypeInConfig = true;
          }
        }

        if (!foundTypeInConfig) {
          missingTypes.set(firstType.toString(), siarcObject[firstType]);
        }
      }

      if (missingTypes.size == 0) {
        return undefined;
      }

      let errorString = '';
      missingTypes.forEach((value, key) => {
        errorString += `Missing property: ${key}: ${value} \n`;
        console.log(value, key);
      });

      // TODO find properties that aren't in siarc.json

      if (errorString !== '') {
        return createSemanticError(errorString, resVal.getStart(), resVal.end);
      }
    }

    return undefined;
  }

  private typeNodeToString(typeNode: TypeNode, resVal: Expression, checker: TypeChecker): { fullString: string; normalString: string } {
    const result: { fullString: string; normalString: string } = {
      fullString: '',
      normalString: '',
    };

    let fullString = '{';

    let typedString: string = '';
    typeNode?.forEachChild((child) => {
      if (child.kind === SyntaxKind.Identifier) {
        typedString = (child as Identifier).getText();
      }
    });

    fullString += `"${resVal.getText()}":"${typedString}",`;

    const temp = fullString.split('');
    temp[fullString.lastIndexOf(',')] = '';
    fullString = temp.join('');
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
  private typeToString(type: Type, checker: TypeChecker): { fullString: string; normalString: string } {
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
          let typedString = checker.typeToString(type);
          if (typedString !== 'any') {
            fullString += `"${key.toString()}":"${typedString}",`;
          } else {
            const variableDeclaration = value.getDeclarations()?.[0] as VariableDeclaration;
            if (variableDeclaration.initializer?.kind == SyntaxKind.Identifier) {
              const initializer = variableDeclaration.initializer as Identifier;
              const symbolOfInit = checker.getSymbolAtLocation(initializer);
              if (symbolOfInit) {
                const declarations = symbolOfInit.getDeclarations();
                if (declarations) {
                  const firstDecl = declarations[0];
                  if (firstDecl.kind === SyntaxKind.VariableDeclaration) {
                    const typeNode = (firstDecl as VariableDeclaration).type;
                    if (typeNode) {
                      let typedString: string = '';
                      typeNode.forEachChild((child) => {
                        if (child.kind === SyntaxKind.Identifier) {
                          typedString = (child as Identifier).getText();
                        }
                      });

                      fullString += `"${key.toString()}":"${typedString}",`;
                    }
                  }
                }
              }

              // TODO von variableDeclaration die eigentliche Declaration holen dann geilo

              // let undefinedString = variableDeclaration.initializer?.getText();
              // if (undefinedString) {
              //   fullString += `"${key.toString()}":"${undefinedString}",`;
              // }
            }
          }
        }
      });
    }

    const temp = fullString.split('');
    temp[fullString.lastIndexOf(',')] = '';
    fullString = temp.join('');
    fullString += '}';

    result.fullString = fullString;
    result.normalString = fullString.replace(/['",]/g, '');

    return result;
  }
}

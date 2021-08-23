import {
  ArrowFunction,
  BindingName,
  Block,
  CallExpression,
  factory,
  createProgram,
  createTextChangeRange,
  createTextSpan,
  Expression,
  ExpressionStatement,
  Identifier,
  ImportDeclaration,
  NodeArray,
  PropertyAccessExpression,
  PropertySignature,
  Statement,
  StringLiteral,
  SyntaxKind,
  Type,
  TypeChecker,
  VariableStatement,
  NamedImports,
} from 'typescript';

import { Endpoint } from '../../config';
import { SemanticError, StaticAnalyzer } from '../../types';
import { expressImportByName } from '../../utils';
import { createSemanticError } from '../../utils/helper';

interface EndpointExpression {
  readonly expr: CallExpression;
  readonly method: string;
  readonly path: string;
  readonly inlineFunction: ArrowFunction;
}

export class StaticExpressAnalyzer extends StaticAnalyzer {
  private httpMethods: string[] = ['get', 'post', 'put', 'delete'];
  private sendMethods: string[] = ['send', 'json'];

  public analyze(uri: string): SemanticError[] {
    // Create a new program for type checking
    const program = createProgram([uri], {});
    const checker = program.getTypeChecker();
    let tsFile = program.getSourceFile(uri);
    if (!tsFile) {
      return [];
    }

    // Extract all higher functions like express import, app declarations and endpoint declarations
    const { expressImport, endpointExpressions } = this.extractExpressExpressions(tsFile.statements);

    if (!expressImport) {
      return [];
    }

    const result: SemanticError[] = [];
    if (this.currentConfig) {
      if (endpointExpressions.length > 0) {
        for (const endpointExprs of endpointExpressions) {
          const expr = endpointExprs.expr;
          const endpoint = this.findEndpointForPath(endpointExprs.path);
          // Validates the defined endpoint with the service configuration
          if (endpoint) {
            if (endpoint.method !== endpointExprs.method) {
              result.push(createSemanticError(`Wrong HTTP method use ${endpoint.method} instead.`, expr.expression.getStart(), expr.expression.end));
            }

            const { resVal, reqVal } = this.extractReqResFromFunction(endpointExprs.inlineFunction);
            // Validate the return value of the inner function
            if (resVal) {
              const resConf = endpoint.response;

              switch (typeof resConf) {
                case 'string':
                  let semanticError = this.createSimpleTypeError(resConf, resVal);
                  if (semanticError) result.push(semanticError);
                  break;
                case 'object':
                  semanticError = this.createComplexTypeError(endpoint, resVal, checker, result);
                  if (semanticError) result.push(semanticError);
                  break;
                default:
                  break;
              }
            } else {
              result.push(createSemanticError('Missing return value for endpoint.', expr.getStart(), expr.end));
            }

            // TODO seb fragen

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
      result.push(createSemanticError(`Missing configuration for service ${this.currentServiceName} in .siarc.json.`, 0, 0));
    }

    return result;
  }

  private extractExpressExpressions(statements: NodeArray<Statement>): {
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

    // TODO replace with a list of e.g for express.Router etc
    let expressVarName;
    for (const statement of statements) {
      switch (statement.kind) {
        case SyntaxKind.ImportDeclaration:
          const importStatement = this.extractExpressImport(statement);
          if (importStatement) {
            result.expressImport = importStatement;
          }
          break;

        case SyntaxKind.VariableStatement:
          const expressVar = this.extractExpressVariable(statement);
          if (expressVar) {
            expressVarName = expressVar;
          }
          break;

        case SyntaxKind.ExpressionStatement:
          if (expressVarName) {
            const expression = this.extractExpressStatement(statement, expressVarName);
            if (expression) {
              result.endpointExpressions.push(expression);
            }
          }
          break;
      }
    }

    return result;
  }

  extractExpressStatement(statement: Statement, expressVarName: String): EndpointExpression | undefined {
    const expr = statement as ExpressionStatement;
    if (expr.expression.kind === SyntaxKind.CallExpression) {
      const callExpr = expr.expression as CallExpression;
      if (callExpr.expression.kind === SyntaxKind.PropertyAccessExpression) {
        // Check if the current expression is a express route declaration like app.get(...)
        const propAccExpr = callExpr.expression as PropertyAccessExpression;
        if (propAccExpr.expression.getText() === expressVarName && this.httpMethods.includes(propAccExpr.name.text)) {
          const { path, inlineFunction } = this.extractPathAndMethodImplementationFromArguments(callExpr.arguments);
          return {
            expr: callExpr,
            method: propAccExpr.name.text.toUpperCase(),
            path,
            inlineFunction,
          };
        }
      }
    }
  }

  private extractExpressVariable(statement: Statement): String | undefined {
    const varDecls = statement as VariableStatement;
    for (const varDecl of varDecls.declarationList.declarations) {
      if (varDecl.initializer && varDecl.initializer.kind === SyntaxKind.CallExpression) {
        const initExp = varDecl.initializer as CallExpression;
        if (initExp.expression.kind === SyntaxKind.Identifier) {
          const initIden = initExp.expression as Identifier;
          if (initIden.escapedText) {
            const express = expressImportByName.get(initIden.escapedText);
            if (initIden.escapedText === express) {
              return varDecl.name.getText();
            }
          }
        }
      }
    }
  }

  private extractExpressImport(statement: Statement): ImportDeclaration | undefined {
    const importDecl = statement as ImportDeclaration;
    const importClause = importDecl.importClause;
    if (importClause) {
      if (importClause.name) {
        if (importClause.name.escapedText === expressImportByName.get('express')) {
          return importDecl;
        }
      } else if (importClause.namedBindings) {
        const imports = importClause.namedBindings as NamedImports;

        for (const element of imports.elements) {
          if (element.name.escapedText === 'Router') {
            return importDecl;
          }
        }
      }
    }
  }

  //TODO not
  private extractReqResFromFunction(inlineFunction: ArrowFunction): { resVal: Expression | undefined; reqVal: BindingName | undefined } {
    const result: {
      resVal: Expression | undefined;
      reqVal: BindingName | undefined;
    } = {
      resVal: undefined,
      reqVal: undefined,
    };

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

    // TODO erkenntn kein res.status ...
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
              if (this.sendMethods.includes(propAccExpr.name.text)) {
                const lastPropAcc: PropertyAccessExpression | undefined = this.parseLastExpression(propAccExpr);
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

  private extractPathAndMethodImplementationFromArguments(args: NodeArray<Expression>): { path: string; inlineFunction: ArrowFunction } {
    const result: any = {};
    for (const node of args) {
      if (node.kind === SyntaxKind.StringLiteral && args.indexOf(node) === 0) {
        result.path = (node as StringLiteral).text;
      } else if (node.kind === SyntaxKind.ArrowFunction) {
        result.inlineFunction = node;
      }
    }
    return result;
  }

  private findEndpointForPath(path: string): Endpoint | undefined {
    if (this.currentConfig) {
      for (const endpoint of this.currentConfig.endpoints) {
        if (endpoint.path === path) {
          return endpoint;
        }
      }
    }
  }

  private typeToString(type: Type, checker: TypeChecker): { fullString: string; normalString: string } {
    const result: { fullString: string; normalString: string } = {
      fullString: '',
      normalString: '',
    };

    //TODO try and catch?

    let fullString = '{';
    const members = type.symbol?.members;
    if (members && members.size > 0) {
      members.forEach((value, key) => {
        const propSig = value.valueDeclaration as PropertySignature;
        if (propSig.type) {
          const propType = checker.getTypeFromTypeNode(propSig.type);
          fullString += `"${key.toString()}":"${checker.typeToString(propType)}",`;
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

  private parseLastExpression(propAccExpr: PropertyAccessExpression): PropertyAccessExpression | undefined {
    if (propAccExpr.expression) {
      propAccExpr = propAccExpr.expression as PropertyAccessExpression;
      return this.parseLastExpression(propAccExpr);
    }

    return propAccExpr;
  }

  private createSimpleTypeError(resConf: string, resVal: Expression): SemanticError | undefined {
    if (resConf === 'string' && resVal.kind !== SyntaxKind.StringLiteral) {
      return createSemanticError('Return value needs to be a string.', resVal.getStart(), resVal.end);
    } else if (resConf === 'number' && resVal.kind !== SyntaxKind.NumericLiteral) {
      createSemanticError('Return value needs to be a number.', resVal.getStart(), resVal.end);
    } else if (resConf === 'boolean' && resVal.kind !== SyntaxKind.TrueKeyword && resVal.kind !== SyntaxKind.FalseKeyword) {
      createSemanticError('Return value needs to be true or false.', resVal.getStart(), resVal.end);
    }

    return undefined;
  }

  private createComplexTypeError(endpoint: Endpoint, resVal: Expression, checker: TypeChecker, result: SemanticError[]): SemanticError | undefined {
    // TODO
    // Check the complex return type, maybe this is inline or a extra type or a class or interface etc.
    const resType = endpoint.response;
    if (resVal.kind === SyntaxKind.Identifier || resVal.kind === SyntaxKind.ObjectLiteralExpression) {
      const type = checker.getTypeAtLocation(resVal);
      // Normalize type strings and compare them
      const { fullString, normalString } = this.typeToString(type, checker);
      const normalTypeInCodeString = normalString;
      const normalTypeInConfigString = JSON.stringify(resType).replace(/['",]/g, '');
      if (normalTypeInCodeString !== normalTypeInConfigString) {
        result.push(createSemanticError(`Wrong type.\nExpected:\n${JSON.stringify(resType)}\nActual:\n${fullString}`, resVal.getStart(), resVal.end));
      }
    } else {
      result.push(
        createSemanticError(`Wrong type.\nExpected:\n${JSON.stringify(resType)}\nActual:\n${resVal.getText()}`, resVal.getStart(), resVal.end),
      );
    }

    return undefined;
  }
}

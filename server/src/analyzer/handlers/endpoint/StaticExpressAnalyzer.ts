import {
  ArrowFunction,
  BindingName,
  Block,
  CallExpression,
  createNodeArray,
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
} from 'typescript';

import { Endpoint } from '../../config';
import { SemanticError, StaticAnalyzer } from '../../types';

interface EndpointExpression {
  readonly expr: CallExpression;
  readonly method: string;
  readonly path: string;
  readonly inlineFunction: ArrowFunction;
}

export class StaticExpressAnalyzer extends StaticAnalyzer {
  private httpMethods: string[] = ['get', 'post', 'put', 'delete'];
  private sendMethods: string[] = ['send', 'json'];

  public analyze(uri: string, text: string): SemanticError[] {
    // Check uri format
    if (uri.startsWith('file:///')) {
      uri = uri.replace('file:///', '');
    }
    if (uri.includes('%3A')) {
      uri = uri.replace('%3A', ':');
    }

    // Create a new program for type checking
    const program = createProgram([uri], {});
    const checker = program.getTypeChecker();
    let tsFile = program.getSourceFile(uri);
    if (!tsFile) {
      return [];
    }

    // TODO: Hure! Das invalidiert das Program wodurch der TypeChecker nicht mehr funktioniert. Ganz toll...
    // TODO: Eventuell ein Pull Request bei der Compiler API machen ?? Erstmal weiter mit onChange stattdessen, oder eigenen TypeChecker schreiben => Auch nicht so angenehm
    // tsFile = tsFile.update(text, createTextChangeRange(createTextSpan(0, tsFile.getFullWidth()), text.length));

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
              result.push({
                message: `Wrong HTTP method use ${endpoint.method} instead.`,
                position: {
                  start: expr.expression.getStart(),
                  end: expr.expression.end,
                },
              });
            }

            const { resVal, reqVal } = this.extractReqResFromFunction(endpointExprs.inlineFunction);
            // Validate the return value of the inner function
            if (resVal) {
              const resConf = endpoint.response;
              if (typeof resConf === 'string') {
                if (resConf === 'string' && resVal.kind !== SyntaxKind.StringLiteral) {
                  result.push({
                    message: 'Return value needs to be a string.',
                    position: { start: resVal.getStart(), end: resVal.end },
                  });
                } else if (resConf === 'number' && resVal.kind !== SyntaxKind.NumericLiteral) {
                  result.push({
                    message: 'Return value needs to be a number.',
                    position: { start: resVal.getStart(), end: resVal.end },
                  });
                } else if (resConf === 'boolean' && resVal.kind !== SyntaxKind.TrueKeyword && resVal.kind !== SyntaxKind.FalseKeyword) {
                  result.push({
                    message: 'Return value needs to be true or false.',
                    position: { start: resVal.getStart(), end: resVal.end },
                  });
                }
              } else if (typeof resConf === 'object') {
                // Check the complex return type, maybe this is inline or a extra type or a class or interface etc.
                const resType = endpoint.response;
                if (resVal.kind === SyntaxKind.Identifier || resVal.kind === SyntaxKind.ObjectLiteralExpression) {
                  const type = checker.getTypeAtLocation(resVal);
                  // Normalize type strings and compare them
                  const { fullString, normalString } = this.typeToString(type, checker);
                  const normalTypeInCodeString = normalString;
                  const normalTypeInConfigString = JSON.stringify(resType).replace(/['",]/g, '');
                  if (normalTypeInCodeString !== normalTypeInConfigString) {
                    result.push({
                      message: `Wrong type.\nExpected:\n${JSON.stringify(resType)}\nActual:\n${fullString}`,
                      position: { start: resVal.getStart(), end: resVal.end },
                    });
                  }
                } else {
                  result.push({
                    message: `Wrong type.\nExpected:\n${JSON.stringify(resType)}\nActual:\n${resVal.getText()}`,
                    position: { start: resVal.getStart(), end: resVal.end },
                  });
                }
              }
            } else {
              result.push({
                message: 'Missing return value for endpoint.',
                position: { start: expr.getStart(), end: expr.end },
              });
            }

            // Check the body, only if this function is a post or put
            if (endpoint.method === 'POST' || endpoint.method === 'PUT') {
              const reqType = endpoint.request;
              if (reqVal) {
                const symbol = checker.getSymbolAtLocation(reqVal);
                if (symbol) {
                  const type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration);
                  // Normalize type strings and compare them
                  const { fullString, normalString } = this.typeToString(type, checker);
                  const normalTypeInCodeString = normalString;
                  const normalTypeInConfigString = JSON.stringify(reqType).replace(/['",]/g, '');
                  if (normalTypeInCodeString !== normalTypeInConfigString) {
                    result.push({
                      message: `Wrong type.\nExpected:\n${JSON.stringify(reqType)}\nActual:\n${fullString}`,
                      position: { start: reqVal.getStart(), end: reqVal.end },
                    });
                  }
                }
              } else {
                result.push({
                  message: `Endpoint with method "${endpoint.method}" has a missing body handling.`,
                  position: { start: expr.getStart(), end: expr.end },
                });
              }
            }
          } else {
            result.push({
              message: 'Endpoint is not defined for this service.',
              position: { start: expr.getStart(), end: expr.end },
            });
          }
        }
      }
    } else {
      result.push({
        message: `Missing configuration for service ${this.currentServiceName} in .siarc.json.`,
        position: { start: 0, end: 0 },
      });
    }

    return result;
  }

  private extractExpressExpressions(
    statements: NodeArray<Statement>,
  ): {
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

    let expressVarName;
    for (const statement of statements) {
      switch (statement.kind) {
        case SyntaxKind.ImportDeclaration:
          const importDecl = statement as ImportDeclaration;
          if (importDecl.importClause && importDecl.importClause.name) {
            if (importDecl.importClause.name.escapedText === 'express') {
              result.expressImport = importDecl;
            }
          }
          break;

        case SyntaxKind.VariableStatement:
          const varDecls = statement as VariableStatement;
          for (const varDecl of varDecls.declarationList.declarations) {
            if (varDecl.initializer && varDecl.initializer.kind === SyntaxKind.CallExpression) {
              const initExp = varDecl.initializer as CallExpression;
              if (initExp.expression.kind === SyntaxKind.Identifier) {
                const initIden = initExp.expression as Identifier;
                if (initIden.escapedText === 'express') {
                  expressVarName = varDecl.name.getText();
                }
              }
            }
          }
          break;

        case SyntaxKind.ExpressionStatement:
          if (!expressVarName) {
            continue;
          }
          const expr = statement as ExpressionStatement;
          if (expr.expression.kind === SyntaxKind.CallExpression) {
            const callExpr = expr.expression as CallExpression;
            if (callExpr.expression.kind === SyntaxKind.PropertyAccessExpression) {
              // Check if the current expression is a express route declaration like app.get(...)
              const propAccExpr = callExpr.expression as PropertyAccessExpression;
              if (propAccExpr.expression.getText() === expressVarName && this.httpMethods.includes(propAccExpr.name.text)) {
                const { path, inlineFunction } = this.extractPathAndMethodImplementationFromArguments(callExpr.arguments);
                result.endpointExpressions.push({
                  expr: callExpr,
                  method: propAccExpr.name.text.toUpperCase(),
                  path,
                  inlineFunction,
                });
              }
            }
          }
          break;
      }
    }

    return result;
  }

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
    let statList: NodeArray<Statement> = createNodeArray();
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
              const propAccExpr = callExpr.expression as PropertyAccessExpression;
              if (propAccExpr.expression.getText() === resVarNAme && this.sendMethods.includes(propAccExpr.name.text)) {
                result.resVal = callExpr.arguments[0];
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

    let fullString = '{';
    const members = type.symbol.members;
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
}

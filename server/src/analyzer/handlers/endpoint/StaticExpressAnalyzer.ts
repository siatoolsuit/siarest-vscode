import { ArrowFunction, BindingName, Block, CallExpression, ConciseBody, createProgram, Expression, ExpressionStatement, Identifier, ImportDeclaration, NodeArray, PropertyAccessExpression, StringLiteral, SyntaxKind, VariableStatement } from 'typescript';
import { Endpoint } from '../../config';
import { SemanticError, StaticAnalyzer } from '../../types';

export class StaticExpressAnalyzer extends StaticAnalyzer {
  private httpMethods: string[] = [ 'get', 'post', 'put', 'delete' ];
  private sendMethods: string[] = [ 'send', 'json' ];

  // TODO: Perfmance verbessern, dafür alle wichtigen variablen auf einmal extrahieren und nicht tausendmal drüber rödeln
  public analyze(uri:string): SemanticError[] {
    // Check uri format
    if (uri.startsWith('file:///')) {
      uri = uri.replace('file:///', '');
    }
    if (uri.includes('%3A')) {
      uri = uri.replace('%3A', ':');
    }

    // Check if the current file has some express imports, otherwise this file seems not to use the express api
    const programm = createProgram([uri], {});
    const checker = programm.getTypeChecker();
    const tsFile = programm.getSourceFile(uri);
    if (!tsFile) {
      return [];
    }

    const importStatementList: ImportDeclaration[] = tsFile.statements.filter((s) => s.kind === SyntaxKind.ImportDeclaration) as ImportDeclaration[];
    if (!this.hasExpressImportStatement(importStatementList)) {
      return [];
    }

    const result: SemanticError[] = [];
    if (this.currentConfig) {
      // Serach for the declaration of the express app variable and look for route definitions
      const variableStatementList: VariableStatement[] = tsFile.statements.filter((s) => s.kind === SyntaxKind.VariableStatement) as VariableStatement[];
      const expressVarName = this.extractExpressVariableName(variableStatementList);
      if (expressVarName) {
        const expressionStatementList: ExpressionStatement[] = tsFile.statements.filter((s) => s.kind === SyntaxKind.ExpressionStatement) as ExpressionStatement[];
        for (const expressionStatement of expressionStatementList) {
          // Check if this expression is a function call
          if (expressionStatement.expression.kind === SyntaxKind.CallExpression) {
            const callExpression = expressionStatement.expression as CallExpression;
            if (callExpression.expression.kind === SyntaxKind.PropertyAccessExpression) {
              // Check if the current expression is a express route declaration like app.get(...)
              const propertyAccessExpression = callExpression.expression as PropertyAccessExpression;
              if (propertyAccessExpression.expression.getText() === expressVarName && this.httpMethods.includes(propertyAccessExpression.name.text)) {
                const method = propertyAccessExpression.name.getText().toUpperCase();
                const { path, inlineFunction } = this.extractPathAndMethodImplementationFromArguments(callExpression.arguments);
                // Validates the defined endpoint with the service configuration
                const endpoint = this.findEndpointForPath(path);
                if (endpoint) {
                  if (endpoint.method !== method) {
                    result.push({
                      message: `Wrong HTTP method use ${endpoint.method} instead.`,
                      position: { start: propertyAccessExpression.getStart(), end: propertyAccessExpression.end }
                    });
                  }
                  // Validate the return value of the inner function
                  const responseVarName = this.extractResponseVariableName(inlineFunction);
                  const returnValue = this.extractReturnValueFromFunction(responseVarName, inlineFunction.body);
                  if (returnValue) {
                    if (typeof endpoint.response === 'string') {
                      if (endpoint.response === 'string' && returnValue.kind !== SyntaxKind.StringLiteral) {
                        result.push({
                          message: 'Return value needs to be a string.',
                          position: { start: returnValue.getStart(), end: returnValue.end }
                        });
                      } else if (endpoint.response === 'number' && returnValue.kind !== SyntaxKind.NumericLiteral) {
                        result.push({
                          message: 'Return value needs to be a number.',
                          position: { start: returnValue.getStart(), end: returnValue.end }
                        });
                      } else if (endpoint.response === 'boolean' && (returnValue.kind !== SyntaxKind.TrueKeyword && returnValue.kind !== SyntaxKind.FalseKeyword)) {
                        result.push({
                          message: 'Return value needs to be true or false.',
                          position: { start: returnValue.getStart(), end: returnValue.end }
                        });
                      }
                    } else if (typeof endpoint.response === 'object') {
                      // Check the complex return type, maybe this is inline or a extra type or a class or interface etc.
                      const responseType = endpoint.response;
                      if (returnValue.kind === SyntaxKind.Identifier || returnValue.kind === SyntaxKind.ObjectLiteralExpression) {
                        const type = checker.getTypeAtLocation(returnValue);
                        // Normalize type strings and compare them
                        const normalTypeInCodeString = checker.typeToString(type, returnValue).replace(/[ ;]/g, '');
                        const normalTypeInConfigString = JSON.stringify(responseType).replace(/['",]/g, '');
                        if (normalTypeInCodeString !== normalTypeInConfigString) {
                          result.push({
                            message: `Wrong type.\nExpected:\n${JSON.stringify(responseType)}\nActual:\n${checker.typeToString(type, returnValue)}`,
                            position: { start: returnValue.getStart(), end: returnValue.end }
                          });
                        }
                      } else {
                        result.push({
                          message: `Wrong type.\nExpected:\n${JSON.stringify(responseType)}\nActual:\n${returnValue.getText()}`,
                          position: { start: returnValue.getStart(), end: returnValue.end }
                        });
                      }
                    }
                  } else {
                    result.push({
                      message: 'Missing return value for endpoint.',
                      position: { start: callExpression.getStart(), end: callExpression.end }
                    });
                  }
                  // Check the body, only if this function is a post or put
                  if (method === 'POST' || method === 'PUT') {
                    const requestType = endpoint.request;
                    const requestVarName = this.extractRequestVariableName(inlineFunction);
                    const body = this.extractBodyFromFunction(requestVarName, inlineFunction.body);
                    if (body) {
                      const type = checker.getTypeAtLocation(body);
                      // Normalize type strings and compare them
                      const normalTypeInCodeString = checker.typeToString(type, returnValue).replace(/[ ;]/g, '');
                      const normalTypeInConfigString = JSON.stringify(requestType).replace(/['",]/g, '');
                      if (normalTypeInCodeString !== normalTypeInConfigString) {
                        result.push({
                          message: `Wrong type.\nExpected:\n${JSON.stringify(requestType)}\nActual:\n${checker.typeToString(type, returnValue)}`,
                          position: { start: body.getStart(), end: body.end }
                        });
                      }
                    } else {
                      result.push({
                        message: `Endpoint with method "${method}" has a missing body handling.`,
                        position: { start: callExpression.getStart(), end: callExpression.end }
                      });
                    }
                  }
                } else {
                  result.push({
                    message: 'Endpoint is not defined for this service.',
                    position: { start: callExpression.getStart(), end: callExpression.end }
                  });
                }
              }
            }
          }
        }
      }
    } else {
      result.push({
        message: `Missing configuration for service ${this.currentServiceName} in .siarc.json.`,
        position: { start: 0, end: 0 } 
      });
    }

    return result;
  }

  private hasExpressImportStatement(importStatementList: ImportDeclaration[]): boolean {
    let hasImport = false;
    for (const importStatement of importStatementList) {
      if (importStatement.importClause && importStatement.importClause.name) {
        if (importStatement.importClause.name.escapedText == 'express') {
          hasImport = true;
          break;
        }
      } 
    }
    return hasImport;
  }

  private extractExpressVariableName(variableStatementList: VariableStatement[]): string {
    for (const variableStatement of variableStatementList) {
      const varDecls = variableStatement.declarationList.declarations;
      for (const varDecl of varDecls) {
        if (varDecl.initializer && varDecl.initializer.kind === SyntaxKind.CallExpression) {
          const initExp = varDecl.initializer as CallExpression;
          if (initExp.expression.kind === SyntaxKind.Identifier) {
            const initIden = initExp.expression as Identifier;
            if (initIden.escapedText === 'express') {
              return varDecl.name.getText();
            }
          }
        }
      }
    }
    return '';
  }
  
  private extractResponseVariableName(inlineFunction: ArrowFunction): string {
    const parameters = inlineFunction.parameters;
    if (parameters.length === 2) {
      return parameters[1].getText();
    }
    return '';
  }

  private extractRequestVariableName(inlineFunction: ArrowFunction): string {
    const parameters = inlineFunction.parameters;
    if (parameters.length === 2) {
      return parameters[0].getText();
    }
    return '';
  }

  private extractPathAndMethodImplementationFromArguments(args: NodeArray<Expression>): { path: string, inlineFunction: ArrowFunction } {
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

  private extractReturnValueFromFunction(responseVarName: string, functionBody: ConciseBody): Expression | undefined {
    let statementList: ExpressionStatement[] = [];
    switch (functionBody.kind) {
      case SyntaxKind.Block:
        statementList = (functionBody as Block).statements.filter((s) => s.kind === SyntaxKind.ExpressionStatement) as ExpressionStatement[];
        break;
    }
    for (const statement of statementList) {
      if (statement.expression.kind === SyntaxKind.CallExpression) {
        const callExpression = statement.expression as CallExpression;
        if (callExpression.expression.kind === SyntaxKind.PropertyAccessExpression) {
          // Check if the current expression is a express send declaration like res.send(...) or res.json(...)
          const propertyAccessExpression = callExpression.expression as PropertyAccessExpression;
          if (propertyAccessExpression.expression.getText() === responseVarName && this.sendMethods.includes(propertyAccessExpression.name.text)) {
            return callExpression.arguments[0];
          }
        }
      }
    }
  }

  private extractBodyFromFunction(requestVarName: string, functionBody: ConciseBody): BindingName | undefined {
    let statementList: VariableStatement[] = [];
    switch (functionBody.kind) {
      case SyntaxKind.Block:
        statementList = (functionBody as Block).statements.filter((s) => s.kind === SyntaxKind.VariableStatement) as VariableStatement[];
        break;
    }
    for (const statement of statementList) {
      for (const varDecl  of statement.declarationList.declarations) {
        if (varDecl.initializer && varDecl.initializer.kind === SyntaxKind.CallExpression) {
          const callExpression = varDecl.initializer as CallExpression;
          if (callExpression.expression.kind === SyntaxKind.PropertyAccessExpression) {
            // Check if the current expression is a express body declaration like req.body()
            const propertyAccessExpression = callExpression.expression as PropertyAccessExpression;
            if (propertyAccessExpression.expression.getText() === requestVarName && propertyAccessExpression.name.text === 'body') {
              return varDecl.name;
            }
          }
        }
      }
    }
  }
}

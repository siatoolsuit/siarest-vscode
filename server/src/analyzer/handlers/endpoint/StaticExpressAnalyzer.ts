import { CallExpression, createSourceFile, Expression, ExpressionStatement, Identifier, ImportDeclaration, NodeArray, PropertyAccessExpression, ScriptTarget, StringLiteral, SyntaxKind, VariableStatement } from 'typescript';
import { Endpoint } from '../../config';
import { SemanticError, StaticAnalyzer } from '../../types';

export class StaticExpressAnalyzer extends StaticAnalyzer {
  private methods: string[] = [ 'get', 'post', 'put', 'delete' ];

  public analyze(uri:string, text: string): SemanticError[] {
    // Check if the current file has some express imports, otherwise this file seems not to use the express api
    const tsFile = createSourceFile(uri, text, ScriptTarget.ES2015, true);
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
              if (propertyAccessExpression.expression.getText() === expressVarName && this.methods.includes(propertyAccessExpression.name.text)) {
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
                } else {
                  result.push({
                    message: 'Endpoint is not defined for this service',
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
        message: `Missing configuration for service ${this.currentServiceName} in .siarc.json`,
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

  private extractPathAndMethodImplementationFromArguments(args: NodeArray<Expression>): any {
    const result = {
      path: '',
      inlineFunction: {}
    };
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
}
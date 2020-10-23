import { CallExpression, createSourceFile, ExpressionStatement, Identifier, ImportDeclaration, ScriptTarget, SyntaxKind, VariableStatement } from 'typescript';
import { SemanticError, StaticAnalyzer } from '../../types';

export class StaticExpressAnalyzer extends StaticAnalyzer {
  public analyze(uri:string, text: string): SemanticError[] {
    // Check if the current file has some express imports, otherwise this file seems not to use the express api
    const tsFile = createSourceFile(uri, text, ScriptTarget.ES2015, true);
    const importStatementList: ImportDeclaration[] = tsFile.getChildren().filter((s) => s.kind === SyntaxKind.ImportDeclaration) as ImportDeclaration[];
    if (!this.hasExpressImportStatement(importStatementList)) {
      return [];
    }

    const result: SemanticError[] = [];
    if (this.currentConfig) {
      // Serach for the declaration of the express app variable and look for route definitions
      const variableStatementList: VariableStatement[] = tsFile.getChildren().filter((s) => s.kind === SyntaxKind.VariableStatement) as VariableStatement[];
      const expressVarName = this.extractExpressVariableName(variableStatementList);
      if (expressVarName) {
        const expressionStatementList: ExpressionStatement[] = tsFile.getChildren().filter((s) => s.kind === SyntaxKind.ExpressionStatement) as ExpressionStatement[];
        // Endpoint extrahieren
      }
    } else {
      result.push({
        message: `Missing configuration for service ${this.currentServiceName} in .siarc.json`,
        offset: 0
      });
    }

    return result;
  }

  private hasExpressImportStatement(importStatementList: ImportDeclaration[]): boolean {
    let hasImport = false;
    for (const importStatement of importStatementList) {
      if (importStatement.moduleSpecifier.getText() === 'express') {
        hasImport = true;
        break;
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
}
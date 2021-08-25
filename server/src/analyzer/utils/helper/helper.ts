import {
  ArrowFunction,
  CallExpression,
  Expression,
  Identifier,
  ImportDeclaration,
  NamedImports,
  NodeArray,
  PropertyAccessExpression,
  Statement,
  StringLiteral,
  SyntaxKind,
  VariableStatement,
} from 'typescript';
import { expressImportByName } from '..';
import { Endpoint } from '../../config';
import { SemanticError } from '../../types';

/**
 *
 * @param message String that contains the error message
 * @param start Error start position
 * @param end Error end position
 * @returns SemanticError object
 */
export const createSemanticError = (message: string, start: number, end: number): SemanticError => {
  const semanticError: SemanticError = {
    message: message,
    position: { start, end },
  };

  return semanticError;
};

/**
 * // Creates a semantic error for simple types (string, number, boolean)
 * @param resConf
 * @param resVal
 * @returns
 */
export const simpleTypeError = (resConf: string, resVal: Expression): SemanticError | undefined => {
  if (resConf === 'string' && resVal.kind !== SyntaxKind.StringLiteral) {
    return createSemanticError('Return value needs to be a string.', resVal.getStart(), resVal.end);
  } else if (resConf === 'number' && resVal.kind !== SyntaxKind.NumericLiteral) {
    createSemanticError('Return value needs to be a number.', resVal.getStart(), resVal.end);
  } else if (resConf === 'boolean' && resVal.kind !== SyntaxKind.TrueKeyword && resVal.kind !== SyntaxKind.FalseKeyword) {
    createSemanticError('Return value needs to be true or false.', resVal.getStart(), resVal.end);
  }

  return undefined;
};

/**
 * Extracts the express variables names (can be from express() or Router())
 * @param statement Statement to analyze
 * @returns the nname of variable
 */
export const extractExpressVariable = (statement: Statement): String | undefined => {
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
};

/**
 * Extracts express or Router from an importStatement
 * @param statement
 * @returns
 */
export const extractExpressImport = (statement: Statement): ImportDeclaration | undefined => {
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
};

/**
 *
 * @param args Arguments for
 * @returns // TODO
 */
export const extractPathAndMethodImplementationFromArguments = (args: NodeArray<Expression>): { path: string; inlineFunction: ArrowFunction } => {
  const result: any = {};
  for (const node of args) {
    if (node.kind === SyntaxKind.StringLiteral && args.indexOf(node) === 0) {
      result.path = (node as StringLiteral).text;
    } else if (node.kind === SyntaxKind.ArrowFunction) {
      result.inlineFunction = node;
    }
  }
  return result;
};

/**
 * Parse first chained expressions recursive
 * @param propAccExpr Last Expression e.g res.status(404).body().send()
 * @returns res
 */
export const parseLastExpression = (propAccExpr: PropertyAccessExpression): PropertyAccessExpression | undefined => {
  if (propAccExpr.expression) {
    propAccExpr = propAccExpr.expression as PropertyAccessExpression;
    return parseLastExpression(propAccExpr);
  }

  return propAccExpr;
};

/**
 * Checks if the API path is defined
 * @param path API path
 * @returns
 */
export const findEndpointForPath = (path: string, endpoints: Endpoint[]): Endpoint | undefined => {
  return endpoints.find((endpoints) => endpoints.path === path);
};

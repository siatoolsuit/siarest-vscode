import {
  CallExpression,
  Expression,
  Identifier,
  ImportDeclaration,
  NamedImports,
  NodeArray,
  PropertyAccessExpression,
  SourceFile,
  Statement,
  StringLiteral,
  SyntaxKind,
  TypeNode,
  VariableStatement,
} from 'typescript';
import { Diagnostic, DiagnosticSeverity, _Connection } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { expressImportByName } from '..';
import { Endpoint } from '../../config';
import { ExpressPathAndFunction, SemanticError } from '../../types';

/**
 * Send a notification to vscode
 * @param connection
 * @param message
 */
export const sendNotification = (connection: _Connection, message: any) => {
  // TODO Won't fix atm does not do anything atm
  // connection.sendNotification(message);
};

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
 * Extracts the express api endpoint with several information
 * @param args Arguments for
 * @returns Returns an object with information about content, inline function, start and end of the called api endpoint
 */
export const extractPathAndMethodImplementationFromArguments = (args: NodeArray<Expression>, sourceFile: SourceFile): ExpressPathAndFunction => {
  const result: ExpressPathAndFunction = {
    inlineFunction: '',
    path: '',
    start: {
      character: 0,
      line: 0,
    },
    end: {
      character: 0,
      line: 0,
    },
  };

  for (const node of args) {
    if (node.kind === SyntaxKind.StringLiteral && args.indexOf(node) === 0) {
      result.path = (node as StringLiteral).text;
      result.start = sourceFile.getLineAndCharacterOfPosition(node.getFullStart());
      result.end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
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

export const isBetween = (lower: number, upper: number, between: Number): Boolean => {
  return between >= lower && between <= upper ? true : false;
};

export const removeLastSymbol = (stringToRemove: string, symbol: string): string => {
  const temp = stringToRemove.split('');
  temp[stringToRemove.lastIndexOf(symbol)] = '';
  return temp.join('');
};

export const findIdentifierInChild = (typeNode: TypeNode | undefined, syntaxKind: SyntaxKind): string => {
  let typedString = '';
  if (typeNode) {
    typeNode.forEachChild((child) => {
      if (child.kind === syntaxKind) {
        typedString = (child as Identifier).getText();
      }
    });
  }
  return typedString;
};

export const createDiagnostic = (
  document: TextDocument,
  message: string,
  start: number,
  end: number,
  diagnosticLevel: DiagnosticSeverity,
): Diagnostic => {
  return {
    message: message,
    range: {
      start: document.positionAt(start),
      end: document.positionAt(end),
    },
    severity: diagnosticLevel,
    source: 'Siarc-Toolkit',
  };
};

export const tryParseJSONObject = (jsonString: string) => {
  try {
    var object = JSON.parse(jsonString);
    if (object && typeof object === 'object') {
      return object;
    }
  } catch (e) {
    console.log(e, jsonString);
  }

  return false;
};

export const tryParseJSONString = (jsonObject: object) => {
  try {
    var object = JSON.stringify(jsonObject);
    if (object && typeof object === 'string') {
      return object;
    }
  } catch (e) {
    console.log(e, jsonObject);
  }

  return false;
};

import {
  TypeNode,
  SyntaxKind,
  Identifier,
  CallExpression,
  Expression,
  ImportDeclaration,
  NamedImports,
  NodeArray,
  PropertyAccessExpression,
  SourceFile,
  Statement,
  StringLiteral,
  Type,
  TypeChecker,
  TypeFlags,
  VariableStatement,
  BinaryExpression,
} from 'typescript';
import { expressImportByName, httpLibsByName } from '..';
import { ExpressPathAndFunction } from '../..';

export const findTypeStringBySyntaxKindInChildren = (typeNode: TypeNode | undefined, syntaxKind: SyntaxKind): string | undefined => {
  let typedString = undefined;
  if (typeNode) {
    typeNode.forEachChild((child) => {
      if (child.kind === syntaxKind) {
        typedString = (child as Identifier).getText();
      }
    });
  }
  return typedString;
};

export const findSyntaxKindInChildren = (typeNode: TypeNode | undefined, syntaxKind: SyntaxKind): any => {
  let res = undefined;
  if (typeNode) {
    typeNode.forEachChild((child) => {
      if (child.kind === syntaxKind) {
        res = child;
      }
    });
  }
  return res;
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
    // TODO parse with variables?? get(x) or get('x' + y)
    switch (node.kind) {
      case SyntaxKind.StringLiteral:
        if (args.indexOf(node) === 0) {
          result.path = (node as StringLiteral).text;
          result.start = sourceFile.getLineAndCharacterOfPosition(node.getFullStart());
          result.end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        }
        break;
      case SyntaxKind.ArrowFunction:
        result.inlineFunction = node;
        break;

      case SyntaxKind.BinaryExpression:
        result.path = (node as BinaryExpression).getText();
        result.start = sourceFile.getLineAndCharacterOfPosition(node.getFullStart());
        result.end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        break;
      default:
        break;
    }
  }
  return result;
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
      const elements = imports.elements;
      if (imports.elements && imports.elements?.length > 0) {
        for (const element of elements) {
          if (element.name.escapedText === expressImportByName.get('Router')) {
            return importDecl;
          }
        }
      }
    }
  }
};

export const extractHttpClientImport = (statement: Statement): ImportDeclaration | undefined => {
  const importDecl = statement as ImportDeclaration;
  const importClause = importDecl.importClause;
  if (importClause) {
    if (importClause.name) {
      if (importClause.name.escapedText === httpLibsByName.get('HttpClient')) {
        return importDecl;
      }
    } else if (importClause.namedBindings) {
      const imports = importClause.namedBindings as NamedImports;
      const elements = imports.elements;
      if (imports.elements && imports.elements?.length > 0) {
        for (const element of elements) {
          if (element.name.escapedText === httpLibsByName.get('HttpClient')) {
            return importDecl;
          }
        }
      }
    }
  }
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

export const getSimpleTypeFromType = (type: Type, checker: TypeChecker): string => {
  switch (type.getFlags()) {
    case TypeFlags.String:
    case TypeFlags.StringLike:
    case TypeFlags.StringLiteral:
      return 'string';
      break;
    case TypeFlags.Number:
    case TypeFlags.NumberLike:
    case TypeFlags.NumberLiteral:
      return 'number';
      break;
    case TypeFlags.Boolean:
    case TypeFlags.BooleanLike:
    case TypeFlags.BooleanLiteral:
      return 'boolean';
      break;
    default:
      return '';
      break;
  }
};

export const tryParseJSONObject = (jsonString: string) => {
  try {
    var object = JSON.parse(jsonString);
    if (object && typeof object === 'object') {
      return object;
    }
  } catch (e) {
    // console.log(e, jsonString);
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
    // console.log(e, jsonObject);
  }

  return false;
};

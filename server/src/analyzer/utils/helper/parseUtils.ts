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
  ArrowFunction,
} from 'typescript';
import { expressImportByName, httpLibsByName, httpMethods } from '..';
import { ClientExpression, EndpointMatch, ExpressPathAndFunction, IProject } from '../..';
import { connection } from '../../../server';
import { Endpoint } from '../../config';

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
    inlineFunction: {
      inlineFunction: undefined,
      start: {
        character: 0,
        line: 0,
      },
      end: {
        character: 0,
        line: 0,
      },
    },
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
        result.inlineFunction.inlineFunction = node as ArrowFunction;
        result.inlineFunction.start = sourceFile.getLineAndCharacterOfPosition(node.getFullStart());
        result.inlineFunction.end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        break;

      case SyntaxKind.BinaryExpression:
        result.path = parseBinaryExpression(node as BinaryExpression);
        result.start = sourceFile.getLineAndCharacterOfPosition(node.getFullStart());
        result.end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        break;
      default:
        break;
    }
  }
  return result;
};

export const parseBinaryExpression = (binaryExpression: BinaryExpression): string => {
  const left = binaryExpression.left;
  const right = binaryExpression.right;
  let result: string = '';

  switch (left.kind) {
    case SyntaxKind.BinaryExpression:
      result += parseBinaryExpression(left as BinaryExpression);
      break;
    case SyntaxKind.StringLiteral:
      let leftText = (left as StringLiteral).getFullText();
      leftText = leftText.replace(/[\'\`\s]/gi, '');
      result += leftText;
      break;
    case SyntaxKind.Identifier:
    default:
      break;
  }

  if (right.kind === SyntaxKind.StringLiteral) {
    let rightText = (right as StringLiteral).getFullText();
    rightText = rightText.replace(/[\'\`\s]/gi, '');
    result += rightText;
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
  } catch (e) {}

  return false;
};

export const tryParseJSONString = (jsonObject: object) => {
  try {
    var object = JSON.stringify(jsonObject);
    if (object && typeof object === 'string') {
      return object;
    }
  } catch (e) {}

  return false;
};

export const getHttpClientExpression = (expr: Expression, httpClientVarName: string, sourceFile: SourceFile): ClientExpression | undefined => {
  if (expr?.kind === SyntaxKind.CallExpression) {
    const callExpr = expr as CallExpression;
    if (callExpr.expression.kind === SyntaxKind.PropertyAccessExpression) {
      const propAccExpr = callExpr.expression as PropertyAccessExpression;
      const { start, end, path } = extractPathAndMethodImplementationFromArguments(callExpr.arguments, sourceFile);
      if (propAccExpr.expression.getText().endsWith(httpClientVarName) && httpMethods.includes(propAccExpr.name.text)) {
        return {
          method: propAccExpr.name.getText().toUpperCase(),
          start: start,
          end: end,
          expr: callExpr,
          path: path,
        };
      }
    }
  }
};

export const getEndpointsPerFile = (project: IProject, avaibaleEndpointsPerFile: Map<string, ClientExpression[]>) => {
  let allEndpoints: EndpointMatch[] = [];
  avaibaleEndpointsPerFile.forEach((endpoints, fileUri) => {
    if (fileUri.includes(project.rootPath)) {
      endpoints.forEach((endPoint) => {
        allEndpoints.push({ clientExpression: endPoint, uri: fileUri });
      });
    }
  });

  return allEndpoints;
};

export const parseURL = (searchValue: string, split: string = '/'): string[] => {
  if (searchValue.startsWith('/')) {
    searchValue = searchValue.substring(1);
  }

  let searchSplit: string[] = [];
  do {
    const pos = searchValue.indexOf(split);

    if (pos > 0) {
      searchSplit.push(searchValue.substring(0, pos + 1));
      searchValue = searchValue.substring(pos + 1);
      continue;
    }

    searchSplit.push(searchValue);
    break;
  } while (searchValue);

  return searchSplit;
};

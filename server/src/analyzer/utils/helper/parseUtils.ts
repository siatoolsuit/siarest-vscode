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

/**
 * Finds the last syntax element in a absract syntax tree.
 * @param typeNode Typenode contains a type (string, number, object, ...)
 * @param syntaxKind Kind to find
 * @returns returns
 */
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

/**
 * Returns an element inside the typenode.
 * @param typeNode
 * @param syntaxKind Kind to find inside typenode
 * @returns
 */
export const findSyntaxKindInChildren = (typeNode: TypeNode | undefined, syntaxKind: SyntaxKind): any => {
  let res = undefined;
  // Searches for a child with the specified SyntaxKind.
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
 * Parse first chained expressions recursive.
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
 * Extracts the express api endpoint with several information.
 * e.g.
 * router.get("user/list", (res, req) => {
 *    res.send("this");
 * });
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

  // Each node of an abstract syntax tree.
  for (const node of args) {
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

/**
 * Parses an binary expressions string and removes all String markers ('")
 * Recursive function.
 * @param binaryExpression Something like a + b  or a + (b + c)
 * @returns
 */
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
 * Extracts express or Router from an importStatement.
 * @param statement
 * @returns Import declaration of express or router
 */
export const extractExpressImport = (statement: Statement): ImportDeclaration | undefined => {
  const importDecl = statement as ImportDeclaration;
  const importClause = importDecl.importClause;
  // Checks if an importClauses contains a express import or Router form express
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

/**
 * Extracts Httpclient from angular for an importStatement.
 * @param statement
 * @returns Import declaration of HttpClient
 */
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
  // Searches in statements if a ExpressJS variable is used.
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
 * Return a simple type from different typeflags.
 * @param type Type of a var
 * @param checker TypeChecker from typescript
 * @returns
 */
export const getSimpleTypeFromType = (type: Type): string => {
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

/**
 * Try/catch to parse string to a json object.
 * @param jsonString
 * @returns The parsed object or false if an error was thrown.
 */
export const tryParseJSONObject = (jsonString: string) => {
  try {
    var object = JSON.parse(jsonString);
    if (object && typeof object === 'object') {
      return object;
    }
  } catch (e) {}

  return false;
};

/**
 * @deprecated
 * @param jsonObject
 * @returns not working
 */
export const tryParseJSONString = (jsonObject: object) => {
  try {
    var object = JSON.stringify(jsonObject);
    if (object && typeof object === 'string') {
      return object;
    }
  } catch (e) {}

  return false;
};

/**
 * Checks if an expression contains the parsed httClient object and returns his position.
 * @param expr Expression to parse
 * @param httpClientVarName variable name of the object
 * @param sourceFile
 * @returns Undefined if nothing is found or a Clientexpression
 */
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

/**
 * Helper function to get all endpoitns for a project.
 * @param project Project
 * @param avaibaleEndpointsPerFile Map with files and its endpoints.
 * @returns all endpoints of a project
 */
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

/**
 * Splits an url by split.
 * @param searchValue String to split
 * @param split split value
 * @returns String value for searching
 */
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

/**
 * Returns a beautifyed json string
 * @param JSON
 * @returns String
 */
export const replaceArrayInJson = (record: Record<string, string>): string => {
  const json = JSON.stringify(record);
  const jsonObj = tryParseJSONObject(json);
  const obj = replaceArrayType(jsonObj);
  const beautifyedJsonString = JSON.stringify(obj, null, '\t');
  if (beautifyedJsonString.startsWith('"') && beautifyedJsonString.endsWith('"')) {
    return beautifyedJsonString.substring(1, beautifyedJsonString.length - 1);
  }
  return beautifyedJsonString;
};

/**
 * Replaces any { isArray: true, type: '**'} with **[]
 * Parses an json object. If { isArray: true, type: '**'} is found replaces it with an
 * expression for an array eg { isArray:true, type: 'int'} = int[]
 * @param jsonObject
 * @returns object
 */
export const replaceArrayType = (jsonObject: any): any => {
  if (jsonObject.isArray && jsonObject.type) {
    jsonObject = jsonObject.type + '[]';
    return jsonObject;
  }

  for (let firstType in jsonObject) {
    jsonObject[firstType];
    if (typeof jsonObject[firstType] === 'object') {
      if (jsonObject[firstType].isArray && jsonObject[firstType].type) {
        jsonObject[firstType] = jsonObject[firstType].type + '[]';
      } else {
        replaceArrayType(jsonObject[firstType]);
      }
    }
  }

  return jsonObject;
};

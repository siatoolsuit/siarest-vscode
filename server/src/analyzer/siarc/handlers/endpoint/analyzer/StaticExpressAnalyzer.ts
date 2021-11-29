import {
  ArrowFunction,
  Block,
  CallExpression,
  factory,
  createProgram,
  Expression,
  ExpressionStatement,
  ImportDeclaration,
  NodeArray,
  PropertyAccessExpression,
  Statement,
  SyntaxKind,
  Type,
  TypeChecker,
  VariableStatement,
  SourceFile,
  VariableDeclaration,
  Identifier,
  Symbol,
  PropertyAssignment,
  TypeFlags,
  Declaration,
  PropertySignature,
  ArrayTypeNode,
  TypeLiteralNode,
  ClassDeclaration,
  ConstructorDeclaration,
  ParameterDeclaration,
  MethodDeclaration,
  ReturnStatement,
} from 'typescript';
import { ClientExpression } from '../../../..';
import { Endpoint, ServiceConfig } from '../../../../config';
import { EndpointExpression, IResult, SemanticError } from '../../../../types';
import { httpLibsByName, httpMethods, sendMethods } from '../../../../utils';
import {
  createSemanticError,
  extractExpressImport,
  extractExpressVariable,
  extractPathAndMethodImplementationFromArguments,
  findEndpointForPath,
  findTypeStringBySyntaxKindInChildren,
  getSimpleTypeFromType,
  parseLastExpression,
  removeLastSymbol,
  simpleTypeError,
  tryParseJSONObject,
  extractHttpClientImport,
  findSyntaxKindInChildren,
  getHttpClientExpression,
} from '../../../../utils/helper';

/**
 *
 * @param uri to the pending file for validation
 * @returns
 */
export function analyze(uri: string, serviceName: string, config: ServiceConfig | undefined, validateFrontend: boolean = false): IResult {
  // Create a new program for type checking
  const program = createProgram([uri], {});
  const checker = program.getTypeChecker();
  let tsFile = program.getSourceFile(uri);
  if (!tsFile) {
    return {};
  }

  if (validateFrontend) {
    const { httpImport, endpointExpressions } = extractHttpClient(tsFile);
    const results: IResult = {};
    if (httpImport) {
      results.endPointsAvaiable = endpointExpressions;
    }

    return results;
  } else {
    // Extract all higher functions like express import, app declarations and endpoint declarations
    const { expressImport, endpointExpressions } = extractExpressExpressions(tsFile);

    if (!expressImport) {
      return {};
    }

    let results: IResult = {};

    if (config && serviceName) {
      if (config.name === serviceName) {
        const result: SemanticError[] = analyzeExpress(config, serviceName, endpointExpressions, checker);
        results.semanticErrors = result;
        results.endPointsAvaiable = endpointExpressions;
      } else {
        results.semanticErrors = [createSemanticError(`Missing configuration for service ${serviceName} in .siarc.json.`, 0, tsFile.end)];
        results.endPointsAvaiable = [];
      }
    }
    return results;
  }
}

function analyzeExpress(config: ServiceConfig, serviceName: string, endpointExpressions: EndpointExpression[], checker: TypeChecker) {
  const result: SemanticError[] = [];

  if (endpointExpressions.length > 0) {
    for (const endpointExprs of endpointExpressions) {
      const expr = endpointExprs.expr;
      const endpoint = findEndpointForPath(endpointExprs.path, config.endpoints);
      // Validates the defined endpoint with the service configuration
      if (endpoint) {
        if (endpoint.method !== endpointExprs.method) {
          result.push(createSemanticError(`Wrong HTTP method use ${endpoint.method} instead.`, expr.getStart(), expr.end));
        }

        const { resVal, reqVal } = extractReqResFromFunction(endpointExprs.inlineFunction.inlineFunction);
        // Validate the return value of the inner function
        if (resVal) {
          const resConf = endpoint.response;
          let semanticError: any;
          switch (typeof resConf) {
            case 'string':
              // TODO get ref of a variable for example and validate it
              if (resVal.kind === SyntaxKind.Identifier) {
                semanticError = createSimpleTypeErrorFromIdentifier(endpoint, resVal, checker);
              } else {
                semanticError = simpleTypeError(resConf, resVal);
              }

              if (semanticError) result.push(semanticError);
              break;
            case 'object':
              semanticError = createComplexTypeErrorFromExpression(endpoint, resVal, checker);
              if (semanticError) result.push(semanticError);
              break;
            default:
              break;
          }
        } else {
          result.push(createSemanticError('Missing return value for endpoint.', expr.getStart(), expr.end));
        }

        if (endpoint.method === 'POST' || endpoint.method === 'PUT') {
          const reqType = endpoint.request;
          if (reqVal) {
            const semanticError = createComplexTypeErrorFromDeclaration(endpoint, reqVal, checker);
            if (semanticError) result.push(semanticError);
          } else {
            result.push(createSemanticError(`Endpoint with method "${endpoint.method}" has a missing body handling.`, expr.getStart(), expr.end));
          }
        }
      } else {
        result.push(createSemanticError('Endpoint is not defined for this service.', expr.getStart(), expr.end));
      }
    }
  }

  return result;
}

/**
 * Extracts the information of the express import statement and endpoint definitions from a ts-file
 * @param statements List of typescript Statements
 * @returns tuple of { Importdeclaration, ListOfEndPoints } of the current file
 */
function extractExpressExpressions(sourceFile: SourceFile): {
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
  // gets all statements from the sourceFile/abstract syntax tree;
  const statements = sourceFile.statements;
  let expressVarName;
  for (const statement of statements) {
    switch (statement.kind) {
      case SyntaxKind.ImportDeclaration:
        const importStatement = extractExpressImport(statement);
        if (importStatement) {
          result.expressImport = importStatement;
        }
        break;

      case SyntaxKind.VariableStatement:
        const expressVar = extractExpressVariable(statement);
        if (expressVar) {
          expressVarName = expressVar;
        }
        break;

      case SyntaxKind.ExpressionStatement:
        if (expressVarName) {
          const endPointExpressions = extractExpressStatement(statement, expressVarName, sourceFile);
          if (endPointExpressions) {
            result.endpointExpressions.push(endPointExpressions);
          }
        }
        break;
    }
  }

  return result;
}

/**
 * Extracts a whole statement of e.g. app.get(...) incl. the arrow function
 * @param statement (Simple node/typescript) state
 * @param expressVarName Name of the express/Router variable
 * @returns an EndpointExpression
 */
function extractExpressStatement(statement: Statement, expressVarName: String, sourceFile: SourceFile): EndpointExpression | undefined {
  const expr = statement as ExpressionStatement;
  if (expr.expression.kind === SyntaxKind.CallExpression) {
    const callExpr = expr.expression as CallExpression;
    if (callExpr.expression.kind === SyntaxKind.PropertyAccessExpression) {
      // Check if the current expression is a express route declaration like app.get(...)
      const propAccExpr = callExpr.expression as PropertyAccessExpression;
      if (propAccExpr.expression.getText() === expressVarName && httpMethods.includes(propAccExpr.name.text)) {
        const { path, inlineFunction, start, end } = extractPathAndMethodImplementationFromArguments(callExpr.arguments, sourceFile);
        return {
          expr: callExpr,
          method: propAccExpr.name.text.toUpperCase(),
          path: path,
          inlineFunction: inlineFunction,
          start: start,
          end: end,
          expressEndpoint: true,
        };
      }
    }
  }

  return undefined;
}

/**
 * Analyzes and inlinefunction from epxress (res, req) => {...}
 * @param inlineFunction an inlineFunction (..) => {...}
 * @returns tuple of { res, req }
 */
function extractReqResFromFunction(inlineFunction?: ArrowFunction): { resVal: Expression | undefined; reqVal: Declaration | undefined } {
  const result: {
    resVal: Expression | undefined;
    reqVal: Declaration | undefined;
  } = {
    resVal: undefined,
    reqVal: undefined,
  };

  if (!inlineFunction) {
    return result;
  }
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
            if (sendMethods.includes(propAccExpr.name.text)) {
              const lastPropAcc: PropertyAccessExpression | undefined = parseLastExpression(propAccExpr);
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
                result.reqVal = varDecl;
              }
            }
          }
        }
        break;
    }
  }

  return result;
}

function createSimpleTypeErrorFromIdentifier(endpoint: Endpoint, resVal: Expression, checker: TypeChecker): any {
  const resType = endpoint.response;
  let result: { fullString: any; normalString: any } = {
    fullString: undefined,
    normalString: undefined,
  };

  if (resVal.kind === SyntaxKind.Identifier) {
    const symbol = checker.getSymbolAtLocation(resVal);
    const typeString = getTypeAsStringOfSymbol(symbol, checker).typedString;
    result.fullString = typeString;
    result.normalString = typeString;
  } else {
    return createSemanticError(`Wrong type.\nExpected:\n${JSON.stringify(resType)}\nActual:\n${resVal.getText()}`, resVal.getStart(), resVal.end);
  }

  return createErrorMessage(endpoint, result, resType, resVal);
}

/**
 * Entrypoint for creating errors/parsing/analyze
 * @param endpoint
 * @param resVal
 * @param checker
 * @returns SemanticError or undefined
 */
function createComplexTypeErrorFromExpression(endpoint: Endpoint, resVal: Expression, checker: TypeChecker): SemanticError | undefined {
  const resType = endpoint.response;
  let result: { fullString: any; normalString: any } = {
    fullString: undefined,
    normalString: undefined,
  };

  if (resVal.kind === SyntaxKind.Identifier) {
    result = getTypeAtNodeLocation(resVal, checker);
  } else if (resVal.kind === SyntaxKind.ObjectLiteralExpression) {
    const type = checker.getTypeAtLocation(resVal);
    // Normalize type strings and compare them
    result = parseObject(type, checker);
  } else {
    return createSemanticError(`Wrong type.\nExpected:\n${JSON.stringify(resType)}\nActual:\n${resVal.getText()}`, resVal.getStart(), resVal.end);
  }

  return createErrorMessage(endpoint, result, resType, resVal);
}

function createComplexTypeErrorFromDeclaration(endpoint: Endpoint, reqVal: Declaration, checker: TypeChecker) {
  const reqType = endpoint.request;
  let result: { fullString: any; normalString: any } = {
    fullString: undefined,
    normalString: undefined,
  };

  const varDecl = reqVal as VariableDeclaration;
  if (!varDecl.type) {
    return undefined;
  }

  let type: any;

  switch (varDecl.type.kind) {
    case SyntaxKind.TypeLiteral:
      type = checker.getTypeAtLocation(varDecl);
      result = parseObject(type, checker);
      break;

    case SyntaxKind.TypeReference:
      const identifier = findTypeStringBySyntaxKindInChildren(varDecl.type, SyntaxKind.Identifier);
      result.fullString = identifier;
      result.normalString = identifier;
      break;

    case SyntaxKind.ArrayType:
      type = varDecl.type as ArrayTypeNode;
      const typeNode = type.elementType;
      const typedString = findTypeStringBySyntaxKindInChildren(typeNode, SyntaxKind.Identifier);

      const array = { isArray: true, type: typedString };
      const fullString = JSON.stringify(array);

      result.fullString = fullString;
      result.normalString = fullString.replace(/['",]/g, '');

      break;
  }

  return createErrorMessage(endpoint, result, reqType, reqVal);
}

function createErrorMessage(
  endpoint: Endpoint,
  result: { fullString: any; normalString: any },
  resType: any,
  resVal: Expression | any,
): SemanticError | undefined {
  if (result.fullString) {
    const actualObject = tryParseJSONObject(result.fullString);
    const siarcObject = tryParseJSONObject(JSON.stringify(resType));
    let errorString = '';

    if (siarcObject === false && actualObject === false) {
      if (result.fullString !== resType) {
        errorString += `${result.fullString} needs to be ${resType}`;
      }
    } else {
      const missingTypesInTS: Map<string, any> = findMissingTypes(siarcObject, actualObject);
      const missingDeclarationInSiarc: Map<string, any> = findMissingTypes(actualObject, siarcObject);

      if (missingTypesInTS.size == 0 && missingDeclarationInSiarc.size == 0) {
        return undefined;
      }

      missingTypesInTS.forEach((value, key) => {
        errorString += `Missing property: ${key}: ${value.actual} \n`;
      });

      missingDeclarationInSiarc.forEach((value, key) => {
        errorString += `Not declared in siarc.json: ${key}: ${value.actual} \n`;
      });
    }

    if (errorString !== '') {
      return createSemanticError(errorString, resVal.getStart(), resVal.end);
    }
  }

  return undefined;
}

/**
 * Compares two JSON objects and returns missing objects/types
 * @param siarcObjects objects
 * @param objectsToCompare objects to compare to
 * @returns List of missing objects/types
 */
function findMissingTypes(siarcObjects: any, objectsToCompare: any): Map<string, any> {
  let nameToTypeMap: Map<string, any> = new Map();
  for (let firstType in siarcObjects) {
    let foundTypeInConfig: boolean = false;
    for (let secondType in objectsToCompare) {
      const x = siarcObjects[firstType];
      const y = objectsToCompare[secondType];

      if (x === y && firstType === secondType) {
        foundTypeInConfig = true;
        break;
      } else if (typeof x === 'object' && typeof y === 'object' && firstType === secondType) {
        if (x.isArray) {
          if (x.isArray === y.isArray && x.type === y.type) {
            foundTypeInConfig = true;
            break;
          }
        } else {
          const nestedTypesByName = findMissingTypes(x, y);
          if (nestedTypesByName.size < 1) {
            foundTypeInConfig = true;
            break;
          } else {
            nestedTypesByName.forEach((value, key) => {
              nameToTypeMap.set(key, value);
            });
            foundTypeInConfig = true;
            break;
          }
        }
      }
    }

    if (!foundTypeInConfig) {
      if (siarcObjects[firstType].isArray) {
        nameToTypeMap.set(firstType.toString(), { actual: `${siarcObjects[firstType].type}[]` });
      } else {
        nameToTypeMap.set(firstType.toString(), { actual: siarcObjects[firstType] });
      }
    }
  }
  return nameToTypeMap;
}

function getTypeAtNodeLocation(resVal: Expression, checker: TypeChecker): { fullString: string; normalString: string } {
  const result: { fullString: string; normalString: string } = {
    fullString: '',
    normalString: '',
  };

  const symbol = checker.getSymbolAtLocation(resVal);
  const typedString = getTypeAsStringOfSymbol(symbol, checker);

  let fullString = '';

  if (typedString.isArray) {
    fullString += `${typedString.typedString},`;
    fullString = removeLastSymbol(fullString, ',');
  } else {
    fullString = '{';
    fullString += `"${resVal.getText()}":"${typedString.typedString}",`;
    fullString = removeLastSymbol(fullString, ',');
    fullString += '}';
  }

  result.fullString = fullString;
  result.normalString = fullString.replace(/['",]/g, '');

  return result;
}

/**
 * Parses an type and extracts object information
 * @param type
 * @param checker
 * @returns
 */
function parseObject(type: Type, checker: TypeChecker): { fullString: string; normalString: string } {
  const result: { fullString: string; normalString: string } = {
    fullString: '',
    normalString: '',
  };

  let fullString = '{';

  const members = type.symbol?.members;
  if (members && members.size > 0) {
    members.forEach((value, key) => {
      if (value.valueDeclaration) {
        const type = checker.getTypeAtLocation(value.valueDeclaration);

        let typedString = '';

        switch (type.flags) {
          case TypeFlags.Object:
            typedString = parsePropertiesRecursive(type, checker);
            fullString += `"${key.toString()}":${typedString},`;
            break;

          case TypeFlags.Number:
          case TypeFlags.String:
          case TypeFlags.Boolean:
            typedString = checker.typeToString(type);
            fullString += `"${key.toString()}":"${typedString}",`;
            break;
          case TypeFlags.Any:
            const variableDeclaration = value.getDeclarations()?.[0] as VariableDeclaration;
            if (variableDeclaration.initializer?.kind == SyntaxKind.Identifier) {
              const initializer = variableDeclaration.initializer as Identifier;
              const symbolOfInit = checker.getSymbolAtLocation(initializer);
              const undefString = getTypeAsStringOfSymbol(symbolOfInit, checker).typedString;
              if (undefString) {
                fullString += `"${key.toString()}":"${undefString}",`;
              }
            }
            break;

          default:
            break;
        }
      }
    });
  }

  fullString = removeLastSymbol(fullString, ',');
  fullString += '}';

  result.fullString = fullString;
  result.normalString = fullString.replace(/['",]/g, '');

  return result;
}

function parsePropertiesRecursive(type: Type, checker: TypeChecker): string {
  const symbolsOfType: Symbol[] = type.getProperties();

  let jsonString: string = '{';

  symbolsOfType.forEach((symbol) => {
    if (symbol.valueDeclaration?.kind === SyntaxKind.PropertyAssignment) {
      const propertyAssignment = symbol.valueDeclaration as PropertyAssignment;
      const typeOfProp = checker.getTypeAtLocation(propertyAssignment);

      let resultString = '';

      switch (typeOfProp.getFlags()) {
        case TypeFlags.Object:
          resultString += `"${symbol.name}":${parsePropertiesRecursive(typeOfProp, checker)}`;
          break;
        case TypeFlags.Any:
          const string = getTypeAsStringOfSymbol(symbol, checker).typedString;
          resultString += `"${symbol.name}":"${string}"`;
          break;
        case TypeFlags.String:
        case TypeFlags.Number:
        case TypeFlags.Boolean:
          resultString += `"${symbol.name}":"${checker.typeToString(typeOfProp)}"`;
        default:
          break;
      }

      jsonString += resultString + ',';
    } else if (symbol.valueDeclaration?.kind === SyntaxKind.PropertySignature) {
      const propertyAssignment = symbol.valueDeclaration as PropertySignature;
      const typeOfProp = checker.getTypeAtLocation(propertyAssignment);

      let resultString = '';

      if (propertyAssignment.type?.kind === SyntaxKind.ArrayType) {
        resultString += `"${symbol.name}":${getTypeAsStringOfSymbol(symbol, checker).typedString}`;
      } else {
        switch (typeOfProp.getFlags()) {
          case TypeFlags.Object:
            resultString += `"${symbol.name}":${parsePropertiesRecursive(typeOfProp, checker)}`;
            break;
          case TypeFlags.Any:
            const string = getTypeAsStringOfSymbol(symbol, checker).typedString;
            resultString += `"${symbol.name}":"${string}"`;
            break;
          case TypeFlags.String:
          case TypeFlags.Number:
          case TypeFlags.Boolean:
            resultString += `"${symbol.name}":"${checker.typeToString(typeOfProp)}"`;
          default:
            break;
        }
      }

      jsonString += resultString + ',';
    }
  });

  jsonString = removeLastSymbol(jsonString, ',');

  jsonString += '}';
  return jsonString;
}

/**
 * Parse the type of a symbol
 * @param symbol Symbol of an object
 * @returns Either undefined or the type of the object
 */
function getTypeAsStringOfSymbol(symbol: Symbol | undefined, checker: TypeChecker): { typedString: String | undefined; isArray: boolean } {
  let result: { typedString: String | undefined; isArray: boolean } = { typedString: undefined, isArray: false };

  let typedString: string | undefined;
  if (symbol) {
    const declarations = symbol.getDeclarations();
    if (declarations) {
      const firstDecl = declarations[0];

      let typeNode;
      switch (firstDecl.kind) {
        case SyntaxKind.VariableDeclaration:
          const varDecl = firstDecl as VariableDeclaration;
          if (varDecl.type) {
            typeNode = varDecl.type;
            if (typeNode.kind === SyntaxKind.ArrayType) {
              const arrayType = typeNode as ArrayTypeNode;
              typeNode = arrayType.elementType;
              typedString = findTypeStringBySyntaxKindInChildren(typeNode, SyntaxKind.Identifier);

              const array = { isArray: true, type: typedString };
              result.typedString = JSON.stringify(array);
              result.isArray = true;
              return result;
            } else if (typeNode.kind == SyntaxKind.TypeLiteral) {
              typedString = parseTypeLiteral(typeNode as TypeLiteralNode, checker);
              result.isArray = true;
            } else {
              typedString = findTypeStringBySyntaxKindInChildren(typeNode, SyntaxKind.Identifier);
            }
          } else {
            const type = checker?.getTypeAtLocation(varDecl);
            if (type) {
              typedString = getSimpleTypeFromType(type);
            }
          }

          if (!typedString) {
            typeNode = varDecl.type;
            if (typeNode) {
              typedString = checker.typeToString(checker.getTypeAtLocation(typeNode));
            }
          }

          result.typedString = typedString;
          return result;
        case SyntaxKind.PropertyAssignment:
          const propsAssignment = firstDecl as PropertyAssignment;
          const symbolRec = checker?.getSymbolAtLocation(propsAssignment.initializer);
          result = getTypeAsStringOfSymbol(symbolRec, checker);
          return result;
        case SyntaxKind.PropertySignature:
          typeNode = (firstDecl as PropertySignature).type;
          typedString = findTypeStringBySyntaxKindInChildren(typeNode, SyntaxKind.Identifier);
          if (typeNode?.kind === SyntaxKind.ArrayType) {
            const arrayType = typeNode as ArrayTypeNode;
            typeNode = arrayType.elementType;
            typedString = findTypeStringBySyntaxKindInChildren(typeNode, SyntaxKind.Identifier);

            const array = { isArray: true, type: typedString };
            result.typedString = JSON.stringify(array);
            result.isArray = true;
            return result;
          }
          result.typedString = typedString;
          return result;
      }
    }
  }
  return result;
}

function parseTypeLiteral(typeLiteral: TypeLiteralNode, checker: TypeChecker): string | undefined {
  const type = checker.getTypeAtLocation(typeLiteral);
  const typedLiteralAsJson = parsePropertiesRecursive(type, checker); // this works

  return typedLiteralAsJson;
}

/**
 *
 * @param tsFile analysed file from typechecker
 * @returns An object containing the httpImport and the Endpoint calls
 */
function extractHttpClient(tsFile: SourceFile): { httpImport: ImportDeclaration | undefined; endpointExpressions: ClientExpression[] } {
  const result: {
    httpImport: ImportDeclaration | undefined;
    endpointExpressions: ClientExpression[];
  } = {
    httpImport: undefined,
    endpointExpressions: [],
  };

  // parse from top to down

  //gets all statements from the absract syntax tree
  const statements = tsFile.statements;
  let httpClientVarName: string;
  for (const statement of statements) {
    switch (statement.kind) {
      // Extracts information about the httpClient import.
      case SyntaxKind.ImportDeclaration:
        const importStatement = extractHttpClientImport(statement);
        if (importStatement) {
          result.httpImport = importStatement;
        }
        break;

      case SyntaxKind.VariableStatement:
        // FIND in constructor
        break;

      case SyntaxKind.ClassDeclaration:
        // Gets all statments from the class
        const classStatement = statement as ClassDeclaration;
        classStatement.members.forEach((member) => {
          switch (member.kind) {
            case SyntaxKind.Constructor:
              const constructorMember = member as ConstructorDeclaration;
              // Search all statments for the constructor and find the httpClient variable.
              constructorMember.parameters.forEach((parameter) => {
                const parameterDeclaration = parameter as ParameterDeclaration;
                if (parameterDeclaration.type) {
                  const foundIdentifier = findSyntaxKindInChildren(parameterDeclaration.type, SyntaxKind.Identifier) as Identifier;
                  if (foundIdentifier) {
                    if (foundIdentifier.text === httpLibsByName.get('HttpClient')) {
                      httpClientVarName = parameterDeclaration.name.getText();
                    }
                  }
                }
              });
              break;

            // Search each function if the httpClient Variable is used and extracts information about the call.
            case SyntaxKind.MethodDeclaration:
              const methodDecl = member as MethodDeclaration;
              // Extracts information aboutz the httpClient usage. (API Endpoint call)
              const x = extractPathFromMethods(methodDecl, httpClientVarName, tsFile);
              if (x) {
                result.endpointExpressions.push(x);
              }
              break;
            default:
              break;
          }
        });
        break;

      default:
        break;
    }
  }

  return result;
}

/**
 * Extracts information about the httpClient usage inside of a function/method.
 * @param methodDecl Method to check
 * @param httpClientVarName HttpClient variable name.
 * @param sourceFile
 * @returns
 */
function extractPathFromMethods(methodDecl: MethodDeclaration, httpClientVarName: string, sourceFile: SourceFile): ClientExpression | undefined {
  if (methodDecl.body) {
    const funcBody = methodDecl.body;
    let statList: NodeArray<Statement> = factory.createNodeArray();
    switch (funcBody.kind) {
      case SyntaxKind.Block:
        statList = (funcBody as Block).statements;
        break;
    }

    for (const stat of statList) {
      switch (stat.kind) {
        case SyntaxKind.ExpressionStatement:
          break;

        // e.g const result = httpClient.get(...);
        case SyntaxKind.VariableStatement:
          const variableStatement = stat as VariableStatement;
          let clientExpression = undefined;
          if (variableStatement.declarationList) {
            variableStatement.declarationList.declarations.forEach((declaration: VariableDeclaration) => {
              if (declaration.initializer?.kind === SyntaxKind.CallExpression) {
                clientExpression = getHttpClientExpression(declaration.initializer, httpClientVarName, sourceFile);
              }
            });
          }
          if (clientExpression) {
            return clientExpression;
          }
          break;

        // e.g return httpClient.get(...);
        case SyntaxKind.ReturnStatement:
          const returnStatement = stat as ReturnStatement;
          const expr = returnStatement.expression;
          if (expr) {
            const clientExpression = getHttpClientExpression(expr, httpClientVarName, sourceFile);
            return clientExpression;
          }
          break;
      }
    }

    return undefined;
  }
}

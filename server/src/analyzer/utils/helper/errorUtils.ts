import { Expression, SyntaxKind } from 'typescript';
import { SemanticError } from '../..';

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
    return createSemanticError('Return value needs to be a number.', resVal.getStart(), resVal.end);
  } else if (resConf === 'boolean' && resVal.kind !== SyntaxKind.TrueKeyword && resVal.kind !== SyntaxKind.FalseKeyword) {
    return createSemanticError('Return value needs to be true or false.', resVal.getStart(), resVal.end);
  } else if (!['string', 'number', 'boolean'].includes(resConf)) {
    return createSemanticError(`Return value needs to be ${resConf}`, resVal.getStart(), resVal.end);
  }

  return undefined;
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

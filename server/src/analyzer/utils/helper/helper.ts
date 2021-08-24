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

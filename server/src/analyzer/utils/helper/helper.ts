import { SemanticError } from '../../types';

export const createSemanticError = (message: string, start: number, end: number): SemanticError => {
  const semanticError: SemanticError = {
    message: message,
    position: { start, end },
  };

  return semanticError;
};

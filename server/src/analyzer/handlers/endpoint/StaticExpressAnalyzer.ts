import { SemanticError, StaticAnalyzer } from '../StaticAnalyzer';

// TODO: Hier gehts weiter, mit pattern versuche das app object oder wie auch immer es heißt zu erkennen und dann zu schauen ob dort routen bestimmt wurden und ob diese falsch sind
export class StaticExpressAnalyzer implements StaticAnalyzer {
  analyze(text: string): SemanticError[] {
    const result: SemanticError[] = [];
    result.push({
      offset: 0,
      message: 'Hello World'
    });
    return result;
  }
}
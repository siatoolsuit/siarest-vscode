export interface SemanticError {
  offset: number;
  message: string;
}

export interface StaticAnalyzer {
  analyze(text: string): SemanticError[];
}

import * as ts from 'typescript';
import { SemanticError, StaticAnalyzer } from '../../types';

export class StaticExpressAnalyzer extends StaticAnalyzer {
  analyze(text: string): SemanticError[] {
    const result: SemanticError[] = [];

    if (this.currentConfig) {
      // 
    } else {
      result.push({
        message: `Missing configuration for service ${this.currentServiceName} in .siarc.json`,
        offset: 0
      });
    }

    return result;
  }
}
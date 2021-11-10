import { InitializeResult, CodeActionKind } from 'vscode-languageserver/node';

export const initializeResult: InitializeResult = {
  capabilities: {
    completionProvider: {
      workDoneProgress: true,
    },
    hoverProvider: true,
    definitionProvider: true,
    referencesProvider: true,
    codeActionProvider: {
      codeActionKinds: [CodeActionKind.QuickFix],
    },
  },
};

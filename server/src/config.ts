import { InitializeResult } from 'vscode-languageserver/node';

export const initializeResult: InitializeResult = {
  capabilities: {
    completionProvider: {
      resolveProvider: true,
      workDoneProgress: true,
    },
    hoverProvider: true,
    definitionProvider: true,
    referencesProvider: true,
    documentLinkProvider: {
      resolveProvider: true,
      workDoneProgress: true,
    },
    // TODO enhance?
  },
};

import { InitializeResult, CodeActionKind } from 'vscode-languageserver/node';

/**
 * Used by the connection to let the extensions/client know what the server is capabale of.
 */
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

import { ExtensionContext, workspace, languages, window, WorkspaceEdit, Uri, Position } from 'vscode';
import { LanguageClient, ServerOptions, TransportKind, LanguageClientOptions } from 'vscode-languageclient';

import * as path from 'path';

const configTemplate: string =
`[
  {
    "name": "MyService",
    "baseUrl": "http://localhost:3000/api",
    "language": "",
    "lib": "",
    "endpoints": [
      {
        "method": "POST",
        "path": "/hello",
        "response": {
          "type": "string",
          "name": "message"
        },
        "parameters": [
          {
            "type": "string",
            "name": "message"
          }
        ]
      }
    ]
  }
]
`;

let client: LanguageClient;

export async function activate(context: ExtensionContext): Promise<void> {
  //  only activate if a folder was opened
  if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
    return;
  }

  // check if there is a .siarc.json,
  const rcFile = await workspace.findFiles('**/.siarc.json', '**/node_modules/**', 1);
  if (!rcFile || rcFile.length === 0) {
    // we need the config, throw a error message
    const result = await window.showErrorMessage('Missing .siarc.json, the rest analyzer is not active!', 'Create file', 'Dismiss');
    if (!result || result === 'Dismiss') {
      return;
    } else {
      // the user want that the extension creates a dummy file
      const wsEdit = new WorkspaceEdit();
      const filePath = Uri.file(path.join(workspace.workspaceFolders[0].uri.fsPath, '.siarc.json'));
      wsEdit.createFile(filePath, { ignoreIfExists: true });
      wsEdit.insert(filePath, new Position(0, 0), configTemplate);
      await workspace.applyEdit(wsEdit);
      await workspace.saveAll();
      window.showTextDocument(await workspace.openTextDocument(filePath));
      window.showInformationMessage('Create new file: .siarc.json');
    }
  }

  const serverModule = context.asAbsolutePath(path.join('server', 'dist', 'server.js'));
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: [ '--nolazy', '--inspect=6069' ] } }
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'typescript' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/.siarc.json'),
    },
  };

  client = new LanguageClient('restVerificationServer', serverOptions, clientOptions);

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
      return undefined;
  }
  return client.stop();
}

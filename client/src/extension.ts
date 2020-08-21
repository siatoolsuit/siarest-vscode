import { ExtensionContext, workspace, window, WorkspaceEdit, Uri, Position, commands } from 'vscode';
import { LanguageClient, ServerOptions, TransportKind, LanguageClientOptions } from 'vscode-languageclient';

import * as fs from 'fs';
import * as path from 'path';

const serviceConfigTemplate =
`[
  {
    "name": "MyService",
    "baseUri": "http://localhost:3000/api",
    "language": "MyLanguage",
    "lib": "MyLib",
    "endpoints": [
      {
        "method": "POST",
        "path": "/hello",
        "response": "string",
        "request": {
          "message": "string"
        }
      }
    ]
  }
]
`;
const settingsTemplate =
{
  "other": true,
  "comments": false,
  "strings": true
};

let client: LanguageClient;

// TODO: Scheiß auf language server das nervt von vorn bis hinten da die schnittstellen nie stimmen und so ein scheiß, man muss da eh für intelij neu schreiben 

export async function activate(context: ExtensionContext): Promise<void> {
  //  Only activate if a folder was opened
  if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
    return;
  }

  // Add the command to create the .siarc.json file
  const disposable = commands.registerCommand('sia-rest.createConfig', async () => {
    // The user wants that the extension creates a dummy file
    const wsEdit = new WorkspaceEdit();
    const filePath = Uri.file(path.join(workspace.workspaceFolders[0].uri.fsPath, '.siarc.json'));
    if (!fs.existsSync(filePath.fsPath)) {
      wsEdit.createFile(filePath, { ignoreIfExists: true });
      wsEdit.insert(filePath, new Position(0, 0), serviceConfigTemplate);
      await workspace.applyEdit(wsEdit);
      await workspace.saveAll();
      window.showTextDocument(await workspace.openTextDocument(filePath));
      window.showInformationMessage('Create new file: .siarc.json');
    } else {
      window.showInformationMessage('.siarc.json already exists');
    }
  });
  context.subscriptions.push(disposable);

  const serverModule = context.asAbsolutePath(path.join('server', 'dist', 'server.js'));
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: [ '--nolazy', '--inspect=6069' ] } }
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'typescript' },
      { scheme: 'untitled', language: 'typescript' },
      { pattern: '**/.siarc.json' }
    ],
  };

  client = new LanguageClient('Sia-Rest-Toolkit', serverOptions, clientOptions);

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
      return undefined;
  }
  return client.stop();
}

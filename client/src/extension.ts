import { ExtensionContext, workspace, window, WorkspaceEdit, Uri, Position, commands } from 'vscode';
import { LanguageClient, ServerOptions, TransportKind, LanguageClientOptions } from 'vscode-languageclient/node';

import * as fs from 'fs';
import * as path from 'path';

const serviceConfigTemplate = `[
  {
    "name": "my-service",
    "baseUri": "http://localhost:3000/api",
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

let client: LanguageClient;

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

  const packageJsons = await (
    await workspace.findFiles('**/package.json', '**​/node_modules/**')
  ).filter((val) => !val.path.includes('node_modules'));

  // Try to load the package.json

  // Must be in root of a folder

  const siarcFiles = await workspace.findFiles('**/.siarc.json', '**​/node_modules/**');

  const projects = [];

  siarcFiles.forEach((file) => {
    const lastIndexOf = file.path.lastIndexOf('/');
    const path = file.path.slice(0, lastIndexOf + 1);

    const packageJsonFile = packageJsons.find((packageFile) => {
      if (packageFile.path.startsWith(path) === true) {
        return packageFile;
      }
    });

    if (packageJsonFile) {
      try {
        const siarc: string = fs.readFileSync(file.path).toString();
        const packJson: string = fs.readFileSync(packageJsonFile.path).toString();

        projects.push({
          siarcTextDoc: { uri: file.path, languageId: 'json', version: 1, content: siarc } || '',
          packageJson: packJson || '',
          rootPath: path,
        });
      } catch (error) {}
    } else {
    }
  });

  // Try to load the siarc.json
  let uri = path.join(workspace.workspaceFolders[0].uri.fsPath, '.siarc.json');
  let siarc: string;
  try {
    siarc = fs.readFileSync(uri).toString();
  } catch (error) {
    siarc = '';
  }

  let packageJson: string;
  try {
    packageJson = fs.readFileSync(path.join(workspace.workspaceFolders[0].uri.fsPath, 'package.json')).toString();
  } catch (error) {
    packageJson = '';
  }

  const serverModule = context.asAbsolutePath(path.join('server', 'dist', 'server.js'));
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6069'] },
    },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { language: 'typescript', scheme: 'file' },
      { language: 'json', pattern: '**/.siarc.json' },
      { language: 'json', pattern: '**/package.json' },
    ],
    // Send the initialized package.json and .siarc.json, only if they exists
    initializationOptions: {
      projects: projects,
    },
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

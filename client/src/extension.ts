import { ExtensionContext, workspace, window, WorkspaceEdit, Uri, Position, commands as Commands } from 'vscode';
import { LanguageClient, ServerOptions, TransportKind, LanguageClientOptions, RequestType } from 'vscode-languageclient/node';
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

// Copied from LSP libraries. We should have a flag in the client to know whether the
// client runs in debugger mode.
function isInDebugMode(): boolean {
  const debugStartWith: string[] = ['--debug=', '--debug-brk=', '--inspect=', '--inspect-brk='];
  const debugEquals: string[] = ['--debug', '--debug-brk', '--inspect', '--inspect-brk'];
  let args: string[] = (process as any).execArgv;
  if (args) {
    return args.some((arg) => {
      return debugStartWith.some((value) => arg.startsWith(value)) || debugEquals.some((value) => arg === value);
    });
  }
  return false;
}

interface InfoWindowsMessage {
  message: string;
}
namespace InfoWindowRequest {
  export const type = new RequestType<InfoWindowsMessage, void, void>('siarc/infoWindowRequest');
}

async function findProjects() {
  let packageJsons = await workspace.findFiles('**/package.json', '**​/node_modules/**');
  packageJsons = packageJsons.filter((val) => !val.path.includes('node_modules'));
  const siarcFiles = await workspace.findFiles('**/.siarc.json', '**​/node_modules/**');

  const projects = [];

  packageJsons.forEach((file) => {
    const lastIndexOf = file.path.lastIndexOf('/');
    const path = file.path.slice(0, lastIndexOf + 1);

    const siarcFile = siarcFiles.find((packageFile) => {
      if (packageFile.path.startsWith(path) === true) {
        return packageFile;
      }
    });

    let siarc: string;
    let packJson: string;

    if (siarcFile) {
      try {
        siarc = fs.readFileSync(siarcFile.path).toString();
      } catch (error) {
        siarc = undefined;
      }
    }

    try {
      packJson = fs.readFileSync(file.path).toString();
    } catch (error) {
      packJson = undefined;
    }

    let siaConf = undefined;
    if (siarc) {
      siaConf = { uri: file.path, languageId: 'json', version: 1, content: siarc };
    }

    const projectConfig = {
      siarcTextDoc: siaConf,
      packageJson: packJson || undefined,
      rootPath: path,
    };

    projects.push(projectConfig);
  });

  return projects;
}

const createLanguageClient = async (context: ExtensionContext) => {
  const projects = await findProjects();
  return new LanguageClient('Sia-Rest-Toolkit', getServerOptions(context), getClientOptions(projects));
};

const getClientOptions = (projects: any[]): LanguageClientOptions => {
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { language: 'typescript', scheme: 'file' },
      { language: 'json', pattern: '**/.siarc.json' },
      { language: 'json', pattern: '**/package.json' },
    ],
    // Send the initialized package.json and .siarc.json, only if they exists
    initializationOptions: {
      projects: projects,
      rootPath: workspace.workspaceFolders ? workspace.workspaceFolders[0].uri.toString() : '',
    },
    markdown: {
      isTrusted: true,
    },
    progressOnInitialization: true,
  };

  return clientOptions;
};

const getServerOptions = (context: ExtensionContext): ServerOptions => {
  const serverModule = Uri.joinPath(context.extensionUri, 'server', 'dist', 'server.js').fsPath;
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6069'] },
    },
  };

  return serverOptions;
};

let client: LanguageClient;

export async function activate(context: ExtensionContext): Promise<void> {
  //  Only activate if a folder was opened
  if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
    return;
  }

  const readyHandler = () => {
    client.onRequest(InfoWindowRequest.type, (params) => {
      window.showInformationMessage(params.message);
    });
  };

  // Add the command to create the .siarc.json file
  context.subscriptions.push(
    Commands.registerCommand('sia-rest.createConfig', async () => {
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
    }),
    Commands.registerCommand('sia-rest.restart', async () => {
      await client.stop();
      // Wait a little to free debugger port. Can not happen in production
      // So we should add a dev flag.
      client = await createLanguageClient(context);
      const start = () => {
        client.start();
        client
          .onReady()
          .then(readyHandler)
          .catch((error) => client.error(`On ready failed`, error));
      };

      if (isInDebugMode()) {
        setTimeout(start, 1000);
      } else {
        start();
      }
    }),
  );

  // Try to load the package.json

  client = await createLanguageClient(context);
  client.start();

  client
    .onReady()
    .then(readyHandler)
    .catch((error) => client.error(`On ready failed`, error));
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

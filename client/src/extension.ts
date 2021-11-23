import { ExtensionContext, workspace, window, WorkspaceEdit, Uri, Position, commands as Commands } from 'vscode';
import { LanguageClient, ServerOptions, TransportKind, LanguageClientOptions, RequestType } from 'vscode-languageclient/node';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Example template for siarc.json
 * @constant
 */
const serviceConfigTemplate = `[
  {
    "name": "my-service",
    "baseUri": "http://localhost:3000/api",
    "frontends": ["my-frontend"],
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

/**
 * Copied from LSP libraries. We should have a flag in the client to know whether the
 * client runs in debugger mode.
 * @function
 * @returns boolean
 */
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

/**
 * Datastructure for messages between client and server
 * @interface
 */
interface InfoWindowsMessage {
  message: string;
}

namespace InfoWindowRequest {
  /**
   * Requesttype for communication between extension and vs code
   */
  export const type = new RequestType<InfoWindowsMessage, void, void>('siarc/infoWindowRequest');
}

namespace Types {
  /**
   * Datastructure for siarc
   * @interface
   */
  export interface Siarc {
    uri: string;
    languageId: string;
    version: number;
    content: string;
  }

  /**
   * Datastructure for projects open in vs code
   * @interface
   */
  export interface Project {
    packageJson: string | undefined;
    rootPath: string;
    siarcTextDoc?: Siarc;
  }
}

/**
 * Finds npm/yarn projects in a mono repo.
 * Creates a list of projects with additional informations
 * More to come
 * @returns List of @interface Project
 */
async function findProjects(): Promise<Types.Project[]> {
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

    let siaConf: Types.Siarc = undefined;
    if (siarc) {
      siaConf = { uri: file.path, languageId: 'json', version: 1, content: siarc };
    }

    const projectConfig: Types.Project = {
      siarcTextDoc: siaConf,
      packageJson: packJson || undefined,
      rootPath: path,
    };

    projects.push(projectConfig);
  });

  return projects;
}

/**
 * Helper function to create the actual LanguageClient
 * @param context VS Codes ExtensionsContext initialized by VSCode
 * @returns LanguageClient
 */
const createLanguageClient = async (context: ExtensionContext) => {
  const projects = await findProjects();

  /**
   * If atleast one project has a siarc config file
   */
  projects.forEach((project) => {
    if (project.siarcTextDoc) {
      start = true;
    }
  });

  return new LanguageClient('Sia-Rest-Toolkit', getServerOptions(context), getClientOptions(projects));
};

/**
 * Helper function to create a LanguageClientOption filled with additonal data for the server
 * E.g contains a list of projects and the root path for the server.
 * @param projects List of projects
 * @returns LanguageClientOptions
 */
const getClientOptions = (projects: any[]): LanguageClientOptions => {
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { language: 'typescript', scheme: 'file' },
      { language: 'json', pattern: '**/.siarc.json' },
      { language: 'json', pattern: '**/package.json' },
    ],
    // Send the initialized projects and the rootPath if a MonoRepository is used.
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

/**
 * Creates ServerOptions. ServerOptions is used by the client to know
 * how the client communicates with the LanguageServer
 * @param context ExtensionContext from VsCode
 * @returns ServerOptions
 */
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

var client: LanguageClient;
var start: boolean = false;

/**
 * Activate function, that get's called by VsCode on Extension launch
 * @param context ExtensionContext from VsCode
 * @returns Promise
 */
export async function activate(context: ExtensionContext): Promise<void> {
  //  Only activate if a folder was opened
  if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
    return;
  }

  /**
   * A Hanlder to show messages in the vscode ui
   */
  const readyHandler = () => {
    client.onRequest(InfoWindowRequest.type, (params) => {
      window.showInformationMessage(params.message);
    });
  };

  /**
   * Adds different commands that can be used by the user from VsCode
   */
  context.subscriptions.push(
    // Add the command to create the .siarc.json file
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
    // Adds the command to restart the extension/server
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

  /**
   * Actual creation of the languageClient/Server
   */
  client = await createLanguageClient(context);

  if (start) {
    //Actual start of the server
    client.start();
    // If the server is ready add handlers ...
    client
      .onReady()
      .then(readyHandler)
      .catch((error) => client.error(`On ready failed`, error));
  } else {
    window.showErrorMessage("Siarc server couldn't start. Please ensure .siarc.json is present");
  }
}

/**
 * Deactivate the server if the extensions gets disabled
 * @returns
 */
export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

import { DocumentUri } from 'vscode-languageserver';
import { tmpdir } from 'os';
import { readFileSync, unlink } from 'fs';
import { writeFile } from 'fs/promises';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createHash } from 'crypto';
import { error } from 'console';
import { sync } from 'fast-glob';
import { connection } from '../../../../server';
import { URI } from 'vscode-uri';

export interface IFile {
  fileName: string;
  fileUri: string;
  tempFileName: string;
  tempFileUri: string;
}

const SLASH = '/';
const POINT = '.';

/**
 * Map with Key fileUri
 */
const tempFiles: Map<string, IFile> = new Map();

/**
 * Unlinks (deletes) the file at uri.
 * @param uri Path to the file
 * @returns Promise<void>
 */
export async function cleanTempFiles(uri: DocumentUri): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    uri = URI.parse(uri).path;

    if (tempFiles.has(uri) == false) {
      reject(`Couldn't find ${uri}`);
      return;
    }

    let fileUri = tempFiles.get(uri)?.tempFileUri;
    if (!fileUri) {
      reject(`Couldn't find ${uri}`);
      return;
    }

    unlink(fileUri, (err) => {
      if (err) {
        connection.console.error(err.message);
        reject(err);
        return;
      } else {
        resolve(fileUri!);
      }
    });
  });
}

/**
 * Creates or gets the created temporary file.
 * @param textDoc The document which should be created as a temporary file
 * @returns Promise with result as IFile
 */
export async function getOrCreateTempFile(textDoc: TextDocument): Promise<IFile> {
  return new Promise<IFile>((resolve, reject) => {
    if (!textDoc) {
      reject('Textdoc is empty');
    }

    const uri = URI.parse(textDoc.uri);
    let res = getFileNameAndUri(uri.path);

    if (tempFiles.has(uri.path)) {
      let file = tempFiles.get(uri.path);

      if (!file?.tempFileUri) {
        reject('Temp File Uri is Empty.');
        return;
      }

      writeFile(file.tempFileUri, textDoc.getText())
        .then(() => {
          if (!file) {
            reject('Should never happen.');
            return;
          }

          connection.console.log(`Updated content of file: ${file.tempFileUri}`);
          tempFiles.set(file.fileUri, file);
          resolve(file);
        })
        .catch(() => {
          reject("Couldn't update temp file");
        });
    } else {
      const splits = uri.path.split('/');

      var file: IFile = {
        fileName: splits[splits.length - 1],
        fileUri: uri.path,
        tempFileName: res.tempFileName,
        tempFileUri: res.tempFileUri,
      };

      writeFile(file.tempFileUri, textDoc.getText())
        .then(() => {
          connection.console.log(`Created file: ${file.tempFileUri}`);
          tempFiles.set(file.fileUri, file);
          resolve(file);
        })
        .catch(() => {
          reject("Couldn't create temp file");
        });
    }
  });
}

/**
 * Creates a fileName and uri to the file on temp path of system
 * @param uri File uri on system
 * @returns Tuple of { tempFileName, tempFileUri }
 */
function getFileNameAndUri(uri: DocumentUri): { tempFileName: string; tempFileUri: string } {
  const res: {
    tempFileName: string;
    tempFileUri: string;
  } = {
    tempFileName: '',
    tempFileUri: '',
  };

  let pathSeperator = '/';
  if (process.platform === 'win32') pathSeperator = '\\';

  const fileName = uri.slice(uri.lastIndexOf(SLASH) + 1, uri.length);
  const split: string[] = fileName.split(POINT);

  if (split.length < 1) {
    throw error('Filename could not be generated');
  }

  const hash = createHash('sha256');
  hash.update(uri);

  split[split.length - 2] = `${split[split.length - 2]}_${hash.digest('hex')}`;
  const tempFileName = split.join(POINT);

  res.tempFileName = `${tempFileName}`;
  res.tempFileUri = `${tmpdir()}${pathSeperator}${res.tempFileName}`;
  return res;
}

/**
 * Searches all files inside a location and returns all typescript files.
 * @param path Path
 * @returns a list
 */
export function getAllFilesInProjectSync(path: string): TextDocument[] {
  if (path.startsWith('file://')) {
    path = path.substring(7);
  }

  if (path.endsWith('/')) {
    path = path.substring(0, path.length - 1);
  }

  const allTypescriptFiles = sync(`${path}/**/*.ts`, { absolute: true, onlyFiles: true, ignore: ['**/node_modules/**', '**/build/**'] });

  allTypescriptFiles.sort((a, b) => {
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  });

  const textDocs: TextDocument[] = [];
  allTypescriptFiles.forEach((uri) => {
    const content = readFileSync(uri).toString();
    textDocs.push(TextDocument.create(URI.file(uri).path, 'typescript', 1, content || ''));
  });

  return textDocs;
}

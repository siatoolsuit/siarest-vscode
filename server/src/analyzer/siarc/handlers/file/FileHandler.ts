import { DocumentUri } from 'vscode-languageserver';
import { tmpdir } from 'os';
import { unlink } from 'fs';
import { writeFile } from 'fs/promises';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createHash } from 'crypto';
import { error } from 'console';

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

export function getFile(uri: string | undefined): IFile | undefined {
  if (uri) {
    if (tempFiles.has(uri)) {
      return tempFiles.get(uri);
    }
  }

  return undefined;
}

/**
 * Unlinks (deletes) the file at uri.
 * @param uri Path to the file
 * @returns Promise<void>
 */
export async function cleanTempFiles(uri: DocumentUri): Promise<string> {
  return new Promise<string>((resolve, reject) => {
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
        console.warn(err);
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

    let res = getFileNameAndUri(textDoc.uri);

    if (tempFiles.has(textDoc.uri)) {
      let file = tempFiles.get(textDoc.uri);

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

          console.debug(`Updated content of file: ${file.tempFileUri}`);
          tempFiles.set(file.fileUri, file);
          resolve(file);
        })
        .catch(() => {
          reject("Couldn't update temp file");
        });
    } else {
      const splits = textDoc.uri.split('/');

      var file: IFile = {
        fileName: splits[splits.length - 1],
        fileUri: textDoc.uri,
        tempFileName: res.tempFileName,
        tempFileUri: res.tempFileUri,
      };

      writeFile(file.tempFileUri, textDoc.getText())
        .then(() => {
          console.debug(`Created file: ${file.tempFileUri}`);
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

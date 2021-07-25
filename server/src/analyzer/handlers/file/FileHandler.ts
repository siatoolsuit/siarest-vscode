import { DocumentUri } from "vscode-languageserver";
import { tmpdir } from "os";
import { open, write, close, unlink } from "fs";
import { writeFile } from "fs/promises";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolve } from "vscode-languageserver/lib/files";

export interface IFile {
    fileName: string;
    fileUri: string;
    tempFileName: string;
    tempFileUri: string;
}

const SLASH = '/'

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
    })
}


/**
 * Creates or gets the created temporary file.
 * @param textDoc The document which should be created as a temporary file 
 * @returns Promise with result as IFile
 */
export async function getOrCreateTempFile(textDoc: TextDocument): Promise<IFile> {
    return new Promise<IFile>((resolve, reject) => {
        if (!textDoc) {
            reject('Textdoc is empty')
        }

        let res = getFileNameAndUri(textDoc.uri);

        if (tempFiles.has(textDoc.uri)) {
            let file = tempFiles.get(textDoc.uri);

            if (!file?.tempFileUri) {
                reject('Temp File Uri is Empty.');
                return;
            }

            var promise = writeFile(file.tempFileUri, textDoc.getText());
            promise.then(() => {
                if (!file) {
                    reject('Should never happen.');
                    return;
                }

                console.debug(`Updated content of file: ${file.tempFileUri}`)
                tempFiles.set(file.fileUri, file);
                resolve(file);
            }).catch(() => {
                reject("Couldn't update temp file");
            });
        } else {
            var file: IFile = {
                fileName: res.tempFileName,
                fileUri: textDoc.uri,
                tempFileName: res.tempFileName,
                tempFileUri: res.tempFileUri,
            }

            var promise = writeFile(file.tempFileUri, textDoc.getText());
            promise.then(() => {
                console.debug(`Created file: ${file.tempFileUri}`)
                tempFiles.set(file.fileUri, file);
                resolve(file);
            }).catch(() => {
                reject("Couldn't create temp file");
            });
        }
    });
}

function getFileNameAndUri(uri: DocumentUri): { tempFileName: string; tempFileUri: string } {
    const res: {
        tempFileName: string;
        tempFileUri: string;
    } = {
        tempFileName: '',
        tempFileUri: '',
    }

    res.tempFileName = uri.slice(uri.lastIndexOf(SLASH) + 1, uri.length);
    res.tempFileUri = `${tmpdir()}\\${res.tempFileName}`;
    return res;
}

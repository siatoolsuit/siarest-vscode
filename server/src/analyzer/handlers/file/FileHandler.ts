import { DocumentUri } from "vscode-languageserver";
import { tmpdir } from "os";
import { open, write, close, unlink } from "fs";
import { writeFile } from "fs/promises";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolve } from "vscode-languageserver/lib/files";

export interface File {
    fileName: string;
    fileUri: string;
    tempFileName: string;
    tempFileUri: string;
}

const SLASH = '\\'

/**
 * Map with Key fileUri
 */
const tempFiles: Map<string, File> = new Map();

/**
 * // TODO change rejects and error logs
 * @param uri 
 * @returns 
 */
export async function cleanTempFiles(uri: DocumentUri): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (tempFiles.has(uri) == false) {
            reject("//TODO");
            return;
        }

        let fileUri = tempFiles.get(uri)?.tempFileUri;
        if (!fileUri) {
            reject("//TODO");
            return;
        }

        unlink(fileUri, (err) => {
            if (err) {
                console.warn(err);
                reject(err);
                return;
            }
        });
    })
}


/**
 * // TODO change rejects and error logs
 * @param textDoc 
 * @returns 
 */
export async function getOrCreateTempFile(textDoc: TextDocument): Promise<File> {
    return new Promise<File>((resolve, reject) => {
        if (!textDoc) {
            reject('Textdoc is empty')
        }

        let res = getFileNameAndUri(textDoc.uri);

        if (tempFiles.has(textDoc.uri)) {
            let file = tempFiles.get(textDoc.uri);

            if (!file?.tempFileUri) {
                reject('ERROR');
                return;
            }

            var promise = writeFile(file.tempFileUri, textDoc.getText());
            promise.then(() => {
                if (!file) {
                    reject('ERROR');
                    return;
                }

                tempFiles.set(file.fileUri, file);
                resolve(file);
            }).catch(() => {
                reject("UNKNOWN REASON");
            });
        } else {
            var file: File = {
                fileName: res.tempFileName,
                fileUri: textDoc.uri,
                tempFileName: res.tempFileName,
                tempFileUri: res.tempFileUri,
            }

            var promise = writeFile(file.tempFileUri, textDoc.getText());
            promise.then(() => {
                tempFiles.set(file.fileUri, file);
                resolve(file);
            }).catch(() => {
                reject("UNKNOWN REASON");
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
    res.tempFileUri = `${tmpdir()}${SLASH}${res.tempFileName}`;
    return res;
}

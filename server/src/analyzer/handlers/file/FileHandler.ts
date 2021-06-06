import { DocumentUri } from "vscode-languageserver";
import { tmpdir } from "os";
import { open, write, close, unlink } from "fs";
import { writeFile } from "fs/promises";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolve } from "vscode-languageserver/lib/files";

interface File {
    fileName: string;
    fileUri: string;
    tempFileName: string;
    tempFileUri: string;
}

const SLASH = '/'

export class FileHandler {

    // TODO nicht so schön?

    /**
     * Map with Key fileUri
     */
    static tempFiles: Map<string, File> = new Map();

    constructor() {

    }

    /**
     * // TODO change rejects and error logs
     * @param uri 
     * @returns 
     */
    public async cleanTempFiles(uri: DocumentUri): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!FileHandler.tempFiles.has(uri)) {
                reject("//TODO");
                return;
            }
    
            let fileUri = FileHandler.tempFiles.get(uri)?.tempFileUri;
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
    public async getOrCreateTempFile(textDoc: TextDocument): Promise<File> {
        return new Promise<File>((resolve, reject) => {
            if (!textDoc) {
                reject('Textdoc is empty')
            }

            let res = this.getFileNameAndUri(textDoc.uri);

            if (FileHandler.tempFiles.has(textDoc.uri)) {
                let file = FileHandler.tempFiles.get(textDoc.uri);

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

                    FileHandler.tempFiles.set(file.fileUri, file);
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
                    FileHandler.tempFiles.set(file.fileUri, file);
                    resolve(file);
                }).catch(() => {
                    reject("UNKNOWN REASON");
                });
            }
        });
    }

    private getFileNameAndUri(uri: DocumentUri): { tempFileName: string; tempFileUri: string } {
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
}
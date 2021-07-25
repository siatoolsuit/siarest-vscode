import { JSONSchema, DiagnosticSeverity, LanguageService, getLanguageService } from "vscode-json-languageservice";
import { InitializeParams, Diagnostic } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Analyzer, SemanticError } from "../..";
import { connection, documents } from "../../../server";
import { ConfigValidator } from "../../config";
import { TYPESCRIPT, JSONS, SIARC, PACKAGE_JSON } from "../../utils";
import { getOrCreateTempFile, IFile } from "../file/FileHandler";

import * as siaSchema from "../../config/config.schema.json";

const pendingValidations: { [uri: string]: NodeJS.Timer } = {};
const validationDelay = 300;

export class Validator {
    jsonLanguageService: LanguageService;
    analyzer: Analyzer = new Analyzer();
    configValidator: ConfigValidator = new ConfigValidator();

    constructor(params: InitializeParams) {
        this.jsonLanguageService = getLanguageService({
            clientCapabilities: params.capabilities,
        });

    }

    public cleanPendingValidations(uri: string): void {
        const request = pendingValidations[uri];
        if (request) {
            clearTimeout(request);
            delete pendingValidations[uri];
        }
    }

    public triggerConfValidation(document: TextDocument): void {
        this.cleanPendingValidations(document.uri);
        pendingValidations[document.uri] = setTimeout(async () => {
            delete pendingValidations[document.uri];
            await this.validateConfig(document);
        }, validationDelay);
    }

    triggerTypescriptValidation(document: TextDocument, file: IFile): void {
        this.cleanPendingValidations(file.fileUri);
        pendingValidations[file.fileUri] = setTimeout(() => {
            delete pendingValidations[file.fileUri];
            this.validateTypescript(document, file);
        }, validationDelay);
    }

    public async checkForValidation(document: TextDocument): Promise<void> {
        switch (document.languageId) {
            case TYPESCRIPT.LANGUAGE_ID: {
                getOrCreateTempFile(document).then((file) => {
                    this.triggerTypescriptValidation(document, file);
                }).catch((reason) => {
                    return;
                });
                break;
            }
            case JSONS.LANGUAGE_ID: {
                this.validateJson(document);
                break;
            }
            default: {
                return;
            }
        }
    }

    public validateJson(document: TextDocument) {
        if (document.uri.endsWith(SIARC)) {
            this.triggerConfValidation(document);
        } else if (document.uri.endsWith(PACKAGE_JSON)) {
            this.loadPackageJson(document.getText());
            // Revalidate all typescript files
            documents.all().forEach((doc: TextDocument) => {
                this.checkForValidation(doc);
            });
        }
    }

    public async validateConfig(document: TextDocument): Promise<void> {
        const jsonDoc = this.jsonLanguageService.parseJSONDocument(document);

        const syntaxErrors = await this.jsonLanguageService.doValidation(document, jsonDoc, { schemaValidation: 'error', trailingCommas: 'error' }, siaSchema as JSONSchema);
        const semanticErrors = this.configValidator.validateConfigSemantic(document, jsonDoc);

        if (syntaxErrors.length === 0 && semanticErrors.length === 0) {
            this.analyzer.config = document.getText();
            connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
            documents.all().forEach(async (doc: TextDocument) => {
                if (doc.languageId === TYPESCRIPT.LANGUAGE_ID) {
                    this.checkForValidation(doc);
                }
            });
        } else {
            connection.sendDiagnostics({ uri: document.uri, diagnostics: semanticErrors });
        }
    }

    public validateTypescript(document: TextDocument, file: IFile): void {
        const diagnostics: Diagnostic[] = [];

        const version = document.version;
        this.analyzer.analyzeEndpoints(file).forEach((error: SemanticError) => {
            diagnostics.push({
                message: error.message,
                range: {
                    start: document.positionAt(error.position.start),
                    end: document.positionAt(error.position.end),
                },
                severity: DiagnosticSeverity.Error,
            });
        });

        setImmediate(() => {
            // To be clear to send the correct diagnostics to the current document
            const currDoc = documents.get(document.uri);
            if (currDoc && currDoc.version === version) {
                connection.sendDiagnostics({ uri: document.uri, diagnostics });
            }
        });
    }

    public loadPackageJson(json: string) {
        if (json) {
            const pack = JSON.parse(json);
            if (pack.name) {
                this.analyzer.currentService = pack.name;
            }
            this.analyzer.detectFrameworkOrLibrary(pack);
        }
    }
}

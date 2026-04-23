import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { QuizPayload, QuizAnswer } from '@quizgate/shared';

let currentPanel: vscode.WebviewPanel | undefined = undefined;


/**
 * Creates or reveals the Quiz webview panel.
 *
 * Returns a Promise that resolves when the user submits answers, skips,
 * or the panel is disposed (closed manually).
 *
 * @param context         - VS Code extension context
 * @param quizPayload     - The quiz data to display
 * @param timeoutSeconds  - Timeout countdown in seconds (passed to the JS for visual countdown)
 */
export function createOrShowQuizPanel(
    context: vscode.ExtensionContext,
    quizPayload: QuizPayload,
    timeoutSeconds: number = 120
): Promise<QuizAnswer[] | { status: string }> {

    return new Promise((resolve) => {

        // ── Guard against double-resolve race ──────────────────────────
        // Both onDidDispose and onDidReceiveMessage can trigger resolution.
        // This flag ensures we only resolve once.
        let resolved = false;

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (currentPanel) {
            // Always dispose the existing panel before creating a new one.
            // Re-using the same panel via reveal() causes message handler
            // accumulation — each call registers a new listener but the old
            // ones stay active, leading to double-resolves and ghost resolutions.
            currentPanel.dispose();
            currentPanel = undefined;
        }

        currentPanel = vscode.window.createWebviewPanel(
            'quizgatePanel',
            'QuizGate',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'media'))
                ]
            }
        );

        // ── Panel disposal handler ─────────────────────────────────
        // If the user closes the panel (X button or Cmd+W), resolve
        // with { status: 'skipped' } instead of hanging forever.
        currentPanel.onDidDispose(
            () => {
                currentPanel = undefined;
                if (!resolved) {
                    resolved = true;
                    resolve({ status: 'skipped' });
                }
            },
            null,
            context.subscriptions
        );

        // ── Generate cryptographic nonce for CSP ───────────────────────
        const nonce = crypto.randomBytes(16).toString('base64');

        // ── Read the HTML template ─────────────────────────────────────
        const htmlPath = path.join(context.extensionPath, 'media', 'quiz.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // ── Resolve webview-safe URIs ──────────────────────────────────
        const stylePathOnDisk = vscode.Uri.file(
            path.join(context.extensionPath, 'media', 'quiz.css')
        );
        const scriptPathOnDisk = vscode.Uri.file(
            path.join(context.extensionPath, 'media', 'quiz.js')
        );

        const styleUri = currentPanel.webview.asWebviewUri(stylePathOnDisk);
        const scriptUri = currentPanel.webview.asWebviewUri(scriptPathOnDisk);

        // ── Content Security Policy (nonce-based) ──────────────────────
        const cspSource = currentPanel.webview.cspSource;
        const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}'; img-src ${cspSource};">`;

        htmlContent = htmlContent.replace('{{cspMeta}}', cspMeta);
        htmlContent = htmlContent.replace('{{styleUri}}', styleUri.toString());
        htmlContent = htmlContent.replace('{{scriptUri}}', scriptUri.toString());
        htmlContent = htmlContent.replace('{{nonce}}', nonce);

        // ── Theme detection ────────────────────────────────────────────
        // Detect VS Code's active color theme and inject as data attribute
        // so CSS can switch between dark/light glassmorphism palettes.
        const themeKind = vscode.window.activeColorTheme.kind;
        const themeString = (
            themeKind === vscode.ColorThemeKind.Light ||
            themeKind === vscode.ColorThemeKind.HighContrastLight
        ) ? 'light' : 'dark';

        // ── Inject quiz data via a script-initialized global ────────────
        // Using a <script> block with JSON.parse avoids the fragile
        // data-attribute approach where &quot; literals in the payload
        // could break the round-trip encode/decode.
        const quizDataJsonSafe = JSON.stringify(quizPayload)
            .replace(/</g, '\\u003c')   // Prevent </script> injection
            .replace(/>/g, '\\u003e');

        htmlContent = htmlContent.replace(
            /(<body[^>]*)>/,
            `$1 data-theme="${themeString}" data-timeout="${timeoutSeconds}">\n` +
            `<script nonce="${nonce}">window.__QUIZGATE_DATA__ = ${quizDataJsonSafe};</script>`
        );

        currentPanel.webview.html = htmlContent;

        // ── Message handler ────────────────────────────────────────────
        currentPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'answer':
                        if (!resolved) {
                            resolved = true;

                            // If the quiz timed out (sent from JS countdown)
                            if (message.timedOut) {
                                resolve({ status: 'timeout' });
                            } else {
                                // Basic validation: ensure data is an array of non-empty answers
                                const data = message.data;
                                if (Array.isArray(data) && data.every(
                                    (a: any) => typeof a.id === 'string' && typeof a.selected === 'string' && a.selected.trim().length > 0
                                )) {
                                    resolve(data as QuizAnswer[]);
                                } else {
                                    resolve({ status: 'skipped' });
                                }
                            }
                        }
                        if (currentPanel) {
                            currentPanel.dispose();
                        }
                        return;

                    case 'skip':
                        // Explicit skip — user chose to skip the quiz
                        if (!resolved) {
                            resolved = true;
                            resolve({ status: 'skipped' });
                        }
                        if (currentPanel) {
                            currentPanel.dispose();
                        }
                        return;

                    case 'quit':
                        // Explicit quit — user chose to dismiss the quiz entirely
                        if (!resolved) {
                            resolved = true;
                            resolve({ status: 'skipped' });
                        }
                        if (currentPanel) {
                            currentPanel.dispose();
                        }
                        return;
                }
            },
            undefined,
            context.subscriptions
        );
    });
}


/**
 * Disposes the current quiz panel if it exists.
 *
 * Called by http-server.ts when the HTTP-level timeout wins the
 * Promise.race — the panel would otherwise stay open as a zombie,
 * with its countdown hitting zero and posting into the void.
 */
export function disposeCurrentPanel(): void {
    if (currentPanel) {
        currentPanel.dispose();
        currentPanel = undefined;
    }
}

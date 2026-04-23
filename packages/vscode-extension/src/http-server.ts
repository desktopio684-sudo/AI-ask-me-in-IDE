import * as http from 'http';
import * as vscode from 'vscode';
import { QuizPayload, QuizAnswer, validateQuizPayload, formatAnswerResponse } from './core';
import { createOrShowQuizPanel, disposeCurrentPanel } from './quiz-panel';

let server: http.Server | undefined;

/** Maximum request body size (1MB) to prevent memory exhaustion attacks. */
const MAX_BODY_SIZE = 1024 * 1024;

/** Tracks whether a quiz is currently being displayed to the user. */
let isQuizActive = false;

/** Exported for use by dev-test commands that also need to check/set the quiz lock. */
export function getIsQuizActive(): boolean {
    return isQuizActive;
}


/**
 * Starts the localhost HTTP server that bridges the MCP server
 * to the VS Code webview quiz panel.
 *
 * Endpoints:
 * - GET  /health → returns { status: 'ready', port }
 * - POST /quiz   → shows quiz panel, blocks until answered/skipped/timeout
 */
export function startHttpServer(context: vscode.ExtensionContext, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => {

            // ── Health Check ───────────────────────────────────────────
            if (req.method === 'GET' && req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ready', port }));
                return;
            }

            // ── Quiz Endpoint ──────────────────────────────────────────
            if (req.method === 'POST' && req.url === '/quiz') {

                // Reject concurrent quizzes
                if (isQuizActive) {
                    res.writeHead(429, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'skipped',
                        error: { code: -32001, message: 'Another quiz is already active' }
                    }));
                    return;
                }

                let body = '';
                let bodyOverflow = false;

                req.on('data', chunk => {
                    body += chunk.toString();
                    if (body.length > MAX_BODY_SIZE) {
                        bodyOverflow = true;
                        res.writeHead(413, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'skipped',
                            error: { code: -32602, message: 'Payload too large (max 1MB)' }
                        }));
                        req.destroy();
                    }
                });

                req.on('end', async () => {
                    if (req.destroyed || bodyOverflow) return;

                    try {
                        // Validate incoming payload using core
                        const rawData = JSON.parse(body);
                        const payload = validateQuizPayload(rawData);

                        // Resolve the effective timeout:
                        // - AI can set payload.timeout (>= 120s) to extend the timer
                        // - AI values < 120 are ignored; extension default (120s) is used
                        // This prevents AI from shortening the timer below a usable threshold.
                        const config = vscode.workspace.getConfiguration('quizgate');
                        const defaultTimeout = config.get<number>('timeout', 120);
                        const timeoutSeconds = (payload.timeout !== undefined && payload.timeout >= 120)
                            ? payload.timeout
                            : defaultTimeout;

                        // Show Quiz Panel and set up timeout race.
                        // try/finally ensures isQuizActive is reset even if
                        // createOrShowQuizPanel throws (e.g. missing quiz.html).
                        let result;
                        try {
                            isQuizActive = true;
                            result = await showQuizWithTimeout(context, payload, timeoutSeconds);
                        } finally {
                            isQuizActive = false;
                        }

                        res.writeHead(200, { 'Content-Type': 'application/json' });

                        if (Array.isArray(result)) {
                            // User submitted answers
                            res.end(JSON.stringify(formatAnswerResponse(result)));
                        } else {
                            // Skipped, timeout, or other status
                            res.end(JSON.stringify(result));
                        }

                    } catch (e: any) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'skipped',
                            error: {
                                code: -32602,
                                message: `Invalid payload: ${e.message || 'Parse error'}`
                            }
                        }));
                    }
                });

                return;
            }

            // ── 404 for everything else ────────────────────────────────
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        });

        server.on('error', (err) => {
            reject(err);
        });

        server.listen(port, '127.0.0.1', () => {
            resolve();
        });
    });
}


/**
 * Wraps the quiz panel creation with a timeout.
 *
 * If the user doesn't answer within `timeoutSeconds`, the panel is
 * automatically closed and a timeout response is returned.
 *
 * KEY DESIGN: The Promise.race has two cleanup paths:
 *   - Timeout wins → dispose the panel (kills the zombie UI)
 *   - Panel wins   → clear the setTimeout handle (prevents late fires)
 */
async function showQuizWithTimeout(
    context: vscode.ExtensionContext,
    payload: QuizPayload,
    timeoutSeconds: number
): Promise<QuizAnswer[] | { status: string }> {

    // Create the quiz panel, passing the timeout so the UI can show a countdown
    const panelPromise = createOrShowQuizPanel(context, payload, timeoutSeconds);

    // If timeout is disabled (0 or negative), just wait for the panel
    if (timeoutSeconds <= 0) {
        return panelPromise;
    }

    // Race between the panel response and the timeout
    let timeoutHandle: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<{ status: string }>((resolve) => {
        timeoutHandle = setTimeout(() => {
            resolve({ status: 'timeout' });
        }, timeoutSeconds * 1000);
    });

    const result = await Promise.race([panelPromise, timeoutPromise]);

    // Cleanup: if timeout won, kill the zombie panel.
    // If panel won, clear the dangling timeout handle.
    if (result && typeof result === 'object' && 'status' in result && result.status === 'timeout') {
        disposeCurrentPanel();
    } else {
        clearTimeout(timeoutHandle!);
    }

    return result;
}


/**
 * Stops the HTTP server gracefully.
 * Called during extension deactivation.
 */
export function stopHttpServer() {
    if (server) {
        server.close();
        server = undefined;
    }
}

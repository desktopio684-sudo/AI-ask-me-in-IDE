import * as vscode from 'vscode';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { startHttpServer, stopHttpServer, getIsQuizActive } from './http-server';
import { findAvailablePort, writePortFile, deletePortFile, validateQuizPayload } from './core';
import { createOrShowQuizPanel } from './quiz-panel';

let outputChannel: vscode.OutputChannel;

// Increase default autoSelectFamily attempt timeout to fix Node 18+ DNS resolution issues
if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === 'function') {
    net.setDefaultAutoSelectFamilyAttemptTimeout(1000);
}

export async function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('QuizGate');
    outputChannel.appendLine('Activating QuizGate...');

    const config = vscode.workspace.getConfiguration('quizgate');
    const startPort = config.get<number>('port', 6010);

    try {
        const port = await findAvailablePort(startPort);

        // Write active port to ~/.quizgate-port so the MCP bridge can find it
        writePortFile(port);
        outputChannel.appendLine(`QuizGate HTTP Server listening on port ${port}`);
        outputChannel.appendLine(`Port file written to ~/.quizgate-port`);

        await startHttpServer(context, port);

        // ── Dev Testing Command ──────────────────────────────────────
        // Opens a file picker → loads any JSON fixture → fires the quiz
        // panel directly inside VS Code. No HTTP, no AI, no tokens burned.
        const openQuizCommand = vscode.commands.registerCommand('quizgate.showQuiz', async () => {
            try {
                const result = await showTestQuiz(context);
                outputChannel.appendLine(`[DEV TEST] Quiz result: ${JSON.stringify(result)}`);
            } catch (err: any) {
                outputChannel.appendLine(`[DEV TEST] Error: ${err.message}`);
                vscode.window.showErrorMessage(`QuizGate Test: ${err.message}`);
            }
        });
        context.subscriptions.push(openQuizCommand);
    } catch (error: any) {
        outputChannel.appendLine(`Failed to start QuizGate server: ${error.message}`);
        vscode.window.showErrorMessage(`QuizGate: Failed to start HTTP server. ${error.message}`);
    }
}


/**
 * Shows a quiz panel from a local JSON fixture file.
 *
 * Flow:
 *   1. Offers "Use sample.json" or "Pick a file..."
 *   2. Validates the JSON against QuizPayloadSchema
 *   3. Opens the webview panel directly (no HTTP round-trip)
 *   4. Logs the result to the Output panel
 *
 * This is the developer's best friend for UI iteration.
 */
async function showTestQuiz(context: vscode.ExtensionContext) {

    // Let the developer choose: bundled sample or custom file
    const choice = await vscode.window.showQuickPick(
        [
            { label: '$(beaker) Use sample.json', description: 'Bundled test fixture', value: 'sample' },
            { label: '$(file) Pick a JSON file...', description: 'Open file picker', value: 'pick' },
        ],
        { placeHolder: 'Choose a quiz fixture to test' }
    );

    if (!choice) return { status: 'cancelled' };

    let filePath: string;

    if (choice.value === 'sample') {
        // Look for sample.json relative to the workspace root
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const possiblePaths = [
            // Monorepo structure
            workspaceFolders?.[0]
                ? path.join(workspaceFolders[0].uri.fsPath, 'packages', 'mcp-server', 'examples', 'sample.json')
                : '',
            // Relative to extension itself (when installed)
            path.join(context.extensionPath, 'examples', 'sample.json'),
        ].filter(Boolean);

        const found = possiblePaths.find(p => fs.existsSync(p));
        if (!found) {
            throw new Error(
                `sample.json not found. Searched:\n${possiblePaths.join('\n')}`
            );
        }
        filePath = found;
    } else {
        // Open native file picker
        const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON Files': ['json'] },
            openLabel: 'Load Quiz Fixture',
        });

        if (!fileUri || fileUri.length === 0) return { status: 'cancelled' };
        filePath = fileUri[0].fsPath;
    }

    // Guard: prevent dev-test from racing with an active HTTP quiz.
    // Check BEFORE file I/O to avoid wasted work.
    if (getIsQuizActive()) {
        vscode.window.showWarningMessage('A quiz is already active (MCP or another dev test). Please wait for it to finish first.');
        return { status: 'skipped' };
    }

    // Read and validate the fixture
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const rawJson = JSON.parse(rawContent);
    const payload = validateQuizPayload(rawJson);

    outputChannel.appendLine(`[DEV TEST] Loaded fixture: ${filePath}`);
    outputChannel.appendLine(`[DEV TEST] Questions: ${payload.questions.length}`);

    const timeoutSeconds = vscode.workspace
        .getConfiguration('quizgate')
        .get<number>('timeout', 120);

    let result;
    try {
        result = await createOrShowQuizPanel(context, payload, timeoutSeconds);
    } catch (err) {
        outputChannel.appendLine(`[DEV TEST] Panel error: ${err}`);
        throw err;
    }

    return result;
}


export function deactivate() {
    stopHttpServer();
    deletePortFile();
    if (outputChannel) {
        outputChannel.dispose();
    }
}



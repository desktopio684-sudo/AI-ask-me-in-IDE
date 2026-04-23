import { QuizPayload, QuizResponse, ErrorCode, QuizResponseSchema } from "@quizgate/shared";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DEFAULT_PORT = 6010;

/**
 * Resolves the port where the VS Code Extension HTTP server is running.
 *
 * Priority chain:
 *   1. QUIZGATE_PORT environment variable
 *   2. ~/.quizgate-port temp file (written by the extension on startup)
 *   3. Default port 6010
 */
function resolvePort(): number {

    // 1. Environment variable override (highest priority)
    if (process.env.QUIZGATE_PORT) {
        const envPort = parseInt(process.env.QUIZGATE_PORT, 10);
        if (!isNaN(envPort) && envPort > 0 && envPort < 65536) {
            return envPort;
        }
    }

    // 2. Port file written by the VS Code extension
    try {
        const portStr = readFileSync(join(homedir(), '.quizgate-port'), 'utf8').trim();
        const port = parseInt(portStr, 10);
        if (!isNaN(port) && port > 0 && port < 65536) {
            return port;
        }
    } catch {
        // File doesn't exist or isn't readable — fall through to default
    }

    // 3. Default fallback
    return DEFAULT_PORT;
}

/**
 * Creates a TRANSPORT_ERROR response.
 *
 * Transport errors happen when we can't even reach the extension server:
 * - ECONNREFUSED: Extension not running
 * - ETIMEDOUT: Network timeout
 * - DNS failures
 */
function transportError(port: number, message: string): QuizResponse {
    return {
        status: "skipped",
        error: {
            code: ErrorCode.EXTENSION_NOT_FOUND,
            message: `[TRANSPORT_ERROR] Cannot reach QuizGate extension on port ${port}. ${message}`,
        },
    };
}

/**
 * Creates a PROTOCOL_ERROR response.
 *
 * Protocol errors happen when the extension returns an unexpected HTTP status code:
 * - Non-200 responses
 * - Malformed JSON
 * - Schema validation failures
 */
function protocolError(message: string): QuizResponse {
    return {
        status: "skipped",
        error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: `[PROTOCOL_ERROR] ${message}`,
        },
    };
}

/**
 * Creates an APPLICATION_ERROR response.
 *
 * Application errors happen when the extension works fine,
 * but the user action doesn't produce a valid answer:
 * - User skips the quiz
 * - Quiz times out
 * - User submits invalid data
 */
function applicationError(code: ErrorCode, status: "skipped" | "timeout", message: string): QuizResponse {
    return {
        status,
        error: {
            code,
            message: `[APPLICATION_ERROR] ${message}`,
        },
    };
}

/**
 * Sends the quiz payload to the VS Code Extension via localhost HTTP.
 * Blocks until the user answers, the connection times out, or an error occurs.
 *
 * Uses the Three-Tier Error Model:
 * - Transport: connection-level failures
 * - Protocol: HTTP/JSON-level failures
 * - Application: user-action-level failures
 */
export async function sendQuizToExtension(payload: QuizPayload): Promise<QuizResponse> {
    const port = resolvePort();
    const endpoint = `http://localhost:${port}/quiz`;

    try {
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 180_000); // 3 min safety net

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(fetchTimeout);

        // ── Protocol Level: non-200 HTTP status ──
        if (!response.ok) {

            // Special handling for 429 (quiz already active)
            if (response.status === 429) {
                return applicationError(
                    ErrorCode.BUSY,
                    "skipped",
                    "Another quiz is already active in the extension. Wait for the current quiz to finish."
                );
            }

            return protocolError(
                `Extension HTTP server returned status ${response.status}. Expected 200.`
            );
        }

        // ── Protocol Level: JSON parse ──
        let data: any;
        try {
            data = await response.json();
        } catch {
            return protocolError(
                "Extension returned a non-JSON response body."
            );
        }

        // ── Protocol Level: Schema validation ──
        let validated: QuizResponse;
        try {
            validated = QuizResponseSchema.parse(data) as QuizResponse;
        } catch (validationError: any) {
            return protocolError(
                `Extension returned invalid response schema: ${validationError.message}`
            );
        }

        // ── Application Level: user skipped or timed out ──
        if (validated.status === "skipped") {
            return applicationError(
                ErrorCode.USER_SKIPPED,
                "skipped",
                "The user dismissed the quiz without answering."
            );
        }

        if (validated.status === "timeout") {
            return applicationError(
                ErrorCode.TIMEOUT,
                "timeout",
                "The quiz timed out before the user could answer."
            );
        }

        // ── Success ──
        return validated;

    } catch (error: any) {

        // ── Transport Level: connection failures ──
        const errorCode = error.cause?.code || error.code || "";

        if (errorCode === "ECONNREFUSED") {
            return transportError(port,
                "Is the extension installed and the IDE open?"
            );
        }

        if (errorCode === "ETIMEDOUT" || errorCode === "ECONNRESET") {
            return transportError(port,
                `Connection ${errorCode}. The extension may have crashed or the network is unreachable.`
            );
        }

        if (errorCode === "ENOTFOUND") {
            return transportError(port,
                "DNS resolution failed for localhost. This shouldn't happen — check your system's hosts file."
            );
        }

        // Generic transport error for anything else
        return transportError(port,
            `Unexpected transport error: ${error.message}`
        );
    }
}

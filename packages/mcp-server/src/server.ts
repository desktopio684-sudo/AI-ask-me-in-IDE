import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
    ErrorCode,
    QuizPayloadSchema
} from "@quizgate/shared";
import { sendQuizToExtension } from "./bridge.js";


// ─────────────────────────────────────────────────────────────────────────────
// Circuit Breaker State
// ─────────────────────────────────────────────────────────────────────────────

interface CircuitBreakerState {

    /** Timestamps of consecutive user dismissals (skipped/timeout). */
    dismissals: number[];

    /** Whether the circuit breaker is currently tripped. */
    tripped: boolean;

    /** Timestamp when the breaker tripped (for cooldown calculation). */
    trippedAt: number | null;
}

/**
 * Maximum consecutive dismissals within the time window before the breaker trips.
 */
const MAX_DISMISSALS = 3;

/**
 * Time window in milliseconds for counting dismissals.
 * If 3 dismissals happen within this window, the breaker trips.
 */
const DISMISSAL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Cooldown period in milliseconds after the breaker trips.
 * After this period, the breaker automatically resets.
 */
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

const circuitBreaker: CircuitBreakerState = {
    dismissals: [],
    tripped: false,
    trippedAt: null,
};

/**
 * Records a user dismissal and checks if the breaker should trip.
 */
function recordDismissal(): void {
    const now = Date.now();

    // Add current dismissal
    circuitBreaker.dismissals.push(now);

    // Remove dismissals older than the window
    circuitBreaker.dismissals = circuitBreaker.dismissals.filter(
        (timestamp) => now - timestamp < DISMISSAL_WINDOW_MS
    );

    // Trip the breaker if threshold exceeded
    if (circuitBreaker.dismissals.length >= MAX_DISMISSALS) {
        circuitBreaker.tripped = true;
        circuitBreaker.trippedAt = now;
        circuitBreaker.dismissals = []; // Reset counter
    }
}

/**
 * Records a successful answer, resetting the breaker state.
 */
function recordSuccess(): void {
    circuitBreaker.dismissals = [];
    circuitBreaker.tripped = false;
    circuitBreaker.trippedAt = null;
}

/**
 * Checks if the circuit breaker is currently blocking requests.
 * Automatically resets after the cooldown period.
 */
function isCircuitBreakerTripped(): boolean {
    if (!circuitBreaker.tripped) return false;

    // Auto-reset after cooldown
    const now = Date.now();
    if (circuitBreaker.trippedAt && now - circuitBreaker.trippedAt >= COOLDOWN_MS) {
        circuitBreaker.tripped = false;
        circuitBreaker.trippedAt = null;
        return false;
    }

    return true;
}

/**
 * Returns the remaining cooldown time in seconds (for the agent's info).
 */
function getRemainingCooldownSeconds(): number {
    if (!circuitBreaker.trippedAt) return 0;
    const elapsed = Date.now() - circuitBreaker.trippedAt;
    return Math.max(0, Math.ceil((COOLDOWN_MS - elapsed) / 1000));
}


// ─────────────────────────────────────────────────────────────────────────────
// MCP Server
// ─────────────────────────────────────────────────────────────────────────────

export function createQuizGateServer() {
    const server = new Server(
        {
            name: "quizgate-mcp",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // ── Register the ask_user tool ──────────────────────────────────────
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "ask_user",
                    description:
                        "Summons a beautiful quiz UI in the user's IDE to ask clarifying questions before proceeding. " +
                        "Halts execution until the user answers. Use this when you face architectural ambiguity or " +
                        "don't know the user's preference. The tool has a circuit breaker — if the user dismisses " +
                        "the quiz 3 times within 5 minutes, the tool temporarily disables itself.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            title: {
                                type: "string",
                                description: "The main heading for the quiz modal",
                            },
                            description: {
                                type: "string",
                                description: "Context explaining why you need these questions answered",
                            },
                            questions: {
                                type: "array",
                                description: "List of questions to ask (max 20)",
                                items: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        question: { type: "string" },
                                        context: { type: "string" },
                                        options: {
                                            type: "array",
                                            items: {
                                                type: "object",
                                                properties: {
                                                    label: { type: "string" },
                                                    description: { type: "string" }
                                                },
                                                required: ["label"]
                                            }
                                        },
                                        required: { type: "boolean", default: true }
                                    },
                                    required: ["id", "question", "options"]
                                }
                            }
                        },
                        required: ["title", "questions"],
                    },
                },
            ],
        };
    });

    // ── Handle ask_user tool execution ──────────────────────────────────
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name !== "ask_user") {
            throw new Error("Tool not found");
        }

        // ── Circuit Breaker Check ──────────────────────────────────────
        if (isCircuitBreakerTripped()) {
            const remaining = getRemainingCooldownSeconds();
            return {
                content: [
                    {
                        type: "text",
                        text: `Circuit breaker active: The user has dismissed QuizGate ${MAX_DISMISSALS} times within ${DISMISSAL_WINDOW_MS / 60000} minutes. ` +
                            `Proceeding with best judgment. The tool will re-enable in ${remaining} seconds.`,
                    },
                ],
                isError: true,
                _meta: { errorCode: ErrorCode.CIRCUIT_BREAKER_TRIPPED },
            };
        }

        try {
            // 1. Validate payload against schema
            const payload = QuizPayloadSchema.parse(request.params.arguments);

            // 2. Send to Extension via HTTP bridge
            const response = await sendQuizToExtension(payload);

            // 3. Handle error responses (from the Three-Tier Error Model)
            if (response.error) {

                // Track dismissals for non-transport errors (user-caused)
                if (response.status === "skipped" || response.status === "timeout") {
                    // Only track dismissals for application-level errors
                    // (user actually saw the UI and dismissed/timed out)
                    if (response.error.code === ErrorCode.USER_SKIPPED || response.error.code === ErrorCode.TIMEOUT) {
                        recordDismissal();
                    }
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: `QuizGate error: ${response.error.message}\n` +
                                `Status: ${response.status}\n` +
                                `Continuing execution with AI best judgment.`,
                        },
                    ],
                    isError: true,
                };
            }

            // ── Defensive: skip without error ─────────────────────────
            // The bridge always wraps skip/timeout with applicationError(),
            // so response.error is always set for these statuses. This code
            // should never run. Kept as a safety net for future refactors.
            if (response.status === "skipped") {
                recordDismissal();
                return {
                    content: [
                        {
                            type: "text",
                            text: "The user manually skipped the quiz. Proceed with your best architectural judgment.",
                        },
                    ],
                    isError: true,
                };
            }

            // ── Defensive: timeout without error ─────────────────────────
            if (response.status === "timeout") {
                recordDismissal();
                return {
                    content: [
                        {
                            type: "text",
                            text: "The quiz timed out before the user answered. Proceed with your best architectural judgment.",
                        },
                    ],
                    isError: true,
                };
            }

            // 6. Success — user answered the quiz
            recordSuccess();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.answers, null, 2),
                    },
                ],
            };

        } catch (error: any) {
            if (error.name === "ZodError") {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Validation error: ${error.message}\nPlease check the input schema and try again.`,
                        },
                    ],
                    isError: true,
                };
            }

            throw error;
        }
    });

    return server;
}

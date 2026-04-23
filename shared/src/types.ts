import { z } from "zod";

/**
 * Standardized JSON-RPC Error Codes used by QuizGate.
 */
export enum ErrorCode {
    /**
     * Cannot reach the QuizGate extension HTTP server.
     * Likely means the extension is not installed, not active, or port is wrong.
     */
    EXTENSION_NOT_FOUND = -32601,

    /**
     * The user did not answer the quiz within the configured timeout period.
     */
    TIMEOUT = -32000,

    /**
     * The agent provided invalid JSON payload matching the question schema.
     */
    VALIDATION_ERROR = -32602,

    /**
     * The user actively skipped or dismissed the quiz without answering.
     */
    USER_SKIPPED = -32001,

    /**
     * Another quiz is already being displayed.
     * Used for 429 responses — NOT counted as a user dismissal by the circuit breaker.
     */
    BUSY = -32003,

    /**
     * Circuit breaker tripped because the user has dismissed the quiz too many times recently.
     */
    CIRCUIT_BREAKER_TRIPPED = -32002
}

/**
 * A single option within a quiz question.
 */
export interface QuizOption {
    label: string;
    description?: string;
}

/**
 * A single question presented to the user.
 */
export interface QuizQuestion {
    id: string;
    question: string;
    context?: string;
    options: QuizOption[];
    required: boolean;
}

/**
 * The payload sent from the AI Agent (via MCP) to the Extension.
 * The AI can optionally set a `timeout` in seconds (minimum 120).
 * If omitted or below 120, the extension's default setting is used.
 */
export interface QuizPayload {
    title: string;
    description?: string;
    questions: QuizQuestion[];
    timeout?: number;
}

/**
 * A single parsed answer returned from the user.
 * Users can type any freeform text for any question — no special flag needed.
 */
export interface QuizAnswer {
    id: string;
    selected: string;
}

/**
 * The structured response returned from the Extension back to the MCP Server.
 */
export interface QuizResponse {
    status: "answered" | "skipped" | "timeout";
    answered_at?: string;
    answers?: QuizAnswer[];
    error?: {
        code: ErrorCode;
        message: string;
    };
}



export const QuizOptionSchema = z.object({
    label: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
});

export const QuizQuestionSchema = z.object({
    id: z.string().min(1).max(100),
    question: z.string().min(1).max(1000),
    context: z.string().max(1000).optional(),
    options: z.array(QuizOptionSchema).min(1).max(10),
    required: z.boolean().default(true),
});

export const QuizPayloadSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    questions: z.array(QuizQuestionSchema).min(1).max(20),
    timeout: z.number().int().positive().optional(),
});

export const QuizAnswerSchema = z.object({
    id: z.string(),
    selected: z.string(),
});

export const QuizResponseSchema = z.object({
    status: z.enum(["answered", "skipped", "timeout"]),
    answered_at: z.string().optional(),
    answers: z.array(QuizAnswerSchema).optional(),
    error: z.object({
        code: z.nativeEnum(ErrorCode),
        message: z.string()
    }).optional()
});

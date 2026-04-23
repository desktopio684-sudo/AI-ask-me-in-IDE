/**
 * core.ts — Zero VS Code dependency.
 * Can be used in any Node.js host environment.
 */

import { QuizPayload, QuizPayloadSchema, QuizAnswer } from '@quizgate/shared';

// Re-export shared types/schemas needed by the host
export { QuizPayload, QuizAnswer };

// Export port management utilities which don't depend on vscode
export { findAvailablePort, writePortFile, deletePortFile, PORT_FILE } from './utils/port';

/** Validates raw JSON body as a QuizPayload. Throws ZodError on failure. */
export function validateQuizPayload(raw: unknown): QuizPayload {
    return QuizPayloadSchema.parse(raw);
}

/** Formats answers for HTTP response. */
export function formatAnswerResponse(answers: QuizAnswer[]) {
    return {
        status: 'answered',
        answered_at: new Date().toISOString(),
        answers
    };
}

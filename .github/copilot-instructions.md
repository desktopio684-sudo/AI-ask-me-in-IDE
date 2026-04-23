# QuizGate Copilot Instructions

## Overview
QuizGate is a monorepo consisting of three main parts:
1. **MCP Server** (`packages/mcp-server`): Provides the `ask_user` tool to AI agents via the Model Context Protocol
2. **VS Code Extension** (`packages/vscode-extension`: Shows quiz UI in VS Code and communicates with MCP server via HTTP
3. **Shared Types** (`shared`): Contains Zod schemas and TypeScript interfaces used by both MCP server and extension

## Key Components

### MCP Server (`packages/mcp-server`)
- Entry point: `src/server.ts`
- Exposes `ask_user` tool that presents quiz questions to users
- Implements circuit breaker pattern to prevent spamming users (max 3 dismissals in 5 minutes)
- Communicates with VS Code extension via HTTP (port stored in `~/.quizgate-port`)
- Key files:
  - `server.ts`: Main MCP server logic with tool handlers
  - `bridge.ts`: HTTP client for sending quizzes to extension and receiving answers
  - `index.ts`: Entry point that starts the server

### VS Code Extension (`packages/vscode-extension`)
- Entry point: `src/extension.ts`
- Activates on VS Code startup, starts HTTP server on available port (default 6010)
- Writes port to `~/.quizgate-port` for MCP server discovery
- Shows quiz panel via webview when receiving HTTP request from MCP server
- Key files:
  - `extension.ts`: Extension activation and HTTP server setup
  - `http-server.ts`: Express server handling quiz requests
  - `quiz-panel.ts`: React-based quiz UI in webview
  - `core.ts`: Port management and payload validation

### Shared Package (`shared`)
- Contains:
  - `src/types.ts`: Zod schemas (`QuizPayloadSchema`, `ErrorCode`) and TypeScript interfaces
  - Used by both MCP server and extension for type safety and validation

## Development Workflows

### Building
```bash
# From workspace root
npm run build   # Builds all workspaces
```

### Testing
```bash
# From workspace root
npm test        # Runs tests in all workspaces (if present)
npm run test:quiz # Runs specific quiz test script (./scripts/test-quiz.sh)
```

#### Manual Quiz Testing
The `scripts/test-quiz.sh` script allows testing the quiz UI without involving AI:
```bash
# Uses default sample.json fixture
./scripts/test-quiz.sh

# Use custom JSON fixture
./scripts/test-quiz.sh path/to/custom.json

# Override port (useful for debugging)
QUIZGATE_PORT=6015 ./scripts/test-quiz.sh
```
This script:
1. Reads the port from `~/.quizgate-port` (written by the extension on startup)
2. POSTs the JSON payload to `http://localhost:<port>/quiz`
3. Blocks until the user answers/skips/timeout in the VS Code UI
4. Prints the JSON response from the extension

### Debugging
- MCP server logs: Check console where `npx quizgate-mcp` runs
- Extension logs: View QuizGate output channel in VS Code (View → Output → QuizGate)
- Port file: `~/.quizgate-port` contains current HTTP port
- Dev testing: Use command `QuizGate: Show Quiz` to test quiz UI without MCP server
- Network tracing: The extension logs HTTP requests/responses when receiving quiz payloads

## Important Patterns

### Circuit Breaker
Located in `packages/mcp-server/src/server.ts`:
- Tracks consecutive user dismissals (skipped/timeout)
- Trips after 3 dismissals within 5 minutes
- Automatically resets after 5-minute cooldown
- Prevents annoying users with repeated quizzes

### Communication Flow
1. AI agent calls `ask_user` tool on MCP server
2. MCP server validates request using shared Zod schema
3. MCP server reads port from `~/.quizgate-port`
4. MCP server sends quiz payload to extension via HTTP POST
5. Extension shows quiz UI and waits for user input
6. User responds → extension sends answer back to MCP server
7. MCP server returns result to AI agent

### Error Handling
- Uses standardized `ErrorCode` enum from shared package
- Extension not found: `EXTENSION_NOT_FOUND` (-32601)
- User timeout: `TIMEOUT` (-32000)
- Validation failure: `VALIDATION_ERROR` (-32602)
- User skipped: `USER_SKIPPED` (-32001)
- Busy (quiz already active): `BUSY` (-32003)
- Circuit breaker tripped: `CIRCUIT_BREAKER_TRIPPED` (-32002)

## Cross-Component Communication
- MCP server → Extension: HTTP POST to `http://localhost:<port>/quiz`
- Extension → MCP server: HTTP POST to MCP server's callback URL (provided in quiz request)
- Both directions use JSON payloads validated by shared Zod schemas

## File Conventions
- TypeScript strict mode enabled in all tsconfig.json files
- Async/await used for all asynchronous operations
- Error-first callback pattern avoided in favor of try/catch
- Constants grouped at top of files with clear comments
- HTTP server uses Express with JSON body parsing
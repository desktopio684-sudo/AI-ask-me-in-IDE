# QuizGate

> Stop your AI agent from guessing. Make it ask inside your IDE.

QuizGate gives MCP-compatible AI agents a structured way to ask you clarifying questions directly in VS Code. Instead of guessing on architecture, implementation details, or user preference, the agent can open a quiz panel in your editor, wait for your answer, and continue with actual input.

## What It Is

QuizGate is made of two runtime pieces:

- `packages/mcp-server`: an MCP server that exposes the `ask_user` tool to AI agents
- `packages/vscode-extension`: a VS Code extension that receives questions over localhost HTTP and renders the quiz UI

There is also one shared workspace package:

- `shared`: shared types and Zod schemas used by both packages

## How It Works

1. Your AI agent encounters ambiguity.
2. It calls the `ask_user` MCP tool with structured questions.
3. The MCP server forwards that payload to the local VS Code extension.
4. The extension opens an interactive quiz panel in VS Code.
5. You answer the quiz.
6. The response flows back to the agent so it can continue with your actual preference.

## Why Use It

- Reduces AI guesswork in real coding workflows
- Keeps clarification inside the editor instead of chat context switching
- Supports structured answers instead of vague free-form back and forth
- Adds guardrails like timeouts, error classification, and a circuit breaker

## Repo Layout

```text
.
├── DOCs/documentation.md          # Developer documentation and architecture notes
├── shared/                        # Shared types and schemas
└── packages/
    ├── mcp-server/                # MCP server package
    └── vscode-extension/          # VS Code extension package
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Build the workspace

```bash
npm run build
```

### 3. Run the VS Code extension

Open the repository in VS Code and launch the extension host with `F5`.

### 4. Configure your AI agent to use the MCP server

Example MCP config:

```json
{
  "mcpServers": {
    "quizgate": {
      "command": "npx",
      "args": ["-y", "quizgate-mcp"]
    }
  }
}
```

### Or install globally

```bash
npm install -g quizgate-mcp
```

If you want to run the local repository build instead of the published package, build the workspace first and point your MCP client at `packages/mcp-server/dist/index.js`.

## Core Features

- `ask_user` tool for structured clarification flows
- Multiple-choice questions with optional descriptions and context
- Free-text answers when the user wants to write their own response
- Configurable timeout via `quizgate.timeout`
- Port discovery starting from `quizgate.port`
- Three-tier error model: transport, protocol, and application failures
- Circuit breaker to avoid repeatedly interrupting the user

## Documentation

- [Developer documentation](DOCs/documentation.md)
- [MCP server README](packages/mcp-server/README.md)
- [VS Code extension README](packages/vscode-extension/README.md)

## Development Notes

- Node.js 18+ is required
- The MCP server is bundled with `esbuild` so the published package can inline the local `@quizgate/shared` workspace package
- The VS Code extension builds into `packages/vscode-extension/out`
- Shared types build into `shared/dist`

## License

MIT

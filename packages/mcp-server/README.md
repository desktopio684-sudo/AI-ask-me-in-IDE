# QuizGate MCP Server

The QuizGate MCP server exposes a single tool, `ask_user`, so an AI agent can ask the developer clarifying questions inside VS Code instead of guessing.  

This package is the agent-facing half of QuizGate. It pairs with the QuizGate VS Code extension, which renders the actual quiz UI.

## What This Package Does

- Exposes `ask_user` over MCP
- Validates request and response shapes using shared schemas
- Forwards quiz payloads to the local VS Code extension over HTTP
- Returns structured answers back to the calling AI agent
- Classifies failures into transport, protocol, and application-level errors
- Uses a circuit breaker to stop repeatedly interrupting the user after repeated dismissals

## Install

### Use with `npx`

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

Then configure your MCP client like this:

```json
{
  "mcpServers": {
    "quizgate": {
      "command": "quizgate-mcp"
    }
  }
}
```

## Requirements

- Node.js 18+
- The QuizGate VS Code extension running locally
- An MCP-compatible client such as Claude Desktop, Gemini CLI, or another MCP host

## Tool Shape

The server exposes one tool:

```ts
ask_user({
  title: "Database Architecture",
  description: "Need clarification before continuing",
  questions: [
    {
      id: "db",
      question: "Which database should I use?",
      context: "SQLite is simpler for local dev. PostgreSQL is better for production.",
      required: true,
      options: [
        { label: "SQLite", description: "Fast local setup" },
        { label: "PostgreSQL", description: "Production-ready" }
      ]
    }
  ]
})
```

The server returns structured results from the extension, including successful answers and non-fatal user outcomes like skip or timeout.

## Runtime Behavior

### Port discovery

The server reads the active extension port from `~/.quizgate-port`. The extension writes this file when it starts and scans from the configured base port if the default is occupied.

### Error model

QuizGate separates failures into three buckets so the agent can react correctly:

- Transport: the extension is unreachable or localhost networking failed
- Protocol: unexpected HTTP or payload mismatch between server and extension
- Application: the user skipped, dismissed, or timed out

### Circuit breaker

If the user dismisses quizzes repeatedly, the server temporarily disables the tool so the agent can proceed with best judgment instead of spamming prompts.

## Local Development

From the repository root:

```bash
npm install
npm run build
```

This package uses [`build.mjs`](build.mjs) with `esbuild` so the published package can bundle the local `@quizgate/shared` workspace package into `dist/index.js`.

## Related Docs

- [Root README](../../README.md)
- [VS Code extension README](../vscode-extension/README.md)
- [Developer documentation](../../DOCs/documentation.md)

## License

MIT

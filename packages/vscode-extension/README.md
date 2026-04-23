# QuizGate VS Code Extension

> Give your AI agent a way to ask, not assume.

The QuizGate VS Code extension is the IDE-facing half of QuizGate. It runs a lightweight localhost bridge and opens a quiz panel in VS Code whenever the QuizGate MCP server sends a clarification request.

## What The Extension Does

- Receives quiz payloads from the local QuizGate MCP server
- Opens a webview panel inside VS Code
- Renders multiple-choice prompts with optional context and descriptions
- Supports custom free-text answers
- Enforces required questions before submission
- Applies timeout behavior and theme-aware UI styling

## Using QuizGate

QuizGate requires both:

1. This VS Code extension
2. The QuizGate MCP server used by your AI agent

Once both pieces are running, the flow is automatic. When your AI agent faces ambiguity, it can open a quiz in VS Code and wait for your response.

## Install

### Marketplace or local package

Install the extension from the VS Code Marketplace if published there, or install a locally packaged `.vsix`.

Example local install:

```bash
code --install-extension ./quizgate-0.3.0.vsix
```

### MCP server setup

 Install MCP

```bash
npm install -g quizgate-mcp
```

Your AI agent also needs the QuizGate MCP server. Example MCP config:

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

## VS Code Settings

- `quizgate.port`: base port for the localhost HTTP bridge, default `6010`
- `quizgate.timeout`: quiz timeout in seconds, default `120`

If the configured port is occupied, the extension scans upward across the next available ports and writes the selected port to `~/.quizgate-port`.

## Local Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/desktopio684-sudo/AI-ask-me-in-IDE.git
cd AI-ask-me-in-IDE
npm install
npm run build
```

Then open the repository in VS Code and press `F5` to launch the Extension Development Host.

If you need the MCP server to run from the local repository instead of a published package, point your MCP client to the built server entry at `packages/mcp-server/dist/index.js` after building.

## UI And Behavior

The extension includes:

- dark and light theme support based on the active VS Code theme
- countdown timer with auto-close timeout behavior
- secure webview handling with nonce-based CSP
- validation for required questions before submit
- free-text input when the provided choices do not fit

## Troubleshooting

- Quiz does not open: confirm the extension is running in the Extension Development Host or installed in your main VS Code instance
- MCP server cannot connect: check that `~/.quizgate-port` exists and that the extension has started
- Blank panel: inspect the webview developer tools for CSP or asset-loading problems
- Wrong port: adjust `quizgate.port` or restart the extension so it rewrites the active port file

## Related Docs

- [Root README](../../README.md)
- [MCP server README](../mcp-server/README.md)
- [Developer documentation](../../DOCs/documentation.md)

## License

MIT

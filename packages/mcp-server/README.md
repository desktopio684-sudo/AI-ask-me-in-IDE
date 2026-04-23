# QuizGate

> **Stop your AI agent from guessing. Make it ask.**

QuizGate is an [MCP](https://modelcontextprotocol.io/) server that gives AI agents a beautiful quiz UI to ask you clarifying questions directly inside VS Code — instead of hallucinating assumptions.

```
  AI Agent                     You (in VS Code)
  ┌───────────┐               ┌──────────────────┐
  │ "Should I │  MCP ask_user │ ┌──────────────┐  │
  │  use SQL  │ ────────────► │ │  Quiz Panel  │  │
  │  or NoSQL │               │ │  ○ PostgreSQL │  │
  │  ...?"    │ ◄──────────── │ │  ● SQLite    │  │
  │           │  { answer }   │ │  ○ MySQL     │  │
  └───────────┘               │ └──────────────┘  │
                              └──────────────────┘
```

---

## Quick Start

### 1. Install the VS Code Extension

Search **"QuizGate"** in the VS Code Extensions marketplace, or install from VSIX:

```bash
code --install-extension quizgate-0.2.0.vsix
```

### 2. Add QuizGate to your AI Agent's MCP config

**Gemini CLI** (`~/.gemini/settings.json`):

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

**Claude Desktop** (`claude_desktop_config.json`):

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

**Or use a local install** (faster startup, no download on each run):

```bash
npm install -g quizgate-mcp
```

Then point your config to:

```json
{
  "mcpServers": {
    "quizgate": {
      "command": "quizgate-mcp"
    }
  }
}
```

### 3. Done

Your AI agent now has the `ask_user` tool. When it faces ambiguity, it'll summon a quiz panel in your IDE instead of guessing.

---

## How It Works

1. **AI Agent** encounters an architectural decision or ambiguity
2. **Calls `ask_user`** via MCP with a structured question payload
3. **MCP Server** (this package) forwards the payload to the VS Code extension via localhost HTTP
4. **VS Code Extension** renders a beautiful quiz panel with options
5. **You answer**, and the structured response flows back to the agent
6. **Agent proceeds** with your actual preference — no hallucination

---

## The `ask_user` Tool

The MCP server exposes a single tool:

```
ask_user({
  title: "Database Architecture",
  description: "Need clarification before proceeding...",
  questions: [
    {
      id: "q1",
      question: "Which database engine?",
      context: "PostgreSQL has better JSONB support...",
      options: [
        { label: "PostgreSQL", description: "Production-grade" },
        { label: "SQLite", description: "Zero setup, local dev" }
      ],
            required: true
    }
  ]
})
```

---

## Safety Features

| Feature                  | What It Does                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------- |
| **Circuit Breaker**      | If you dismiss the quiz 3 times in 5 minutes, the tool auto-disables for 5 minutes |
| **Three-Tier Errors**    | Transport / Protocol / Application error classification for the agent              |
| **Configurable Timeout** | Quiz auto-closes after configurable seconds (default: 120)                         |
| **Nonce-based CSP**      | Content Security Policy prevents XSS in the webview                                |

---

## Configuration

Set these in VS Code settings:

| Setting            | Default | Description                                               |
| ------------------ | ------- | --------------------------------------------------------- |
| `quizgate.port`    | `6010`  | HTTP bridge port. Auto-scans 10 ports upward if occupied. |
| `quizgate.timeout` | `120`   | Seconds before quiz auto-closes (5–600).                  |

---

## Requirements

- **Node.js** 18+
- **VS Code** 1.85+ with the QuizGate extension installed
- An MCP-compatible AI agent (Gemini CLI, Claude Desktop, etc.)

---

## License

MIT

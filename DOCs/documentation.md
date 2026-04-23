# QuizGate Developer Documentation

QuizGate is an MCP (Model Context Protocol) tool that lets AI agents ask you clarifying questions directly in your IDE.

## Architecture

```text
AI Agent (e.g. Antigravity/Claude)
    │
    ▼  MCP Tool Call: ask_user(payload)
MCP Server (packages/mcp-server)
    │  ┌─────────────────────────────────────┐
    │  │ Three-Tier Error Model              │
    │  │ • Transport: connection failures    │
    │  │ • Protocol: HTTP/JSON errors        │
    │  │ • Application: user skip/timeout    │
    │  └─────────────────────────────────────┘
    │  ┌─────────────────────────────────────┐
    │  │ Circuit Breaker                     │
    │  │ • 3 dismissals in 5 min → trip      │
    │  │ • 5 min cooldown → auto-reset       │
    │  └─────────────────────────────────────┘
    ▼  POST http://localhost:{port}/quiz
VS Code Extension (packages/vscode-extension)
    │  ┌─────────────────────────────────────┐
    │  │ Port Discovery                      │
    │  │ • Configured port → scan 10 up      │
    │  │ • Write to ~/.quizgate-port         │
    │  └─────────────────────────────────────┘
    ▼  Opens Webview Panel
User answers in Quiz UI
    │  ┌─────────────────────────────────────┐
    │  │ UI Features                         │
    │  │ • Dark/Light theme auto-detect      │
    │  │ • Configurable countdown timer      │
    │  │ • Glassmorphism design              │
    │  │ • Custom free-text answers          │
    │  └─────────────────────────────────────┘
    ▼  Answer JSON → back up the stack
AI Agent receives structured answer
```

## Project Structure

```text
ASK_ME/
├── shared/                       # @quizgate/shared — Shared types + Zod schemas
│   └── src/types.ts              #   QuizQuestion, QuizAnswer, ErrorCode, schemas
├── packages/
│   ├── mcp-server/               # MCP server with ask_user tool
│   │   └── src/
│   │       ├── index.ts          #   Entry point, stdio transport
│   │       ├── server.ts         #   Tool registration + Circuit Breaker
│   │       └── bridge.ts         #   HTTP client + Three-Tier Error Model
│   └── vscode-extension/         # VS Code Extension
│       ├── src/
│       │   ├── extension.ts      #   activate/deactivate lifecycle
│       │   ├── http-server.ts    #   Localhost HTTP bridge + configurable timeout
│       │   ├── quiz-panel.ts     #   Webview panel + theme detection + CSP
│       │   └── utils/port.ts     #   Port discovery + ~/.quizgate-port writing
│       └── media/
│           ├── quiz.html         #   Webview HTML template
│           ├── quiz.css          #   Dark/Light glassmorphism styles
│           └── quiz.js           #   Client-side quiz logic + countdown
└── package.json                  # npm workspaces root
```

## Robustness Features

### Three-Tier Error Model

Every failure is classified into one of three tiers so the AI agent can understand the failure domain:

| Tier            | Examples                                      | Agent Behavior                                                  |
| --------------- | --------------------------------------------- | --------------------------------------------------------------- |
| **Transport**   | `ECONNREFUSED`, DNS failure, `ETIMEDOUT`      | Extension not running. Agent should proceed with best judgment. |
| **Protocol**    | Non-200 HTTP, malformed JSON, schema mismatch | Bug in extension or version mismatch. Agent should report.      |
| **Application** | User skip, timeout, invalid data              | User chose not to answer. Agent should proceed independently.   |

### Circuit Breaker

Prevents the agent from repeatedly annoying the user:

- Tracks consecutive **application-level** dismissals (skips + timeouts)
- After **3 dismissals within 5 minutes** → tool temporarily disables
- Returns clear message: _"User has dismissed QuizGate multiple times. Proceeding with best judgment."_
- Auto-resets after **5-minute cooldown** or after a successful answer

### Dynamic Port Discovery

The extension finds an available port automatically:

1. Try configured port (default `6010`)
2. If occupied, scan `6011, 6012, ... 6019`
3. Write active port to `~/.quizgate-port`
4. MCP server reads the port file on each request

### Configurable Timeout

- Default: **120 seconds** (configurable via `quizgate.timeout` setting)
- Visual countdown progress bar (green → yellow → red)
- Timer label showing `M:SS` remaining
- Auto-close and return `{ status: "timeout" }` when expired

### Theme Detection

- Reads `vscode.window.activeColorTheme.kind` on panel creation
- Injects `data-theme="dark"` or `data-theme="light"` on `<body>`
- CSS has full light-mode glassmorphism overrides

## Quiz UI Features

- **Glassmorphism design** with backdrop-filter blur
- **Dark/Light theme** auto-detection from VS Code
- **Progress bar countdown** with color transitions
- **"Write your own" option** — custom free-text answers
- **Required question validation** — Submit disabled until all required questions answered
- **XSS protection** — all dynamic content HTML-escaped
- **Nonce-based CSP** — Content Security Policy with cryptographic nonce
- **`webview.cspSource` restriction** — only loads resources from extension's media folder

## Troubleshooting

| Problem                 | Fix                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Quiz panel doesn't open | Ensure extension is running (F5 or installed). Check **QuizGate** output channel.            |
| MCP can't connect       | Check `~/.quizgate-port` exists. Restart extension. Try `curl http://localhost:6010/health`. |
| Port conflict           | Change `quizgate.port` setting. Extension auto-scans 10 ports upward.                        |
| White/blank quiz panel  | Open DevTools on Webview (Help → Toggle Developer Tools) for CSP errors.                     |
| Circuit breaker tripped | Wait 5 minutes or answer the next quiz successfully to reset.                                |
| Timeout too short       | Increase `quizgate.timeout` in VS Code settings.                                             |

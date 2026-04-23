#!/usr/bin/env bash
set -e

echo "═══════════════════════════════════════════"
echo "  QuizGate — Fresh Build"
echo "═══════════════════════════════════════════"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 1. Clean all build outputs
echo "[1/5] Cleaning build outputs..."
rm -rf shared/dist
rm -rf packages/mcp-server/dist
rm -rf packages/vscode-extension/out
rm -rf packages/vscode-extension/.vscode-test

# 2. Install dependencies
echo "[2/5] Installing dependencies..."
npm install

# 3. Build shared (types + schemas)
echo "[3/5] Building @quizgate/shared..."
cd shared && npm run build && cd ..

# 4. Build MCP server
echo "[4/5] Building quizgate-mcp..."
cd packages/mcp-server && npm run build && cd ../..

# 5. Build VS Code extension
echo "[5/5] Building quizgate VS Code extension..."
cd packages/vscode-extension && npm run compile && cd ../..

echo ""
echo "═══════════════════════════════════════════"
echo "  ✓ Build complete"
echo "═══════════════════════════════════════════"
echo ""
echo "Outputs:"
echo "  - shared/dist/          (types + schemas)"
echo "  - packages/mcp-server/dist/ (bundled server)"
echo "  - packages/vscode-extension/out/ (extension)"

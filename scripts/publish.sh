#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# publish.sh — Build + Package + Publish QuizGate
#
# Publishes:
#   1. quizgate         → npm public registry
#   2. quizgate (vsix)  → VS Code Marketplace / Open VSX
#
# Prerequisites:
#   - npm login (run `npm adduser` first)
#   - VSCE_PAT env var for VS Code Marketplace
#   - OVSX_TOKEN env var for Open VSX (optional)
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║${RESET}  ${BOLD}QuizGate Publish Pipeline${RESET}                    ${CYAN}║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${RESET}"
echo ""

# ── Step 1: Build shared types ────────────────────────────────────────
echo -e "${YELLOW}▶ Building shared types...${RESET}"
npm run build --workspace=shared
echo -e "${GREEN}✓ Shared types built${RESET}"

# ── Step 2: Build MCP server (esbuild bundles @quizgate/shared) ───────
echo -e "${YELLOW}▶ Building MCP server (esbuild bundle)...${RESET}"
cd packages/mcp-server
npm run build
echo -e "${GREEN}✓ MCP server built → dist/index.js${RESET}"

# ── Step 3: Dry run (shows what would be published) ───────────────────
echo ""
echo -e "${YELLOW}▶ npm pack dry run:${RESET}"
npm pack --dry-run 2>&1 | head -30
echo ""

# ── Step 4: Publish MCP server to npm ─────────────────────────────────
echo -e "${YELLOW}▶ Publishing 'quizgate' to npm...${RESET}"
# Uncomment when ready:
# npm publish --access public
echo -e "${DIM}  ⊘ Skipped (uncomment 'npm publish' in this script)${RESET}"

cd ../..

# ── Step 5: Package VS Code extension ─────────────────────────────────
echo ""
echo -e "${YELLOW}▶ Building VS Code extension...${RESET}"
cd packages/vscode-extension
npm run esbuild
echo -e "${GREEN}✓ Extension compiled${RESET}"

echo -e "${YELLOW}▶ Packaging VSIX...${RESET}"
npx vsce package --no-dependencies --no-update-package-json
echo -e "${GREEN}✓ VSIX packaged${RESET}"

# ── Step 6: Publish extension ─────────────────────────────────────────
echo -e "${YELLOW}▶ Publishing to VS Code Marketplace...${RESET}"
# Uncomment when ready:
# npx vsce publish
echo -e "${DIM}  ⊘ Skipped (uncomment 'vsce publish' + set VSCE_PAT)${RESET}"

echo -e "${YELLOW}▶ Publishing to Open VSX...${RESET}"
# Uncomment when ready:
# VSIX=$(ls *.vsix | sort -V | tail -1)
# npx ovsx publish "$VSIX" -p "$OVSX_TOKEN"
echo -e "${DIM}  ⊘ Skipped (uncomment 'ovsx publish' + set OVSX_TOKEN)${RESET}"

cd ../..

# ── Done ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${RESET}"
echo -e "${GREEN}✓ All packaging completed.${RESET}"
echo ""
echo -e "${BOLD}To actually publish, uncomment the publish lines in this script:${RESET}"
echo -e "  ${DIM}1. npm login          → authenticate with npm${RESET}"
echo -e "  ${DIM}2. npm publish        → push 'quizgate' to npm${RESET}"
echo -e "  ${DIM}3. vsce publish       → push extension to Marketplace${RESET}"
echo -e "${GREEN}═══════════════════════════════════════════════${RESET}"

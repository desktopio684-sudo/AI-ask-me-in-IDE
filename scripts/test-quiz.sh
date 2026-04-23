#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# test-quiz.sh — Fire the QuizGate UI without involving any AI.
#
# Usage:
#   ./scripts/test-quiz.sh                         # Uses default sample.json
#   ./scripts/test-quiz.sh path/to/custom.json     # Uses your own fixture
#   QUIZGATE_PORT=6015 ./scripts/test-quiz.sh      # Override port
#
# How it works:
#   1. Reads the port from ~/.quizgate-port (written by the extension on startup)
#   2. POSTs the JSON payload to http://localhost:<port>/quiz
#   3. Blocks until the user answers/skips/timeout in the VS Code UI
#   4. Prints the JSON response from the extension
#
# Prerequisites:
#   - QuizGate VS Code extension must be running (check Output > QuizGate)
#   - curl must be installed
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Color definitions ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Resolve the script's own directory (for default sample path) ──────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Determine which JSON fixture to use ───────────────────────────────
FIXTURE="${1:-$PROJECT_ROOT/packages/mcp-server/examples/sample.json}"

if [ ! -f "$FIXTURE" ]; then
    echo -e "${RED}✗ Fixture not found:${RESET} $FIXTURE"
    echo -e "${DIM}  Pass a valid JSON file as the first argument.${RESET}"
    exit 1
fi

# ── Validate it's valid JSON ──────────────────────────────────────────
if ! python3 -m json.tool "$FIXTURE" > /dev/null 2>&1; then
    echo -e "${RED}✗ Invalid JSON:${RESET} $FIXTURE"
    exit 1
fi

# ── Resolve port ──────────────────────────────────────────────────────
# Priority: QUIZGATE_PORT env > ~/.quizgate-port file > default 6010
if [ -n "${QUIZGATE_PORT:-}" ]; then
    PORT="$QUIZGATE_PORT"
elif [ -f "$HOME/.quizgate-port" ]; then
    PORT="$(cat "$HOME/.quizgate-port" | tr -d '[:space:]')"
else
    PORT=6010
fi

ENDPOINT="http://localhost:${PORT}/quiz"

# ── Health check ──────────────────────────────────────────────────────
echo -e "${CYAN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║${RESET}  ${BOLD}QuizGate Manual Test Runner${RESET}                  ${CYAN}║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${DIM}Fixture :${RESET} $(basename "$FIXTURE")"
echo -e "  ${DIM}Port    :${RESET} $PORT"
echo -e "  ${DIM}Endpoint:${RESET} $ENDPOINT"
echo ""

# Quick health check before sending the full payload
echo -e "${YELLOW}⟳ Checking if extension is alive...${RESET}"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/health" 2>/dev/null || echo "000")

if [ "$HEALTH" != "200" ]; then
    echo -e "${RED}✗ Extension not reachable on port $PORT${RESET}"
    echo -e "${DIM}  Make sure VS Code is open with QuizGate extension activated.${RESET}"
    echo -e "${DIM}  Check: Output panel > QuizGate for server status.${RESET}"
    exit 1
fi

echo -e "${GREEN}✓ Extension is ready${RESET}"
echo ""

# ── Fire the quiz ─────────────────────────────────────────────────────
echo -e "${YELLOW}⟳ Sending quiz payload... ${DIM}(waiting for user response)${RESET}"
echo -e "${DIM}  Switch to VS Code to see the quiz panel.${RESET}"
echo ""

RESPONSE=$(curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d @"$FIXTURE")

# ── Pretty print the response ────────────────────────────────────────
echo -e "${GREEN}═══ Response ═══════════════════════════════════${RESET}"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo -e "${GREEN}════════════════════════════════════════════════${RESET}"

# ── Quick status summary ─────────────────────────────────────────────
STATUS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")

case "$STATUS" in
    answered)
        echo -e "\n${GREEN}✓ Quiz answered successfully${RESET}"
        ;;
    skipped)
        echo -e "\n${YELLOW}⊘ Quiz was skipped${RESET}"
        ;;
    timeout)
        echo -e "\n${RED}⏱ Quiz timed out${RESET}"
        ;;
    *)
        echo -e "\n${DIM}Status: $STATUS${RESET}"
        ;;
esac

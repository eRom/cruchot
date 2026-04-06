#!/usr/bin/env bash
# scripts/test-e2e-setup.sh
#
# Pre-flight check for `npm run test:e2e:flows`. Verifies that Ollama is
# running locally and the qwen3.5:4b model is installed. No-op in CI.
#
# Exit codes:
#   0 — ready to run flows
#   1 — Ollama or model missing (script prints actionable error)

set -euo pipefail

if [ "${CI:-}" = "1" ] || [ "${CI:-}" = "true" ]; then
  echo "[test-e2e-setup] CI detected — skipping Ollama check (using gemini-2.5-flash)"
  exit 0
fi

OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
MODEL="qwen3.5:4b"

# Check 1: Ollama is reachable
if ! curl -fsS "${OLLAMA_HOST}/api/tags" > /dev/null; then
  echo "[test-e2e-setup] ERROR: Ollama is not reachable at ${OLLAMA_HOST}" >&2
  echo "  → Run \`ollama serve\` in another terminal, or set OLLAMA_HOST." >&2
  exit 1
fi

# Check 2: model is installed
if ! curl -fsS "${OLLAMA_HOST}/api/tags" | grep -q "\"name\":\"${MODEL}\""; then
  echo "[test-e2e-setup] ERROR: model \"${MODEL}\" is not installed in Ollama" >&2
  echo "  → Run: ollama pull ${MODEL}" >&2
  exit 1
fi

echo "[test-e2e-setup] Ollama ready (model: ${MODEL})"

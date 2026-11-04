#!/usr/bin/env bash
# scripts/accept.sh — the acceptance for facedown. Worker, reviewer and CI run this exact
# script; the orchestrator never retypes it. Keep it under three minutes.
set -eu

cd "$(dirname "$0")/.."
scratch="$(mktemp -d)"
trap 'rm -r "$scratch"' EXIT
export FACEDOWN_DB="$scratch/facedown.db"

echo "== gate"
bun run typecheck
bun run lint

echo "== unit and engine"
FACEDOWN_PLAYOUTS="${FACEDOWN_PLAYOUTS:-2000}" bun test

echo "== e2e"
bun run test:e2e

echo "== build"
# M5 adds: bun run build

echo "== browser"
# M5 adds: bun run test:browser (when Playwright browsers are installed or CI=1)

echo "accept: ok"

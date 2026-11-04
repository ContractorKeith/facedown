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
bun run build

echo "== browser"
if [ "${CI:-}" = "1" ] || (bunx playwright --version >/dev/null 2>&1 && bun -e 'import { chromium } from "@playwright/test"; process.exit(await Bun.file(chromium.executablePath()).exists() ? 0 : 1)'); then
  bun run test:browser
else
  echo "browser: skipped (no chromium)"
fi

echo "accept: ok"

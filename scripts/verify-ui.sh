#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:-"$ROOT/build/ui-verification"}"

if [[ "$#" -gt 1 || "$OUTPUT" != /* ]]; then
    printf 'Usage: %s [/absolute/output/directory]\n' "$0" >&2
    exit 1
fi
"$ROOT/scripts/build.sh"
"$ROOT/build/PokerCalculator.app/Contents/MacOS/PokerCalculator" --verify-ui "$OUTPUT"

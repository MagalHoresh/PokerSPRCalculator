#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESTINATION="${1:-"$HOME/Applications/PokerCalculator.app"}"

if [[ "$#" -gt 1 || "$DESTINATION" != /* || "$DESTINATION" != *.app ]]; then
    printf 'Usage: %s [/absolute/path/PokerCalculator.app]\n' "$0" >&2
    exit 1
fi
if [[ -e "$DESTINATION" || -L "$DESTINATION" ]]; then
    printf 'Refusing to overwrite an existing destination: %s\nChoose a new .app path or move the previous app yourself.\n' "$DESTINATION" >&2
    exit 1
fi

"$ROOT/scripts/build.sh"
mkdir -p "$(dirname "$DESTINATION")"
# Claim the destination exclusively, so a concurrent install cannot be overwritten.
mkdir "$DESTINATION"
if ! /usr/bin/ditto "$ROOT/build/PokerCalculator.app" "$DESTINATION"; then
    printf 'Copy failed. Incomplete app remains at: %s\n' "$DESTINATION" >&2
    exit 1
fi
/usr/bin/codesign --verify --strict --verbose=2 "$DESTINATION"
printf '\nInstalled: %s\nOpen with: open "%s"\n' "$DESTINATION" "$DESTINATION"

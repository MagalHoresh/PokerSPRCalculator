#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/build/PokerCalculator.app"

if [[ "$(uname -m)" != "arm64" ]]; then
    printf 'Build on an Apple-silicon Mac using a native arm64 terminal (not Rosetta).\n' >&2
    exit 1
fi

cd "$ROOT"
xcrun swift build --configuration release --arch arm64
BIN_DIR="$(xcrun swift build --configuration release --arch arm64 --show-bin-path)"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
/usr/bin/install -m 755 "$BIN_DIR/PokerCalculator" "$APP/Contents/MacOS/PokerCalculator"
/usr/bin/install -m 644 "$ROOT/Resources/Info.plist" "$APP/Contents/Info.plist"
xcrun swift "$ROOT/scripts/make-icon.swift" "$ROOT/build/AppIcon.iconset"
/usr/bin/iconutil --convert icns --output "$APP/Contents/Resources/AppIcon.icns" "$ROOT/build/AppIcon.iconset"
/usr/bin/plutil -lint "$APP/Contents/Info.plist"
/usr/bin/lipo "$APP/Contents/MacOS/PokerCalculator" -verify_arch arm64
/usr/bin/codesign --force --sign - --options runtime --timestamp=none "$APP"
/usr/bin/codesign --verify --strict --verbose=2 "$APP"
printf '\nBuilt local arm64 app: %s\n' "$APP"

#!/usr/bin/env bash
# Build the Windows installer zip: dist/PodGrip-<version>-Windows.zip
#   PodGrip-<version>-Windows/
#     Install PodGrip.bat, Uninstall PodGrip.bat, install.ps1
#     PodGrip/   the panel: CSXS, client, host, engine, lib, vendor/ffmpeg, LICENSE
# Run scripts/fetch-vendor.sh first if vendor/ is empty.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(cd "$ROOT" && node -p "require('./lib/version.js').VERSION")"
OUT="$ROOT/dist/PodGrip-$VERSION-Windows"
EXT="$OUT/PodGrip"

[ -f "$ROOT/vendor/ffmpeg/win32-x64/ffmpeg.exe" ] || { echo "Missing vendor/ffmpeg/win32-x64/ffmpeg.exe - run scripts/fetch-vendor.sh"; exit 1; }

rm -rf "$OUT" && mkdir -p "$EXT/vendor"
cp -R "$ROOT/CSXS" "$ROOT/client" "$ROOT/engine" "$ROOT/host" "$ROOT/lib" "$EXT/"
cp -R "$ROOT/vendor/ffmpeg" "$EXT/vendor/"
cp "$ROOT/LICENSE" "$EXT/"
cp "$ROOT/install/install.ps1" "$ROOT/install/Install PodGrip.bat" "$ROOT/install/Uninstall PodGrip.bat" "$OUT/"

cd "$ROOT/dist" && rm -f "PodGrip-$VERSION-Windows.zip"
if command -v zip >/dev/null; then zip -qr -9 "PodGrip-$VERSION-Windows.zip" "PodGrip-$VERSION-Windows"
else powershell.exe -NoProfile -Command "Compress-Archive -Path 'PodGrip-$VERSION-Windows' -DestinationPath 'PodGrip-$VERSION-Windows.zip'"; fi   # Git Bash on Windows has no zip
echo "Built $ROOT/dist/PodGrip-$VERSION-Windows.zip ($(du -h "$ROOT/dist/PodGrip-$VERSION-Windows.zip" | cut -f1))"

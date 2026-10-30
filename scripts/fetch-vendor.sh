#!/usr/bin/env bash
# Download the third-party runtime PodGrip bundles for Windows (not kept in git): ffmpeg (LGPL build, BtbN),
# the same build PodCutter bundles. It reads the timecode on the cameras' audio.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V="$ROOT/vendor"; TMP="$(mktemp -d)"
mkdir -p "$V/ffmpeg/win32-x64"

echo "ffmpeg (win64, LGPL)..."
curl -fsSL -o "$TMP/ffmpeg.zip" https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip
unzip -j -o -q "$TMP/ffmpeg.zip" '*/bin/ffmpeg.exe' '*/LICENSE.txt' -d "$V/ffmpeg/win32-x64"

rm -rf "$TMP"
du -sh "$V"/*/*

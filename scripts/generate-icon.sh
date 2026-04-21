#!/bin/bash
# Generate a properly padded macOS .icns icon from a source PNG.
#
# macOS Big Sur+ uses a squircle mask for app icons. The icon content
# should fill ~80% of the canvas (824px out of 1024px), with transparent
# padding around it. Without this padding the icon appears oversized and
# the OS doesn't apply the rounded-corner mask correctly.
#
# Prerequisites: macOS with `sips` and `iconutil` (pre-installed).
#
# Usage: ./scripts/generate-icon.sh [source.png]
#   If no source is given, uses build/icon.png

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SOURCE="${1:-$PROJECT_DIR/build/icon.png}"
ICONSET_DIR="$PROJECT_DIR/build/AppIcon.iconset"
OUTPUT="$PROJECT_DIR/build/icon.icns"

if [ ! -f "$SOURCE" ]; then
  echo "Error: Source icon not found at $SOURCE"
  exit 1
fi

# Clean up
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

# Create a 1024x1024 canvas with the icon content centered at ~80% size (824px)
# Step 1: Resize the source to 824x824
PADDED="$ICONSET_DIR/_padded_1024.png"
sips -z 824 824 "$SOURCE" --out "$ICONSET_DIR/_resized_824.png" > /dev/null 2>&1

# Step 2: Create a 1024x1024 transparent canvas and paste the 824px icon centered
# Using sips: pad the image to 1024x1024
sips -p 1024 1024 "$ICONSET_DIR/_resized_824.png" --out "$PADDED" > /dev/null 2>&1

# Generate all required sizes from the padded 1024 source
declare -a SIZES=(16 32 64 128 256 512 1024)

for SIZE in "${SIZES[@]}"; do
  sips -z "$SIZE" "$SIZE" "$PADDED" --out "$ICONSET_DIR/icon_${SIZE}x${SIZE}.png" > /dev/null 2>&1
done

# Rename to match Apple's expected naming convention
# icon_16x16.png already in place
cp "$ICONSET_DIR/icon_32x32.png" "$ICONSET_DIR/icon_16x16@2x.png"
# icon_32x32.png already in place
mv "$ICONSET_DIR/icon_64x64.png" "$ICONSET_DIR/icon_32x32@2x.png"
# icon_128x128.png already in place
cp "$ICONSET_DIR/icon_256x256.png" "$ICONSET_DIR/icon_128x128@2x.png"
# icon_256x256.png already in place
cp "$ICONSET_DIR/icon_512x512.png" "$ICONSET_DIR/icon_256x256@2x.png"
# icon_512x512.png already in place
mv "$ICONSET_DIR/icon_1024x1024.png" "$ICONSET_DIR/icon_512x512@2x.png"

# Clean up intermediate files
rm -f "$ICONSET_DIR/_resized_824.png" "$ICONSET_DIR/_padded_1024.png"

# Generate .icns
iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT"

# Clean up iconset directory
rm -rf "$ICONSET_DIR"

echo "Generated: $OUTPUT"
echo "Icon has proper macOS padding (content at ~80% of canvas)."

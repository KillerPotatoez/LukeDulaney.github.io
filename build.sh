#!/bin/sh
# Assembles the public site into dist/.
#
# This exists for two reasons, both of which are about what must NOT ship:
#   1. ARCHITECTURE.md and DEPLOY.md are internal. Deploying the repo root
#      would publish the commercial and IP notes at a guessable URL.
#   2. Portfolio.html is unrelated to this tool and must not appear on the
#      publisher's domain.
# Everything public is listed explicitly below. Nothing is copied by wildcard
# over a whole directory, so a new file is never published by accident.
#
# It also stamps the service worker's cache name with a hash of the files it
# precaches, so the version bump that invalidates returning users' caches
# happens automatically instead of being a step someone remembers.

set -eu

SRC="tools/bone-age"
OUT="dist/tools/bone-age"

rm -rf dist
mkdir -p "$OUT"

# --- public app files, listed one by one on purpose ---
cp "$SRC/index.html"             "$OUT/"
cp "$SRC/manifest.webmanifest"   "$OUT/"
cp "$SRC/icon-192.png"           "$OUT/"
cp "$SRC/icon-512.png"           "$OUT/"
cp "$SRC/icon-maskable-512.png"  "$OUT/"
cp "$SRC/apple-touch-icon.png"   "$OUT/"

# --- headers and redirects belong at the output ROOT, not beside the app ---
cp _headers   dist/
cp _redirects dist/

# --- stamp the service worker with a content hash of everything it precaches ---
VERSION=$(cat "$OUT/index.html" "$OUT/manifest.webmanifest" "$OUT"/*.png \
          | sha256sum | cut -c1-12)
sed "s/__CACHE_VERSION__/$VERSION/" "$SRC/sw.js" > "$OUT/sw.js"

if grep -q "__CACHE_VERSION__" "$OUT/sw.js"; then
  echo "build.sh: FAILED to stamp the cache version" >&2
  exit 1
fi

echo "built dist/  (service worker cache: boneage-$VERSION)"

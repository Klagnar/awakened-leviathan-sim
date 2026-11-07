#!/usr/bin/env bash
# Site build: the beta SDK, the pinned cache reader, the cache assets, then the site.
# The OpenRS2 cache (213 MB) is downloaded on a cold build and reused when the build cache keeps it.
set -euo pipefail

OSRS_CACHE_READER_REPO="${OSRS_CACHE_READER_REPO:-https://github.com/Julian-Dasilva/osrscachereader.git}"
OSRS_CACHE_READER_COMMIT="${OSRS_CACHE_READER_COMMIT:-8ba9131f1afd1193e7c6180db5a895ffe9e21fa8}"

cd "$(dirname "$0")/.."
CACHE_ROOT="${LEVIATHAN_BUILD_CACHE:-$PWD/node_modules/.cache/leviathan-build}"
READER="${CACHE_ROOT}/osrscachereader-${OSRS_CACHE_READER_COMMIT}"
mkdir -p "${CACHE_ROOT}"

if [[ -d "${READER}/node_modules" ]]; then
  echo "build: reusing cache reader ${OSRS_CACHE_READER_COMMIT}"
else
  echo "build: installing cache reader ${OSRS_CACHE_READER_REPO} at ${OSRS_CACHE_READER_COMMIT}"
  rm -rf "${READER}"
  git init --quiet "${READER}"
  git -C "${READER}" fetch --quiet --depth 1 "${OSRS_CACHE_READER_REPO}" "${OSRS_CACHE_READER_COMMIT}"
  git -C "${READER}" checkout --quiet FETCH_HEAD
  (cd "${READER}" && npm ci --no-audit --no-fund)
fi

scripts/install-beta-sdk.sh
npm run assets -- --cache-dir "${CACHE_ROOT}/openrs2" --reader-path "${READER}"
npm run build

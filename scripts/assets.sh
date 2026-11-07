#!/usr/bin/env bash
set -euo pipefail

# Windows path fix and missing-sound tolerance for the beta asset tool (idempotent).
node "$(dirname "$0")/patch-sdk-assets.mjs"
osrs-sdk-assets build "$@"
npm run --silent item-icons -- "$@"

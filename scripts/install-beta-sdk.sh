#!/usr/bin/env bash
set -euo pipefail

OSRS_SDK_REPO="${OSRS_SDK_REPO:-https://github.com/OldSchoolSDK/osrs-sdk.git}"
OSRS_SDK_COMMIT="${OSRS_SDK_COMMIT:-c7d9693ab2d6dacb533506700b46987525869410}"
OSRS_SDK_PACKS="${OSRS_SDK_PACKS:-}"

cd "$(dirname "$0")/.."

if [[ -n "${OSRS_SDK_PACKS}" ]]; then
  packs="${OSRS_SDK_PACKS}"
  echo "install-beta-sdk: using prebuilt packs from ${packs}"
else
  work="$(mktemp -d)"
  packs="${work}/packs"
  mkdir -p "${packs}"
  echo "install-beta-sdk: building ${OSRS_SDK_REPO} at ${OSRS_SDK_COMMIT}"
  git init --quiet "${work}/osrs-sdk"
  git -C "${work}/osrs-sdk" fetch --quiet --depth 1 "${OSRS_SDK_REPO}" "${OSRS_SDK_COMMIT}"
  git -C "${work}/osrs-sdk" checkout --quiet FETCH_HEAD
  # Local fixes to the pinned SDK (patches/README.md says what each one does).
  for patch in patches/osrs-sdk-*.patch; do
    [[ -f "${patch}" ]] || continue
    echo "install-beta-sdk: applying ${patch}"
    git -C "${work}/osrs-sdk" apply --whitespace=nowarn "${PWD}/${patch}"
  done
  (
    cd "${work}/osrs-sdk"
    npm ci --no-audit --no-fund
    npm run build
    npm pack --pack-destination "${packs}" --silent
    npm pack --workspace osrs-sdk-assets --pack-destination "${packs}" --silent
    npm pack --workspace osrs-sdk-react --pack-destination "${packs}" --silent
  )
fi

pack() {
  local matches=("${packs}"/$1)
  if [[ ${#matches[@]} -ne 1 || ! -f "${matches[0]}" ]]; then
    echo "install-beta-sdk: expected exactly one ${packs}/$1" >&2
    exit 1
  fi
  echo "${matches[0]}"
}

npm install --no-save --no-audit --no-fund \
  "$(pack 'osrs-sdk-[0-9]*.tgz')" \
  "$(pack 'osrs-sdk-assets-*.tgz')" \
  "$(pack 'osrs-sdk-react-*.tgz')"
node -p '"install-beta-sdk: osrs-sdk " + require("osrs-sdk/package.json").version + ", osrs-sdk-react " + require("osrs-sdk-react/package.json").version'

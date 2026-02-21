#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing dependencies"
npm install -g pnpm
pnpm install --frozen-lockfile

echo "==> Building TypeScript"
pnpm run build

echo "==> Installing Foundry into project directory"
export FOUNDRY_DIR="$(pwd)/.foundry"
mkdir -p "$FOUNDRY_DIR"
curl -L https://foundry.paradigm.xyz | bash
export PATH="$HOME/.foundry/bin:$PATH"
FOUNDRY_INSTALL_DIR="$FOUNDRY_DIR" foundryup
cp -f "$HOME/.foundry/bin/forge" "$FOUNDRY_DIR/forge" 2>/dev/null || true
cp -f "$HOME/.foundry/bin/cast" "$FOUNDRY_DIR/cast" 2>/dev/null || true
chmod +x "$FOUNDRY_DIR/forge" "$FOUNDRY_DIR/cast"
"$FOUNDRY_DIR/forge" --version
echo "==> Foundry installed at: $FOUNDRY_DIR/forge"

echo "==> Patching 0G SDK (npm v0.3.3 has stale flow contract ABI)"
git clone --depth 1 https://github.com/0gfoundation/0g-ts-sdk.git /tmp/0g-sdk-patch
cd /tmp/0g-sdk-patch
npm install --ignore-scripts
npx tsc -b tsconfig.esm.json tsconfig.commonjs.json tsconfig.types.json
echo '{"type":"commonjs"}' > lib.commonjs/package.json
echo '{"type":"module"}' > lib.esm/package.json
cd -

SDK_DIR=$(find node_modules -path '*/@0glabs/0g-ts-sdk' -type d | head -1)
echo "==> Patching SDK at: $SDK_DIR"
rm -rf "$SDK_DIR/lib.esm" "$SDK_DIR/lib.commonjs" "$SDK_DIR/types"
cp -R /tmp/0g-sdk-patch/lib.esm "$SDK_DIR/lib.esm"
cp -R /tmp/0g-sdk-patch/lib.commonjs "$SDK_DIR/lib.commonjs"
cp -R /tmp/0g-sdk-patch/types "$SDK_DIR/types"
rm -rf /tmp/0g-sdk-patch

echo "==> Build complete"

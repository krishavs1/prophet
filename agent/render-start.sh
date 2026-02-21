#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORGE="$SCRIPT_DIR/.foundry/forge"

if [ -x "$FORGE" ]; then
  export FORGE_PATH="$FORGE"
  export PATH="$SCRIPT_DIR/.foundry:$PATH"
  echo "[start] FORGE_PATH=$FORGE_PATH"
  "$FORGE" --version
else
  echo "[start] WARNING: forge not found at $FORGE"
  ls -la "$SCRIPT_DIR/.foundry/" 2>/dev/null || echo "[start] .foundry dir does not exist"
fi

exec node dist/src/index.js

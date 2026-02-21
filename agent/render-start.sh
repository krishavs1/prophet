#!/usr/bin/env bash

# Source the forge path saved during build
if [ -f /opt/render/project/src/agent/.forge-env ]; then
  source /opt/render/project/src/agent/.forge-env
  export FORGE_PATH
  export PATH="$FOUNDRY_DIR:$PATH"
  echo "[start] FORGE_PATH=$FORGE_PATH"
fi

exec node dist/src/index.js

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[prophet] Building prophet-forge Docker image..."
docker build -t prophet-forge -f "$SCRIPT_DIR/Dockerfile.forge" "$SCRIPT_DIR"
echo "[prophet] Done. Image: prophet-forge"

#!/usr/bin/env bash
# Download Qdrant binary for the current platform
# Usage: ./scripts/download-qdrant.sh [version]

set -euo pipefail

QDRANT_VERSION="${1:-v1.17.0}"
VENDOR_DIR="vendor/qdrant"

# Detect OS and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) PLATFORM="aarch64-apple-darwin" ; TARGET_DIR="darwin-arm64" ;;
      x86_64) PLATFORM="x86_64-apple-darwin" ; TARGET_DIR="darwin-x64" ;;
      *) echo "Unsupported macOS arch: $ARCH" ; exit 1 ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64) PLATFORM="x86_64-unknown-linux-musl" ; TARGET_DIR="linux-x64" ;;
      aarch64) PLATFORM="aarch64-unknown-linux-musl" ; TARGET_DIR="linux-arm64" ;;
      *) echo "Unsupported Linux arch: $ARCH" ; exit 1 ;;
    esac
    ;;
  *)
    echo "Unsupported OS: $OS" ; exit 1 ;;
esac

DOWNLOAD_URL="https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-${PLATFORM}.tar.gz"
DEST="${VENDOR_DIR}/${TARGET_DIR}"

echo "==> Downloading Qdrant ${QDRANT_VERSION} for ${TARGET_DIR}..."
echo "    URL: ${DOWNLOAD_URL}"

mkdir -p "$DEST"

# Download and extract
curl -fSL "$DOWNLOAD_URL" | tar xz -C "$DEST"

# Verify binary exists
if [ -f "${DEST}/qdrant" ]; then
  chmod +x "${DEST}/qdrant"
  echo "==> Qdrant binary ready: ${DEST}/qdrant"
  "${DEST}/qdrant" --version 2>/dev/null || true
else
  echo "ERROR: qdrant binary not found after extraction"
  exit 1
fi

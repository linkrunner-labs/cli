#!/bin/sh
set -e

REPO="linkrunner-labs/cli"
INSTALL_DIR="/usr/local/bin"
FALLBACK_DIR="$HOME/.local/bin"

# --- Helpers ---

command_exists() {
  command -v "$1" > /dev/null 2>&1
}

download() {
  url="$1"
  dest="$2"
  if command_exists curl; then
    curl -fsSL "$url" -o "$dest"
  elif command_exists wget; then
    wget -qO "$dest" "$url"
  else
    echo "Error: curl or wget is required to download files."
    exit 1
  fi
}

verify_checksum() {
  file="$1"
  expected_hash="$2"
  if command_exists sha256sum; then
    actual_hash=$(sha256sum "$file" | awk '{print $1}')
  elif command_exists shasum; then
    actual_hash=$(shasum -a 256 "$file" | awk '{print $1}')
  else
    echo "Warning: sha256sum/shasum not found, skipping checksum verification."
    return 0
  fi

  if [ "$actual_hash" != "$expected_hash" ]; then
    echo "Error: Checksum verification failed."
    echo "  Expected: $expected_hash"
    echo "  Actual:   $actual_hash"
    rm -f "$file"
    exit 1
  fi
}

# --- Detect platform ---

OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) BINARY="lr-darwin-arm64" ;;
      x86_64) BINARY="lr-darwin-x64" ;;
      *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64) BINARY="lr-linux-x64" ;;
      aarch64|arm64) BINARY="lr-linux-arm64" ;;
      *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

echo "Detected platform: ${OS} ${ARCH} -> ${BINARY}"

# --- Check existing installation ---

if command_exists lr; then
  CURRENT_VERSION=$(lr --version 2>/dev/null || echo "unknown")
  echo "Linkrunner CLI already installed (version: $CURRENT_VERSION). Updating..."
fi

# --- Get latest version ---

echo "Fetching latest release..."
if command_exists curl; then
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
elif command_exists wget; then
  VERSION=$(wget -qO- "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
fi

if [ -z "$VERSION" ]; then
  echo "Error: Could not determine latest version."
  exit 1
fi

echo "Latest version: $VERSION"

# --- Download binary and checksums ---

DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/$BINARY"
CHECKSUMS_URL="https://github.com/$REPO/releases/download/$VERSION/checksums.txt"
TMP_FILE=$(mktemp)
TMP_CHECKSUMS=$(mktemp)

echo "Downloading ${BINARY}..."
download "$DOWNLOAD_URL" "$TMP_FILE"
download "$CHECKSUMS_URL" "$TMP_CHECKSUMS"

# --- Verify checksum ---

EXPECTED_HASH=$(grep "$BINARY" "$TMP_CHECKSUMS" | awk '{print $1}')
if [ -n "$EXPECTED_HASH" ]; then
  echo "Verifying checksum..."
  verify_checksum "$TMP_FILE" "$EXPECTED_HASH"
  echo "Checksum verified."
else
  echo "Warning: Could not find checksum for $BINARY, skipping verification."
fi

rm -f "$TMP_CHECKSUMS"

# --- Install ---

chmod +x "$TMP_FILE"

if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP_FILE" "$INSTALL_DIR/lr"
  echo "Installed to $INSTALL_DIR/lr"
elif command_exists sudo; then
  sudo mv "$TMP_FILE" "$INSTALL_DIR/lr"
  echo "Installed to $INSTALL_DIR/lr (with sudo)"
else
  # Fallback to ~/.local/bin
  mkdir -p "$FALLBACK_DIR"
  mv "$TMP_FILE" "$FALLBACK_DIR/lr"
  echo "Installed to $FALLBACK_DIR/lr"

  # Check if fallback dir is in PATH
  case ":$PATH:" in
    *":$FALLBACK_DIR:"*) ;;
    *)
      echo ""
      echo "Add $FALLBACK_DIR to your PATH:"
      echo "  echo 'export PATH=\"$FALLBACK_DIR:\$PATH\"' >> ~/.bashrc"
      echo "  source ~/.bashrc"
      ;;
  esac
fi

# --- Verify ---

if command_exists lr; then
  echo ""
  lr --version
  echo "Linkrunner CLI installed successfully!"
else
  echo ""
  echo "Installation complete. Restart your shell or run:"
  echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
fi

#!/bin/bash
# batlimit — uninstall script
# Removes all installed components.

set -e

EXT_DIR="$HOME/.local/share/gnome-shell/extensions/batlimit@fahrul.id"

echo "==> Disabling extension..."
gnome-extensions disable "batlimit@fahrul.id" 2>/dev/null || true

echo "==> Removing extension files..."
rm -rf "$EXT_DIR"

echo "==> Removing helper script (needs sudo)..."
sudo rm -f /usr/local/bin/batlimit-set

echo "==> Removing sudoers entry..."
sudo rm -f /etc/sudoers.d/batlimit

echo ""
echo "=== Uninstall complete ==="
echo ""
echo "The extension has been removed. Changes take effect after"
echo "logging out and back in, or restarting GNOME Shell."

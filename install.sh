#!/bin/bash
# batlimit — fresh install setup script
# Run once after cloning the extension repo.

set -e

EXT_DIR="$HOME/.local/share/gnome-shell/extensions/batlimit@fahrul.id"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
UUID="batlimit@fahrul.id"

echo "==> Installing extension (copying files)..."
mkdir -p "$EXT_DIR"
cp -r "$PROJECT_DIR"/{extension.js,prefs.js,metadata.json,stylesheet.css,LICENSE,README.md,install.sh,schemas} "$EXT_DIR"/

echo "==> Compiling GSettings schema..."
glib-compile-schemas "$EXT_DIR/schemas/"

echo "==> Installing helper script (needs sudo)..."
sudo tee /usr/local/bin/batlimit-set > /dev/null <<'HELPER'
#!/bin/bash
set -e
echo "$1" > /sys/class/power_supply/BAT0/charge_control_end_threshold
HELPER
sudo chmod +x /usr/local/bin/batlimit-set

echo "==> Adding sudoers NOPASSWD entry..."
echo "$USER ALL=(ALL) NOPASSWD: /usr/local/bin/batlimit-set" | sudo tee /etc/sudoers.d/batlimit > /dev/null
sudo chmod 440 /etc/sudoers.d/batlimit

echo "==> Adding to enabled-extensions list..."
CURRENT=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo "@as []")
if echo "$CURRENT" | grep -q "$UUID"; then
    echo "  already enabled"
elif [ "$CURRENT" = "@as []" ]; then
    gsettings set org.gnome.shell enabled-extensions "['$UUID']"
    echo "  done (first extension)"
else
    NEW=$(echo "$CURRENT" | sed "s/\]\$/, '$UUID'\]/")
    gsettings set org.gnome.shell enabled-extensions "$NEW"
    echo "  done"
fi

echo "==> Restarting GNOME Shell to load the extension..."
busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s \
  'Meta.restart("Restarting...")' 2>/dev/null || \
  echo "  (auto-restart failed — log out and back in)"

echo ""
echo "=== Setup complete ==="
echo ""
echo "GNOME Shell is restarting. You'll be back at the login"
echo "screen briefly — log in and open Quick Settings."
echo "The slider will appear below brightness."

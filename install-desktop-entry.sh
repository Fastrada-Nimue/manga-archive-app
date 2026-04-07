#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/manga-archive-app.desktop"

mkdir -p "$DESKTOP_DIR"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Manga Archive
Comment=Open local Manga Archive app
Exec="$APP_DIR/launch-app.sh"
Terminal=false
Categories=Utility;
EOF

chmod 644 "$DESKTOP_FILE"

echo "Launcher installed: $DESKTOP_FILE"
echo "You may need to log out and back in for it to appear in some desktop menus."

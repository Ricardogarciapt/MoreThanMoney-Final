#!/bin/bash
# Instala a app «MTM Conteúdo» no Mac: copia o servidor, o painel e o motor para
# ~/Library/Application Support/MTM Conteudo/app e cria ~/Applications/MTM Conteúdo.app
# (duplo clique → arranca o servidor local e abre o painel em http://127.0.0.1:4747).
#
#   bash instalar.sh              instala/actualiza
#   bash instalar.sh --arranque   e também arranca sozinha quando entras no Mac (LaunchAgent)
#
# Corre a partir da pasta do repositório (services/conteudo-magnetico-app) ou com os ficheiros
# ao lado. Precisa de Node 18+ (o resto — ffmpeg, vozes — instala-se a partir do painel).
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
DESTINO="$HOME/Library/Application Support/MTM Conteudo/app"
APP="$HOME/Applications/MTM Conteúdo.app"
NODE="$(command -v node || true)"
for c in /opt/homebrew/bin/node /usr/local/bin/node; do [ -z "$NODE" ] && [ -x "$c" ] && NODE="$c"; done
if [ -z "$NODE" ]; then echo "Falta o Node: brew install node"; exit 1; fi

MOTOR="$AQUI/motor.mjs"
[ -f "$MOTOR" ] || MOTOR="$AQUI/../conteudo-magnetico-render/motor.mjs"
LOGO="$AQUI/../../public/logo-mtm-transparent.png"

mkdir -p "$DESTINO" "$APP/Contents/MacOS" "$APP/Contents/Resources" "$HOME/Applications"
cp "$AQUI/servidor.mjs" "$AQUI/painel.html" "$DESTINO/"
cp "$MOTOR" "$DESTINO/motor.mjs"
[ -f "$LOGO" ] && cp "$LOGO" "$DESTINO/logo.png" || true

cat > "$APP/Contents/MacOS/MTM-Conteudo" <<EOF
#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:\$HOME/.local/bin:\$PATH"
cd "$DESTINO"
nohup "$NODE" servidor.mjs --abrir >> "$DESTINO/../app.log" 2>&1 &
EOF
chmod +x "$APP/Contents/MacOS/MTM-Conteudo"

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>MTM Conteúdo</string>
  <key>CFBundleDisplayName</key><string>MTM Conteúdo</string>
  <key>CFBundleIdentifier</key><string>pt.morethanmoney.conteudo</string>
  <key>CFBundleExecutable</key><string>MTM-Conteudo</string>
  <key>CFBundleIconFile</key><string>icone</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>
EOF

# Ícone a partir do logótipo (se o sips/iconutil existirem; sem ícone a app funciona na mesma).
if [ -f "$DESTINO/logo.png" ] && command -v iconutil >/dev/null; then
  SET="$(mktemp -d)/icone.iconset"; mkdir -p "$SET"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$DESTINO/logo.png" --out "$SET/icon_${s}x${s}.png" >/dev/null 2>&1 || true
    sips -z $((s*2)) $((s*2)) "$DESTINO/logo.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null 2>&1 || true
  done
  iconutil -c icns "$SET" -o "$APP/Contents/Resources/icone.icns" 2>/dev/null || true
fi

if [ "${1:-}" = "--arranque" ]; then
  PL="$HOME/Library/LaunchAgents/pt.morethanmoney.conteudo.plist"
  cat > "$PL" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>pt.morethanmoney.conteudo</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DESTINO/servidor.mjs</string></array>
  <key>WorkingDirectory</key><string>$DESTINO</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>Nice</key><integer>5</integer>
  <key>StandardOutPath</key><string>$DESTINO/../app.log</string>
  <key>StandardErrorPath</key><string>$DESTINO/../app.log</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
</dict></plist>
EOF
  launchctl unload "$PL" 2>/dev/null || true
  launchctl load "$PL"
  echo "Arranque automático ligado."
fi

echo "Instalada: $APP"
echo "Abre com duplo clique (ou: open \"$APP\"). Painel: http://127.0.0.1:4747"

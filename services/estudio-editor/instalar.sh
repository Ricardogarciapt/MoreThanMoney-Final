#!/bin/zsh
# Instala o EDITOR DO ESTÚDIO no Mac (launchd, prioridade baixa). Corre-se a partir do repositório:
#   zsh services/estudio-editor/instalar.sh
# Reaproveita o CRON_SECRET do cortador do Mac (~/.mtm-videocliper/env) se existir.
# Parar:   launchctl bootout gui/$(id -u)/pt.morethanmoney.estudio-editor
# Registo: ~/Library/Logs/mtm-estudio-editor.log
set -eu
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$HOME/.mtm-estudio-editor"
ROTULO="pt.morethanmoney.estudio-editor"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
LOG="$HOME/Library/Logs/mtm-estudio-editor.log"
command -v ffmpeg >/dev/null || { echo "Falta o ffmpeg (brew install ffmpeg)"; exit 1; }
NODE="$(command -v node)"; [ -n "$NODE" ] || { echo "Falta o node (brew install node)"; exit 1; }
mkdir -p "$DEST"; chmod 700 "$DEST"
cp "$REPO/services/estudio-editor/editor.mjs" "$DEST/editor.mjs"
if [ ! -f "$DEST/env" ]; then
  SEG=""
  # O env do cortador escreve «export CRON_SECRET=…», às vezes com aspas.
  [ -f "$HOME/.mtm-videocliper/env" ] && SEG="$(grep -E '^(export )?CRON_SECRET=' "$HOME/.mtm-videocliper/env" | head -1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']\$//")"
  if [ -z "$SEG" ]; then
    [ -t 0 ] || { echo "Falta o CRON_SECRET e não há terminal para o pedir."; exit 1; }
    printf "CRON_SECRET: "; read -rs SEG; echo
  fi
  umask 077; printf 'CRON_SECRET=%s\n' "$SEG" > "$DEST/env"
fi
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$ROTULO</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>-c</string>
    <string>set -a; source "$DEST/env"; set +a; export PATH="$(dirname "$NODE"):$(dirname "$(command -v ffmpeg)"):/usr/bin:/bin"; exec "$NODE" "$DEST/editor.mjs"</string></array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>Nice</key><integer>15</integer><key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>$LOG</string><key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✓ Editor do estúdio a correr. Registo: $LOG"

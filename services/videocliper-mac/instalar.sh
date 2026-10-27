#!/bin/zsh
# O CORTADOR DO MAC — o videocliper a correr no Mac, para as aulas do YouTube.
#
# O YouTube recusa descargas de servidores («confirma que não és um robô»); do IP de casa passa.
# Por isso as aulas das playlists são descarregadas, transcritas e cortadas AQUI, pelo mesmo
# worker do VPS (deploy/vps-stream/videocliper), com VIDEOCLIPER_YOUTUBE=1. Só os clips prontos
# (uns MB) saem do Mac; a aula inteira vive numa pasta temporária e é apagada no fim.
#
# Corre-se UMA vez, a partir da pasta do repositório:
#   zsh services/videocliper-mac/instalar.sh
# Volta a correr-se para actualizar o worker depois de um `git pull` (não pede o segredo de novo).
#
# Fica a correr sozinho (launchd) sempre que o Mac está ligado, com prioridade baixa.
# Parar:  launchctl bootout gui/$(id -u)/pt.morethanmoney.videocliper
# Registo: ~/Library/Logs/mtm-videocliper.log
set -eu

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$HOME/.mtm-videocliper"
ENV_F="$DEST/env"
ROTULO="pt.morethanmoney.videocliper"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
LOG="$HOME/Library/Logs/mtm-videocliper.log"

echo "→ dependências (Homebrew: ffmpeg, yt-dlp, node)"
command -v brew >/dev/null || { echo "Falta o Homebrew: https://brew.sh"; exit 1; }
for p in ffmpeg yt-dlp node python@3.12; do brew list --formula "$p" >/dev/null 2>&1 || brew install "$p"; done
brew upgrade yt-dlp >/dev/null 2>&1 || true   # o YouTube muda; o yt-dlp acompanha

echo "→ transcrição local (faster-whisper, sem custo)"
mkdir -p "$DEST"
# O python do macOS (3.9) não tem rodas do PyAV: obrigava a compilar e falhava. O do Homebrew tem.
PY="$(brew --prefix python@3.12)/bin/python3.12"
if [[ -x "$DEST/venv/bin/python3" ]] && ! "$DEST/venv/bin/python3" -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
  rm -rf "$DEST/venv"
fi
[[ -x "$DEST/venv/bin/python3" ]] || "$PY" -m venv "$DEST/venv"
"$DEST/venv/bin/pip" install -q --upgrade pip faster-whisper numpy

echo "→ worker"
rm -rf "$DEST/worker"
cp -R "$REPO/deploy/vps-stream/videocliper" "$DEST/worker"
mkdir -p "$HOME/Library/Fonts"
cp -n "$DEST/worker/fonts/"*.ttf "$HOME/Library/Fonts/" 2>/dev/null || true

if [[ ! -f "$ENV_F" ]]; then
  SEGREDO=""
  # A antiga ponte do Mac já guardava o segredo do worker; aproveita-se.
  [[ -f "$HOME/.mtm-ponte.env" ]] && SEGREDO="$(grep -E '^(export )?LMS_CAPTION_WORKER_SECRET=' "$HOME/.mtm-ponte.env" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  if [[ -z "$SEGREDO" ]]; then
    echo ""
    echo "Cola o CRON_SECRET (Vercel → morethanmoney → Settings → Environment Variables)."
    echo "Não aparece no ecrã enquanto escreves."
    read -rs "SEGREDO?CRON_SECRET: "
    echo ""
  fi
  [[ -n "$SEGREDO" ]] || { echo "Sem segredo não há cortador."; exit 1; }
  umask 077
  cat > "$ENV_F" <<EOF
export MTM_API_BASE="https://www.morethanmoney.pt"
export CRON_SECRET="$SEGREDO"
export VIDEOCLIPER_YOUTUBE=1
export WORKER_NAME="mac-$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
export ASR_LOCAL_MODELO=small
export POLL_SECONDS=60
EOF
  chmod 600 "$ENV_F"
fi

echo "→ arranque automático (launchd)"
NODE="$(command -v node)"
BREW_BIN="$(dirname "$(command -v ffmpeg)")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ROTULO</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string><string>-c</string>
    <string>source "$ENV_F"; export YTDLP_BIN="$BREW_BIN/yt-dlp"; export PATH="$DEST/venv/bin:$BREW_BIN:/usr/bin:/bin"; exec "$NODE" "$DEST/worker/videocliper-worker.js"</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>ProcessType</key><string>Background</string>
  <key>Nice</key><integer>10</integer>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 5
echo ""
echo "✓ Cortador instalado. Últimas linhas do registo:"
tail -5 "$LOG" 2>/dev/null || true
echo ""
echo "No painel (morethanmoney.pt/admin/videocliper) deve aparecer «Cortador do Mac ligado»."

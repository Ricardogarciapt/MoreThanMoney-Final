#!/bin/zsh
# O SOCIAL DO MAC: comentários do radar todos os dias e stories com storytelling às segundas.
#
# Corre-se UMA vez, a partir da pasta do repositório (o mesmo clone do cortador serve):
#   zsh services/social-mac/instalar.sh
# No fim abre-se uma janela do Instagram: inicia sessão como @morethanmoney.pt e fecha-a.
# Volta a correr-se depois de um `git pull` para actualizar (não pede nada de novo).
#
# Parar:   launchctl bootout gui/$(id -u)/pt.morethanmoney.comentarios
#          launchctl bootout gui/$(id -u)/pt.morethanmoney.stories
# Registo: ~/Library/Logs/mtm-social.log
set -eu

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$HOME/.mtm-social"
ENV_F="$DEST/env"
LOG="$HOME/Library/Logs/mtm-social.log"
mkdir -p "$DEST"

echo "→ dependências (Homebrew: ffmpeg, node, python)"
command -v brew >/dev/null || { echo "Falta o Homebrew: https://brew.sh"; exit 1; }
for p in ffmpeg node python@3.12; do brew list --formula "$p" >/dev/null 2>&1 || brew install "$p"; done
PY="$(brew --prefix python@3.12)/bin/python3.12"
[[ -x "$DEST/venv/bin/python3" ]] || "$PY" -m venv "$DEST/venv"
"$DEST/venv/bin/pip" install -q --upgrade pip numpy scipy

echo "→ Playwright (browser próprio, com perfil separado do teu Chrome)"
cd "$DEST"
[[ -f package.json ]] || echo '{"private":true}' > package.json
npm install --silent playwright@1.49.1
npx playwright install chromium

if [[ ! -f "$ENV_F" ]]; then
  SEGREDO=""
  [[ -f "$HOME/.mtm-videocliper/env" ]] && SEGREDO="$(grep -E '^export CRON_SECRET=' "$HOME/.mtm-videocliper/env" | cut -d= -f2- | tr -d '"' || true)"
  if [[ -z "$SEGREDO" ]]; then
    read -rs "SEGREDO?CRON_SECRET (Vercel → Settings → Environment Variables): "; echo ""
  fi
  FISH="$(grep -E '^FISH_API_KEY=' "/Volumes/Disco externo/Ollama para a MTM/MTM-Videoframes-projetos/educador-estrategias/.env.local" 2>/dev/null | cut -d= -f2- | tr -d '"'"'" || true)"
  [[ -n "$FISH" ]] || { read -rs "FISH?FISH_API_KEY (fish.audio): "; echo ""; }
  umask 077
  cat > "$ENV_F" <<EOT
export MTM_API_BASE="https://www.morethanmoney.pt"
export CRON_SECRET="$SEGREDO"
export FISH_API_KEY="$FISH"
export COMENTARIOS_MAX_DIA=8
EOT
  chmod 600 "$ENV_F"
fi

NODE="$(command -v node)"
BREW_BIN="$(dirname "$(command -v ffmpeg)")"
agente() { # rótulo, script, calendário (dict)
  local PLIST="$HOME/Library/LaunchAgents/$1.plist"
  cat > "$PLIST" <<EOT
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string><string>-c</string>
    <string>source "$ENV_F"; export NODE_PATH="$DEST/node_modules"; export PATH="$DEST/venv/bin:$BREW_BIN:/usr/bin:/bin"; git -C "$REPO" pull -q --ff-only || true; exec "$NODE" "$REPO/services/social-mac/$2"</string>
  </array>
  <key>StartCalendarInterval</key>$3
  <key>ProcessType</key><string>Background</string>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOT
  launchctl bootout "gui/$(id -u)/$1" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
}
echo "→ arranque automático (launchd)"
agente pt.morethanmoney.comentarios comentarios.mjs '<dict><key>Hour</key><integer>11</integer><key>Minute</key><integer>20</integer></dict>'
agente pt.morethanmoney.stories stories.mjs '<dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>30</integer></dict>'

if [[ ! -d "$DEST/perfil-instagram" ]]; then
  echo ""
  echo "→ Inicia sessão no Instagram como @morethanmoney.pt na janela que vai abrir, e fecha-a."
  source "$ENV_F"; NODE_PATH="$DEST/node_modules" "$NODE" "$REPO/services/social-mac/comentarios.mjs" --entrar
fi
echo ""
echo "✓ Instalado. Comentários todos os dias às 11:20; stories às segundas às 10:30."

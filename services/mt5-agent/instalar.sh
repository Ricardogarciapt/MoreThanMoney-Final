#!/bin/bash
#
# Instala o agente MT5 no Mac: guarda o token e põe-o a arrancar com o computador.
#
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$HOME/.mtm-agent.env"
PLIST="$HOME/Library/LaunchAgents/pt.morethanmoney.mt5agent.plist"

echo "── Agente MT5 · MoreThanMoney ──"
echo

if [ -f "$CONFIG" ]; then
  echo "Já existe $CONFIG — mantenho o token que lá está."
else
  read -r -p "Token do agente (o mesmo de MTMFUNDED_AGENT_SECRET na Vercel): " TOKEN
  if [ "${#TOKEN}" -lt 16 ]; then
    echo "Token demasiado curto: mínimo 16 caracteres. Um token curto adivinha-se." >&2
    exit 1
  fi
  umask 077   # o ficheiro tem um segredo: só o dono o lê
  cat > "$CONFIG" <<EOF
MTMFUNDED_AGENT_SECRET=$TOKEN
MTM_AGENT_SITE=https://www.morethanmoney.pt
MTM_AGENT_MODO=assistido
MTM_AGENT_INTERVALO=60
EOF
  chmod 600 "$CONFIG"
  echo "Guardado em $CONFIG (só tu o lês)."
fi

chmod +x "$DIR/agente.sh"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

# O modo assistido precisa de alguém a escrever no terminal, por isso o launchd instala-se
# a correr em modo de ESPERA: mantém-se vivo e avisa quando há pedidos, sem tentar preencher
# formulários sozinho. Passa a MTM_AGENT_MODO=auto quando o criar_conta.py estiver calibrado.
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>pt.morethanmoney.mt5agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$DIR/agente.sh</string>
    <string>correr</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>MTM_AGENT_ENV</key><string>$CONFIG</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/mtm-mt5-agent.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/mtm-mt5-agent.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo
echo "Instalado. O agente arranca com o Mac e levanta-se sozinho se morrer."
echo
echo "  $DIR/agente.sh uma-vez    # testar agora"
echo "  $DIR/agente.sh estado"
echo "  $DIR/agente.sh registos"
echo
echo "Para parar:  launchctl unload $PLIST"

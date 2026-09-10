#!/bin/bash
#
# Instala o agente MT5 do VPS como serviço: arranca com a máquina e levanta-se sozinho.
#
# Dois serviços, e não um: o ecrã virtual tem de estar de pé ANTES do agente. Juntá-los num
# só dava um agente a morrer no arranque porque o Xvfb ainda não existia, e o systemd a
# reiniciá-lo em ciclo sem nunca dizer porquê.
#
set -euo pipefail

DIR="/home/ubuntu/mtm-agent"
ENV="/home/ubuntu/.mtm-agent.env"

[ -f "$ENV" ] || { echo "Falta $ENV com MTMFUNDED_AGENT_SECRET." >&2; exit 1; }

# ── ecrã virtual ─────────────────────────────────────────────────────────────
sudo tee /etc/systemd/system/mtm-xvfb.service >/dev/null <<'EOF'
[Unit]
Description=MTM · ecrã virtual para o MetaTrader
After=network.target

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/bin/Xvfb :99 -screen 0 1440x900x24 -nolisten tcp
Restart=always
RestartSec=5
Nice=10

[Install]
WantedBy=multi-user.target
EOF

# ── agente ───────────────────────────────────────────────────────────────────
sudo tee /etc/systemd/system/mtm-mt5-agent.service >/dev/null <<EOF
[Unit]
Description=MTM · agente de criação de contas MT5
After=network-online.target mtm-xvfb.service
Requires=mtm-xvfb.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$DIR
EnvironmentFile=$ENV
Environment=DISPLAY=:99
Environment=WINEPREFIX=/home/ubuntu/.mt5
Environment=WINEDEBUG=-all
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 $DIR/agente.py correr
Restart=always
RestartSec=20
# Prioridade baixa: este VPS também transmite, e o que se estraga na transmissão não se
# recupera. O agente pode esperar; quem está a ver não.
Nice=15
CPUWeight=20

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mtm-xvfb.service
sleep 3
sudo systemctl enable --now mtm-mt5-agent.service
sleep 3

echo "── estado ──"
systemctl is-active mtm-xvfb.service mtm-mt5-agent.service | tr '\n' ' '
echo
echo
echo "Registos:  journalctl -u mtm-mt5-agent -f"

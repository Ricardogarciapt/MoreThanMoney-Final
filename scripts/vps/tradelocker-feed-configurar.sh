#!/usr/bin/env bash
# Liga o feed de preços TradeLocker do motor MTM Funded (índices, energia, ações — o que não tem
# outra fonte sem MetaApi). Corre no Mac; pede as credenciais (a password não aparece no ecrã nem
# fica no histórico), valida o login, deixa escolher a conta, grava em /etc/mtm-funded-motor.env
# na VPS (root, 600), instala o motor compilado e reinicia.
#
# Uso: bash scripts/vps/tradelocker-feed-configurar.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

read -rp "Email da conta TradeLocker: " TL_EMAIL
read -rsp "Password TradeLocker (não aparece): " TL_PASS; echo
read -rp "Servidor TradeLocker (o que aparece no login, ex.: PUPrime-Demo): " TL_SERVER
read -rp "Ambiente — demo ou live [demo]: " TL_ENV; TL_ENV=${TL_ENV:-demo}
[[ "$TL_ENV" == "demo" || "$TL_ENV" == "live" ]] || { echo "Ambiente tem de ser demo ou live"; exit 1; }
BASE="https://${TL_ENV}.tradelocker.com/backend-api"

# login (credenciais passam por variáveis de ambiente, nunca por argumentos visíveis no ps)
TOKEN=$(TL_EMAIL="$TL_EMAIL" TL_PASS="$TL_PASS" TL_SERVER="$TL_SERVER" python3 - "$BASE" <<'PY'
import json, os, sys, urllib.request
req = urllib.request.Request(sys.argv[1] + "/auth/jwt/token", method="POST",
    data=json.dumps({"email": os.environ["TL_EMAIL"], "password": os.environ["TL_PASS"], "server": os.environ["TL_SERVER"]}).encode(),
    headers={"Content-Type": "application/json"})
try:
    print(json.load(urllib.request.urlopen(req, timeout=20)).get("accessToken", ""))
except Exception as e:
    print("", end=""); sys.stderr.write(f"login falhou: {e}\n")
PY
)
[ -n "$TOKEN" ] || { echo "✗ Login TradeLocker falhou — confirma email, password, servidor e ambiente."; exit 1; }
echo "✓ Login TradeLocker OK"

CONTAS=$(TOKEN="$TOKEN" python3 - "$BASE" <<'PY'
import json, os, sys, urllib.request
req = urllib.request.Request(sys.argv[1] + "/auth/jwt/all-accounts", headers={"Authorization": "Bearer " + os.environ["TOKEN"]})
for a in json.load(urllib.request.urlopen(req, timeout=20)).get("accounts", []):
    print(f'{a.get("id")}\t{a.get("accNum")}\t{a.get("name","")}\t{a.get("currency","")}\t{a.get("status","")}')
PY
)
[ -n "$CONTAS" ] || { echo "✗ A conta não tem contas de negociação"; exit 1; }
echo; echo "Contas disponíveis:"; echo "$CONTAS" | awk -F'\t' '{printf "  %d) id %s · accNum %s · %s %s %s\n", NR, $1, $2, $3, $4, $5}'
read -rp "Qual usar para os preços [1]: " N; N=${N:-1}
LINHA=$(echo "$CONTAS" | sed -n "${N}p"); [ -n "$LINHA" ] || { echo "Escolha inválida"; exit 1; }
TL_ACCOUNT_ID=$(echo "$LINHA" | cut -f1); TL_ACCNUM=$(echo "$LINHA" | cut -f2)

esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
BLOCO=$(cat <<EOF
# TradeLocker — preços de índices/energia/ações sem MetaApi (configurado $(date +%F))
ESPELHO_FEED_TL=1
ESPELHO_FEED_TL_RECURSO=1
ESPELHO_FEED_TL_MS=1000
TL_FEED_PARALELO=4
TL_FEED_ENV=${TL_ENV}
TL_FEED_SERVER="$(esc "$TL_SERVER")"
TL_FEED_EMAIL="$(esc "$TL_EMAIL")"
TL_FEED_PASSWORD="$(esc "$TL_PASS")"
TL_FEED_ACCOUNT_ID=${TL_ACCOUNT_ID}
TL_FEED_ACCNUM=${TL_ACCNUM}
EOF
)

echo "→ a gravar na VPS e a instalar o motor novo…"
scp -q deploy/vps-stream/funded-motor/dist/motor.js mtm-stream:/tmp/fm-novo.js
printf '%s\n' "$BLOCO" | ssh mtm-stream 'bash -c "
set -euo pipefail
F=/etc/mtm-funded-motor.env; D=\$(date +%Y%m%d-%H%M)
sudo cp \$F \$F.bak-\$D
sudo sed -i -E \"/^(ESPELHO_FEED_TL|ESPELHO_FEED_TL_RECURSO|ESPELHO_FEED_TL_MS|TL_FEED_[A-Z_]+)=/d; /^# TradeLocker — preços/d\" \$F
sudo tee -a \$F >/dev/null
sudo chmod 600 \$F
sudo cp /opt/mtm/funded-motor/motor.js /opt/mtm/funded-motor/motor.js.bak-\$D
sudo mv /tmp/fm-novo.js /opt/mtm/funded-motor/motor.js
sudo systemctl restart mtm-funded-motor
"'
unset TL_PASS TOKEN
echo "→ à espera do arranque (20 s)…"; sleep 20
ssh mtm-stream 'systemctl is-active mtm-funded-motor; journalctl -u mtm-funded-motor --since "-40s" --no-pager -o cat | grep -E "\[(feed|feed-tl|binance|yahoo)\]" | tail -8 | cut -c1-200'
echo "FEITO"

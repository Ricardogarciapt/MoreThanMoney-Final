#!/usr/bin/env bash
# Liga o feed de preços TradeLocker do motor MTM Funded (índices, energia, ações — o que não tem
# outra fonte sem MetaApi). Corre no Mac; pede as credenciais (a password não aparece no ecrã nem
# fica no histórico), valida o login, deixa escolher a conta, grava em /etc/mtm-funded-motor.env
# na VPS (root, 600), instala o motor compilado e reinicia.
#
# Uso: bash scripts/vps/tradelocker-feed-configurar.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

# Pré-preenchimento opcional: TL_EMAIL, TL_SERVER, TL_ENV (demo|live), TL_CONTA (ex.: L#853778)
[ -n "${TL_EMAIL:-}" ] || read -rp "Email da conta TradeLocker: " TL_EMAIL
read -rsp "Password TradeLocker de ${TL_EMAIL} (não aparece): " TL_PASS; echo
[ -n "${TL_SERVER:-}" ] || read -rp "Servidor TradeLocker (o que aparece no login): " TL_SERVER
CONTA_ALVO=$(printf '%s' "${TL_CONTA:-}" | sed -E 's/^[LlDd]#//')

# login: tenta o ambiente pedido (ou live e depois demo) e variantes do nome do servidor
login() { # $1=base $2=servidor → imprime o accessToken (vazio se falhar)
  TL_EMAIL="$TL_EMAIL" TL_PASS="$TL_PASS" TL_SERVER="$2" python3 - "$1" <<'PY2'
import json, os, sys, urllib.request
req = urllib.request.Request(sys.argv[1] + "/auth/jwt/token", method="POST",
    data=json.dumps({"email": os.environ["TL_EMAIL"], "password": os.environ["TL_PASS"], "server": os.environ["TL_SERVER"]}).encode(),
    headers={"Content-Type": "application/json"})
try:
    print(json.load(urllib.request.urlopen(req, timeout=20)).get("accessToken", ""))
except Exception:
    print("")
PY2
}
AMBIENTES=${TL_ENV:-"live demo"}
SERVIDORES="$TL_SERVER $(printf '%s' "$TL_SERVER" | tr '[:lower:]' '[:upper:]') HeroFX"
TOKEN=""
for AMB in $AMBIENTES; do
  for SRV in $SERVIDORES; do
    T=$(login "https://${AMB}.tradelocker.com/backend-api" "$SRV")
    if [ -n "$T" ]; then TOKEN=$T; TL_ENV=$AMB; TL_SERVER=$SRV; break 2; fi
  done
done
[ -n "$TOKEN" ] || { echo "✗ Login TradeLocker falhou (tentei ${AMBIENTES} × ${SERVIDORES}) — confirma a password e o servidor."; exit 1; }
BASE="https://${TL_ENV}.tradelocker.com/backend-api"
echo "✓ Login TradeLocker OK · ambiente ${TL_ENV} · servidor ${TL_SERVER}"

CONTAS=$(TOKEN="$TOKEN" python3 - "$BASE" <<'PY2'
import json, os, sys, urllib.request
req = urllib.request.Request(sys.argv[1] + "/auth/jwt/all-accounts", headers={"Authorization": "Bearer " + os.environ["TOKEN"]})
for a in json.load(urllib.request.urlopen(req, timeout=20)).get("accounts", []):
    print(f'{a.get("id")}\t{a.get("accNum")}\t{a.get("name","")}\t{a.get("currency","")}\t{a.get("status","")}')
PY2
)
[ -n "$CONTAS" ] || { echo "✗ A conta não tem contas de negociação"; exit 1; }
LINHA=""
if [ -n "$CONTA_ALVO" ]; then
  LINHA=$(echo "$CONTAS" | awk -F'\t' -v c="$CONTA_ALVO" '$1==c || $2==c || index($3,c)>0' | head -1)
fi
if [ -z "$LINHA" ]; then
  echo; echo "Contas disponíveis:"; echo "$CONTAS" | awk -F'\t' '{printf "  %d) id %s · accNum %s · %s %s %s\n", NR, $1, $2, $3, $4, $5}'
  read -rp "Qual usar para os preços [1]: " N; N=${N:-1}
  LINHA=$(echo "$CONTAS" | sed -n "${N}p"); [ -n "$LINHA" ] || { echo "Escolha inválida"; exit 1; }
fi
TL_ACCOUNT_ID=$(echo "$LINHA" | cut -f1); TL_ACCNUM=$(echo "$LINHA" | cut -f2)
echo; echo "Conta escolhida: id ${TL_ACCOUNT_ID} · accNum ${TL_ACCNUM} · $(echo "$LINHA" | cut -f3-4) (só leitura de preços, nunca ordens)"
read -rp "Confirmar e ligar o feed na VPS? [S/n]: " OK; OK=${OK:-S}
[[ "$OK" =~ ^[SsYy]$ ]] || { echo "Cancelado — nada foi alterado."; exit 0; }

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

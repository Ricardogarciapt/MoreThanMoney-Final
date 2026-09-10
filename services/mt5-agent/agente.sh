#!/bin/bash
#
# Agente MT5 — cria as contas demo do Torneio e do MTM Funded.
#
# Pergunta ao site se há pedidos, mostra-os (ou conduz o MT5), e devolve as credenciais.
# Corre no Mac do Ricardo, onde o MetaTrader está instalado.
#
set -uo pipefail

CONFIG="${MTM_AGENT_ENV:-$HOME/.mtm-agent.env}"
[ -f "$CONFIG" ] && set -a && . "$CONFIG" && set +a

SITE="${MTM_AGENT_SITE:-https://www.morethanmoney.pt}"
TOKEN="${MTMFUNDED_AGENT_SECRET:-}"
MODO="${MTM_AGENT_MODO:-assistido}"
INTERVALO="${MTM_AGENT_INTERVALO:-60}"
LOG="${MTM_AGENT_LOG:-$HOME/Library/Logs/mtm-mt5-agent.log}"

# Escreve só para o stdout: sob o launchd é ele que o encaminha para o ficheiro, e o `tee`
# que aqui esteve duplicava cada linha — o log ficava com tudo a dobrar e a parecer que o
# agente tentava duas vezes cada pedido. Em execução manual, vê-se no terminal.
registar() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [ -z "$TOKEN" ]; then
  echo "MTMFUNDED_AGENT_SECRET em falta. Corre ./instalar.sh primeiro." >&2
  exit 1
fi

# Reclama um pedido. Devolve o JSON do pedido, ou vazio.
reclamar() {
  curl -sS -m 30 -H "x-agent-token: $TOKEN" "$SITE/api/mtmfunded/agent" 2>/dev/null
}

# Espreita sem reclamar: quantos pedidos estão à espera.
espreitar() {
  curl -sS -m 30 -H "x-agent-token: $TOKEN" "$SITE/api/mtmfunded/agent?peek=1" 2>/dev/null
}

# Há alguém a quem perguntar? O modo assistido precisa de um terminal.
ha_terminal() { [ -t 0 ]; }

# Devolve o resultado ao site.
entregar() {
  curl -sS -m 30 -X POST "$SITE/api/mtmfunded/agent" \
    -H "Content-Type: application/json" -H "x-agent-token: $TOKEN" \
    -d "$1" 2>/dev/null
}

processar_um() {
  local resposta pedido id

  # SEM TERMINAL NÃO SE RECLAMA NADA.
  #
  # Reclamar é destrutivo: marca o pedido e gasta uma tentativa. Em modo assistido é preciso
  # alguém a escrever o login e a password — e como serviço não há terminal nenhum. Da
  # primeira vez que isto correu como serviço, o agente reclamou, leu EOF na pergunta, e
  # queimou as três tentativas do pedido em segundos. Um participante real teria ficado sem
  # conta antes de saber que se tinha inscrito.
  if [ "$MODO" != "auto" ] && ! ha_terminal; then
    local espera n
    espera="$(espreitar)"
    if printf '%s' "$espera" | grep -q '"error"'; then
      registar "o site recusou: $(printf '%s' "$espera" | head -c 200)"
      return 1
    fi
    n="$(printf '%s' "$espera" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("emFila",0))' 2>/dev/null || echo 0)"
    if [ "${n:-0}" -gt 0 ]; then
      registar "$n pedido(s) à espera — corre: $(dirname "$0")/agente.sh uma-vez"
      # Aviso no ecrã do Mac: o log sozinho não chama ninguém.
      osascript -e "display notification \"$n conta(s) por criar no MT5\" with title \"MTM · Agente MT5\"" 2>/dev/null || true
    fi
    return 2
  fi

  resposta="$(reclamar)"
  if [ -z "$resposta" ]; then registar "sem resposta do site"; return 1; fi

  # Um token errado devolve {"error":"não autorizado"} — que sem esta verificação se lia
  # como "fila vazia". O agente ficaria calado para sempre, a dizer que estava tudo bem,
  # enquanto ninguém recebia a conta. Um erro tem de fazer barulho.
  if printf '%s' "$resposta" | grep -q '"error"'; then
    registar "o site recusou: $(printf '%s' "$resposta" | head -c 200)"
    return 1
  fi

  pedido="$(printf '%s' "$resposta" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(json.dumps(d.get("pedido") or {}))' 2>/dev/null)"
  # Resposta que não é JSON (uma página de erro, um 404, a Vercel a redirecionar) também
  # não é fila vazia.
  if [ -z "$pedido" ]; then
    registar "resposta ilegível do site: $(printf '%s' "$resposta" | head -c 120)"
    return 1
  fi
  if [ "$pedido" = "{}" ]; then return 2; fi   # 2 = fila mesmo vazia

  id="$(printf '%s' "$pedido" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')"
  registar "pedido $id reclamado"

  if [ "$MODO" = "auto" ]; then
    local saida
    saida="$(python3 "$(dirname "$0")/criar_conta.py" "$pedido" 2>&1)"
    if [ $? -ne 0 ]; then
      registar "criação automática falhou: $saida"
      entregar "$(python3 -c 'import sys,json;print(json.dumps({"id":sys.argv[1],"erro":sys.argv[2][:400]}))' "$id" "$saida")" >/dev/null
      return 0
    fi
    entregar "$(python3 -c 'import sys,json;d=json.loads(sys.argv[2]);d["id"]=sys.argv[1];print(json.dumps(d))' "$id" "$saida")" >/dev/null
    registar "pedido $id concluído (auto)"
    return 0
  fi

  # ── modo assistido ───────────────────────────────────────────────────────
  # O formulário do MT5 é gráfico. Em vez de adivinhar coordenadas — e de arriscar criar
  # uma conta com o depósito errado — mostram-se os dados exactos e pede-se o resultado.
  printf '%s' "$pedido" | python3 - <<'PY'
import sys, json
p = json.load(sys.stdin)
print("\n" + "=" * 58)
print("  ABRIR CONTA NO METATRADER 5")
print("=" * 58)
print(f"  Primeiro nome : {p.get('primeiro_nome','')}")
print(f"  Sobrenome     : {p.get('sobrenome','')}      <- é o TIPO de conta")
print(f"  E-mail        : {p.get('email','')}")
print(f"  Telemóvel     : {p.get('telefone') or '(qualquer)'}")
print(f"  Nascimento    : {p.get('data_nascimento') or '(qualquer)'}")
print(f"  Servidor      : {p.get('servidor','')}")
print(f"  Tipo de conta : {p.get('tipo_conta','ECN')}")
print(f"  Depósito      : {int(float(p.get('deposito') or 0))} USD")
print(f"  Alavancagem   : 1:{p.get('alavancagem',100)}")
print("=" * 58)
PY

  echo
  read -r -p "  Login criado (Enter em branco = falhou): " novo_login
  if [ -z "$novo_login" ]; then
    read -r -p "  O que correu mal? " motivo
    entregar "$(python3 -c 'import sys,json;print(json.dumps({"id":sys.argv[1],"erro":sys.argv[2] or "cancelado pelo operador"}))' "$id" "${motivo:-}")" >/dev/null
    registar "pedido $id devolvido com erro"
    return 0
  fi
  read -r -p "  Password: " nova_pass
  read -r -p "  Password investidor (opcional): " investor

  local corpo
  corpo="$(python3 -c '
import sys, json
print(json.dumps({"id": sys.argv[1], "login": sys.argv[2], "password": sys.argv[3],
                  "investor": sys.argv[4] or None}))' "$id" "$novo_login" "$nova_pass" "${investor:-}")"
  local r
  r="$(entregar "$corpo")"
  if printf '%s' "$r" | grep -q '"ok":true'; then
    registar "pedido $id concluído — conta $novo_login"
  else
    registar "pedido $id: o site recusou — $r"
  fi
  return 0
}

case "${1:-correr}" in
  uma-vez)
    processar_um
    case $? in 2) echo "Fila vazia." ;; esac
    ;;
  correr)
    registar "agente a arrancar (modo=$MODO, intervalo=${INTERVALO}s, site=$SITE)"
    while true; do
      processar_um
      case $? in
        2) sleep "$INTERVALO" ;;          # fila vazia: dorme o intervalo normal
        1) sleep "$INTERVALO" ;;          # erro: dorme na mesma, para não martelar o site
        *) : ;;                           # tratou um pedido: volta já, a fila pode ter mais
      esac
    done
    ;;
  estado)
    launchctl list 2>/dev/null | grep -q pt.morethanmoney.mt5agent \
      && echo "a correr" || echo "parado"
    ;;
  registos)
    tail -n "${2:-40}" "$LOG" 2>/dev/null || echo "(sem registos ainda)"
    ;;
  *)
    echo "uso: $0 [correr|uma-vez|estado|registos]" >&2
    exit 1
    ;;
esac

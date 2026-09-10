#!/bin/bash
#
# Serve o ecrã virtual do MT5 por VNC — só para dentro da máquina.
#
# O `-localhost` não é um detalhe: um VNC aberto à internet no porto 5900 é dos alvos mais
# varridos que há, e do outro lado está um terminal de trading. Aqui só se liga quem já
# entrou por SSH, e o túnel do SSH é que traz o ecrã até ao Mac.
#
set -uo pipefail

export DISPLAY="${DISPLAY:-:99}"
PORTO="${PORTO:-5900}"

registar() { echo "[$(date '+%H:%M:%S')] $*"; }

case "${1:-arrancar}" in
  arrancar)
    if pgrep -f "x11vnc.*$DISPLAY" >/dev/null 2>&1; then
      registar "o VNC já está a servir $DISPLAY no porto $PORTO"
      exit 0
    fi
    pgrep -f "Xvfb $DISPLAY" >/dev/null 2>&1 || {
      registar "ERRO: não há ecrã virtual em $DISPLAY. Corre primeiro o instalar-mt5.sh."
      exit 1
    }
    registar "a servir $DISPLAY em 127.0.0.1:$PORTO (só por túnel SSH)"
    # -forever: não morre quando o visualizador fecha. -shared: dois olhares ao mesmo tempo.
    # -nopw é seguro AQUI porque -localhost já fecha a porta a toda a gente de fora.
    nohup x11vnc -display "$DISPLAY" -rfbport "$PORTO" -localhost -forever -shared -nopw \
      -noxdamage -quiet >/dev/null 2>&1 &
    sleep 2
    pgrep -f "x11vnc.*$DISPLAY" >/dev/null 2>&1 && registar "a correr" || { registar "ERRO: não arrancou"; exit 1; }
    ;;
  parar)
    pkill -f "x11vnc.*$DISPLAY" && registar "parado" || registar "não estava a correr"
    ;;
  estado)
    pgrep -f "x11vnc.*$DISPLAY" >/dev/null 2>&1 && echo "a correr" || echo "parado"
    ;;
  *)
    echo "uso: $0 [arrancar|parar|estado]" >&2
    exit 1
    ;;
esac

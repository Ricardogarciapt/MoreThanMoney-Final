#!/bin/bash
#
# Abre o MetaTrader no ecrã virtual do VPS (ou confirma que já está aberto).
#
# O MT5 não foi instalado aqui: o instalador da MetaQuotes é empacotado com protecção
# anti-debugger que, sob Wine, se convence de que está a ser depurado e trava num diálogo —
# mesmo com o depurador do Wine desligado. A protecção está no INSTALADOR, não no terminal,
# por isso copiou-se a instalação já feita do Mac. São binários Windows: correm igual.
#
set -uo pipefail

export WINEPREFIX="${WINEPREFIX:-$HOME/.mt5}"
export WINEARCH=win64
export WINEDEBUG=-all
export DISPLAY="${DISPLAY:-:99}"

MT5="$WINEPREFIX/drive_c/Program Files/MetaTrader 5/terminal64.exe"
registar() { echo "[$(date '+%H:%M:%S')] $*"; }

[ -f "$MT5" ] || { registar "ERRO: o MetaTrader não está em $MT5"; exit 1; }

# Ecrã virtual primeiro: sem ele o MT5 arranca e morre sem dizer porquê.
if ! pgrep -f "Xvfb $DISPLAY" >/dev/null 2>&1; then
  registar "a arrancar o Xvfb em $DISPLAY"
  nohup Xvfb "$DISPLAY" -screen 0 1440x900x24 -nolisten tcp >/dev/null 2>&1 &
  sleep 3
fi

if pgrep -f terminal64.exe >/dev/null 2>&1; then
  registar "o MetaTrader já está a correr"
else
  registar "a abrir o MetaTrader"
  # Prioridade baixa: este VPS também transmite, e o que se estraga na transmissão não se
  # recupera.
  cd "$(dirname "$MT5")" || exit 1
  nohup nice -n 15 wine "$MT5" >/tmp/mt5-terminal.log 2>&1 &
  sleep 25
fi

# A janela é a prova. O processo pode estar vivo com a interface morta.
JANELA="$(xdotool search --name "MetaTrader" 2>/dev/null | head -1)"
if [ -n "$JANELA" ]; then
  registar "janela $JANELA: $(xdotool getwindowname "$JANELA" 2>/dev/null)"
  exit 0
fi

registar "o processo arrancou mas não há janela. Últimas linhas do log:"
tail -5 /tmp/mt5-terminal.log 2>/dev/null
exit 1

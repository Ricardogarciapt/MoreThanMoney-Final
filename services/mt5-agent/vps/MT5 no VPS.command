#!/bin/bash
#
# Abre o MetaTrader do VPS no ecrã do Mac. Dois cliques neste ficheiro e está lá.
#
# O que acontece: liga-se por SSH, garante-se que o ecrã virtual e o VNC estão a correr,
# abre-se um túnel, e o Partilha de Ecrã do macOS mostra o ambiente de trabalho do VPS.
#
# O VNC NUNCA é exposto à internet: fica preso a 127.0.0.1 no VPS e só o túnel do SSH o
# alcança. Um VNC aberto no 5900 é dos alvos mais varridos que há, e do outro lado está um
# terminal de trading.
#
set -uo pipefail

MAQUINA="${MTM_VPS_HOST:-mtm-stream}"
PORTO_LOCAL="${MTM_VNC_PORTO:-5901}"
PORTO_REMOTO=5900

echo "── MetaTrader 5 · VPS MoreThanMoney ──"
echo

# Um túnel antigo ainda de pé rouba o porto e faz parecer que nada funciona.
if lsof -ti tcp:"$PORTO_LOCAL" >/dev/null 2>&1; then
  echo "· a fechar um túnel anterior no porto $PORTO_LOCAL"
  lsof -ti tcp:"$PORTO_LOCAL" | xargs kill -9 2>/dev/null
  sleep 1
fi

echo "· a preparar o ecrã virtual no VPS…"
if ! ssh -o ConnectTimeout=15 "$MAQUINA" \
  'sudo -u ubuntu bash -lc "~/mtm-agent/instalar-mt5.sh >/dev/null 2>&1; DISPLAY=:99 ~/mtm-agent/vnc.sh arrancar"' 2>&1 | tail -2
then
  echo
  echo "Não consegui preparar o VPS. Verifica a ligação: ssh $MAQUINA"
  read -r -p "Enter para fechar…"
  exit 1
fi

echo "· a abrir o túnel…"
ssh -f -N -L "${PORTO_LOCAL}:127.0.0.1:${PORTO_REMOTO}" "$MAQUINA" 2>/dev/null
sleep 2

if ! lsof -ti tcp:"$PORTO_LOCAL" >/dev/null 2>&1; then
  echo
  echo "O túnel não abriu. Tenta outra vez, ou verifica: ssh $MAQUINA"
  read -r -p "Enter para fechar…"
  exit 1
fi

# A palavra-passe do VNC vem do VPS, por SSH. Não fica escrita neste ficheiro — um ficheiro
# na Dock é aberto por quem passar pelo computador; o SSH exige a chave.
echo "· a buscar a palavra-passe do ecrã…"
SEGREDO="$(ssh -o ConnectTimeout=15 "$MAQUINA" 'sudo -u ubuntu bash -lc "~/mtm-agent/vnc.sh segredo"' 2>/dev/null | tr -d "\r\n")"

# Guardada no Porta-chaves com o endereço exacto que a Partilha de Ecrã usa: da próxima vez
# ela entra sozinha. Escrever uma palavra-passe aleatória à mão, de cada vez, é o género de
# atrito que faz com que ninguém use a ferramenta.
if [ -n "$SEGREDO" ]; then
  security delete-internet-password -s "127.0.0.1" -r "rfbs" >/dev/null 2>&1
  security add-internet-password -a "" -s "127.0.0.1" -r "rfbs" -P "$PORTO_LOCAL" \
    -w "$SEGREDO" -T /System/Library/CoreServices/Applications/Screen\ Sharing.app \
    -U >/dev/null 2>&1
fi

echo "· a abrir a Partilha de Ecrã…"
open "vnc://127.0.0.1:${PORTO_LOCAL}"

echo
if [ -n "$SEGREDO" ]; then
  echo "┌──────────────────────────────────────────────────────────┐"
  printf "│  Palavra-passe do ecrã:  %-31s │\n" "$SEGREDO"
  echo "│  (já ficou guardada no Porta-chaves — da próxima vez      │"
  echo "│   a Partilha de Ecrã entra sozinha)                       │"
  echo "└──────────────────────────────────────────────────────────┘"
else
  echo "Não consegui buscar a palavra-passe. Lê-a com:"
  echo "  ssh $MAQUINA 'sudo -u ubuntu bash -lc \"~/mtm-agent/vnc.sh segredo\"'"
fi
echo
echo "Pronto. O MetaTrader está na janela que abriu."
echo
echo "Se o MT5 não estiver visível, corre no VPS:"
echo "  ssh $MAQUINA 'sudo -u ubuntu bash -lc \"~/mtm-agent/abrir-mt5.sh\"'"
echo
echo "Para fechar o túnel quando acabares:"
echo "  lsof -ti tcp:$PORTO_LOCAL | xargs kill"
echo
read -r -p "Enter para fechar esta janela…"

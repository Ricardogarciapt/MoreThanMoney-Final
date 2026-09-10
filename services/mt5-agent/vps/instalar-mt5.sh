#!/bin/bash
#
# Instala o MetaTrader 5 no VPS, num ecrã virtual.
#
# Porquê aqui e não no Mac: no macOS o Wine não expõe janelas à acessibilidade e nada traz o
# MT5 à frente de forma fiável — as teclas iam para a aplicação que estivesse à frente. Aqui,
# o Xvfb tem UM ecrã só para o MT5 e o `xdotool` envia teclas para uma JANELA CONCRETA, com
# foco ou sem ele.
#
# NOTA sobre o instalador da MetaQuotes: tem protecção anti-debugger e, sob Wine, dispara-a
# porque o Wine se regista como depurador de falhas (AeDebug). Sem o desligar, o instalador
# fica parado num diálogo — "A debugger has been found running in your system" — a 0% de CPU,
# à espera de um OK que ninguém dá. Foi assim que a primeira tentativa ficou dez minutos sem
# fazer nada, e só se soube porque se fotografou o ecrã virtual.
#
set -uo pipefail

export WINEPREFIX="${WINEPREFIX:-$HOME/.mt5}"
export WINEARCH=win64
export WINEDEBUG=-all
export DISPLAY="${DISPLAY:-:99}"

registar() { echo "[$(date '+%H:%M:%S')] $*"; }
MT5="$WINEPREFIX/drive_c/Program Files/MetaTrader 5/terminal64.exe"

# ── ecrã virtual ─────────────────────────────────────────────────────────────
# O padrão do pgrep tem de vir entre aspas: com um espaço solto, o pgrep recusa e o script
# concluía que o Xvfb tinha falhado quando ele estava a arrancar bem.
if pgrep -f "Xvfb $DISPLAY" >/dev/null 2>&1; then
  registar "Xvfb já corre em $DISPLAY"
else
  registar "a arrancar o Xvfb em $DISPLAY"
  nohup Xvfb "$DISPLAY" -screen 0 1440x900x24 -nolisten tcp >/dev/null 2>&1 &
  sleep 3
  pgrep -f "Xvfb $DISPLAY" >/dev/null 2>&1 || { registar "ERRO: o Xvfb não arrancou"; exit 1; }
fi

if [ -f "$MT5" ]; then
  registar "o MetaTrader já está instalado"
  exit 0
fi

# ── prefixo ──────────────────────────────────────────────────────────────────
if [ ! -d "$WINEPREFIX/drive_c/windows" ]; then
  registar "a criar o prefixo Wine"
  wineboot -i >/dev/null 2>&1
  sleep 10
fi

# ── desligar o depurador ─────────────────────────────────────────────────────
registar "a desligar o depurador do Wine (é o que a protecção do instalador detecta)"
wine reg delete 'HKLM\Software\Microsoft\Windows NT\CurrentVersion\AeDebug' /v Debugger /f >/dev/null 2>&1
wine reg add   'HKLM\Software\Microsoft\Windows NT\CurrentVersion\AeDebug' /v Auto /t REG_SZ /d 0 /f >/dev/null 2>&1

# ── instalar ─────────────────────────────────────────────────────────────────
ORIGEM="$HOME/mt5/mt5setup.exe"
[ -f "$ORIGEM" ] || { registar "ERRO: falta $ORIGEM"; exit 1; }

# Correr a partir do C: e não do Z:. A protecção também estranha caminhos de rede, e o Z: é
# exactamente isso aos olhos do Wine.
cp -f "$ORIGEM" "$WINEPREFIX/drive_c/mt5setup.exe"
pkill -f mt5setup.exe 2>/dev/null
sleep 1

registar "a instalar (silencioso, alguns minutos)"
cd "$WINEPREFIX/drive_c" || exit 1
nohup nice -n 15 wine mt5setup.exe /auto >/tmp/mt5-instalacao.log 2>&1 &

# O instalador sai antes de o terminal estar pronto: espera-se pelo FICHEIRO.
for i in $(seq 1 100); do
  [ -f "$MT5" ] && break
  sleep 5
  # De meio em meio minuto, fotografa-se. Se ficar parado num diálogo, fica registado onde.
  if [ $((i % 6)) -eq 0 ]; then
    import -window root "/tmp/mt5-instalacao-$i.png" 2>/dev/null
    registar "…$((i * 5))s"
  fi
done

if [ -f "$MT5" ]; then
  registar "instalado: $MT5"
  pkill -f terminal64.exe 2>/dev/null   # abre-se sozinho no fim; quem o abre é o agente
  rm -f "$WINEPREFIX/drive_c/mt5setup.exe"
  exit 0
fi

registar "ERRO: não apareceu em 8 minutos. Vê /tmp/mt5-instalacao-*.png para saber onde parou."
exit 1

# ── fontes ───────────────────────────────────────────────────────────────────
# O prefixo vinha SEM UMA ÚNICA fonte, e o Wine ia buscá-las ao sistema à sorte. O diálogo
# final das contas escrevia a password numa fonte a que faltavam símbolos: o caractere
# especial não era desenhado de todo, e no ecrã ficava um espaço em branco. Não há OCR que
# leia o que não foi desenhado — a conta 19011 nasceu com uma password que ninguém podia ler.
sudo apt-get install -y -qq fonts-liberation fonts-dejavu-core
mkdir -p "$WINEPREFIX/drive_c/windows/Fonts"
for f in $(fc-list -f "%{file}\n" | grep -iE "liberation|dejavu" | sort -u); do
  cp -n "$f" "$WINEPREFIX/drive_c/windows/Fonts/" 2>/dev/null || true
done

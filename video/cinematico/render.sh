#!/bin/bash
# MOTOR CINEMÁTICO (Remotion + Three.js) — vídeos de apresentação, promo e landing no estilo do /solucoes.
# Usa o motor de vídeo único (video/motor) para a marca, o formato, o volume e a pasta de saída.
#
#   bash video/cinematico/render.sh <Composicao> <marca> [opções]
#     --voz=<pasta>       narração (falaNN.wav/mp3) misturada por cima da música (som/misturar-voz.py)
#     --formato=youtube   youtube | reel | feed (omissão: o da composição)
#     --frames=0-299      só um troço (ensaio)
#     --slug=nome         nome do ficheiro final (omissão: a composição)
#     --cliente='{...}'   perfil B2B em linha (com --marca=modelo-b2b), ex.: '{"nome":"Estúdio Ana","cores":{"destaque":"#C0392B"}}'
#
# Saída: <raiz dos renders>/<marca>/cinematico/<AAAA-MM-DD>-<slug>.mp4  (mestre H.264 CRF 17, -14 LUFS)
# Stock real (Mixkit, licença livre): <MTM-Assets>/stock/cinematico → ligado em public/stock.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$AQUI/../.." && pwd)"
COMP="${1:?composição (ex.: Solucoes)}"; MARCA="${2:-morethanmoney}"; shift 2 || true
VOZ=""; FORMATO=""; FRAMES=""; SLUG="$COMP"; CLIENTE=""
for a in "$@"; do case "$a" in
  --voz=*) VOZ="${a#*=}";; --formato=*) FORMATO="${a#*=}";; --frames=*) FRAMES="${a#*=}";;
  --slug=*) SLUG="${a#*=}";; --cliente=*) CLIENTE="${a#*=}";; esac; done
MOTOR="node $REPO/video/motor/motor.mjs"
cd "$AQUI"
[ -d node_modules ] || npm install --no-audit --no-fund --loglevel=error
# stock partilhado (fora do git)
ATIVOS="${MTM_ASSETS:-$(node -e "import('$REPO/video/motor/motor.mjs').then(m=>console.log(m.raizAtivos()))")}"
[ -e public/stock ] || ln -s "$ATIVOS/stock/cinematico" public/stock
mkdir -p out
# som: música + SFX sintetizados (sem direitos) pela linha do tempo do projecto
PROJ="$(echo "$COMP" | tr '[:upper:]' '[:lower:]')"
[ -f "som/$PROJ/gerar-som.py" ] && python3 "som/$PROJ/gerar-som.py"
SOM=out/som.wav
if [ -n "$VOZ" ]; then python3 som/misturar-voz.py "$VOZ"; SOM=out/som-narrado.wav; fi
# browser: o do Playwright pré-instalado (nuvem) ou o que o Remotion descarregar (Mac)
BR=(); for b in /opt/pw-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell; do [ -x "$b" ] && BR=(--browser-executable="$b" --gl=swangle); done
PROPS="{\"marca\":\"$MARCA\"${FORMATO:+,\"formato\":\"$FORMATO\"}${CLIENTE:+,\"cliente\":$CLIENTE}}"
npx remotion render src/index.ts "$COMP" out/mudo.mp4 --muted --crf=16 --concurrency=3 --log=error \
  --props="$PROPS" ${FRAMES:+--frames=$FRAMES} ${BR[@]+"${BR[@]}"}
DEST="$($MOTOR saida "$MARCA" cinematico "$SLUG")"
FMT="${FORMATO:-youtube}"; DESDE=0; [ -n "$FRAMES" ] && DESDE="$(awk -v f="${FRAMES%%-*}" 'BEGIN{print f/30}')"
node -e "import('$REPO/video/motor/motor.mjs').then(async m=>{await m.finalizar('out/mudo.mp4','$DEST',{formato:'$FMT',qualidade:'mestre',audioDesde:$DESDE,audio:require('fs').existsSync('$SOM')?'$SOM':null});console.log(JSON.stringify(m.verificar('$DEST','$FMT')))})"
echo "feito: $DEST"

#!/bin/bash
# Reels de anúncio com o gémeo HeyGen por baixo e a edição do motor por cima (src/projetos/anuncio-reel).
#   bash video/cinematico/projetos-anuncio.sh <chave> [--frames=0-89]   chaves: cor seg edu b2b rgs rgl
# Precisa de public/stock/anuncios/<chave>.mp4 (vídeo HeyGen SEM legendas). Saída: out/anuncio-<chave>.mp4 (-14 LUFS)
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$AQUI/../.." && pwd)"; cd "$AQUI"
K="${1:?chave}"; FRAMES=""; for a in "${@:2}"; do case "$a" in --frames=*) FRAMES="${a#*=}";; esac; done
MARCA=$(node -e "const s=require('fs').readFileSync('src/projetos/anuncio-reel/anuncios.ts','utf8');const m=s.match(new RegExp('\\\\n  $K: \\\\{\\\\n    marca: \\'([^\\']+)'));console.log(m?m[1]:'morethanmoney')")
python3 som/anuncio-reel/gerar-som.py "$K"
BR=(); for b in /opt/pw-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell; do [ -x "$b" ] && BR=(--browser-executable="$b" --gl=swangle); done
mkdir -p out
npx remotion render src/index.ts AnuncioReel "out/bruto-$K.mp4" --crf=16 --concurrency=4 --log=error \
  --props="{\"marca\":\"$MARCA\",\"formato\":\"reel\",\"anuncio\":\"$K\"}" ${FRAMES:+--frames=$FRAMES} ${BR[@]+"${BR[@]}"}
node -e "import('$REPO/video/motor/motor.mjs').then(async m=>{await m.finalizar('out/bruto-$K.mp4','out/anuncio-$K.mp4',{formato:'reel',qualidade:'final'});console.log(JSON.stringify(m.verificar('out/anuncio-$K.mp4','reel')))})"
echo "feito: out/anuncio-$K.mp4"

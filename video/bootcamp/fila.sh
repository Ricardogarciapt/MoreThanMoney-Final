#!/bin/bash
exec < /dev/null  # ffmpeg/node sem terminal: evita «suspended (tty output)» quando corre em segundo plano
# Fila completa dos bootcamps (corre no Mac, na raiz do worktree).
# Uso: nohup caffeinate -dims bash video/bootcamp/fila.sh > ~/bootcamp-fila.log 2>&1 &
# Ver progresso: tail -f ~/bootcamp-fila.log
# Pode ser relançada a qualquer momento: salta vídeos já feitos (marcador .v3 (versão do motor)).
cd "$(dirname "$0")/../.." || exit 1
# Só se desenham estratégias com gráfico fiel ao Pine (video/bootcamp/<est>.js ou "motor" no guião).
# As outras ficam à espera do motor (pedido do Ricardo a 07/11: vídeos o mais próximos possível do código).
ESTS="trendshot defy-explica defy mtm-scanner sensei golden-zone momentum rocketnova sniper-pro quantum goldkiller aurum-flow premium-scanner"
DEST="$HOME/Documents/youtube-upload-mtm"
git pull --ff-only origin claude/project-thread-piyxkj || true
# vídeos já feitos a 1,10× passam a 1,03× sem novo render
node video/bootcamp/ajustar-velocidade.mjs || echo "ERRO ajuste"
# 07/11: TrendShot e DEFY passam a gráfico fiel ao indicador; os já publicados são substituídos (uma só vez)
node video/bootcamp/publicar-youtube.mjs --refazer trendshot defy --tag fiel1 || echo "ERRO refazer"
# 08/11: o vídeo 2 do TrendShot ganha a cena de gestão da posição aberta (parciais, stop na entrada, trailing)
node video/bootcamp/publicar-youtube.mjs --refazer trendshot --tag gestao1 --so '-2-' || echo "ERRO refazer"
# 08/11: Golden Zone passa a gráfico fiel ao scanner; os vídeos antigos ficam no YouTube até o Ricardo dar OK
node video/bootcamp/publicar-youtube.mjs --refazer golden-zone --tag fiel1 --manter || echo "ERRO refazer"
for est in $ESTS; do
  motor=$(node -e "console.log(require('./video/bootcamp/guioes/$est.pt.json').motor||'$est')")
  # sem gráfico fiel: só acaba as estratégias que já tinham vídeos feitos (decisão do Ricardo 07/11: os já feitos ficam)
  if [ ! -f "video/bootcamp/$motor.js" ] && ! ls video/bootcamp/saida/$est/*.v3 >/dev/null 2>&1; then echo "=== $est: à espera do gráfico fiel ($motor.js) ==="; continue; fi
  n=$(node -e "console.log(require('./video/bootcamp/guioes/$est.pt.json').videos.length)")
  echo "=== $est ($n vídeos) $(date +%H:%M) ==="
  node video/bootcamp/voz.mjs "$est" all pt en || { echo "ERRO voz $est"; continue; }
  for lang in pt en; do
    for i in $(seq 1 "$n"); do
      out="video/bootcamp/saida/$est/bootcamp-$est-$i-$lang.mp4"
      if [ -f "$out.v3" ]; then echo "já feito: $out"; continue; fi
      rm -f "$out"
      if nice -n 10 node video/bootcamp/render.mjs "$est" "$i" "$lang"; then
        touch "$out.v3"
        node video/bootcamp/youtube-meta.mjs "$est" "$i" "$lang"
        d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out" | cut -d. -f1)
        echo "FEITO $out ${d}s $(du -h "$out" | cut -f1) $(date +%H:%M)"
      else
        echo "ERRO render $est $i $lang"
      fi
    done
  done
  node video/bootcamp/capa.mjs "$est" || echo "ERRO capa $est"
  mkdir -p "$DEST/bootcamp-$est"
  cp video/bootcamp/saida/$est/*.mp4 video/bootcamp/saida/$est/*.vtt video/bootcamp/saida/$est/*.txt video/bootcamp/saida/$est/*.jpg "$DEST/bootcamp-$est/" 2>/dev/null
  node video/bootcamp/publicar-youtube.mjs || echo "publicação em pausa (quota ou erro); retoma no fim"
done
echo "=== FILA TERMINADA $(date) ==="
# Publicação: a quota do YouTube dá ~5 vídeos por dia; repete de hora a hora até subir tudo.
while true; do
  node video/bootcamp/publicar-youtube.mjs > /tmp/bootcamp-pub.txt 2>&1; c=$?; cat /tmp/bootcamp-pub.txt
  grep -q "publicação: 0 por publicar" /tmp/bootcamp-pub.txt && break
  [ $c -eq 2 ] && break
  sleep 3600
done
echo "=== PUBLICAÇÃO TERMINADA $(date) ==="

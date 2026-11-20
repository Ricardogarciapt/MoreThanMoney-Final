#!/bin/bash
# Stock real do molde cinemático (Mixkit, licença livre — ver creditos em MTM-Assets/stock/cinematico).
# Fora do git: no Mac/nuvem public/stock é ligação para MTM-Assets; no GitHub Actions descarrega-se aqui
# (7 s do trecho central, sem áudio). O que falhar fica de fora e o gerador usa ecrãs da app no lugar.
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; D="$AQUI/public/stock"
[ -L "$D" ] && { echo "stock ligado a $(readlink "$D")"; exit 0; }
mkdir -p "$D"
while IFS='|' read -r nome id slug; do
  [ -s "$D/$nome.mp4" ] && continue
  ok=""
  for u in "https://assets.mixkit.co/videos/$id/$id-720.mp4" "https://assets.mixkit.co/videos/preview/mixkit-$slug-$id-large.mp4"; do
    if curl -fsSL --max-time 90 "$u" -o "/tmp/mk-$id.mp4"; then ok=1; break; fi
  done
  if [ -z "$ok" ]; then echo "stock: $nome indisponível"; continue; fi
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "/tmp/mk-$id.mp4" | cut -d. -f1); ini=$(( ${dur:-7} > 9 ? (${dur:-7} - 7) / 2 : 0 ))
  ffmpeg -loglevel error -y -ss "$ini" -i "/tmp/mk-$id.mp4" -t 7 -an -c:v libx264 -crf 23 -preset veryfast -pix_fmt yuv420p "$D/$nome.mp4" && echo "stock: $nome ok"
  rm -f "/tmp/mk-$id.mp4"
done <<'LISTA'
noite_cansado_1|5601|stressed-businessman-rubs-eyes-while-working-on-laptop
noite_cansado_2|14669|hands-texting-on-a-mobile-phone-at-night
stress_papel_1|45922|young-businessman-overwhelmed-with-paperwork
stress_papel_2|4533|woman-doing-accounts-on-a-calculator
cliente_marca_1|1805|a-woman-using-her-smartphone
cliente_marca_2|42629|checking-the-calendar-on-a-tablet
negocio_tecnologia_1|49927|woman-working-in-front-at-home-on-a-computer
negocio_tecnologia_2|42617|people-working-in-the-office
equipa_formacao_1|48712|co-workers-sharing-ideas-during-a-workshop
equipa_formacao_2|9069|digital-marketing-team-leader-explains-strategy-on-whiteboard
liberdade_1|36784|woman-feeling-freedom-at-the-beach
liberdade_2|6213|family-walking-together-at-sunset
LISTA
exit 0

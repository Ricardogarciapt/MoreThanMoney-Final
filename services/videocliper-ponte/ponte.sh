#!/bin/zsh
# PONTE DO VIDEOCLIPER — corre no Mac (IP de casa), porque o YouTube recusa o IP do servidor.
#
# De 30 em 30 segundos pergunta ao site se há um link do YouTube à espera. Se houver:
#   1. descarrega com o yt-dlp (até 1080p, mp4) para uma pasta temporária;
#   2. copia para /mnt/dvr/ponte-<id>.mp4 no VPS (ssh alias mtm-stream);
#   3. diz ao site o nome do ficheiro — o VPS transcreve e corta como uma gravação do DVR;
#   4. apaga a cópia local. Nada fica no Mac.
#
# Segredo e endereço em ~/.mtm-ponte.env (chmod 600), nunca no repo.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
source "$HOME/.mtm-ponte.env"
API="${MTM_API_BASE:-https://www.morethanmoney.pt}"
LOG="$HOME/Library/Logs/mtm-videocliper-ponte.log"

log() { print -r -- "$(date -u +%FT%TZ) $*" >> "$LOG" }

reportar() {
  curl -s -m 30 -X POST "$API/api/videocliper/ponte" \
    -H "x-caption-secret: $LMS_CAPTION_WORKER_SECRET" -H "content-type: application/json" \
    -d "$1" > /dev/null
}

while true; do
  resp=$(curl -s -m 30 "$API/api/videocliper/ponte" -H "x-caption-secret: $LMS_CAPTION_WORKER_SECRET")
  tipo=$(print -r -- "$resp" | /usr/bin/python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("tipo",""))
except Exception: print("")')
  if [[ "$tipo" == "descarregar" ]]; then
    jobId=$(print -r -- "$resp" | /usr/bin/python3 -c 'import sys,json; print(json.load(sys.stdin)["jobId"])')
    url=$(print -r -- "$resp" | /usr/bin/python3 -c 'import sys,json; print(json.load(sys.stdin)["url"])')
    nome="ponte-${jobId}.mp4"
    tmp=$(mktemp -d)
    log "a descarregar $url"
    if yt-dlp -q --no-playlist -f 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b' \
         --merge-output-format mp4 -o "$tmp/video.%(ext)s" "$url" >> "$LOG" 2>&1 \
       && titulo=$(yt-dlp --no-playlist --skip-download --print title "$url" 2>/dev/null | head -1) \
       && scp -q "$tmp/video.mp4" "mtm-stream:/mnt/dvr/$nome" >> "$LOG" 2>&1; then
      corpo=$(/usr/bin/python3 -c 'import json,sys; print(json.dumps({"jobId":sys.argv[1],"ficheiro":sys.argv[2],"titulo":sys.argv[3]}))' "$jobId" "$nome" "$titulo")
      reportar "$corpo"
      log "no VPS: $nome"
    else
      erro=$(tail -3 "$LOG" | tr '\n' ' ' | cut -c1-300)
      corpo=$(/usr/bin/python3 -c 'import json,sys; print(json.dumps({"jobId":sys.argv[1],"erro":sys.argv[2]}))' "$jobId" "$erro")
      reportar "$corpo"
      log "falhou: $erro"
    fi
    rm -rf "$tmp"
  fi
  sleep 30
done

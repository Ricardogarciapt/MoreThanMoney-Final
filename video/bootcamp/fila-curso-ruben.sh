#!/bin/bash
exec < /dev/null
# Curso do Ruben: narra (voz Fish do Ruben, som «rádio») e renderiza as 80 aulas (20 × PT/EN/ES/FR), no Mac.
# Uso (na raiz do repo): nohup caffeinate -dims bash video/bootcamp/fila-curso-ruben.sh > ~/curso-ruben.log 2>&1 &
# Relançável: salta aulas já entregues no destino COM a versão atual (marcador .<VERSAO>). A narração tem cache por texto (não volta a gastar).
# VERSAO muda quando o vídeo muda (23/11 20:39: narração 7 % mais lenta, vel 0.93) — as aulas antigas são refeitas.
cd "$(dirname "$0")/../.." || exit 1
git pull --ff-only origin main || true
DEST="${CURSO_DEST:-/Volumes/Disco externo/Ricardo/Bootcamp Ruben/20 aulas com voz}"
EST=curso-a-primeira-chave
VERSAO=vel093
node video/bootcamp/entrada.mjs "video/bootcamp/saida/$EST/entrada.wav"  # gera antes, para os 2 processos não a escreverem ao mesmo tempo
uma() {
  local n=$1 l=$2 alvo="$DEST/$l/aula-$(printf %02d "$n")-$l.mp4"
  [ -f "$alvo" ] && [ -f "${alvo%.mp4}.$VERSAO" ] && { echo "já feita: $alvo"; return; }
  mkdir -p "$DEST/$l"
  local log; log=$(mktemp)
  node video/bootcamp/voz.mjs $EST "$n" "$l" > "$log" 2>&1 || { echo "ERRO voz aula $n $l"; tail -5 "$log"; return; }
  node video/bootcamp/render.mjs $EST "$n" "$l" >> "$log" 2>&1 \
    && mv "video/bootcamp/saida/$EST/bootcamp-$EST-$n-$l.mp4" "$alvo" \
    && cp "video/bootcamp/saida/$EST/bootcamp-$EST-$n-$l.vtt" "${alvo%.mp4}.vtt" \
    && touch "${alvo%.mp4}.$VERSAO" \
    && echo "OK $alvo" || { echo "ERRO render aula $n $l"; tail -5 "$log"; }
}
for l in pt en es fr; do
  for n in $(seq 1 2 20); do
    uma "$n" "$l" & uma $((n + 1)) "$l" & wait
  done
done
echo "fila do curso terminada"

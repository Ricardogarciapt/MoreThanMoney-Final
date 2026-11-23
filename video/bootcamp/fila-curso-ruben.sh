#!/bin/bash
exec < /dev/null
# Render das 80 aulas do curso do Ruben (20 × PT/EN/ES/FR), no Mac, 2 processos de cada vez.
# Uso (na raiz do repo): nohup caffeinate -dims bash video/bootcamp/fila-curso-ruben.sh > ~/curso-ruben.log 2>&1 &
# Relançável: salta aulas já entregues no destino.
cd "$(dirname "$0")/../.." || exit 1
git pull --ff-only origin main || true
DEST="${CURSO_DEST:-/Volumes/Disco externo/Ricardo/Bootcamp Ruben}"
EST=curso-a-primeira-chave
uma() {
  local n=$1 l=$2 alvo="$DEST/$l/aula-$(printf %02d "$n")-$l.mp4"
  [ -f "$alvo" ] && { echo "já feita: $alvo"; return; }
  mkdir -p "$DEST/$l"
  local tmp; tmp=$(mktemp -d)
  # nomes de saída diferentes por aula, por isso os 2 processos não colidem
  node video/bootcamp/render.mjs $EST "$n" "$l" > "$tmp/log" 2>&1 \
    && mv "video/bootcamp/saida/$EST/bootcamp-$EST-$n-$l.mp4" "$alvo" \
    && echo "OK $alvo" || { echo "ERRO aula $n $l"; tail -5 "$tmp/log"; }
}
node video/bootcamp/entrada.mjs "video/bootcamp/saida/$EST/entrada.wav"  # gera antes, para os 2 processos não a escreverem ao mesmo tempo
for l in pt en es fr; do
  for n in $(seq 1 2 20); do
    uma "$n" "$l" & uma $((n + 1)) "$l" & wait
  done
done
echo "fila do curso terminada"

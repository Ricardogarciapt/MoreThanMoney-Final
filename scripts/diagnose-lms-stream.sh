#!/usr/bin/env bash
# Diagnóstico rápido do endpoint HLS público (VPS stream).
# Uso:
#   ./scripts/diagnose-lms-stream.sh
#   ./scripts/diagnose-lms-stream.sh https://stream.exemplo.pt mtm_sua_chave
set -euo pipefail

BASE="${1:-https://stream.morethanmoney.pt}"
KEY="${2:-__diagnostic_fake_key__}"
ORIGIN="${3:-https://morethanmoney.pt}"

M3U8="${BASE%/}/hls/${KEY}.m3u8"
echo "== URL testada: ${M3U8}"
echo "== Origin (CORS): ${ORIGIN}"
echo ""

code=$(curl -sS -o /tmp/mtm-hls-test.body -w "%{http_code}" -H "Origin: ${ORIGIN}" "$M3U8" || true)
body=$(cat /tmp/mtm-hls-test.body 2>/dev/null || true)
echo "HTTP status: ${code}"
echo "Primeiros bytes:"
head -c 200 /tmp/mtm-hls-test.body 2>/dev/null | cat -v
echo ""
echo ""

if [[ "$body" == *"MTM stream OK"* ]]; then
  echo "❌ FALHA: A resposta é o placeholder do nginx (location /), não o proxy /hls/ → SRS."
  echo "   Corrige o site nginx na VPS: inclui os blocos location /hls/ e /live/ de"
  echo "   deploy/vps-stream/nginx-mtm-stream.conf dentro do server { listen 443 ssl; ... }."
  exit 1
fi

if [[ "$code" != "200" ]]; then
  echo "⚠️  Status não é 200 — sem manifest enquanto não houver ingest ativo pode ser normal (404)."
  exit 0
fi

if [[ "$body" == \#EXTM3U* ]]; then
  echo "✅ Corpo parece manifest HLS (#EXTM3U)."
else
  echo "⚠️  200 mas o corpo não começa por #EXTM3U — pode ser erro HTML/texto do upstream."
fi

echo ""
echo "Headers relevantes:"
curl -sSI -H "Origin: ${ORIGIN}" "$M3U8" | grep -iE '^(HTTP|access-control|content-type)' || true

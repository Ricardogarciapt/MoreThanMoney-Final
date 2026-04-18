#!/usr/bin/env bash
# Build de validação local (mesmo pipeline que produção, sem deploy).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "==> Build de teste (Next.js) em: $ROOT"
if [[ ! -f node_modules/next/dist/bin/next ]]; then
  echo "ERRO: instala dependências primeiro: npm install --legacy-peer-deps"
  exit 1
fi
node node_modules/next/dist/bin/next build
echo "==> Build de teste concluído com sucesso."

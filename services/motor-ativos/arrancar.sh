#!/usr/bin/env bash
# Arranca o ComfyUI e o worker em segundo plano (sobrevive ao fecho do SSH). Volta a correr à vontade.
# Parar: bash arrancar.sh parar
set -euo pipefail
BASE="${BASE:-/workspace}"
AQUI="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" = "parar" ]; then
  pkill -f "ComfyUI/main.py" || true; pkill -f "motor-ativos/worker.py" || true; echo "parado"; exit 0
fi

pgrep -f "ComfyUI/main.py" >/dev/null || nohup "$BASE/venv-comfy/bin/python" "$BASE/ComfyUI/main.py" \
  --listen 127.0.0.1 --port 8188 > "$BASE/logs/comfy.log" 2>&1 &
for _ in $(seq 1 90); do curl -fs http://127.0.0.1:8188/system_stats >/dev/null && break; sleep 2; done
curl -fs http://127.0.0.1:8188/system_stats >/dev/null || { echo "ComfyUI não arrancou: vê $BASE/logs/comfy.log"; exit 1; }

pgrep -f "motor-ativos/worker.py" >/dev/null || (set -a; . "$BASE/motor.env"; set +a; \
  nohup python3 "$AQUI/worker.py" > "$BASE/logs/worker.log" 2>&1 &)
echo "a correr · logs: tail -f $BASE/logs/worker.log"

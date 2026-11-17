#!/usr/bin/env bash
# MOTOR DE ATIVOS no Mac mini (M4, 16 GB) — modo NOTURNO, sem deitar a máquina abaixo.
#
# O que faz no Mac: só `voz` (Chatterbox, voz clonada em PT) por omissão. `cena`/`angulo` (Qwen-Image-Edit
# em GGUF Q4) são experimentais: MOTOR_CAPS=voz,cena,angulo  — mas com 16 GB o modelo + o codificador de
# texto passam a memória disponível e o Mac entra em swap (~10–20 min por imagem, estimativa).
# `mover` (LTX-2) e `falar` (LatentSync) precisam de CUDA/48 GB: ficam para a GPU alugada.
#
# Regras de casa: 1 trabalho de cada vez, só das 01h às 07h, prioridade de fundo (taskpolicy -b + nice),
# e não pega trabalho com menos de 3 GB de memória livre (Ollama/Xcode/next build ganham sempre).
#
# Uso (no Mac):  MTM_MOTOR_SECRET='<CRON_SECRET>' bash services/motor-ativos/mac.sh
#                bash services/motor-ativos/mac.sh parar
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
BASE="${BASE:-/Volumes/Disco externo/Ollama para a MTM/motor-ativos}"   # disco externo: o interno tem pouco espaço
ROTULO="pt.morethanmoney.motor-ativos"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"

if [ "${1:-}" = "parar" ]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true; rm -f "$PLIST"; echo "parado"; exit 0
fi
[ -n "${MTM_MOTOR_SECRET:-}" ] || { echo "Falta MTM_MOTOR_SECRET"; exit 1; }
command -v ffmpeg >/dev/null || { echo "Falta o ffmpeg (brew install ffmpeg)"; exit 1; }
mkdir -p "$BASE/voz" "$BASE/logs"

# Voz: Chatterbox (MIT) num venv no disco externo; corre em MPS/CPU.
[ -x "$BASE/venv-voz/bin/python" ] || { command -v uv >/dev/null && uv venv -p 3.11 "$BASE/venv-voz" || python3 -m venv "$BASE/venv-voz"; }   # chatterbox quer 3.10/3.11
"$BASE/venv-voz/bin/pip" install -q chatterbox-tts "setuptools<81"   # perth precisa do pkg_resources
[ -f "$BASE/voz/ricardo.wav" ] || echo "AVISO: copia a referência para $BASE/voz/ricardo.wav (está em project-files/motor-ativos/voz-ricardo-ref.wav)"

umask 077
cat > "$BASE/motor.env" <<ENV
MTM_SITE=https://www.morethanmoney.pt
MTM_MOTOR_SECRET=$MTM_MOTOR_SECRET
MOTOR_MODO=gpu
MOTOR_NOME=mac-mini
MOTOR_CAPS=${MOTOR_CAPS:-voz}
MOTOR_JANELA=${MOTOR_JANELA:-1-7}
MOTOR_MEM_MIN_GB=${MOTOR_MEM_MIN_GB:-3}
MOTOR_INTERVALO=30
CHATTERBOX_PY=$BASE/venv-voz/bin/python
VOZ_REF=$BASE/voz/ricardo.wav
HF_HOME=$BASE/hf-cache
PYTORCH_ENABLE_MPS_FALLBACK=1
ENV

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$ROTULO</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>-c</string>
    <string>set -a; . "$BASE/motor.env"; set +a; exec /usr/sbin/taskpolicy -b /usr/bin/nice -n 15 /usr/bin/python3 "$AQUI/worker.py"</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$BASE/logs/worker.log</string>
  <key>StandardErrorPath</key><string>$BASE/logs/worker.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "motor noturno instalado (${MOTOR_CAPS:-voz}, ${MOTOR_JANELA:-1-7}h). Logs: tail -f \"$BASE/logs/worker.log\""

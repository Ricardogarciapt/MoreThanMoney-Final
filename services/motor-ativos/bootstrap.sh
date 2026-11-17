#!/usr/bin/env bash
# MOTOR DE ATIVOS MTM — põe uma máquina GPU acabada de alugar (Ubuntu + CUDA, ex.: modelo «PyTorch» do
# RunPod/Vast/Lambda) pronta a gerar em ~20–40 min (o tempo é quase todo a descarregar os pesos).
#
# Uso:   PERFIL=completo MTM_MOTOR_SECRET=… bash bootstrap.sh
# Perfis: imagem   cena + angulo                       (~60 GB; ~41 GB com ANGLE_VARIANTE=gguf)
#         video    imagem + mover (LTX-2 19B)          (~110 GB)
#         completo video + voz (Chatterbox) + falar (LatentSync 1.6)   (~118 GB)  ← omissão
# Env:   BASE=/workspace (disco persistente da máquina) · HF_TOKEN (opcional, acelera o HF)
#        VOZ_REF_URL=URL assinado de um WAV com 10–30 s da voz do Ricardo (ou copia para $BASE/voz/ricardo.wav)
#        CAMERA_LORAS=all|static,dolly-in,…   · ARRANCAR=0 para só instalar
#
# Nenhum segredo fica escrito no disco fora de $BASE/motor.env (chmod 600). Volta a correr à vontade:
# o que já existe é saltado (descargas retomáveis).
set -euo pipefail

PERFIL="${PERFIL:-completo}"
BASE="${BASE:-/workspace}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
COMFY_DIR="$BASE/ComfyUI"
mkdir -p "$BASE/voz" "$BASE/logs"
log() { echo "[$(date +%H:%M:%S)] $*"; }

log "perfil $PERFIL · base $BASE"
command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || log "AVISO: sem nvidia-smi"
apt-get update -qq && apt-get install -y -qq ffmpeg git curl aria2 >/dev/null || log "apt indisponível (segue)"

# ── ComfyUI + nós ──────────────────────────────────────────────────────────────────────
if [ ! -d "$COMFY_DIR" ]; then
  git clone -q https://github.com/comfyanonymous/ComfyUI "$COMFY_DIR"
fi
python3 -m venv "$BASE/venv-comfy"
"$BASE/venv-comfy/bin/pip" install -q --upgrade pip
"$BASE/venv-comfy/bin/pip" install -q -r "$COMFY_DIR/requirements.txt"
if [ "${ANGLE_VARIANTE:-}" = "gguf" ] && [ ! -d "$COMFY_DIR/custom_nodes/ComfyUI-GGUF" ]; then
  git clone -q https://github.com/city96/ComfyUI-GGUF "$COMFY_DIR/custom_nodes/ComfyUI-GGUF"
  "$BASE/venv-comfy/bin/pip" install -q -r "$COMFY_DIR/custom_nodes/ComfyUI-GGUF/requirements.txt"
fi

# ── Pesos (lista do manifest do open-higgsfield) ──────────────────────────────────────
case "$PERFIL" in
  imagem) ETAPAS="angle" ;;
  video|completo) ETAPAS="angle move" ;;
  *) echo "perfil desconhecido: $PERFIL"; exit 2 ;;
esac
[ "${ANGLE_VARIANTE:-}" = "gguf" ] && ETAPAS="${ETAPAS/angle/angle:gguf}"
python3 - "$AQUI/workflows/manifest.json" $ETAPAS > "$BASE/pesos.tsv" <<'PY'
import json, os, sys
m = json.load(open(sys.argv[1]))
cams = os.environ.get("CAMERA_LORAS", "all")
cam_files = {c["lora"] for c in m["cameraMoves"] if c["lora"]}
quero = None if cams == "all" else {next((c["lora"] for c in m["cameraMoves"] if c["id"] == i), None) for i in cams.split(",")}
vistos = set()
for arg in sys.argv[2:]:
    etapa, _, var = arg.partition(":")
    modelos = m[etapa]["models"]
    if var:
        v = m[etapa]["variants"][var]
        modelos = [x for x in modelos if x["folder"] != v["replaces"]] + v["models"]
    for x in modelos:
        if x["file"] in cam_files and quero is not None and x["file"] not in quero: continue
        if x["file"] in vistos: continue
        vistos.add(x["file"])
        print(f'{x["folder"]}\t{x["file"]}\t{x["url"]}\t{x["sizeGB"]}')
PY
log "a descarregar $(wc -l < "$BASE/pesos.tsv") pesos ($(awk -F'\t' '{s+=$4} END {printf "%.0f", s}' "$BASE/pesos.tsv") GB)"
while IFS=$'\t' read -r pasta ficheiro url _; do
  mkdir -p "$COMFY_DIR/models/$pasta"
  destino="$COMFY_DIR/models/$pasta/$ficheiro"
  [ -f "$destino" ] && [ ! -f "$destino.aria2" ] && continue
  auth=(); [ -n "${HF_TOKEN:-}" ] && auth=(--header="Authorization: Bearer $HF_TOKEN")
  aria2c -q -x 16 -s 16 -c "${auth[@]}" -d "$COMFY_DIR/models/$pasta" -o "$ficheiro" "$url"
done < "$BASE/pesos.tsv"

# ── Voz (Chatterbox Multilingual, MIT) e lábios (LatentSync 1.6, Apache-2.0) ──────────
CHATTERBOX_PY=""; LATENTSYNC_DIR=""; LATENTSYNC_PY=""
if [ "$PERFIL" = "completo" ]; then
  python3 -m venv "$BASE/venv-voz"
  "$BASE/venv-voz/bin/pip" install -q chatterbox-tts
  CHATTERBOX_PY="$BASE/venv-voz/bin/python"

  if [ ! -d "$BASE/LatentSync" ]; then
    git clone -q https://github.com/bytedance/LatentSync "$BASE/LatentSync"
  fi
  python3 -m venv "$BASE/venv-labios"
  "$BASE/venv-labios/bin/pip" install -q -r "$BASE/LatentSync/requirements.txt" "huggingface_hub[cli]"
  "$BASE/venv-labios/bin/huggingface-cli" download ByteDance/LatentSync-1.6 whisper/tiny.pt latentsync_unet.pt \
    --local-dir "$BASE/LatentSync/checkpoints" >/dev/null
  LATENTSYNC_DIR="$BASE/LatentSync"; LATENTSYNC_PY="$BASE/venv-labios/bin/python"

  if [ -n "${VOZ_REF_URL:-}" ] && [ ! -f "$BASE/voz/ricardo.wav" ]; then
    curl -fsSL "$VOZ_REF_URL" -o "$BASE/voz/ref.in" && ffmpeg -loglevel error -y -i "$BASE/voz/ref.in" -ac 1 -ar 24000 -t 30 "$BASE/voz/ricardo.wav"
  fi
  [ -f "$BASE/voz/ricardo.wav" ] || log "AVISO: falta $BASE/voz/ricardo.wav — sem ela o tipo voz/falar só corre com Fish (FISH_API_KEY)"
fi

# ── Ambiente do worker ────────────────────────────────────────────────────────────────
umask 077
cat > "$BASE/motor.env" <<ENV
MTM_SITE=${MTM_SITE:-https://www.morethanmoney.pt}
MTM_MOTOR_SECRET=${MTM_MOTOR_SECRET:-}
MOTOR_MODO=gpu
MOTOR_NOME=${MOTOR_NOME:-gpu-$(hostname | cut -c1-12)}
COMFY_URL=http://127.0.0.1:8188
ANGLE_VARIANTE=${ANGLE_VARIANTE:-}
CHATTERBOX_PY=$CHATTERBOX_PY
VOZ_REF=$BASE/voz/ricardo.wav
LATENTSYNC_DIR=$LATENTSYNC_DIR
LATENTSYNC_PY=$LATENTSYNC_PY
MOTOR_DESLIGAR_APOS_MIN=${MOTOR_DESLIGAR_APOS_MIN:-10}
MOTOR_CMD_DESLIGAR=${MOTOR_CMD_DESLIGAR:-$( [ -n "${RUNPOD_POD_ID:-}" ] && echo "runpodctl stop pod $RUNPOD_POD_ID" )}
FISH_API_KEY=${FISH_API_KEY:-}
FISH_VOICE_RICARDO=${FISH_VOICE_RICARDO:-}
ENV
log "ambiente em $BASE/motor.env"

[ "${ARRANCAR:-1}" = "1" ] || { log "instalado (ARRANCAR=0)"; exit 0; }
bash "$AQUI/arrancar.sh"

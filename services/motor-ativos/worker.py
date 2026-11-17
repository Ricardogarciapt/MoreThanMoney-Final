#!/usr/bin/env python3
"""
MOTOR DE ATIVOS MTM — worker da GPU (o nosso Higgsfield).

Corre numa máquina com GPU (alugada à hora, ou um Mac grande) ao lado de um ComfyUI local.
Em ciclo: pede trabalho a /api/estudio/motor/geracao, gera, sobe a saída para o bucket `estudio`
e fecha o trabalho (o site cria o ativo novo no /estudio).

Tipos (ver lib/estudio/geracao.ts):
  cena    foto + prompt → mesma pessoa noutro cenário     (ComfyUI: Qwen-Image-Edit 2511, workflow angle com LoRA de ângulos a 0)
  angulo  foto → outro ângulo de câmara                     (ComfyUI: Qwen-Image-Edit 2511 + Multiple-Angles LoRA)
  mover   imagem → clipe 9:16 com movimento de câmara       (ComfyUI: LTX-2 19B i2v + LoRAs de câmara)
  voz     texto → voz clonada do Ricardo                    (Chatterbox Multilingual, MIT; recurso: Fish Audio)
  falar   imagem/clipe + texto|áudio → clone a falar        (voz + mover estático + LatentSync 1.6, Apache-2.0)

Modos (MOTOR_MODO):
  gpu     a sério (precisa de ComfyUI em COMFY_URL, e para voz/falar do Chatterbox e do LatentSync)
  ensaio  sem GPU: gera saídas de teste com ffmpeg. Serve para provar o ciclo inteiro em qualquer máquina.

Só usa a biblioteca padrão do Python + ffmpeg/ffprobe no PATH.
"""
from __future__ import annotations

import json
import os
import random
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

AQUI = Path(__file__).resolve().parent
VERSAO = "1.0.0"

SITE = os.environ.get("MTM_SITE", "https://www.morethanmoney.pt").rstrip("/")
SEGREDO = os.environ.get("MTM_MOTOR_SECRET", "")  # = CRON_SECRET da Vercel (nunca no repositório)
MODO = os.environ.get("MOTOR_MODO", "gpu")
NOME = os.environ.get("MOTOR_NOME", socket.gethostname()[:40])
COMFY = os.environ.get("COMFY_URL", "http://127.0.0.1:8188").rstrip("/")
ANGLE_VARIANTE = os.environ.get("ANGLE_VARIANTE", "")  # "gguf" para GPUs < 48 GB
INTERVALO = float(os.environ.get("MOTOR_INTERVALO", "5"))
# Desligar sozinho: ao fim de N minutos sem trabalho corre este comando (ex.: «runpodctl stop pod $RUNPOD_POD_ID»).
DESLIGAR_APOS_MIN = float(os.environ.get("MOTOR_DESLIGAR_APOS_MIN", "0"))
CMD_DESLIGAR = os.environ.get("MOTOR_CMD_DESLIGAR", "")
# Modo noturno (Mac mini): só trabalha entre estas horas locais, ex. "1-7" (01h00–06h59).
JANELA = os.environ.get("MOTOR_JANELA", "")
# Não pega trabalho se a memória livre descer abaixo disto (GB). Protege o Mac de ir abaixo.
MEM_MIN_GB = float(os.environ.get("MOTOR_MEM_MIN_GB", "0"))
CHATTERBOX_PY = os.environ.get("CHATTERBOX_PY", "")  # python do venv do Chatterbox
VOZ_REF = os.environ.get("VOZ_REF", str(AQUI / "voz" / "ricardo.wav"))  # 10–30 s da voz real
LATENTSYNC_DIR = os.environ.get("LATENTSYNC_DIR", "")
LATENTSYNC_PY = os.environ.get("LATENTSYNC_PY", "python3")
FISH_KEY = os.environ.get("FISH_API_KEY", "")
FISH_VOZ = os.environ.get("FISH_VOICE_RICARDO", "")

TIPOS_TODOS = ["cena", "angulo", "mover", "voz", "falar"]

# Lados das saídas por aspecto. LTX quer múltiplos de 32; o Qwen aceita o mesmo.
DIMENSOES = {"9:16": (736, 1280), "1:1": (1024, 1024), "4:5": (896, 1120), "16:9": (1280, 736)}
FPS = 24
NEGATIVO = "blurry, low quality, distorted, warped face, extra limbs, flicker, jitter, watermark, text, subtitles, logo"
IDENTIDADE = "Keep exactly the same person: same face, same identity, same hair and skin. Photorealistic, natural light, sharp focus."
FALA = "The man talks naturally to the camera with subtle head and hand movement, calm confident expression, mouth moving as he speaks."


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ── Catálogo (manifest do open-higgsfield) ─────────────────────────────────────────────
def manifest() -> dict:
    return json.loads((AQUI / "workflows" / "manifest.json").read_text())


def prompt_angulo(p: dict, m: dict) -> str:
    g = m["angleGrammar"]
    tok = lambda lista, i: next(x["token"] for x in g[lista] if x["id"] == i)
    return " ".join(
        g["template"]
        .replace("{azimuth}", tok("azimuths", p.get("azimute", "front-right")))
        .replace("{elevation}", tok("elevations", p.get("elevacao", "eye")))
        .replace("{distance}", tok("distances", p.get("distancia", "medium")))
        .split()
    )


def frames_para(segundos: float) -> int:
    """LTX quer 8n+1 frames."""
    return max(9, round(segundos * FPS / 8) * 8 + 1)


def plano_mover(p: dict, m: dict, prompt_extra: str = "") -> dict:
    mov = next((c for c in m["cameraMoves"] if c["id"] == p.get("movimento", "dolly-in")), m["cameraMoves"][0])
    w, h = DIMENSOES.get(p.get("aspecto", "9:16"), DIMENSOES["9:16"])
    estatica = next(c["lora"] for c in m["cameraMoves"] if c["id"] == "static")
    acao = prompt_extra or p.get("prompt") or "the subject holds the moment, subtle natural motion"
    return {
        "prompt": f"{acao}. {mov['prompt']} Cinematic, film still quality.",
        "negative": NEGATIVO,
        "seed": int(p.get("seed", 0)),
        # Movimentos sem LoRA vão só por prompt: usa-se a LoRA estática com força 0.
        "cameraLora": mov["lora"] or estatica,
        "cameraLoraStrength": 1.0 if mov["lora"] else 0.0,
        "frames": frames_para(float(p.get("duracao_s", 5))),
        "width": w,
        "height": h,
        "fps": FPS,
    }


def aplicar(grafo: dict, entradas: dict, valores: dict) -> dict:
    g = json.loads(json.dumps(grafo))
    for chave, valor in valores.items():
        b = entradas.get(chave)
        if b is None:
            raise KeyError(f"binding desconhecido: {chave}")
        g[b["node"]]["inputs"][b["field"]] = valor
    return g


# ── HTTP ────────────────────────────────────────────────────────────────────────────────
def http(metodo: str, url: str, corpo: bytes | None = None, headers: dict | None = None, timeout=120) -> bytes:
    req = urllib.request.Request(url, data=corpo, method=metodo, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def site(metodo: str, caminho: str, dados: dict | None = None) -> dict:
    h = {"authorization": f"Bearer {SEGREDO}", "content-type": "application/json"}
    corpo = json.dumps(dados).encode() if dados is not None else None
    return json.loads(http(metodo, f"{SITE}{caminho}", corpo, h))


def descarregar(url: str, destino: Path) -> Path:
    destino.write_bytes(http("GET", url, timeout=300))
    return destino


# ── ffmpeg ──────────────────────────────────────────────────────────────────────────────
def ff(*args: str):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)


def duracao(ficheiro: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(ficheiro)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip() or 0)


def recortar_imagem(origem: Path, destino: Path, aspecto: str) -> Path:
    """Corta ao centro para o aspecto pedido (o Qwen mantém o aspecto da entrada)."""
    w, h = DIMENSOES.get(aspecto, DIMENSOES["9:16"])
    ff("-i", str(origem), "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}", "-frames:v", "1", str(destino))
    return destino


def primeiro_frame(video: Path, destino: Path) -> Path:
    ff("-i", str(video), "-frames:v", "1", str(destino))
    return destino


# ── ComfyUI ─────────────────────────────────────────────────────────────────────────────
def comfy_subir(imagem: Path) -> str:
    fronteira = uuid.uuid4().hex
    corpo = (
        f"--{fronteira}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{imagem.name}\"\r\n"
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + imagem.read_bytes() + f"\r\n--{fronteira}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{fronteira}--\r\n".encode()
    r = json.loads(http("POST", f"{COMFY}/upload/image", corpo, {"content-type": f"multipart/form-data; boundary={fronteira}"}))
    return r["name"] if not r.get("subfolder") else f"{r['subfolder']}/{r['name']}"


def comfy_correr(grafo: dict, no_saida: str, destino: Path, limite_s=1800) -> Path:
    cid = uuid.uuid4().hex
    r = json.loads(http("POST", f"{COMFY}/prompt", json.dumps({"prompt": grafo, "client_id": cid}).encode(), {"content-type": "application/json"}))
    pid = r["prompt_id"]
    fim = time.time() + limite_s
    while time.time() < fim:
        hist = json.loads(http("GET", f"{COMFY}/history/{pid}"))
        if pid in hist:
            h = hist[pid]
            st = h.get("status", {})
            if st.get("status_str") == "error":
                raise RuntimeError(f"ComfyUI: {json.dumps(st.get('messages', []))[:400]}")
            saidas = h.get("outputs", {}).get(no_saida, {})
            for lista in saidas.values():
                if isinstance(lista, list):
                    for f in lista:
                        if isinstance(f, dict) and f.get("filename"):
                            q = urllib.parse.urlencode({"filename": f["filename"], "subfolder": f.get("subfolder", ""), "type": f.get("type", "output")})
                            destino.write_bytes(http("GET", f"{COMFY}/view?{q}", timeout=300))
                            return destino
            if st.get("completed"):
                raise RuntimeError("ComfyUI terminou sem saída")
        time.sleep(2)
    raise TimeoutError("ComfyUI demorou demasiado")


def gerar_imagem_qwen(img: Path, prompt: str, p: dict, pasta: Path, lora_angulos: float) -> Path:
    m = manifest()
    est = m["angle"]
    ficheiro = est["variants"]["gguf"]["file"] if ANGLE_VARIANTE == "gguf" else est["file"]
    grafo = json.loads((AQUI / "workflows" / ficheiro).read_text())
    entrada = recortar_imagem(img, pasta / "entrada.png", p.get("aspecto", "9:16"))
    vals = {
        "image": comfy_subir(entrada),
        "prompt": prompt,
        "seed": int(p.get("seed", 0)),
        **est["defaults"],
        "angleLoraStrength": lora_angulos,
    }
    return comfy_correr(aplicar(grafo, est["inputs"], vals), est["outputs"]["image"], pasta / "saida.png")


def gerar_video_ltx(img: Path, p: dict, pasta: Path, prompt_extra: str = "") -> Path:
    m = manifest()
    est = m["move"]
    grafo = json.loads((AQUI / "workflows" / est["file"]).read_text())
    plano = plano_mover(p, m, prompt_extra)
    vals = {"image": comfy_subir(img), **plano}
    bruto = comfy_correr(aplicar(grafo, est["inputs"], vals), est["outputs"]["video"], pasta / "ltx.mp4")
    # Sem o áudio inventado pelo LTX; codificação amiga do Instagram.
    final = pasta / "saida.mp4"
    ff("-i", str(bruto), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", str(final))
    return final


# ── Voz e lábios ────────────────────────────────────────────────────────────────────────
def gerar_voz(texto: str, pasta: Path) -> Path:
    destino = pasta / "voz.wav"
    if CHATTERBOX_PY and Path(VOZ_REF).exists():
        subprocess.run([CHATTERBOX_PY, str(AQUI / "voz_chatterbox.py"), texto, VOZ_REF, str(destino)], check=True)
        return destino
    if FISH_KEY and FISH_VOZ:  # recurso pago (já usado no editor do Mac)
        corpo = json.dumps({"text": texto, "reference_id": FISH_VOZ, "format": "wav"}).encode()
        destino.write_bytes(http("POST", "https://api.fish.audio/v1/tts", corpo, {"authorization": f"Bearer {FISH_KEY}", "content-type": "application/json"}, 300))
        return destino
    raise RuntimeError("sem motor de voz: falta CHATTERBOX_PY + VOZ_REF (ou FISH_API_KEY + FISH_VOICE_RICARDO)")


def sincronizar_labios(video: Path, audio: Path, pasta: Path) -> Path:
    if not LATENTSYNC_DIR:
        raise RuntimeError("falta LATENTSYNC_DIR (corre o bootstrap.sh com o perfil completo)")
    destino = pasta / "falar.mp4"
    subprocess.run(
        [LATENTSYNC_PY, "-m", "scripts.inference",
         "--unet_config_path", "configs/unet/stage2_512.yaml",
         "--inference_ckpt_path", "checkpoints/latentsync_unet.pt",
         "--inference_steps", "20", "--guidance_scale", "1.5",
         "--video_path", str(video), "--audio_path", str(audio), "--video_out_path", str(destino)],
        cwd=LATENTSYNC_DIR, check=True,
    )
    return destino


def ajustar_a_duracao(video: Path, segundos: float, destino: Path) -> Path:
    """Repete em ciclo ou corta um clipe para durar o mesmo que o áudio."""
    ff("-stream_loop", "-1", "-i", str(video), "-t", f"{segundos:.2f}", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(destino))
    return destino


# ── Tipos ───────────────────────────────────────────────────────────────────────────────
def executar(t: dict, pasta: Path) -> Path:
    tipo, p = t["tipo"], t["params"]
    if MODO == "ensaio":
        return ensaio(t, pasta)

    img = None
    if t.get("imagem"):
        ext = ".mp4" if (t["imagem"].get("tipo") == "video") else ".img"
        img = descarregar(t["imagem"]["url"], pasta / f"ref{ext}")
        if ext == ".img":  # normaliza (HEIC/WEBP/JPG) para PNG
            png = pasta / "ref.png"
            ff("-i", str(img), "-frames:v", "1", str(png))
            img = png

    if tipo == "cena":
        return gerar_imagem_qwen(img, f"{p['prompt']}. {IDENTIDADE}", p, pasta, lora_angulos=0.0)
    if tipo == "angulo":
        return gerar_imagem_qwen(img, prompt_angulo(p, manifest()), p, pasta, lora_angulos=1.0)
    if tipo == "mover":
        if img.suffix == ".mp4":
            img = primeiro_frame(img, pasta / "frame.png")
        return gerar_video_ltx(img, p, pasta)
    if tipo == "voz":
        return gerar_voz(p["texto"], pasta)
    if tipo == "falar":
        audio = descarregar(t["audio"]["url"], pasta / "audio.in") if t.get("audio") else gerar_voz(p["texto"], pasta)
        wav = pasta / "audio.wav"
        ff("-i", str(audio), "-ac", "1", "-ar", "16000", str(wav))
        seg = min(duracao(wav), 15.0)
        if img.suffix == ".mp4":  # um take real: só se ajusta a duração
            base = ajustar_a_duracao(img, seg, pasta / "base.mp4")
        else:
            clipe = gerar_video_ltx(img, {**p, "duracao_s": min(seg, 8.0), "movimento": p.get("movimento", "static")}, pasta, FALA)
            base = ajustar_a_duracao(clipe, seg, pasta / "base.mp4")
        sincronizado = sincronizar_labios(base, wav, pasta)
        final = pasta / "saida.mp4"
        ff("-i", str(sincronizado), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(final))
        return final
    raise ValueError(f"tipo desconhecido: {tipo}")


def ensaio(t: dict, pasta: Path) -> Path:
    """Saídas de teste do tamanho e formato certos, sem GPU."""
    p = t["params"]
    w, h = DIMENSOES.get(p.get("aspecto", "9:16"), DIMENSOES["9:16"])
    rotulo = f"ENSAIO {t['tipo'].upper()}"
    texto = f"drawtext=text='{rotulo}':fontcolor=0xE9C46A:fontsize=48:x=(w-tw)/2:y=(h-th)/2"
    if t["tipo"] in ("cena", "angulo"):
        out = pasta / "saida.png"
        ff("-f", "lavfi", "-i", f"color=c=0x0d0d0f:s={w}x{h}", "-vf", texto, "-frames:v", "1", str(out))
    elif t["tipo"] == "voz":
        out = pasta / "saida.wav"
        ff("-f", "lavfi", "-i", "sine=frequency=440:duration=2", str(out))
    else:
        out = pasta / "saida.mp4"
        d = float(p.get("duracao_s", 4))
        ff("-f", "lavfi", "-i", f"color=c=0x0d0d0f:s={w}x{h}:d={d}:r={FPS}", "-vf", texto, "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out))
    return out


# ── Ciclo ───────────────────────────────────────────────────────────────────────────────
def gpu_nome() -> str:
    try:
        return subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"], capture_output=True, text=True, timeout=5).stdout.strip()[:120]
    except Exception:
        return "sem-gpu" if MODO == "ensaio" else "?"


def capacidades() -> list[str]:
    if MODO == "ensaio":
        return TIPOS_TODOS
    caps = os.environ.get("MOTOR_CAPS")
    if caps:
        return [c for c in caps.split(",") if c in TIPOS_TODOS]
    tem_voz = bool((CHATTERBOX_PY and Path(VOZ_REF).exists()) or (FISH_KEY and FISH_VOZ))
    return ["cena", "angulo", "mover"] + (["voz"] if tem_voz else []) + (["falar"] if tem_voz and LATENTSYNC_DIR else [])


def dentro_da_janela(hora: int | None = None) -> bool:
    if not JANELA:
        return True
    ini, fim = (int(x) for x in JANELA.split("-"))
    h = time.localtime().tm_hour if hora is None else hora
    return ini <= h < fim if ini <= fim else (h >= ini or h < fim)


def memoria_livre_gb() -> float:
    """macOS: páginas livres + inactivas + purgáveis (vm_stat). Linux: MemAvailable."""
    try:
        if sys.platform == "darwin":
            out = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5).stdout
            tam = int(out.split("page size of ")[1].split(" ")[0])
            paginas = 0
            for chave in ("Pages free", "Pages inactive", "Pages purgeable", "Pages speculative"):
                for linha in out.splitlines():
                    if linha.startswith(chave):
                        paginas += int(linha.split(":")[1].strip().rstrip("."))
            return paginas * tam / 1e9
        for linha in Path("/proc/meminfo").read_text().splitlines():
            if linha.startswith("MemAvailable"):
                return int(linha.split()[1]) / 1e6
    except Exception:  # noqa: BLE001
        pass
    return float("inf")


def pode_trabalhar() -> tuple[bool, str]:
    if not dentro_da_janela():
        return False, f"fora da janela {JANELA}h"
    if MEM_MIN_GB and memoria_livre_gb() < MEM_MIN_GB:
        return False, f"memória livre abaixo de {MEM_MIN_GB:g} GB"
    return True, ""


def uma_volta() -> bool:
    q = urllib.parse.urlencode({"motor": NOME, "gpu": gpu_nome(), "versao": VERSAO, "caps": ",".join(capacidades())})
    t = site("GET", f"/api/estudio/motor/geracao?{q}").get("trabalho")
    if not t:
        return False
    log("trabalho", t["id"], t["tipo"])
    inicio = time.time()
    pasta = Path(tempfile.mkdtemp(prefix="motor-"))
    try:
        saida = executar(t, pasta)
        http("PUT", t["saida"]["subir_url"], saida.read_bytes(), {"content-type": t["saida"]["mime"], "x-upsert": "true"}, 600)
        r = site("POST", "/api/estudio/motor/geracao", {"id": t["id"], "ok": True, "segundos_gpu": round(time.time() - inicio, 1), "tamanho": saida.stat().st_size})
        log("pronto", t["id"], r)
    except Exception as e:  # noqa: BLE001 — qualquer falha devolve o trabalho à fila
        log("falhou", t["id"], repr(e))
        try:
            site("POST", "/api/estudio/motor/geracao", {"id": t["id"], "ok": False, "erro": repr(e)[:480], "segundos_gpu": round(time.time() - inicio, 1)})
        except Exception as e2:  # noqa: BLE001
            log("nem consegui avisar o site", repr(e2))
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
    return True


def main():
    if not SEGREDO:
        sys.exit("Falta MTM_MOTOR_SECRET (o CRON_SECRET da Vercel).")
    log(f"motor de ativos {VERSAO} · {NOME} · modo {MODO} · site {SITE} · caps {capacidades()}")
    uma_vez = "--uma-vez" in sys.argv
    ultimo_trabalho = time.time()
    while True:
        pode, porque = pode_trabalhar()
        if not pode:  # sem pulso: o site não conta com este motor enquanto ele descansa
            if uma_vez:
                log("não trabalho agora:", porque)
                break
            time.sleep(60)
            ultimo_trabalho = time.time()
            continue
        try:
            trabalhou = uma_volta()
        except Exception as e:  # noqa: BLE001
            log("erro no ciclo", repr(e))
            trabalhou = False
        if uma_vez:
            break
        if trabalhou:
            ultimo_trabalho = time.time()
        elif DESLIGAR_APOS_MIN and CMD_DESLIGAR and time.time() - ultimo_trabalho > DESLIGAR_APOS_MIN * 60:
            log(f"{DESLIGAR_APOS_MIN:g} min sem trabalho: a desligar a máquina")
            subprocess.run(CMD_DESLIGAR, shell=True)
            return
        if not trabalhou:
            time.sleep(INTERVALO + random.random())


if __name__ == "__main__":
    main()

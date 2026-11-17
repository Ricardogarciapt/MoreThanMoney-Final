#!/usr/bin/env python3
"""
RunPod para o motor de ativos MTM — cria e gere a máquina GPU pela API REST (v1), sem painel.

  python3 runpod.py criar      → disco persistente (modelos) + pod GPU que instala tudo no 1.º arranque
  python3 runpod.py estado     → estado do pod e do disco
  python3 runpod.py ligar      → liga o pod parado (o site faz isto sozinho quando entra trabalho)
  python3 runpod.py parar      → para o pod (o worker faz isto sozinho ao fim de 10 min parado)
  python3 runpod.py apagar     → apaga o pod (o disco com os modelos fica)
  --ensaio                     → mostra os pedidos à API sem os enviar

Env: RUNPOD_API_KEY (obrigatório), MTM_MOTOR_SECRET (= CRON_SECRET da Vercel, vai para o env do pod),
     RUNPOD_DC (centro de dados, omissão EU-RO-1), RUNPOD_GPUS (lista por ordem de preferência),
     RUNPOD_VOLUME_GB (omissão 200), PERFIL (omissão completo), VOZ_REF_URL (opcional).
Guarda os ids criados em ~/.mtm-runpod.json; no fim diz o RUNPOD_POD_ID a pôr na Vercel.
Só usa a biblioteca padrão.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = os.environ.get("RUNPOD_API", "https://rest.runpod.io/v1")
ESTADO = Path(os.environ.get("MTM_RUNPOD_ESTADO", Path.home() / ".mtm-runpod.json"))
ENSAIO = "--ensaio" in sys.argv

IMAGEM = os.environ.get("RUNPOD_IMAGEM", "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04")
GPUS = [g.strip() for g in os.environ.get(
    "RUNPOD_GPUS", "NVIDIA L40S,NVIDIA RTX 6000 Ada Generation,NVIDIA RTX A6000"
).split(",") if g.strip()]
DC = os.environ.get("RUNPOD_DC", "EU-RO-1")
VOLUME_GB = int(os.environ.get("RUNPOD_VOLUME_GB", "200"))
REPO = "https://github.com/Ricardogarciapt/MoreThanMoney-Final"

# O pod: actualiza o código, instala (só descarrega o que falta no disco persistente), arranca
# ComfyUI + worker e fica vivo. O worker pára o pod sozinho quando não há trabalho.
ARRANQUE = (
    "cd /workspace && (git -C mtm pull -q || git clone -q --depth 1 " + REPO + " mtm) && "
    "bash mtm/services/motor-ativos/bootstrap.sh > /workspace/arranque.log 2>&1; sleep infinity"
)


def chave() -> str:
    k = os.environ.get("RUNPOD_API_KEY", "").strip()
    if not k and not ENSAIO:
        sys.exit("Falta RUNPOD_API_KEY.")
    return k


def api(metodo: str, caminho: str, corpo: dict | None = None) -> dict:
    if ENSAIO:
        print(json.dumps({"pedido": f"{metodo} {caminho}", "corpo": corpo}, ensure_ascii=False, indent=2))
        return {"id": f"ensaio-{caminho.strip('/').replace('/', '-')}"}
    req = urllib.request.Request(
        f"{API}{caminho}", method=metodo,
        data=json.dumps(corpo).encode() if corpo is not None else None,
        headers={"authorization": f"Bearer {chave()}", "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt.strip() else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"RunPod {e.code} em {metodo} {caminho}: {e.read().decode()[:400]}")


def ler() -> dict:
    return json.loads(ESTADO.read_text()) if ESTADO.exists() else {}


def gravar(d: dict):
    if ENSAIO:
        return
    ESTADO.write_text(json.dumps(d, indent=2))
    ESTADO.chmod(0o600)


def corpo_volume() -> dict:
    return {"name": "mtm-motor-ativos", "size": VOLUME_GB, "dataCenterId": DC}


def corpo_pod(volume_id: str) -> dict:
    env = {
        "PERFIL": os.environ.get("PERFIL", "completo"),
        "BASE": "/workspace",
        "MTM_SITE": os.environ.get("MTM_SITE", "https://www.morethanmoney.pt"),
        "MTM_MOTOR_SECRET": os.environ.get("MTM_MOTOR_SECRET", ""),
        "MOTOR_NOME": "runpod",
        "MOTOR_DESLIGAR_APOS_MIN": os.environ.get("MOTOR_DESLIGAR_APOS_MIN", "10"),
        # runpodctl já vem na imagem; RUNPOD_POD_ID é injectado pelo RunPod em cada pod.
        "MOTOR_CMD_DESLIGAR": "runpodctl stop pod $RUNPOD_POD_ID",
    }
    for opc in ("VOZ_REF_URL", "HF_TOKEN", "ANGLE_VARIANTE", "FISH_API_KEY", "FISH_VOICE_RICARDO"):
        if os.environ.get(opc):
            env[opc] = os.environ[opc]
    return {
        "name": "mtm-motor-ativos",
        "imageName": IMAGEM,
        "cloudType": "SECURE",
        "computeType": "GPU",
        "gpuTypeIds": GPUS,
        "gpuTypePriority": "custom",
        "gpuCount": 1,
        "dataCenterIds": [DC],
        "networkVolumeId": volume_id,
        "volumeMountPath": "/workspace",
        "containerDiskInGb": 40,
        "ports": ["22/tcp"],
        "env": env,
        "dockerEntrypoint": ["bash", "-lc"],
        "dockerStartCmd": [ARRANQUE],
    }


def criar():
    if not os.environ.get("MTM_MOTOR_SECRET") and not ENSAIO:
        sys.exit("Falta MTM_MOTOR_SECRET (o CRON_SECRET da Vercel) para o worker falar com o site.")
    d = ler()
    if not d.get("volume_id"):
        d["volume_id"] = api("POST", "/networkvolumes", corpo_volume())["id"]
        gravar(d)
        print(f"disco persistente criado: {d['volume_id']} ({VOLUME_GB} GB, {DC})")
    if not d.get("pod_id"):
        d["pod_id"] = api("POST", "/pods", corpo_pod(d["volume_id"]))["id"]
        gravar(d)
        print(f"pod criado: {d['pod_id']}")
    print("\nNa Vercel (Production): RUNPOD_POD_ID=" + d["pod_id"] + " e RUNPOD_API_KEY=<a tua chave>.")
    print("1.º arranque: 30–60 min a descarregar os modelos (vê /workspace/arranque.log).")


def pod_id() -> str:
    p = os.environ.get("RUNPOD_POD_ID") or ler().get("pod_id")
    if not p:
        sys.exit("Sem pod: corre primeiro «runpod.py criar» (ou define RUNPOD_POD_ID).")
    return p


def main():
    cmds = [a for a in sys.argv[1:] if not a.startswith("--")]
    cmd = cmds[0] if cmds else "estado"
    if cmd == "criar":
        criar()
    elif cmd == "ligar":
        api("POST", f"/pods/{pod_id()}/start"); print("a ligar")
    elif cmd == "parar":
        api("POST", f"/pods/{pod_id()}/stop"); print("parado")
    elif cmd == "apagar":
        api("DELETE", f"/pods/{pod_id()}"); d = ler(); d.pop("pod_id", None); gravar(d); print("pod apagado (o disco fica)")
    elif cmd == "estado":
        p = api("GET", f"/pods/{pod_id()}")
        print(json.dumps({k: p.get(k) for k in ("id", "desiredStatus", "costPerHr", "gpu", "machine", "lastStatusChange")}, indent=2, default=str))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()

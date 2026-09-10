#!/usr/bin/env python3
"""
O agente do VPS: reclama pedidos da fila, cria a conta no MT5, devolve as credenciais.

═══ PORQUE ESTE É AUTÓNOMO E O DO MAC NÃO ERA ═══

No Mac, o modo assistido precisava de alguém a escrever no terminal, e o Wine não deixava
garantir que as teclas iam para o MT5. Aqui há um ecrã virtual só para o MetaTrader e o
`xdotool` fala com a janela directamente. Não é preciso ninguém.

═══ O QUE ESTE AGENTE NUNCA FAZ ═══

· Não reclama nada durante uma transmissão. O site diz-lho e ele espera — são 2 vCPU
  partilhados com o SRS e o ffmpeg do DVR, e o que se estraga numa sessão ao vivo não se
  recupera.
· Não deita fora uma conta já criada. Assim que o journal regista a conta, ela EXISTE na
  corretora: se a password não se conseguir ler, entrega-se o login com um aviso em vez de
  um erro que mandaria criar outra.
· Não inventa credenciais. Sem confirmação no journal, o pedido volta à fila.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SITE = os.environ.get("MTM_AGENT_SITE", "https://www.morethanmoney.pt")
TOKEN = os.environ.get("MTMFUNDED_AGENT_SECRET", "")
INTERVALO = int(os.environ.get("MTM_AGENT_INTERVALO", "60"))


def registar(msg: str) -> None:
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def pedir(caminho: str, corpo: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{SITE}{caminho}",
        data=json.dumps(corpo).encode() if corpo is not None else None,
        headers={"Content-Type": "application/json", "x-agent-token": TOKEN},
        method="POST" if corpo is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read() or "{}")
    except urllib.error.HTTPError as e:
        corpo_erro = e.read().decode()[:200]
        return {"error": f"HTTP {e.code}: {corpo_erro}"}
    except Exception as e:
        return {"error": str(e)[:200]}


def garantir_mt5() -> bool:
    """O MetaTrader tem de estar aberto no ecrã virtual antes de se reclamar seja o que for."""
    r = subprocess.run(["bash", str(AQUI / "abrir-mt5.sh")], capture_output=True, text=True, timeout=180)
    if "janela" in r.stdout:
        return True
    registar(f"o MetaTrader não está pronto: {r.stdout.strip()[-160:]}")
    return False


def tratar_um() -> int:
    """0 = tratou um · 1 = erro · 2 = nada a fazer."""
    r = pedir("/api/mtmfunded/agent")

    if r.get("error"):
        registar(f"o site recusou: {r['error']}")
        return 1
    if r.get("emPausa"):
        registar(f"em pausa: {r.get('motivo', 'transmissão a decorrer')}")
        return 2

    pedido = r.get("pedido")
    if not pedido:
        return 2

    pid = pedido.get("id")
    registar(f"pedido {pid}: {pedido.get('primeiro_nome')} {pedido.get('sobrenome')} · "
             f"{pedido.get('deposito')} USD · {pedido.get('servidor')}")

    if not garantir_mt5():
        # O MT5 não está de pé. Devolve-se o pedido à fila em vez de gastar tentativas.
        pedir("/api/mtmfunded/agent", {"id": pid, "erro": "MetaTrader indisponível no VPS"})
        return 1

    try:
        saida = subprocess.run(
            [sys.executable, str(AQUI / "criar_conta.py"), json.dumps(pedido)],
            capture_output=True, text=True, timeout=420,
        )
        if saida.returncode != 0:
            motivo = (saida.stderr or "falhou sem dizer porquê").strip()[:300]
            registar(f"criação falhou: {motivo}")
            pedir("/api/mtmfunded/agent", {"id": pid, "erro": motivo})
            return 1

        resultado = json.loads(saida.stdout or "{}")
    except subprocess.TimeoutExpired:
        registar("a criação passou dos 7 minutos — devolvido à fila")
        pedir("/api/mtmfunded/agent", {"id": pid, "erro": "tempo esgotado a criar a conta"})
        return 1
    except Exception as e:
        pedir("/api/mtmfunded/agent", {"id": pid, "erro": str(e)[:300]})
        return 1

    if not resultado.get("login"):
        pedir("/api/mtmfunded/agent", {"id": pid, "erro": "sem login no resultado"})
        return 1

    if not resultado.get("password"):
        # A conta EXISTE. Devolver erro aqui mandava criar outra — e ficavam duas contas
        # reais para a mesma pessoa. Regista-se o que se sabe e pede-se atenção humana.
        registar(f"conta {resultado['login']} criada SEM password: {resultado.get('aviso', '')}")
        pedir("/api/mtmfunded/agent", {
            "id": pid,
            "erro": f"conta {resultado['login']} criada mas sem password legível — "
                    "define-a no MT5 e reenvia pelo painel de admin",
        })
        return 1

    entrega = pedir("/api/mtmfunded/agent", {
        "id": pid,
        "login": resultado["login"],
        "password": resultado["password"],
        "investor": resultado.get("investor"),
        "servidor": resultado.get("servidor"),
    })
    if entrega.get("ok"):
        registar(f"conta {resultado['login']} entregue · email: {'sim' if entrega.get('emailEnviado') else 'FALHOU'}")
        return 0

    registar(f"o site recusou a entrega: {entrega.get('error')}")
    return 1


def main() -> None:
    if not TOKEN:
        print("MTMFUNDED_AGENT_SECRET em falta", file=sys.stderr)
        sys.exit(1)

    modo = sys.argv[1] if len(sys.argv) > 1 else "correr"
    if modo == "uma-vez":
        code = tratar_um()
        print({0: "tratado", 1: "erro", 2: "nada a fazer"}[code])
        sys.exit(0 if code != 1 else 1)

    registar(f"agente a arrancar · site={SITE} · intervalo={INTERVALO}s")
    while True:
        try:
            r = tratar_um()
        except Exception as e:
            registar(f"erro inesperado: {e}")
            r = 1
        # Tratou um pedido? Volta já — a fila pode ter mais. Caso contrário, dorme.
        if r != 0:
            time.sleep(INTERVALO)


if __name__ == "__main__":
    main()

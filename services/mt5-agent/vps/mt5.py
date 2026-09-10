#!/usr/bin/env python3
"""
Conduz o MetaTrader 5 no ecrã virtual do VPS.

═══ PORQUE ISTO É DIFERENTE DA VERSÃO DO MAC ═══

No macOS, o Wine não expõe janelas à acessibilidade e nada trazia o MT5 à frente: as teclas
iam para a aplicação que estivesse à frente, fosse ela qual fosse. Aqui há um ecrã virtual só
para o MT5, e o `xdotool` fala com uma JANELA CONCRETA — com foco ou sem ele.

E, sobretudo: aqui **vê-se**. Cada passo pode ser fotografado e lido. Passa-se de mandar teclas
às cegas e torcer, para agir e confirmar. Toda a lógica abaixo assenta nisso: nunca se avança
sem ver que o passo anterior deu no que devia dar.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

DISPLAY = os.environ.get("DISPLAY", ":99")
AQUI = Path(__file__).resolve().parent
PREFIXO = Path(os.environ.get("WINEPREFIX", str(Path.home() / ".mt5")))


def _correr(cmd: list[str], timeout: int = 30) -> str:
    amb = {**os.environ, "DISPLAY": DISPLAY}
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=amb)
    return r.stdout.strip()


# ── janelas ──────────────────────────────────────────────────────────────────

def janelas() -> list[tuple[str, str]]:
    """Todas as janelas visíveis, com id e nome."""
    ids = _correr(["xdotool", "search", "--onlyvisible", "--name", ".+"]).splitlines()
    out = []
    for i in ids:
        nome = _correr(["xdotool", "getwindowname", i])
        if nome:
            out.append((i, nome))
    return out


def janela_por_nome(padrao: str) -> str | None:
    rx = re.compile(padrao, re.IGNORECASE)
    for i, nome in janelas():
        if rx.search(nome):
            return i
    return None


def esperar_janela(padrao: str, segundos: int = 20) -> str | None:
    limite = time.time() + segundos
    while time.time() < limite:
        j = janela_por_nome(padrao)
        if j:
            return j
        time.sleep(1)
    return None


# ── ver ──────────────────────────────────────────────────────────────────────

def fotografar(destino: str | None = None) -> str:
    alvo = destino or os.path.join(tempfile.mkdtemp(prefix="mt5-"), "ecra.png")
    _correr(["import", "-window", "root", alvo], timeout=40)
    return alvo


def ler_ecra() -> list[tuple[float, float, float, str]]:
    """OCR do ecrã inteiro: (y, x, altura, texto), coordenadas de 0 a 1."""
    img = fotografar()
    ocr = AQUI.parent / "ocr"
    if not ocr.exists():
        # No VPS não há framework Vision. Usa-se tesseract se lá estiver.
        return _ocr_tesseract(img)
    saida = subprocess.run([str(ocr), img], capture_output=True, text=True, timeout=90)
    linhas = []
    for l in saida.stdout.splitlines():
        p = l.split("\t", 3)
        if len(p) == 4:
            try:
                linhas.append((float(p[0]), float(p[1]), float(p[2]), p[3]))
            except ValueError:
                pass
    return linhas


def _ocr_tesseract(img: str) -> list[tuple[float, float, float, str]]:
    """Alternativa para Linux. Devolve vazio se o tesseract não estiver instalado."""
    try:
        r = subprocess.run(
            ["tesseract", img, "-", "-l", "eng", "--psm", "6", "tsv"],
            capture_output=True, text=True, timeout=90,
        )
    except FileNotFoundError:
        return []
    linhas = []
    largura = altura = 1.0
    try:
        dim = _correr(["identify", "-format", "%w %h", img])
        largura, altura = (float(x) for x in dim.split())
    except Exception:
        pass
    for l in r.stdout.splitlines()[1:]:
        c = l.split("\t")
        if len(c) >= 12 and c[11].strip():
            try:
                x, y, h = float(c[6]), float(c[7]), float(c[9])
                linhas.append((y / altura, x / largura, h / altura, c[11].strip()))
            except ValueError:
                pass
    return linhas


def texto_no_ecra() -> str:
    return "\n".join(t for _, _, _, t in ler_ecra())


def ve(padrao: str) -> bool:
    """O ecrã mostra isto? É a pergunta que substitui 'espero que tenha funcionado'."""
    return bool(re.search(padrao, texto_no_ecra(), re.IGNORECASE))


# ── agir ─────────────────────────────────────────────────────────────────────

def tecla(janela: str, *teclas: str, pausa: float = 0.25) -> None:
    for t in teclas:
        _correr(["xdotool", "key", "--window", janela, "--clearmodifiers", t])
        time.sleep(pausa)


def escrever(janela: str, texto: str, pausa: float = 0.4) -> None:
    # --delay 40: o Wine perde teclas quando chegam depressa de mais.
    _correr(["xdotool", "type", "--window", janela, "--delay", "40", texto], timeout=60)
    time.sleep(pausa)


def clicar(x: int, y: int) -> None:
    _correr(["xdotool", "mousemove", str(x), str(y), "click", "1"])
    time.sleep(0.4)


def clicar_texto(padrao: str) -> bool:
    """Clica no meio do texto que casar. Devolve False se não o encontrar — e não clica
    em lado nenhum, que é melhor do que clicar num sítio à sorte."""
    dim = _correr(["identify", "-format", "%w %h", fotografar()]).split()
    if len(dim) != 2:
        return False
    largura, altura = float(dim[0]), float(dim[1])
    rx = re.compile(padrao, re.IGNORECASE)
    for y, x, h, texto in ler_ecra():
        if rx.search(texto):
            clicar(int((x + 0.02) * largura), int((y + h / 2) * altura))
            return True
    return False


if __name__ == "__main__":
    accao = sys.argv[1] if len(sys.argv) > 1 else "ver"
    if accao == "janelas":
        for i, n in janelas():
            print(f"{i}\t{n}")
    elif accao == "texto":
        print(texto_no_ecra())
    elif accao == "foto":
        print(fotografar(sys.argv[2] if len(sys.argv) > 2 else None))
    else:
        print(json.dumps({"janelas": janelas(), "display": DISPLAY}, ensure_ascii=False))

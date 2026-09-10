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
    """Alternativa para Linux. Devolve vazio se o tesseract não estiver instalado.

    JUNTA AS PALAVRAS EM LINHAS, e é essa a parte que interessa. O tesseract em TSV devolve
    uma PALAVRA por registo; devolvê-las soltas fazia com que «select a company» nunca casasse
    — cada palavra ficava numa linha só dela e a expressão procurava três seguidas. O ecrã
    tinha o texto à frente e o agente jurava que não. As colunas `block/par/line` dizem que
    palavras pertencem à mesma linha; usa-se isso, e a caixa da linha é a união das caixas.

    `--psm 11` (texto esparso) e não `--psm 6`: um ecrã de aplicação não é um bloco de texto
    uniforme, e o modo 6 misturava a barra de separadores com o título do diálogo.
    """
    try:
        r = subprocess.run(
            ["tesseract", img, "-", "-l", "eng", "--psm", "11", "tsv"],
            capture_output=True, text=True, timeout=90,
        )
    except FileNotFoundError:
        return []

    largura = altura = 1.0
    try:
        dim = _correr(["identify", "-format", "%w %h", img])
        largura, altura = (float(x) for x in dim.split())
    except Exception:
        pass

    # (bloco, parágrafo, linha) → palavras por ordem, e os limites da linha inteira
    agrupadas: dict[tuple[str, str, str, str], dict] = {}
    for l in r.stdout.splitlines()[1:]:
        c = l.split("\t")
        if len(c) < 12 or not c[11].strip():
            continue
        try:
            x, y, w, h = float(c[6]), float(c[7]), float(c[8]), float(c[9])
            ordem = int(c[5])
        except ValueError:
            continue
        chave = (c[1], c[2], c[3], c[4])
        g = agrupadas.setdefault(chave, {"palavras": [], "x0": x, "y0": y, "x1": x + w, "y1": y + h})
        g["palavras"].append((ordem, c[11].strip()))
        g["x0"] = min(g["x0"], x)
        g["y0"] = min(g["y0"], y)
        g["x1"] = max(g["x1"], x + w)
        g["y1"] = max(g["y1"], y + h)

    linhas = []
    for g in agrupadas.values():
        texto = " ".join(t for _, t in sorted(g["palavras"]))
        linhas.append((g["y0"] / altura, g["x0"] / largura, (g["y1"] - g["y0"]) / altura, texto))
    linhas.sort()
    return linhas


def texto_no_ecra() -> str:
    return "\n".join(t for _, _, _, t in ler_ecra())


def ve(padrao: str) -> bool:
    """O ecrã mostra isto? É a pergunta que substitui 'espero que tenha funcionado'."""
    return bool(re.search(padrao, texto_no_ecra(), re.IGNORECASE))


def esperar_texto(padrao: str, segundos: int = 30) -> bool:
    """Espera até o ecrã mostrar isto — ou desiste ao fim do tempo.

    Um `sleep(4)` fixo é uma aposta: a lista de corretoras vem da rede e às vezes demora 15
    segundos. Foi exactamente isto que fez o primeiro pedido real falhar — o diálogo abriu,
    mas quatro segundos depois ainda estava em branco, e o agente concluiu que não tinha
    aberto. Esperar pelo que se procura custa o mesmo quando é rápido e salva quando não é.
    """
    limite = time.time() + segundos
    while True:
        if ve(padrao):
            return True
        if time.time() >= limite:
            return False
        time.sleep(2)


# ── agir ─────────────────────────────────────────────────────────────────────

# NUNCA `--window` AQUI. E a razão custou uma conta mal preenchida:
#
# Com `--window`, o xdotool envia eventos SINTÉTICOS (XSendEvent) para uma janela concreta.
# O Wine aceita-os mas ignora o estado dos modificadores — o SHIFT perde-se. "Ricardo" chegava
# como "ricardo" e o "@" do email como "2" (é shift+2), pelo que o campo do email ficava
# vermelho e o botão Seguinte morto, sem nada no ecrã a dizer porquê.
#
# Sem `--window`, o xdotool usa XTEST: teclas REAIS no servidor X, que o Wine trata como se
# viessem de um teclado. Maiúsculas e símbolos passam. Isto só é seguro porque neste ecrã
# virtual vive só o MetaTrader — não há outra aplicação para onde as teclas possam ir.
#
# O argumento `janela` fica na assinatura porque quem chama continua a saber com que janela
# está a falar, e um dia pode voltar a ser preciso.

def tecla(janela: str, *teclas: str, pausa: float = 0.25) -> None:
    for t in teclas:
        _correr(["xdotool", "key", "--clearmodifiers", t])
        time.sleep(pausa)


def escrever(janela: str, texto: str, pausa: float = 0.4) -> None:
    # --delay 60: o Wine perde teclas quando chegam depressa de mais.
    # `--` para que um texto começado por "-" não seja lido como opção.
    _correr(["xdotool", "type", "--delay", "60", "--", texto], timeout=90)
    time.sleep(pausa)


def clicar(x: int, y: int) -> None:
    _correr(["xdotool", "mousemove", str(x), str(y), "click", "1"])
    time.sleep(0.4)


def tinta(x: int, y: int, largura: int, altura: int) -> float:
    """O pixel mais escuro de um rectângulo (0 = preto, 255 = branco).

    Serve para uma pergunta que o OCR não responde: um botão está ACTIVO ou cinzento? O texto
    lê-se igual nos dois casos. Um «Next >» activo tem preto a sério (mínimo ~16); cinzento
    nunca desce dos ~166. Sem isto, clicava-se num botão morto e só se descobria minutos
    depois, quando o journal não registava conta nenhuma.
    """
    img = fotografar()
    r = _correr([
        "convert", img, "-crop", f"{largura}x{altura}+{x}+{y}", "+repage",
        "-colorspace", "Gray", "-format", "%[fx:minima*255]", "info:",
    ])
    try:
        return float(r)
    except ValueError:
        return 255.0


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

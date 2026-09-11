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


def janela_do_terminal() -> str | None:
    """A janela do MetaTrader, pela CLASSE e não pelo título.

    O título muda: acabada de criar a conta, o terminal entra nela e passa a chamar-se
    «19009 - TheTradingMaster-Live: Demo Account …» — sem a palavra «MetaTrader» em lado
    nenhum. Quem procurasse por nome concluía que o terminal tinha fechado, e o pedido
    seguinte voltava à fila com «o MetaTrader não está aberto no ecrã virtual», com ele à
    frente, aberto. A classe X (`terminal64.exe`) é a mesma da primeira à última conta.
    """
    for i in _correr(["xdotool", "search", "--onlyvisible", "--class", "terminal64"]).splitlines():
        if _correr(["xdotool", "getwindowname", i.strip()]):
            return i.strip()
    return None


def janela_por_nome(padrao: str) -> str | None:
    """Por nome — e, para o terminal, pela classe.

    `janela_por_nome("MetaTrader")` aparece em todo o código a querer dizer «a janela do
    terminal». Continua a querer dizer isso, seja qual for o título que ele tenha agora.
    """
    if re.search(r"metatrader|terminal64", padrao, re.IGNORECASE):
        j = janela_do_terminal()
        if j:
            return j
    rx = re.compile(padrao, re.IGNORECASE)
    for i, nome in janelas():
        if rx.search(nome):
            return i
    return None


# O ECRÃ VIRTUAL É DE 1440x900, e isso é uma decisão, não uma limitação por resolver.
#
# Tentei subi-lo para 1920x1080 — dá espaço para arrastar janelas quando alguém entra por VNC.
# Partiu tudo: as dezenas de coordenadas desta automação foram lidas de um ecrã real de
# 1440x900, e num ecrã maior o MetaTrader perde a barra de título (o menu sobe 29px), os
# diálogos deixam de centrar onde estavam, e a janela encaixotada a 1440x900 num ecrã de
# 1920x1080 fica com barras pretas que parecem uma avaria.
#
# Subir a resolução a sério significa tornar CADA coordenada relativa à janela, e recalibrar
# o que não for. É um trabalho com princípio e fim — não um efeito secundário de mudar um
# número no Xvfb. Até lá, 1440x900, que é o que mantém contas a ser emitidas.
LARGURA_MT5, ALTURA_MT5 = 1440, 900
DESVIO_Y = 0


def enquadrar_janela(janela: str) -> None:
    """Põe o MetaTrader sempre na mesma geometria, antes de se lhe tocar.

    TODAS as coordenadas desta automação foram lidas de um ecrã real de 1440x900. Crescer o
    ecrã virtual sem isto moveria cada diálogo para outro sítio e partiria tudo de uma vez,
    porque os diálogos do MT5 centram-se na janela e não no ecrã.
    
    Assim o ecrã pode ser do tamanho que for — e alguém pode arrastar a janela para onde
    quiser por VNC — que o agente volta a pô-la no sítio antes de trabalhar. É também o que
    torna a automação reprodutível: dois arranques encontram sempre a mesma geometria.
    """
    if not janela:
        return
    # Sair do maximizado primeiro: uma janela maximizada ignora o `windowsize`.
    _correr(["xdotool", "windowstate", "--remove", "MAXIMIZED_VERT", "--remove", "MAXIMIZED_HORZ", janela])
    time.sleep(0.4)
    _correr(["xdotool", "windowmove", janela, "0", str(DESVIO_Y)])
    _correr(["xdotool", "windowsize", janela, str(LARGURA_MT5), str(ALTURA_MT5)])
    time.sleep(0.8)

    # E devolve-se-lhe o FOCO.
    #
    # Mover e redimensionar tira o foco à janela, e as teclas desta automação vão por XTEST —
    # ou seja, para onde o foco estiver. Sem isto, o `ctrl+shift+n` que abre o diálogo de
    # criação caía no vazio de um ecrã de 1920x1080 e o agente concluía, trinta segundos
    # depois, que o atalho não funcionava.
    _correr(["xdotool", "windowactivate", "--sync", janela])
    _correr(["xdotool", "windowfocus", "--sync", janela])
    time.sleep(0.5)


def dimensoes_ecra() -> tuple[int, int]:
    """O tamanho REAL do ecrã virtual, lido do servidor X.

    O `ler_ecra()` devolve coordenadas de 0 a 1, e quem as usa tem de as multiplicar por
    alguma coisa. Durante muito tempo essa coisa foi 1440x900 escrito à mão, porque era o
    tamanho do ecrã. Ao passar para 1920x1080, cada clique calculado assim caiu a três
    quartos do caminho — e o agente parou sem que nada no log dissesse porquê.
    """
    try:
        saida = _correr(["xdpyinfo"], timeout=10)
        m = re.search(r"dimensions:\s+(\d+)x(\d+)", saida)
        if m:
            return int(m.group(1)), int(m.group(2))
    except Exception:
        pass
    return 1920, 1080


def px(xn: float) -> int:
    """Coordenada X normalizada → pixel no ecrã."""
    return int(xn * dimensoes_ecra()[0])


def py(yn: float) -> int:
    """Coordenada Y normalizada → pixel no ecrã."""
    return int(yn * dimensoes_ecra()[1])


def _ancora_navegador() -> tuple[float, float, str] | None:
    """A âncora do painel, por TRÊS caminhos — porque nenhum serve sozinho.

    1. O TÍTULO «Navigator». Lê-se bem em teoria; na prática o tesseract corta-o («ive») porque
       é texto azul-escuro pequeno sobre a barra do painel.
    2. A RAIZ da árvore («MetaTrader 5», que o tesseract corta em «MetaTra»). Desaparece quando
       a árvore rola — e some do OCR quando está SELECCIONADA: o fundo azul da selecção come o
       contraste e sobra um «Tr».
    3. «Accounts». É o que efectivamente se lê quando os outros dois falham.

    O terceiro estava deliberadamente de fora, com uma razão que era boa e ficou incompleta: a
    árvore rola e «Accounts» sai por cima, e quem decidisse SÓ por ele concluía que o painel
    estava fechado estando aberto — e carregava em Ctrl+N, que é um interruptor, fechando-o
    mesmo. A correcção não é ignorá-lo, é pô-lo em ÚLTIMO: só se pergunta por «Accounts»
    depois de os outros dois não terem respondido. Com o painel aberto e a árvore no topo —
    que é o estado em que se trabalha — os três concordam; com a árvore rolada, os dois
    primeiros bastam.

    Sem isto a desactivação nunca chegava a correr: dizia «o Navegador não abriu» com ele
    aberto e à vista, e repetia-se de minuto a minuto.

    Devolve (y, x, qual) normalizados. O `qual` diz onde fica «Accounts» a partir daí.
    """
    raiz = None
    contas = None
    for y, x, _h, texto in ler_ecra():
        if x >= 0.20 or y >= 0.32:
            continue
        if re.search(r"Navigator", texto, re.IGNORECASE):
            return (y, x, "titulo")
        if re.search(r"MetaTra", texto) and raiz is None:
            raiz = (y, x, "raiz")
        # «Accounts» sai do tesseract com o ícone colado à frente («\ Q Accounts»).
        if contas is None and re.search(r"Accounts?\b", texto, re.IGNORECASE):
            contas = (y, x, "contas")
    return raiz or contas


def navegador_aberto() -> bool:
    """O Navegador está à vista?

    Não se pergunta por «Accounts»: a árvore rola, e com as contas todas ele sai por cima.
    Quem decidisse por ele concluía que o painel estava fechado com ele aberto — e carregava
    em Ctrl+N, que é um interruptor, fechando-o mesmo. Foi assim que a emissão parou.
    """
    return _ancora_navegador() is not None


def linha_das_contas() -> tuple[int, int] | None:
    """Onde clicar em «Accounts» — por geometria, e não pelo texto.

    O tesseract lê «Accounts» como «Act», «Acc» ou «uns», conforme o ícone que tem ao lado.
    O que se lê sempre é a âncora do painel; «Accounts» fica a 38px dela.
    """
    a = _ancora_navegador()
    if a is None:
        return None
    y, x, qual = a
    # Quando a âncora JÁ É a linha das contas, não se desce nada — descer 38px daí caía na
    # primeira conta da lista, e o clique seguinte abria a conta errada.
    if qual == "contas":
        return (px(x + 0.06), py(y))
    return (px(x + 0.06), py(y) + 38)


def abrir_navegador(janela: str) -> bool:
    """Garante o Navegador ABERTO e a árvore no topo, onde está «Accounts».

    Ctrl+N alterna. Confirma-se depois de cada toque, em vez de assumir: dois Ctrl+N seguidos
    deixavam o painel exactamente como estava, e o passo seguinte procurava contas num painel
    invisível.
    """
    for _ in range(2):
        if navegador_aberto():
            break
        tecla(janela, "ctrl+n", pausa=2.5)

    if not navegador_aberto():
        return False

    # A árvore guarda a posição do scroll entre sessões. Sobe-se ao topo, que é onde vive
    # «Accounts» — e é de lá que se cria e se gere qualquer conta.
    clicar(110, 200)
    time.sleep(0.5)
    tecla(janela, "ctrl+Home", pausa=1)
    return navegador_aberto()


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

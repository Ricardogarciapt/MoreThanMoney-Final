#!/usr/bin/env python3
"""
Cria uma conta demo no MetaTrader 5, sozinho.

═══ COMO ISTO FUNCIONA, E PORQUÊ ASSIM ═══

O MT5 no Mac corre sob Wine, e o Wine NÃO expõe menus nem janelas à acessibilidade do macOS:
`System Events` não vê um único botão. Sobram as teclas — que funcionam — e nada mais.

Conduzir uma interface às cegas seria irresponsável se não houvesse forma de confirmar o
resultado. Há: o MT5 escreve no journal `new demo account 'NNNNN' opened on <servidor>`. O
log é a FONTE DA VERDADE. As teclas tentam; o log confirma. Se o log não confirmar, não se
inventa nada — devolve-se erro e o pedido volta à fila.

A PASSWORD é a parte difícil, e não há caminho perfeito.

Tentei desenhar isto a MUDAR a password depois de criar a conta, para deixarmos de a adivinhar.
Fui verificar nos logs e não existe uma única linha de `change of password` (mestre) — só de
`change of investor password`, e três dessas falharam com «Not enough permissions». O
`accounts.dat` onde o MT5 as guarda é cifrado. Portanto: a password mestre NÃO se recupera do
disco e NÃO há prova de que se possa alterar.

Sobram dois caminhos, por esta ordem:
  1. OCR do diálogo de conclusão (ler_credenciais.py) — exige permissão de GRAVAÇÃO DE ECRÃ.
     É o caminho fiável, e já está construído e testado.
  2. Tentar alterar a password mestre — mantido como recurso, porque não está provado que
     falhe, mas também não está provado que funcione.

O QUE NUNCA ACONTECE: criar uma conta e deitá-la fora. Assim que o journal regista a conta,
ela EXISTE na corretora. Se a password não se conseguir obter, devolve-se o login com um aviso
de que falta a password — nunca um erro que mande criar outra. A primeira versão disto fazia
exactamente isso: três contas reais por pedido, todas abandonadas.
"""
# O Mac traz o Python 3.9 do Xcode, que ainda não aceita `str | None` em anotações. Isto faz
# as anotações serem texto e o ficheiro correr em qualquer 3.x — o agente tem de funcionar
# com o Python que existir na máquina, não com o que gostaríamos que existisse.
from __future__ import annotations

import json
import os
import re
import secrets
import string
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

PREFIXO_WINE = Path.home() / "Library/Application Support/net.metaquotes.wine.metatrader5/drive_c"
APP = "/Applications/MetaTrader 5.app"
ESPERA_LOG = 60          # segundos à espera da confirmação no journal
PAUSA_TECLA = 0.12       # entre teclas — o Wine perde teclas se forem rápidas de mais


# ── journal ──────────────────────────────────────────────────────────────────

def _pastas_de_log() -> list[Path]:
    return [p for p in PREFIXO_WINE.rglob("logs") if p.is_dir()]


def _log_de_hoje() -> list[Path]:
    hoje = datetime.now().strftime("%Y%m%d")
    return [p / f"{hoje}.log" for p in _pastas_de_log() if (p / f"{hoje}.log").exists()]


def _ler(p: Path) -> str:
    # O MT5 escreve os logs em UTF-16 nalgumas versões e em latim noutras.
    for codec in ("utf-8", "utf-16", "latin-1"):
        try:
            return p.read_text(encoding=codec, errors="ignore")
        except Exception:
            continue
    return ""


def marca_dagua() -> int:
    """Tamanho actual dos logs. Só se olha para o que for escrito DEPOIS disto — senão
    apanhava-se a conta criada ontem e dava-se por criada a de hoje."""
    return sum(p.stat().st_size for p in _log_de_hoje())


def procurar_no_log(padrao: str, desde: int, segundos: int = ESPERA_LOG) -> str | None:
    """Espera até `segundos` por uma linha nova que case com o padrão. Devolve o grupo 1."""
    rx = re.compile(padrao, re.IGNORECASE)
    limite = time.time() + segundos
    while time.time() < limite:
        acumulado = 0
        for p in _log_de_hoje():
            texto = _ler(p)
            acumulado += p.stat().st_size
            for linha in texto.splitlines():
                m = rx.search(linha)
                if m:
                    # Só conta se for texto novo — comparação grosseira mas suficiente:
                    # os logs só crescem.
                    if acumulado > desde or desde == 0:
                        return m.group(1) if m.groups() else linha
        time.sleep(1.5)
    return None


# ── teclado ──────────────────────────────────────────────────────────────────

def _osa(script: str) -> None:
    subprocess.run(["osascript", "-e", script], capture_output=True, timeout=20)


def _processo_em_foco() -> str:
    r = subprocess.run(
        ["osascript", "-e",
         'tell application "System Events" to get name of first process whose frontmost is true'],
        capture_output=True, text=True, timeout=15,
    )
    return r.stdout.strip()


def activar() -> None:
    """
    Põe o MT5 à frente — e CONFIRMA que ficou.

    Isto não é zelo a mais. O Wine não expõe janelas à acessibilidade, e o `open -a` nem sempre
    traz a janela para a frente. Sem esta confirmação, as teclas iam para a aplicação que
    estivesse à frente: um email e um Enter escritos dentro do editor de código, do browser, ou
    de uma conversa. Melhor abortar do que escrever às cegas na aplicação errada.
    """
    subprocess.run(["open", "-a", APP], capture_output=True, timeout=20)
    for _ in range(10):
        time.sleep(1.0)
        foco = _processo_em_foco().lower()
        if "wine" in foco or "metatrader" in foco:
            time.sleep(0.8)
            return
    raise RuntimeError(
        f"o MetaTrader não veio para a frente (à frente está: {_processo_em_foco() or 'nada'}). "
        "Abre-o e deixa a janela visível — sem foco, as teclas iriam para outra aplicação."
    )


def escrever(texto: str) -> None:
    seguro = texto.replace("\\", "\\\\").replace('"', '\\"')
    _osa(f'tell application "System Events" to keystroke "{seguro}"')
    time.sleep(PAUSA_TECLA)


def tecla(nome: str, vezes: int = 1) -> None:
    codigos = {"tab": 48, "enter": 36, "space": 49, "esc": 53, "down": 125, "up": 126}
    for _ in range(vezes):
        _osa(f'tell application "System Events" to key code {codigos[nome]}')
        time.sleep(PAUSA_TECLA)


def atalho(letra: str, com_shift: bool = False) -> None:
    mods = '{control down' + (', shift down' if com_shift else '') + '}'
    _osa(f'tell application "System Events" to keystroke "{letra}" using {mods}')
    time.sleep(0.4)


def pode_gravar_ecra() -> bool:
    """A captura de ecrã está autorizada? Sem ela não há OCR do diálogo."""
    try:
        # NÃO usar nome começado por ponto: o `screencapture` recusa escrever em ficheiros
        # ocultos — e devolve código 0 na mesma. Só a existência do ficheiro prova que gravou.
        alvo = os.path.join(tempfile.gettempdir(), "mtm-teste-ecra.png")
        r = subprocess.run(["screencapture", "-x", alvo], capture_output=True, timeout=15)
        existe = os.path.exists(alvo)
        if existe:
            os.unlink(alvo)
        return r.returncode == 0 and existe
    except Exception:
        return False


def ler_do_ecra() -> dict:
    """Fotografa o ecrã e lê as credenciais. Devolve {} se não conseguir ler com confiança."""
    alvo = os.path.join(tempfile.mkdtemp(prefix="mtm-"), "dialogo.png")
    try:
        subprocess.run(["screencapture", "-x", alvo], capture_output=True, timeout=20)
        r = subprocess.run(
            [sys.executable, str(Path(__file__).parent / "ler_credenciais.py"), alvo],
            capture_output=True, text=True, timeout=90,
        )
        dados = json.loads(r.stdout or "{}")
        # `problemas` não vazio = leitura duvidosa. Uma password duvidosa é pior do que
        # nenhuma: entrega-se uma conta que não abre e ninguém sabe porquê.
        return {} if dados.get("problemas") else dados
    except Exception:
        return {}
    finally:
        # A fotografia tem uma password no meio. Não fica no disco — nem o ficheiro nem a
        # pasta que o continha.
        try:
            os.unlink(alvo)
            os.rmdir(os.path.dirname(alvo))
        except OSError:
            pass


# ── password ─────────────────────────────────────────────────────────────────

def gerar_password() -> str:
    """
    Password para o MT5: 12 caracteres com maiúscula, minúscula e dígito — as três classes
    que o servidor exige. Sem símbolos: alguns servidores MT5 recusam-nos, e descobrir isso
    a meio de uma criação automática é perder a conta.
    """
    alfabeto = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alfabeto) for _ in range(12))
        if any(c.isupper() for c in pw) and any(c.islower() for c in pw) and any(c.isdigit() for c in pw):
            return pw


# ── a criação ────────────────────────────────────────────────────────────────

def criar(pedido: dict) -> dict:
    """
    Devolve {'login':…, 'password':…, 'servidor':…} ou levanta RuntimeError.

    Cada passo é uma tentativa às cegas; o log é que decide se resultou.
    """
    servidor = pedido.get("servidor", "TheTradingMaster-Live")
    deposito = str(int(float(pedido.get("deposito") or 10000)))
    alavancagem = str(pedido.get("alavancagem") or 100)

    activar()
    antes = marca_dagua()

    # Ficheiro → Abrir uma conta. No Wine o menu não é acessível por nome; o MT5 responde
    # ao atalho do Windows.
    atalho("n", com_shift=True)   # Ctrl+Shift+N = abrir conta (MT5 Windows)
    time.sleep(2.5)

    # Corretora: escreve-se o nome e escolhe-se o primeiro resultado.
    escrever(servidor.split("-")[0])
    time.sleep(2.0)
    tecla("enter")
    time.sleep(2.0)

    # "Abrir uma conta demo" costuma ser a primeira opção da lista.
    tecla("enter")
    time.sleep(2.0)

    # Formulário. A ordem dos campos é a da imagem que o Ricardo enviou.
    escrever(pedido.get("primeiro_nome", "MTM"))
    tecla("tab")
    escrever(pedido.get("sobrenome", "Torneio"))
    tecla("tab")
    escrever(pedido.get("email", ""))
    tecla("tab")
    escrever(pedido.get("telefone") or "+351000000000")
    tecla("tab", 3)          # salta data de nascimento, servidor e tipo de conta (defaults)
    escrever(deposito)
    tecla("tab")
    escrever(alavancagem)
    tecla("tab")
    tecla("space")           # aceitar os termos
    tecla("enter")           # Seguinte

    login = procurar_no_log(r"new demo account '(\d+)' opened", antes, ESPERA_LOG)
    if not login:
        raise RuntimeError(
            "o journal do MT5 não registou nenhuma conta nova — a sequência de teclas não "
            "chegou ao fim. Nada foi criado."
        )

    # ── A CONTA JÁ EXISTE ────────────────────────────────────────────────────
    # A partir daqui, falhar não pode significar "tenta outra vez": tentar outra vez cria
    # OUTRA conta real na corretora. O que falta é só a password.
    time.sleep(3)

    # Caminho 1: ler do diálogo, que ainda está no ecrã.
    if pode_gravar_ecra():
        lido = ler_do_ecra()
        if lido.get("password") and (not lido.get("login") or lido["login"] == login):
            return {
                "login": login,
                "password": lido["password"],
                "investor": lido.get("investor"),
                "servidor": servidor,
                "origem_password": "ocr",
            }

    # Caminho 2: tentar defini-la. Não está provado que funcione neste servidor — se não
    # funcionar, não se perde nada por ter tentado.
    nova = gerar_password()
    antes_pw = marca_dagua()
    atalho("o")
    time.sleep(1.5)
    tecla("tab")
    escrever(nova)
    tecla("tab")
    escrever(nova)
    tecla("enter")
    if procurar_no_log(r"'" + re.escape(login) + r"': change of password (completed)", antes_pw, 25):
        return {"login": login, "password": nova, "servidor": servidor, "origem_password": "alterada"}
    tecla("esc")   # fecha o diálogo que ficou aberto

    # Nem uma coisa nem outra. A conta EXISTE — devolve-se assim mesmo, com o aviso.
    # Inventar uma password, ou fingir erro e deixar criar outra, seriam ambos piores.
    return {
        "login": login,
        "password": None,
        "servidor": servidor,
        "origem_password": None,
        "precisa_password": True,
        "aviso": (
            f"conta {login} criada, mas a password não foi obtida. "
            "Liga a Gravação de Ecrã ao agente (Definições → Privacidade → Gravação de Ecrã) "
            "para o OCR a poder ler, ou copia-a do MetaTrader."
        ),
    }


if __name__ == "__main__":
    try:
        entrada = json.loads(sys.argv[1]) if len(sys.argv) > 1 else json.load(sys.stdin)
        print(json.dumps(criar(entrada), ensure_ascii=False))
    except Exception as e:
        print(str(e)[:400], file=sys.stderr)
        sys.exit(1)

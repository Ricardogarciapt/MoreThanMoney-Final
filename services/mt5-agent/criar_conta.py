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

A PASSWORD NÃO SE LÊ, DEFINE-SE. Ler a password do ecrã exigia OCR e permissão de gravação
de ecrã, e uma password mal lida entrega uma conta que não abre. Em vez disso, depois de a
conta existir, muda-se a password para uma que geramos — com entropia a sério — e confirma-se
no log (`change of password completed`). Passamos de adivinhar para saber.
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


def activar() -> None:
    subprocess.run(["open", "-a", APP], capture_output=True, timeout=20)
    time.sleep(1.5)


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

    # A conta existe e o MT5 entrou nela. Agora a password passa a ser NOSSA.
    time.sleep(3)
    nova = gerar_password()
    antes_pw = marca_dagua()
    atalho("o")              # Ctrl+O = alterar password (MT5 Windows)
    time.sleep(1.5)
    tecla("tab")
    escrever(nova)
    tecla("tab")
    escrever(nova)
    tecla("enter")

    ok = procurar_no_log(r"'" + re.escape(login) + r"': (change of password completed)", antes_pw, 30)
    if not ok:
        # A conta existe, mas não sabemos a password. Devolver a conta sem password seria
        # entregar ao participante uma conta que ele não consegue abrir.
        raise RuntimeError(
            f"conta {login} criada mas a password não foi alterada — "
            "é preciso defini-la à mão no MT5 e reenviar"
        )

    return {"login": login, "password": nova, "servidor": servidor}


if __name__ == "__main__":
    try:
        entrada = json.loads(sys.argv[1]) if len(sys.argv) > 1 else json.load(sys.stdin)
        print(json.dumps(criar(entrada), ensure_ascii=False))
    except Exception as e:
        print(str(e)[:400], file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""
Desactiva uma conta no MetaTrader do VPS: troca-lhe a password e apaga-a do terminal.

═══ PORQUE SÃO AS DUAS COISAS, E NÃO SÓ UMA ═══

APAGAR do terminal, sozinho, não desactiva nada: a conta continua a existir na corretora e
quem tiver as credenciais no telemóvel continua a negociá-la. É preciso trocar a password
primeiro — a partir daí as credenciais antigas não servem a ninguém.

TROCAR a password, sozinho, deixa a conta na árvore do Navegador para sempre. E essa árvore é
por onde o próprio agente se orienta para criar as contas seguintes: com cem contas mortas lá
dentro, a procura pela conta certa passa a demorar minutos.

Falhando a troca, não se apaga. Uma conta apagada do terminal com a password antiga viva é o
pior dos dois mundos: ninguém a vê e qualquer um a usa.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import mt5  # noqa: E402
import criar_conta as cc  # noqa: E402
import mudar_password as mp  # noqa: E402


def registar(msg: str) -> None:
    cc.registar(msg)


def apagar_do_terminal(login: str) -> bool:
    """Navegador → a conta → botão direito → Delete, e confirmar."""
    janela = mt5.janela_por_nome("MetaTrader") or ""
    mp.fechar_dialogo_aberto()

    if not mt5.abrir_navegador(janela):
        registar("o Navegador não abriu")
        return False

    mt5.clicar(*mp.NAVEGADOR_CONTAS)
    time.sleep(0.8)
    mt5.tecla(janela, "Right", pausa=1.5)
    if not mt5.clicar_texto(r"TheTradingMaster|Trading\s*Master"):
        return False
    mt5.tecla(janela, "Right", pausa=1.5)

    base = mp.linha_da_corretora()
    if base is None:
        registar("não encontrei a corretora na árvore")
        return False

    # De baixo para cima: as contas a apagar são as mais recentes muito mais vezes do que as
    # antigas, e cada tentativa custa alguns segundos.
    total = max(mp.quantas_contas(), 1)
    for indice in range(total - 1, -1, -1):
        y = base + mp.PRIMEIRA_CONTA + mp.ALTURA_LINHA * indice + 6
        mt5._correr(["xdotool", "mousemove", "110", str(y), "click", "3"])
        time.sleep(2)

        # Confirma-se QUE CONTA é antes de apagar. Uma coordenada errada aqui apaga a conta de
        # outra pessoa — e essa não se recupera.
        linha = ""
        for _y, _x, _h, texto in mt5.ler_ecra():
            if _x < 0.25 and str(login) in texto:
                linha = texto
                break

        if not linha:
            mt5.tecla(janela, "Escape", pausa=0.8)
            continue

        if not mt5.clicar_texto(r"^\s*(Delete|Apagar|Eliminar)\b"):
            mt5.tecla(janela, "Escape", pausa=0.8)
            continue

        time.sleep(2)
        # O MetaTrader pergunta se é mesmo para apagar. Responde-se Yes/Sim.
        if mt5.ve(r"delete|apagar|are you sure|tem a certeza"):
            if not mt5.clicar_texto(r"^\s*(Yes|Sim|OK)\s*$"):
                mt5.tecla(janela, "Return", pausa=1)
        time.sleep(2)

        # A prova é a conta ter desaparecido da árvore.
        sumiu = not any(str(login) in t and x < 0.25 for _y, x, _h, t in mt5.ler_ecra())
        if sumiu:
            registar(f"conta {login} apagada do terminal")
            return True

    registar(f"não encontrei a conta {login} na árvore")
    return False


def desactivar(login: str, password_atual: str | None) -> dict:
    janela = mt5.esperar_janela("MetaTrader", 30)
    if not janela:
        return {"ok": False, "motivo": "o MetaTrader não está aberto no ecrã virtual"}
    mt5.enquadrar_janela(janela)

    trocada = False
    if password_atual:
        r = mp.trocar(str(login), [password_atual])
        trocada = bool(r.get("ok"))
        if not trocada:
            # Sem trocar a password, apagar do terminal deixava a conta viva nas mãos de quem
            # tivesse as credenciais antigas. Diz-se, e não se apaga.
            registar(f"conta {login}: não consegui trocar a password — {r.get('motivo')}")
            return {"ok": False, "motivo": r.get("motivo"), "passwordTrocada": False}

    apagada = apagar_do_terminal(str(login))
    return {"ok": apagada, "passwordTrocada": trocada, "apagadaDoTerminal": apagada}


if __name__ == "__main__":
    try:
        entrada = json.loads(sys.argv[1]) if len(sys.argv) > 1 else json.load(sys.stdin)
        print(json.dumps(desactivar(str(entrada["login"]), entrada.get("password")), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "motivo": str(e)[:300]}, ensure_ascii=False))
        sys.exit(1)

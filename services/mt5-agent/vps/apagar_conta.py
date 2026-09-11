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

    return _apagar_linha_da_conta(janela, login, base)


def _linha_no_ecra(login: str) -> int | None:
    """Onde está ESTA conta na árvore, em pixels — lido do ecrã, não calculado.

    O código anterior adivinhava a posição por geometria (base + altura × índice) e varria a
    lista de baixo para cima à espera de acertar. Adivinhar onde está uma linha para lhe fazer
    clique-direito e Delete é o tipo de coisa que funciona até ao dia em que a árvore rola ou
    ganha uma linha — e nesse dia apaga outra conta.

    Aqui pergunta-se ao ecrã. Se o OCR não a lê, não se apaga nada: é a falha certa.
    """
    for y, x, altura, texto in mt5.ler_ecra():
        if x >= 0.25:
            continue
        if re.search(rf"\b{re.escape(str(login))}\b", texto):
            return mt5.py(y) + max(int(altura * mt5.dimensoes_ecra()[1] / 2), 4)
    return None


def _conta_na_linha(y_pixel: int) -> str | None:
    """Que conta está NA linha que acabou de ser clicada.

    A verificação antiga procurava o login em TODO o painel — e o painel tem a lista inteira à
    vista. Bastava a conta estar algures na árvore para a verificação passar, mesmo que o
    clique-direito tivesse caído noutra linha. Ou seja: a guarda que existia para impedir
    apagar a conta errada nunca chegou a olhar para a linha certa.

    Agora lê-se só a FAIXA do clique. Uma linha tem ~18px; meia altura para cada lado chega
    para a apanhar inteira sem apanhar as vizinhas.
    """
    altura_ecra = mt5.dimensoes_ecra()[1]
    for y, x, _h, texto in mt5.ler_ecra():
        if x >= 0.25:
            continue
        if abs(mt5.py(y) - y_pixel) > 9:
            continue
        m = re.search(r"\b(\d{5,})\b", texto)
        if m:
            return m.group(1)
    return None


def _apagar_linha_da_conta(janela: str, login: str, base: int) -> bool:
    y = _linha_no_ecra(login)
    if y is None:
        registar(f"não encontrei a conta {login} na árvore")
        return False

    mt5._correr(["xdotool", "mousemove", "110", str(y), "click", "3"])
    time.sleep(2)

    # A GUARDA: que conta está mesmo nesta linha? Uma coordenada errada aqui apaga a conta de
    # outra pessoa, e essa não se recupera. O OCR confunde dígitos parecidos — 19019 já foi
    # lido como 19013 — por isso exige-se igualdade EXACTA, e desiste-se em vez de arriscar.
    na_linha = _conta_na_linha(y)
    if na_linha != str(login):
        registar(f"a linha clicada tem {na_linha or 'nada legível'}, não {login} — não apago")
        mt5.tecla(janela, "Escape", pausa=0.8)
        return False

    if not mt5.clicar_texto(r"^\s*(Delete|Apagar|Eliminar)\b"):
        registar("não encontrei o Delete no menu")
        mt5.tecla(janela, "Escape", pausa=0.8)
        return False

    time.sleep(2)
    # O MetaTrader pergunta se é mesmo para apagar. Responde-se Yes/Sim.
    if mt5.ve(r"delete|apagar|are you sure|tem a certeza"):
        if not mt5.clicar_texto(r"^\s*(Yes|Sim|OK)\s*$"):
            mt5.tecla(janela, "Return", pausa=1)
    time.sleep(2)

    # A prova é a conta ter desaparecido da árvore.
    if _linha_no_ecra(login) is None:
        registar(f"conta {login} apagada do terminal")
        return True

    registar(f"a conta {login} continua na árvore depois do Delete")
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

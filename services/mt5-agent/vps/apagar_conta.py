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


def _ler_arvore(vezes: int = 3) -> dict[str, int]:
    """A árvore lida várias vezes, unindo o que cada passagem viu.

    Uma leitura não chega. O tesseract omite linhas inteiras de forma consistente: a 19015
    faltou em TRÊS leituras seguidas e apareceu na quarta — três leituras concordantes e todas
    erradas. Quem decidisse por uma passagem concluía que a conta já não existia.

    Unir as passagens não torna o OCR fiável; torna-o menos cego. O que decide se uma conta é
    apagada continua a ser o diálogo do MetaTrader, que não passa por aqui.
    """
    encontradas: dict[str, int] = {}
    for _ in range(max(vezes, 1)):
        for y, x, altura, texto in mt5.ler_ecra():
            if x >= 0.25:
                continue
            m = re.search(r"\b(\d{5,})\b", texto)
            if m and m.group(1) not in encontradas:
                meia = max(int(altura * mt5.dimensoes_ecra()[1] / 2), 4)
                encontradas[m.group(1)] = mt5.py(y) + meia
    return encontradas


def _linha_no_ecra(login: str) -> int | None:
    """Onde está ESTA conta na árvore, em pixels — lido do ecrã, não calculado.

    O código anterior adivinhava a posição por geometria (base + altura × índice) e varria a
    lista de baixo para cima à espera de acertar. Adivinhar onde está uma linha para lhe fazer
    clique-direito e Delete é o tipo de coisa que funciona até ao dia em que a árvore rola ou
    ganha uma linha — e nesse dia apaga outra conta.

    Aqui pergunta-se ao ecrã. Se o OCR não a lê, não se apaga nada: é a falha certa.
    """
    return _ler_arvore().get(str(login))


def _conta_no_dialogo() -> str | None:
    """Que conta é que o MetaTrader está a perguntar se pode apagar.

    ESTA É A GUARDA QUE VALE, e as outras todas são aproximações dela.

    Tudo o que se faz antes — encontrar a linha por OCR, clicar, confirmar o texto na faixa
    clicada — assenta em coordenadas lidas num instante e usadas noutro. E entre os dois a
    JANELA MEXE-SE: apanhei o MetaTrader deslocado 30px, que são quase duas linhas da árvore.
    Foi assim que um Delete apontado à 19015 foi parar à 19013.

    O diálogo de confirmação não tem esse problema: é o próprio MetaTrader a dizer, por
    extenso, o que está prestes a fazer — «Do you really want to delete account '19013'?».
    Comparar com o que pedimos é a única verificação que não depende de nada ter ficado quieto.
    """
    for _y, _x, _h, texto in mt5.ler_ecra():
        m = re.search(r"delete account\s*['\"]?(\d{4,})", texto, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


def _contas_da_arvore() -> list[str]:
    """Os números das contas, pela ordem em que estão na árvore.

    Serve para saber QUANTAS linhas separam duas contas — não para clicar em nenhuma. A
    posição em pixels é a parte que não se pode usar; a ordem relativa é estável.
    """
    arvore = _ler_arvore()
    return [n for n, _y in sorted(arvore.items(), key=lambda kv: kv[1])]


def _apagar_linha_da_conta(janela: str, login: str, base: int) -> bool:
    """Apaga a conta usando o DIÁLOGO DO METATRADER como bússola.

    Porque não se clica simplesmente na linha certa: entre ler a posição e clicar, a janela do
    MetaTrader mexe-se — apanhei-a deslocada 30px, que são quase duas linhas da árvore. Um
    Delete apontado à 19015 foi parar à 19013. Numa operação que apaga contas, «quase certo» é
    a mesma coisa que errado.

    O diálogo de confirmação é a única coisa que não depende de nada ter ficado quieto: é o
    próprio MetaTrader a dizer por extenso o que vai apagar. Então usa-se isso como sensor —
    pergunta-se, lê-se o que ele escolheu, diz-se NÃO, e move-se a selecção com as SETAS, que
    são relativas e por isso imunes ao desalinhamento. Repete-se até o diálogo dizer a conta
    certa; só então se responde Yes.

    O número de setas não é adivinhado: calcula-se pela distância entre as duas contas na
    lista lida da árvore. Na prática acerta à primeira ou à segunda.
    """
    if _linha_no_ecra(login) is None:
        registar(f"não encontrei a conta {login} na árvore")
        return False

    # Dá foco à árvore. A coordenada não precisa de estar certa ao pixel — só de cair na
    # lista; quem afina a selecção a partir daqui são as setas.
    y = _linha_no_ecra(login)
    if y is not None:
        mt5.clicar(110, y)
        time.sleep(1)

    for tentativa in range(12):
        mt5.tecla(janela, "Delete", pausa=2)
        perguntada = _conta_no_dialogo()

        if perguntada is None:
            # Sem diálogo: ou a selecção não é uma conta, ou o Delete não pegou. Desce uma
            # linha e tenta outra vez.
            mt5.tecla(janela, "Down", pausa=0.6)
            continue

        if perguntada == str(login):
            if not mt5.clicar_texto(r"^\s*(Yes|Sim|OK)\s*$"):
                mt5.tecla(janela, "Return", pausa=1)
            time.sleep(2)
            if _linha_no_ecra(login) is None:
                registar(f"conta {login} apagada do terminal")
                return True
            registar(f"a conta {login} continua na árvore depois do Delete")
            return False

        # Conta errada: NÃO, e anda-se o número de linhas que as separa.
        if not mt5.clicar_texto(r"^\s*(No|Não|Cancel|Cancelar)\s*$"):
            mt5.tecla(janela, "Escape", pausa=1)
        time.sleep(1)

        lista = _contas_da_arvore()
        try:
            passos = lista.index(str(login)) - lista.index(perguntada)
        except ValueError:
            passos = 1  # não estão as duas legíveis: anda uma e volta a perguntar
        if passos == 0:
            passos = 1
        registar(f"o diálogo dizia {perguntada}; ando {passos:+d} para chegar a {login}")
        mt5.tecla(janela, "Down" if passos > 0 else "Up", pausa=0.5, vezes=abs(passos))

    registar(f"desisti de apagar a conta {login} — o diálogo nunca a nomeou")
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

    # A troca da password é o que torna a conta INÚTIL: ninguém entra nela outra vez, tenha as
    # credenciais antigas onde as tiver. Remover a linha da árvore é higiene — impede que a
    # lista do Navegador cresça sem fim, e é por ela que o agente se orienta.
    #
    # Fazer o sucesso depender das duas punha a tarefa a repetir-se para sempre por causa da
    # parte cosmética, com a conta já desactivada há muito. Uma tarefa que nunca fecha acaba
    # por ser ignorada, e aí perde-se também o sinal das que falham a sério.
    if trocada and not apagada:
        registar(f"conta {login}: password trocada (já não se entra nela); ficou na árvore")
    return {
        "ok": trocada or apagada,
        "passwordTrocada": trocada,
        "apagadaDoTerminal": apagada,
    }


if __name__ == "__main__":
    try:
        entrada = json.loads(sys.argv[1]) if len(sys.argv) > 1 else json.load(sys.stdin)
        print(json.dumps(desactivar(str(entrada["login"]), entrada.get("password")), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "motivo": str(e)[:300]}, ensure_ascii=False))
        sys.exit(1)

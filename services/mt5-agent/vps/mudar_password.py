#!/usr/bin/env python3
"""
Troca a password mestra de uma conta acabada de criar — e, ao fazê-lo, prova que a que se
leu do ecrã estava certa.

═══ PORQUE ISTO EXISTE ═══

A password de uma conta demo só aparece no ecrã, uma vez, numa fonte de 11 pixels. Lê-se por
OCR, e o OCR mente com convicção: a conta 19010 mostrava «!pY2HdCq» e a primeira leitura deu
«tpy2Hacg» — oito caracteres plausíveis, todos errados. Nada no resultado dizia qual das duas
versões era a verdadeira. Entregava-se uma conta que não abria e ninguém saberia porquê.

O diálogo «Change Password» do MetaTrader pede a password ACTUAL. Isso, que parecia o
problema (para trocar é preciso já saber), é a solução: quem valida a password deixa de ser o
OCR e passa a ser a corretora. Se ela aceita a troca, a leitura estava certa — não há opinião
nenhuma no meio. E a partir daí a conta fica com uma password GERADA aqui, que não precisa de
ser lida de lado nenhum.

Falhando a troca, não se inventa nada: a conta existe e entrega-se o login com aviso.
"""
from __future__ import annotations

import json
import re
import secrets
import string
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import mt5  # noqa: E402
import criar_conta as cc  # noqa: E402

registar = cc.registar

# Coordenadas do diálogo «Change Password», lidas do ecrã real de 1440x900.
CAMPO_ATUAL = (900, 500)
CAMPO_NOVA = (900, 575)
CAMPO_CONFIRMA = (1118, 575)
BOTAO_OK = (903, 617)
BOTAO_CANCELAR = (994, 617)
# A caixa do campo «Login:» do diálogo. É a ÚNICA prova de que conta ali está.
CAIXA_LOGIN = (850, 463, 105, 18)
# A árvore do Navegador: Contas → corretora → a conta.
NAVEGADOR_CONTAS = (70, 118)
MENU_MUDAR_PASSWORD = r"change password|mudar password"


def gerar() -> str:
    """A corretora exige 8+ com maiúsculas, minúsculas, números e símbolos.

    Constrói-se com uma de cada e o resto ao acaso, e baralha-se: assim cumpre sempre a regra
    à primeira. Um gerador que às vezes falha a regra dá um diálogo recusado a meio de uma
    automação, e a conta fica com a password velha sem ninguém reparar.
    """
    letras = string.ascii_lowercase
    maiusculas = string.ascii_uppercase
    digitos = string.digits
    simbolos = "!@#%&*+-"
    corpo = [
        secrets.choice(maiusculas), secrets.choice(letras),
        secrets.choice(digitos), secrets.choice(simbolos),
    ]
    corpo += [secrets.choice(letras + maiusculas + digitos) for _ in range(8)]
    secrets.SystemRandom().shuffle(corpo)
    return "".join(corpo)


def login_no_dialogo() -> str:
    """O número que o diálogo tem no campo «Login:».

    Perguntar `mt5.ve("19011")` era inútil e perigoso: o ecrã inteiro inclui a árvore do
    Navegador por trás, onde estão TODAS as contas — a resposta era sempre sim. Foi assim que
    uma tentativa de troca foi parar à 19010, cuja password já tinha sido entregue por email.
    Só falhou por timeout do lado da corretora. Aqui lê-se o campo, e mais nada.
    """
    x, y, largura, altura = CAIXA_LOGIN
    imagem = mt5.fotografar()
    mt5._correr(["convert", imagem, "-crop", f"{largura}x{altura}+{x}+{y}", "+repage",
                 "-resize", "300%", "-colorspace", "Gray", "/tmp/mtm-login.png"])
    lido = mt5._correr(["tesseract", "/tmp/mtm-login.png", "-", "--psm", "7"])
    import re as _re
    return "".join(_re.findall(r"\d", lido))


# A árvore do Navegador tem linhas de 18px, e as contas começam 38px abaixo da linha da
# corretora. É geometria, não OCR: as posições que o tesseract dá para esta árvore variam uns
# pixels entre leituras (o agrupamento cola o ícone ao texto), e uma delas chegou a apontar
# para a linha de baixo — abria-se o menu da conta errada.
ALTURA_LINHA = 18
PRIMEIRA_CONTA = 38


def linha_da_corretora() -> int | None:
    for y, x, _altura, texto in mt5.ler_ecra():
        if x < 0.25 and "radingmaster" in texto.replace(" ", "").lower():
            return int(y * 900)
    return None


def quantas_contas() -> int:
    return sum(1 for y, x, _h, t in mt5.ler_ecra()
               if x < 0.25 and re.search(r"\b\d{4,}\b", t))


def fechar_dialogo_aberto() -> bool:
    """Cancela um «Change Password» deixado aberto por uma tentativa anterior.

    É modal: enquanto estiver à frente, o botão direito na árvore não abre menu nenhum e a
    tentativa seguinte conclui que não chegou ao diálogo — com o diálogo à frente, aberto.
    Uma sessão inteira de tentativas falhou assim.
    """
    for _ in range(3):
        if not mt5.ve(r"must be the master password|current password"):
            return True
        mt5.clicar(*BOTAO_CANCELAR)
        time.sleep(2)
    return False


def abrir_dialogo(login: str) -> bool:
    """Navegador → Contas → a conta → botão direito → Change Password.

    Percorre as contas da árvore e, em cada uma, confirma no PRÓPRIO diálogo de que conta se
    trata. Não sendo a certa, cancela e passa à seguinte. Assim, uma coordenada errada custa
    alguns segundos em vez de trocar a password da pessoa errada.
    """
    janela = mt5.janela_por_nome("MetaTrader") or ""
    fechar_dialogo_aberto()

    # Ctrl+N é um INTERRUPTOR, não um "abrir". Com o Navegador já aberto, fecha-o — e o passo
    # seguinte procurava as contas numa árvore que já não estava no ecrã. Pergunta-se primeiro.
    if not mt5.ve(r"\bAccounts\b"):
        mt5.tecla(janela, "ctrl+n", pausa=2)
    if not mt5.ve(r"\bAccounts\b"):
        registar("o Navegador não abriu")
        return False

    mt5.clicar(*NAVEGADOR_CONTAS)
    time.sleep(0.8)
    mt5.tecla(janela, "Right", pausa=1.5)
    if not mt5.clicar_texto(r"TheTradingMaster|Trading\s*Master"):
        return False
    mt5.tecla(janela, "Right", pausa=1.5)

    base = linha_da_corretora()
    if base is None:
        registar("não encontrei a corretora na árvore do Navegador")
        return False

    # De BAIXO para cima: a conta que se acabou de criar é a última da árvore, e é sempre essa
    # que se quer. Começar por cima obrigava a abrir e cancelar o diálogo de todas as contas
    # antigas antes de lá chegar — e essas já foram entregues a alguém.
    total = max(quantas_contas(), 1)
    for indice in range(total - 1, -1, -1):
        y = base + PRIMEIRA_CONTA + ALTURA_LINHA * indice + 6
        mt5._correr(["xdotool", "mousemove", "110", str(y), "click", "3"])
        time.sleep(2)
        if not mt5.clicar_texto(MENU_MUDAR_PASSWORD):
            mt5.tecla(janela, "Escape", pausa=0.8)   # menu de contexto: aqui o Escape é seguro
            fechar_dialogo_aberto()
            continue
        time.sleep(3)
        if not mt5.ve(r"must be the master password|current password"):
            continue
        se_for = login_no_dialogo()
        if se_for == str(login):
            return True
        registar(f"o diálogo aberto é da conta {se_for or '?'}, não da {login} — cancelo")
        fechar_dialogo_aberto()
    return False


def trocar(login: str, candidatos: list[str]) -> dict:
    """Experimenta cada leitura até o MetaTrader aceitar uma.

    Não é adivinhar: o MT5 guarda a password da conta e compara-a LOCALMENTE — uma errada é
    recusada na hora, sem sequer contactar a corretora, e o diálogo fica aberto com o campo
    seleccionado. É um verificador instantâneo e sem custo, e é ele que decide, não o OCR.
    """
    janela = mt5.janela_por_nome("MetaTrader") or ""
    if not abrir_dialogo(login):
        return {"ok": False, "motivo": "não cheguei ao diálogo de mudança de password"}

    def campo(x: int, y: int, valor: str) -> None:
        mt5.clicar(x, y)
        time.sleep(0.4)
        mt5.tecla(janela, "ctrl+a", pausa=0.15)
        mt5.tecla(janela, "Delete", pausa=0.15)
        mt5.escrever(janela, valor)

    for tentativa, atual in enumerate(candidatos, 1):
        nova = gerar()
        antes = cc.marca_dagua()
        campo(*CAMPO_ATUAL, atual)
        campo(*CAMPO_NOVA, nova)
        campo(*CAMPO_CONFIRMA, nova)
        mt5.clicar(*BOTAO_OK)
        time.sleep(4)

        # O diálogo fechado é o primeiro sinal; a palavra final é da corretora, no journal.
        # Não se lê o ecrã à procura de uma mensagem de sucesso: uma caixa que não apareceu
        # lê-se como tudo bem.
        if mt5.ve(r"must be the master password|current password"):
            registar(f"leitura {tentativa} recusada pelo MetaTrader")
            continue
        if cc.esperar_no_log(r"change of master password completed", antes, 45):
            return {"ok": True, "password": nova}
        return {"ok": False, "motivo": "o diálogo fechou mas a corretora não confirmou a troca"}

    fechar_dialogo_aberto()
    return {"ok": False, "motivo": f"nenhuma das {len(candidatos)} leituras da password foi "
                                   "aceite — a conta existe mas não sei a password"}


if __name__ == "__main__":
    try:
        entrada = json.loads(sys.argv[1]) if len(sys.argv) > 1 else json.load(sys.stdin)
        candidatos = entrada.get("candidatos") or [entrada["password"]]
        print(json.dumps(trocar(str(entrada["login"]), candidatos), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "motivo": str(e)[:300]}, ensure_ascii=False))
        sys.exit(1)

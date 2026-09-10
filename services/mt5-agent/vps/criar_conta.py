#!/usr/bin/env python3
"""
Cria uma conta demo no MetaTrader 5 do VPS — sozinho, e a ver o que faz.

═══ O FLUXO, TAL COMO ELE É ═══

Percorrido à mão uma vez, com fotografia em cada passo, e só depois escrito:

  1. Ficheiro → Abrir uma conta        → lista de corretoras
  2. Escrever "TheTradingMaster"        → «Find your company»
  3. A corretora aparece seleccionada   → Next
  4. «Open a demo account» (já vem escolhido) → Next
  5. Formulário: nome, apelido, nascimento, email, telefone, depósito, alavancagem, termos
  6. Next                               → o diálogo final mostra login e passwords

O SOBRENOME é o TIPO de conta ("Torneio", "Challenge", "Funded"): é assim que a corretora
mostra de que conta se trata, sem ter campo próprio para isso.

═══ PORQUE ISTO NÃO É AUTOMAÇÃO ÀS CEGAS ═══

Cada passo confirma-se antes do seguinte, por OCR do ecrã. Se um diálogo não aparecer, pára —
não continua a martelar teclas numa janela que já não é a que se pensava. E o journal do MT5
é a última palavra: se ele não escrever `new demo account 'NNNNN' opened`, nada foi criado,
por muito bem que os cliques tenham parecido correr.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import mt5  # noqa: E402  (o módulo de janelas/OCR/cliques está ao lado)

PREFIXO = Path(os.environ.get("WINEPREFIX", str(Path.home() / ".mt5")))
LARGURA, ALTURA = 1440, 900

# Coordenadas lidas do ecrã real de 1440x900. Não são adivinhadas: saíram de fotografias
# do diálogo a correr. Se a versão do MT5 mudar, é aqui que se recalibra — e como cada passo
# é confirmado por OCR, uma coordenada errada dá erro em vez de uma conta errada.
CAMPOS = {
    "primeiro_nome": (570, 291),
    "sobrenome": (570, 319),
    "nascimento": (570, 348),
    "email": (626, 390),
    "telefone": (704, 418),
    "deposito": (554, 555),
    "termos": (502, 607),
}
BOTAO_SEGUINTE = (919, 698)
CAMPO_PESQUISA = (653, 293)
BOTAO_PROCURAR = (981, 293)


def registar(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


# ── journal ──────────────────────────────────────────────────────────────────

def _logs_de_hoje() -> list[Path]:
    hoje = datetime.now().strftime("%Y%m%d")
    base = PREFIXO / "drive_c/Program Files/MetaTrader 5/logs"
    return [base / f"{hoje}.log"] if (base / f"{hoje}.log").exists() else []


def _ler_log(p: Path) -> str:
    for codec in ("utf-16", "utf-8", "latin-1"):
        try:
            return p.read_text(encoding=codec, errors="ignore")
        except Exception:
            continue
    return ""


def marca_dagua() -> int:
    return sum(p.stat().st_size for p in _logs_de_hoje())


def esperar_no_log(padrao: str, desde: int, segundos: int = 90) -> str | None:
    rx = re.compile(padrao, re.IGNORECASE)
    limite = time.time() + segundos
    while time.time() < limite:
        for p in _logs_de_hoje():
            if p.stat().st_size <= desde:
                continue
            texto = _ler_log(p)
            for linha in texto.splitlines():
                m = rx.search(linha)
                if m:
                    return m.group(1) if m.groups() else linha
        time.sleep(2)
    return None


# ── passos ───────────────────────────────────────────────────────────────────

def abrir_dialogo(janela: str) -> bool:
    """Ficheiro → Abrir uma conta. Confirma-se pelo título do diálogo."""
    if mt5.ve(r"select a company|abrir uma conta|open an account"):
        registar("o diálogo já estava aberto")
        return True
    mt5.tecla(janela, "ctrl+shift+n")
    time.sleep(4)
    if mt5.ve(r"select a company"):
        return True
    # Alguns builds não têm o atalho. Vai-se pelo menu Ficheiro.
    registar("o atalho não abriu o diálogo; a tentar pelo menu Ficheiro")
    mt5.clicar(20, 40)
    time.sleep(1.5)
    if not mt5.clicar_texto(r"open an account|abrir uma conta"):
        return False
    time.sleep(4)
    return mt5.ve(r"select a company")


def escolher_corretora(servidor: str) -> bool:
    empresa = servidor.split("-")[0]  # "TheTradingMaster-Live" → "TheTradingMaster"
    mt5.clicar(*CAMPO_PESQUISA)
    time.sleep(0.8)
    mt5.escrever(mt5.janela_por_nome("MetaTrader") or "", empresa)
    time.sleep(1)
    mt5.clicar(*BOTAO_PROCURAR)
    time.sleep(6)
    # A corretora certa tem de estar VISÍVEL e escolhida. Sem esta confirmação, um Next
    # cego seguia com a corretora que estivesse seleccionada — outra qualquer.
    if not mt5.ve(re.escape(empresa[:10])):
        registar(f"a corretora '{empresa}' não apareceu na lista")
        return False
    return True


def preencher(pedido: dict) -> bool:
    """O formulário. Cada campo é limpo antes de ser escrito: um valor por omissão que
    fique para trás vai para a corretora sem ninguém dar por isso."""
    janela = mt5.janela_por_nome("MetaTrader") or ""

    def campo(nome: str, valor: str) -> None:
        mt5.clicar(*CAMPOS[nome])
        time.sleep(0.4)
        mt5.tecla(janela, "ctrl+a", pausa=0.15)
        mt5.tecla(janela, "Delete", pausa=0.15)
        mt5.escrever(janela, valor)

    campo("primeiro_nome", str(pedido.get("primeiro_nome") or "MTM")[:30])
    campo("sobrenome", str(pedido.get("sobrenome") or "Torneio")[:30])
    # A data vem preenchida com HOJE e o diálogo recusa-a («Please enter a valid birth date»).
    campo("nascimento", str(pedido.get("data_nascimento") or "01/01/1990").replace("-", "/"))
    campo("email", str(pedido.get("email") or ""))
    campo("telefone", re.sub(r"\D", "", str(pedido.get("telefone") or "912345678"))[:15])
    campo("deposito", str(int(float(pedido.get("deposito") or 10000))))

    # Termos: sem isto o Next fica cinzento e a automação ficava a carregar num botão morto.
    mt5.clicar(*CAMPOS["termos"])
    time.sleep(0.6)
    return True


def criar(pedido: dict) -> dict:
    servidor = str(pedido.get("servidor") or "TheTradingMaster-Live")

    janela = mt5.esperar_janela("MetaTrader", 20)
    if not janela:
        raise RuntimeError("o MetaTrader não está aberto no ecrã virtual")
    registar(f"janela {janela}")

    if not abrir_dialogo(janela):
        raise RuntimeError("não consegui abrir o diálogo de criação de conta")
    registar("diálogo aberto")

    if not escolher_corretora(servidor):
        raise RuntimeError(f"não encontrei a corretora de '{servidor}'")
    registar("corretora escolhida")

    mt5.clicar(*BOTAO_SEGUINTE)
    time.sleep(6)
    if not mt5.ve(r"demo account|real account"):
        raise RuntimeError("não cheguei à escolha do tipo de conta")

    mt5.clicar(*BOTAO_SEGUINTE)   # «Open a demo account» já vem escolhido
    time.sleep(6)
    if not mt5.ve(r"first name|second name|deposit"):
        raise RuntimeError("não cheguei ao formulário")
    registar("formulário à frente")

    preencher(pedido)
    registar("formulário preenchido")

    antes = marca_dagua()
    mt5.clicar(*BOTAO_SEGUINTE)

    # O JOURNAL É A ÚLTIMA PALAVRA. Os cliques podem parecer todos certos e não ter sido
    # criada conta nenhuma; o log não engana.
    login = esperar_no_log(r"new demo account '(\d+)' opened", antes, 90)
    if not login:
        mt5.fotografar("/tmp/mt5-falhou.png")
        raise RuntimeError(
            "o journal não registou nenhuma conta nova. Nada foi criado. "
            "Vê /tmp/mt5-falhou.png para saber onde parou."
        )
    registar(f"conta {login} criada")

    # As passwords só existem no ecrã que está agora à frente.
    time.sleep(3)
    foto = mt5.fotografar()
    credenciais = ler_credenciais(foto)
    try:
        os.unlink(foto)   # a fotografia tem as passwords: não fica no disco
    except OSError:
        pass

    if not credenciais.get("password"):
        return {
            "login": login, "password": None, "servidor": servidor,
            "precisa_password": True,
            "aviso": f"conta {login} criada, mas não consegui ler a password do ecrã",
        }

    return {
        "login": login,
        "password": credenciais["password"],
        "investor": credenciais.get("investor"),
        "servidor": servidor,
    }


def ler_credenciais(imagem: str) -> dict:
    """Lê login/password/investor do diálogo final."""
    r = subprocess.run(
        [sys.executable, str(AQUI.parent / "ler_credenciais.py"), imagem],
        capture_output=True, text=True, timeout=120,
    )
    try:
        d = json.loads(r.stdout or "{}")
    except Exception:
        return {}
    # `problemas` não vazio = leitura duvidosa. Uma password duvidosa é pior do que nenhuma:
    # entrega-se uma conta que não abre e ninguém sabe porquê.
    return {} if d.get("problemas") else d


if __name__ == "__main__":
    try:
        entrada = json.loads(sys.argv[1]) if len(sys.argv) > 1 else json.load(sys.stdin)
        print(json.dumps(criar(entrada), ensure_ascii=False))
    except Exception as e:
        print(str(e)[:400], file=sys.stderr)
        sys.exit(1)

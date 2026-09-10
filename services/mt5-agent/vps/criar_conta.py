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

import base64
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
# O QR do diálogo final: é o do MetaTrader, o mesmo que a app lê em «Sign In with QR code».
# A região é generosa de propósito — recorta-se em excesso e apara-se ao branco a seguir,
# porque o diálogo desloca-se alguns pixels conforme o tamanho do nome da corretora.
REGIAO_QR = (930, 540, 160, 160)
# O rectângulo do texto do botão Seguinte, para lhe medir a tinta.
CAIXA_SEGUINTE = (890, 690, 60, 16)
# A data é um contador com três segmentos; clica-se no PRIMEIRO e navega-se com setas.
PRIMEIRO_SEGMENTO_DATA = (512, 348)
# As listas abrem-se pela SETA, não pelo texto: clicar no texto de uma combo editável só lá
# põe o cursor. Uma lista que se julga aberta e não está transforma os cliques seguintes em
# cliques no que estiver por baixo.
SETA_DEPOSITO = (605, 555)
SETA_PAIS = (636, 419)
# A entrada que casa com o indicativo escrito fica sempre na PRIMEIRA linha da lista.
PRIMEIRA_LINHA_PAIS = (560, 438)
CAMPO_PESQUISA = (653, 293)
BOTAO_PROCURAR = (981, 293)


def registar(msg: str) -> None:
    """Progresso para o ERRO PADRÃO, nunca para a saída.

    A saída deste programa é UM objecto JSON e mais nada — é assim que o agente a lê. Enquanto
    o progresso saía por ali, o `json.loads` do agente rebentava com as linhas de progresso à
    frente, o erro era apanhado por um `except` genérico e o pedido voltava à fila em silêncio.
    A conta 19009 chegou a ser criada na corretora sem que uma única linha o dissesse.
    """
    print(f"[{datetime.now():%H:%M:%S}] {msg}", file=sys.stderr, flush=True)


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


def marca_dagua() -> dict:
    """Onde é que cada ficheiro de log ia, antes de se carregar no botão.

    Um dicionário {ficheiro: bytes} e não um total: à meia-noite o MT5 abre um log novo e um
    total deixa de querer dizer nada. Um ficheiro que não esteja aqui lê-se do princípio, que
    é o que se quer para um log acabado de nascer.
    """
    return {str(p): p.stat().st_size for p in _logs_de_hoje()}


def _ler_desde(p: Path, desde: int) -> str:
    """Lê SÓ o que foi escrito depois da marca. É a diferença entre a conta que se acabou de
    criar e a que se criou há uma hora.

    Isto já custou caro: o código antigo usava a marca apenas para saber se o ficheiro tinha
    crescido e depois varria-o todo, pelo que a primeira linha «new demo account» do dia
    ganhava sempre. Na segunda conta da noite, o agente anunciou a 19009 — criada às 21:35 —
    quando o que estava no ecrã era a 19010. Um passo mais à frente e teria entregue o login
    de uma conta com a password de outra.
    """
    try:
        with p.open("rb") as f:
            f.seek(max(desde, 0))
            bruto = f.read()
    except OSError:
        return ""
    # O log é UTF-16; saltada a marca, já não há BOM — tem de se dizer que é little-endian.
    for codec in ("utf-16-le", "utf-8", "latin-1"):
        try:
            return bruto.decode(codec, errors="ignore")
        except Exception:
            continue
    return ""


def esperar_no_log(padrao: str, desde: dict, segundos: int = 90) -> str | None:
    rx = re.compile(padrao, re.IGNORECASE)
    limite = time.time() + segundos
    while True:
        for p in _logs_de_hoje():
            inicio = desde.get(str(p), 0)
            if p.stat().st_size <= inicio:
                continue
            for linha in _ler_desde(p, inicio).splitlines():
                m = rx.search(linha)
                if m:
                    return m.group(1) if m.groups() else linha
        if time.time() >= limite:
            return None
        time.sleep(2)


# ── passos ───────────────────────────────────────────────────────────────────

def abrir_dialogo(janela: str) -> bool:
    """Ficheiro → Abrir uma conta. Confirma-se pelo título do diálogo."""
    if mt5.ve(r"select a company|abrir uma conta|open an account"):
        registar("o diálogo já estava aberto")
        return True
    mt5.tecla(janela, "ctrl+shift+n")
    # A lista de corretoras vem da rede: o diálogo abre vazio e só depois se escreve.
    if mt5.esperar_texto(r"select a company", 30):
        return True
    # Alguns builds não têm o atalho. Vai-se pelo menu Ficheiro.
    registar("o atalho não abriu o diálogo; a tentar pelo menu Ficheiro")
    mt5.clicar(20, 40)
    time.sleep(1.5)
    if not mt5.clicar_texto(r"open an account|abrir uma conta"):
        return False
    return mt5.esperar_texto(r"select a company", 30)


def padrao_empresa(empresa: str) -> str:
    """Uma expressão que reconhece o nome da corretora tal como o ecrã o pode mostrar.

    O nome vem colado do servidor ("TheTradingMaster") e a lista mostra-o separado
    ("The Trading Master Global Ltd."). Pior: a linha seleccionada é branca sobre azul e o
    tesseract corta-a a meio — leu "The Trading Ma:". Por isso pedem-se só as DUAS primeiras
    palavras, com os espaços opcionais: sobrevive ao corte e continua a ser específico.
    """
    palavras = re.findall(r"[A-Z][a-z]+|[A-Z]+(?![a-z])|\d+", empresa) or [empresa]
    return r"\s*".join(re.escape(p) for p in palavras[:2])


def escolher_corretora(servidor: str) -> bool:
    """Procura a corretora e deixa-a escolhida.

    Devolve False sem levantar erro: a linha escolhida é branca sobre azul e o tesseract
    corta-a a meio, pelo que «não a vi» não quer dizer «não está lá». A confirmação a sério
    vem dois passos à frente, no campo Servidor do formulário — que é o valor que a corretora
    vai mesmo usar, e está escrito a preto sobre branco.
    """
    empresa = servidor.split("-")[0]  # "TheTradingMaster-Live" → "TheTradingMaster"
    janela = mt5.janela_por_nome("MetaTrader") or ""
    mt5.clicar(*CAMPO_PESQUISA)
    time.sleep(0.8)
    # Limpar primeiro: numa segunda conta o diálogo reabre com a procura anterior lá dentro.
    mt5.tecla(janela, "ctrl+a", pausa=0.15)
    mt5.tecla(janela, "Delete", pausa=0.15)
    mt5.escrever(janela, empresa)
    time.sleep(1)
    mt5.clicar(*BOTAO_PROCURAR)
    if not mt5.esperar_texto(padrao_empresa(empresa), 40):
        registar(f"não confirmei '{empresa}' na lista — verifico no campo Servidor")
        return False
    return True


def seguinte_ativo() -> bool:
    """O botão Seguinte está clicável? Cinzento nunca desce dos ~166 de tinta; preto ronda 16."""
    return mt5.tinta(*CAIXA_SEGUINTE) < 100


def preencher(pedido: dict) -> bool:
    """O formulário.

    Três coisas que este diálogo faz e que não se adivinham — todas descobertas a ver o ecrã:

    · NUNCA se carrega em Return. Não confirma o campo: aciona o botão por omissão do
      diálogo, e o formulário recua um passo levando consigo o que já lá estava.
    · A data NÃO avança sozinha de segmento. Escrever "03101984" de seguida mete tudo no mês.
      Vai-se ao primeiro segmento e passa-se ao seguinte com a seta direita.
    · O país do telefone vem do IP do servidor (a AWS dá Suécia) e o número português é
      recusado com «Mobile phone required» — em vermelho por baixo, longe do campo. Escolhe-se
      o país pelo teclado com a lista FECHADA (Tab para trás e escrever o nome): abrir a lista
      obrigaria a confirmar, e confirmar aqui é o Return que não se pode dar.
    """
    janela = mt5.janela_por_nome("MetaTrader") or ""

    def campo(nome: str, valor: str) -> None:
        mt5.clicar(*CAMPOS[nome])
        time.sleep(0.4)
        mt5.tecla(janela, "ctrl+a", pausa=0.15)
        mt5.tecla(janela, "Delete", pausa=0.15)
        mt5.escrever(janela, valor)

    campo("primeiro_nome", str(pedido.get("primeiro_nome") or "MTM")[:30])
    campo("sobrenome", str(pedido.get("sobrenome") or "Torneio")[:30])
    escrever_data(janela, str(pedido.get("data_nascimento") or "1990-01-01"))
    campo("email", str(pedido.get("email") or ""))
    escrever_telefone(janela, pedido)
    escolher_deposito(int(float(pedido.get("deposito") or 10000)))

    # Termos: sem isto o Seguinte fica cinzento. Confirma-se pelo botão, não pela caixa —
    # clicar às cegas numa caixa JÁ marcada desmarcava-a, e o efeito era o mesmo do erro.
    if not seguinte_ativo():
        mt5.clicar(*CAMPOS["termos"])
        time.sleep(0.8)

    if not seguinte_ativo():
        mt5.fotografar("/tmp/mt5-formulario.png")
        raise RuntimeError(
            "o formulário ficou preenchido mas o botão Seguinte continua cinzento — algum "
            "campo foi recusado. Vê /tmp/mt5-formulario.png."
        )
    return True


def escrever_data(janela: str, iso: str) -> None:
    """`1984-03-10` → 03 / 10 / 1984, segmento a segmento."""
    partes = re.split(r"[-/]", iso.strip())
    if len(partes) != 3:
        partes = ["1990", "01", "01"]
    ano, mes, dia = (partes if len(partes[0]) == 4 else [partes[2], partes[1], partes[0]])

    mt5.clicar(*PRIMEIRO_SEGMENTO_DATA)
    time.sleep(0.5)
    mt5.tecla(janela, "Home", pausa=0.3)
    for i, valor in enumerate((mes.zfill(2), dia.zfill(2), ano.zfill(4))):
        mt5.escrever(janela, valor, pausa=0.4)
        if i < 2:
            mt5.tecla(janela, "Right", pausa=0.3)


def escrever_telefone(janela: str, pedido: dict) -> None:
    """País e número.

    O país vem do IP do servidor — a AWS dá Suécia — e um número português por baixo de +46 é
    recusado com «Mobile phone required», em vermelho longe do campo. A combo é EDITÁVEL: dizer
    -lhe "Portugal" escreve mesmo a palavra e não escolhe país nenhum (foi o que se viu:
    aparecia «Portugal» na caixa e o número continuava vermelho). Escolhe-se pelo INDICATIVO,
    que é por onde a lista está ordenada, e clica-se na linha — que é sempre a primeira.
    """
    indicativo = str(pedido.get("indicativo") or "+351")
    numero = re.sub(r"\D", "", str(pedido.get("telefone") or "912345678"))[:15]

    mt5.clicar(*SETA_PAIS)
    time.sleep(1.2)
    mt5.tecla(janela, "ctrl+a", pausa=0.3)
    mt5.escrever(janela, indicativo, pausa=1.5)
    mt5.clicar(*PRIMEIRA_LINHA_PAIS)
    time.sleep(1.2)

    mt5.clicar(*CAMPOS["telefone"])
    time.sleep(0.4)
    mt5.tecla(janela, "ctrl+a", pausa=0.15)
    mt5.tecla(janela, "Delete", pausa=0.15)
    mt5.escrever(janela, numero)


def escolher_deposito(valor: int) -> None:
    r"""O depósito é uma lista fechada (3000, 5000, 10000, 25000, 50000, 100000) e vem a 100000.

    `^\W*10000\W*$` e não `10000`: sem as âncoras o clique caía em «100000», que também contém
    «10000» — dez vezes o saldo pedido, e ninguém a ver. E `\W*` porque o OCR encosta uma plica
    ao número («'10000»), o que fazia falhar um `^10000$` limpo.

    Não encontrando a linha, fecha-se a lista clicando OUTRA VEZ na seta. Escape aqui fechava o
    diálogo inteiro e o passo seguinte ia escrever para o terminal, onde as letras são atalhos.
    """
    mt5.clicar(*SETA_DEPOSITO)
    time.sleep(1.4)
    if not mt5.clicar_texto(rf"^\W*{valor}\W*$"):
        registar(f"o depósito {valor} não está na lista; fica o que o diálogo trazia")
        mt5.clicar(*SETA_DEPOSITO)
    time.sleep(0.8)


def criar(pedido: dict) -> dict:
    servidor = str(pedido.get("servidor") or "TheTradingMaster-Live")

    janela = mt5.esperar_janela("MetaTrader", 20)
    if not janela:
        raise RuntimeError("o MetaTrader não está aberto no ecrã virtual")
    registar(f"janela {janela}")

    if not abrir_dialogo(janela):
        raise RuntimeError("não consegui abrir o diálogo de criação de conta")
    registar("diálogo aberto")

    escolher_corretora(servidor)   # a confirmação verdadeira é no campo Servidor, adiante

    mt5.clicar(*BOTAO_SEGUINTE)
    if not mt5.esperar_texto(r"demo account|real account", 30):
        raise RuntimeError("não cheguei à escolha do tipo de conta")

    mt5.clicar(*BOTAO_SEGUINTE)   # «Open a demo account» já vem escolhido
    if not mt5.esperar_texto(r"first name|second name|deposit", 30):
        raise RuntimeError("não cheguei ao formulário")

    # AQUI é que se confirma a corretora. O campo Servidor é o que a conta vai usar, e está
    # escrito a preto sobre branco — legível, ao contrário da linha azul da lista. Seguir sem
    # isto abria a conta numa corretora qualquer, com tudo o resto a parecer bem.
    if not mt5.ve(padrao_empresa(servidor.split("-")[0])):
        mt5.fotografar("/tmp/mt5-corretora.png")
        raise RuntimeError(
            f"o campo Servidor não mostra '{servidor}' — não abro a conta na corretora errada. "
            "Vê /tmp/mt5-corretora.png."
        )
    registar("formulário à frente, corretora confirmada")

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
    qr = capturar_qr(foto)
    credenciais = ler_credenciais(foto, login)

    # O QR do MetaTrader traz as credenciais codificadas. Lendo-se, a password vem EXACTA —
    # e um caractere lido por OCR nunca é exacto. Este candidato vai à frente de todos.
    do_qr = password_do_qr(qr.get("conteudo"), login)
    if do_qr:
        registar("password obtida do QR do MetaTrader")
        credenciais["candidatos"] = [do_qr] + [c for c in (credenciais.get("candidatos") or []) if c != do_qr]
        credenciais["password"] = do_qr
    try:
        os.unlink(foto)   # a fotografia tem as passwords: não fica no disco
    except OSError:
        pass

    if not credenciais.get("candidatos"):
        return {
            "login": login, "password": None, "servidor": servidor,
            "precisa_password": True,
            "qr": qr.get("imagem"),
            "aviso": f"conta {login} criada, mas não consegui ler a password do ecrã",
        }

    # O diálogo das credenciais é MODAL: enquanto estiver à frente, o Navegador não recebe
    # cliques e a troca de password não chega a começar. Fecha-se aqui, já com o que
    # interessava lido dele.
    fechar_credenciais()

    # ── veio do QR? então está certa, e não se lhe toca ──────────────────────
    #
    # O QR do MetaTrader é a própria plataforma a dizer qual é a password — não há leitura,
    # não há dúvida, não há nada a confirmar. E trocá-la aqui teria um custo escondido: o QR
    # codifica a password ANTIGA, pelo que a troca transformava o código num quadrado que não
    # entra em lado nenhum. Guarda-se a password e guarda-se o código, que é o que faz a app
    # entrar com um toque.
    if do_qr:
        return {
            "login": login,
            "password": do_qr,
            "investor": credenciais.get("investor"),
            "servidor": servidor,
            "qr": qr.get("imagem"),
        }

    # ── a corretora é que diz se a leitura estava certa ──────────────────────
    # Sem QR legível, volta-se ao OCR — e aí a leitura não vale por si. Troca-se a password
    # lida por uma gerada aqui: o diálogo pede a actual e é a corretora que a valida.
    # Aceitando, a leitura estava certa; recusando, estava errada — e mais vale saber isso
    # agora do que quando o participante não conseguir entrar.
    troca = trocar_password(login, credenciais.get("candidatos") or [credenciais["password"]])
    if troca.get("ok"):
        registar(f"conta {login}: password mestra trocada por uma gerada")
        return {
            "login": login,
            "password": troca["password"],
            "investor": credenciais.get("investor"),
            "servidor": servidor,
            "password_gerada": True,
            # O QR fica INVÁLIDO depois de trocar a password: ele codifica a antiga. Vai
            # vazio de propósito — um código que não entra é pior do que código nenhum.
            "qr": None,
        }

    registar(f"conta {login}: {troca.get('motivo')}")
    return {
        "login": login, "password": None, "servidor": servidor,
        "precisa_password": True,
        # Sem password legível, o QR é o que salva a conta: entra com um toque sem ela.
        "qr": qr.get("imagem"),
        "aviso": f"conta {login} criada, mas {troca.get('motivo')}",
    }


def fechar_credenciais() -> None:
    """Fecha o diálogo final.

    Pelo BOTÃO, e não pelo texto. O «Finish» está na mesma posição do «Seguinte» de todos os
    passos anteriores, mas o OCR agrupa a linha inteira dos botões — «< Back Finish Cancel» —
    e uma expressão ancorada no início e no fim nunca lá casa. O diálogo ficava aberto, e
    aberto ele é modal: a conta seguinte não conseguia sequer chegar ao menu.
    """
    for _ in range(3):
        if not mt5.ve(r"read only password"):
            return
        mt5.clicar(*BOTAO_SEGUINTE)   # é onde o «Finish» está
        time.sleep(2)
    if mt5.ve(r"read only password"):
        registar("o diálogo das credenciais não fechou")


def trocar_password(login: str, candidatos: list) -> dict:
    trocador = AQUI / "mudar_password.py"
    if not trocador.exists():
        return {"ok": False, "motivo": "mudar_password.py não está instalado"}
    r = subprocess.run(
        [sys.executable, str(trocador), json.dumps({"login": login, "candidatos": candidatos})],
        capture_output=True, text=True, timeout=420,
    )
    for linha in (r.stderr or "").splitlines():
        if linha.strip():
            registar(f"    {linha.strip()[:160]}")
    try:
        return json.loads((r.stdout or "{}").strip().splitlines()[-1])
    except Exception:
        return {"ok": False, "motivo": "o trocador respondeu de forma ilegível"}


def password_do_qr(conteudo: str | None, login: str) -> str | None:
    """A password que vier dentro do QR — se lá estiver, e se for daquela conta.

    O formato do payload é da MetaQuotes e pode mudar de build para build, por isso não se
    presume: procura-se o login lá dentro (se o QR for de outra conta, não serve) e depois
    uma password nomeada. Não se encontrando, devolve-se None e segue-se pelo caminho normal
    — nunca se devolve o primeiro pedaço de texto que apareça só porque tem o tamanho certo.
    """
    if not conteudo or str(login) not in conteudo:
        return None
    for padrao in (r"password[=:\"']+([^&\s\"',}]{6,64})",
                   r"\bpass[=:\"']+([^&\s\"',}]{6,64})"):
        m = re.search(padrao, conteudo, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


def capturar_qr(imagem: str) -> dict:
    """Recorta e LÊ o QR do diálogo final do MetaTrader.

    É o QR oficial da plataforma — o mesmo que a app móvel lê em «Sign In with QR code». Duas
    coisas saem daqui, e ambas valem:

    · A IMAGEM, para o email e para o painel. Um toque a entrar vale mais do que três campos
      copiados à mão de um email para o telemóvel.
    · O CONTEÚDO. O QR traz as credenciais codificadas — é por isso que entra com um toque.
      Descodificá-lo dá a password EXACTA, sem OCR e sem adivinhar: acaba com o problema de
      ler oito caracteres a 11 pixels e nunca saber se estão certos.

    Se o `zbarimg` não estiver instalado ou o código não ler, devolve-se o que se tiver. A
    conta já existe; falhar por causa de um código seria deitar fora o que se acabou de criar.
    """
    x, y, largura, altura = REGIAO_QR
    recorte = "/tmp/mtm-qr.png"
    saida = {"imagem": None, "conteudo": None}
    try:
        # `-trim` encosta a moldura ao código: assim a imagem que segue no email é o QR e não
        # um quadrado branco com um QR ao canto.
        subprocess.run(
            ["convert", imagem, "-crop", f"{largura}x{altura}+{x}+{y}", "+repage",
             "-trim", "+repage", "-bordercolor", "white", "-border", "12", recorte],
            capture_output=True, timeout=60,
        )
        if not os.path.exists(recorte) or os.path.getsize(recorte) < 200:
            return saida
        saida["imagem"] = base64.b64encode(Path(recorte).read_bytes()).decode()

        r = subprocess.run(["zbarimg", "--quiet", "--raw", recorte],
                           capture_output=True, text=True, timeout=60)
        conteudo = (r.stdout or "").strip()
        saida["conteudo"] = conteudo or None
    except Exception as e:
        registar(f"não consegui capturar o QR: {str(e)[:120]}")
    finally:
        try:
            os.unlink(recorte)
        except OSError:
            pass
    return saida


def ler_credenciais(imagem: str, login: str | None = None) -> dict:
    """Lê login/password/investor do diálogo final."""
    # No VPS está tudo na mesma pasta; no repositório, o leitor vive um nível acima.
    leitor = AQUI / "ler_credenciais.py"
    if not leitor.exists():
        leitor = AQUI.parent / "ler_credenciais.py"
    r = subprocess.run(
        [sys.executable, str(leitor), imagem] + ([str(login)] if login else []),
        capture_output=True, text=True, timeout=120,
    )
    try:
        d = json.loads(r.stdout or "{}")
    except Exception:
        return {}
    # `problemas` não vazio = nenhuma leitura se impôs. Antes deitava-se fora o dicionário
    # inteiro, e com ele os CANDIDATOS — que são justamente o que se quer nesse caso: o
    # MetaTrader experimenta-os e recusa os errados na hora. O que não se leva daqui para a
    # frente é a `password`: essa só vale confirmada.
    if d.get("problemas"):
        return {"candidatos": d.get("candidatos") or [], "problemas": d["problemas"]}
    return d


if __name__ == "__main__":
    try:
        entrada = json.loads(sys.argv[1]) if len(sys.argv) > 1 else json.load(sys.stdin)
        print(json.dumps(criar(entrada), ensure_ascii=False))
    except Exception as e:
        print(str(e)[:400], file=sys.stderr)
        sys.exit(1)

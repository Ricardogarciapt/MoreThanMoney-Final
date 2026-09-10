#!/usr/bin/env python3
"""
Lê as credenciais do diálogo final do MetaTrader 5, a partir do OCR nativo do macOS.

Porque OCR e não outra coisa: o login aparece no journal do terminal, mas a PASSWORD só
existe no ecrã — não é gravada em lado nenhum legível, e ainda bem. Ou se lê dali, ou se
pede a um humano. Para o agente ser autónomo, lê-se dali.

O OCR corre na máquina (framework Vision). As credenciais de uma conta nunca saem do Mac.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
OCR = AQUI / "ocr"

# O Vision separa palavras coladas ("TheTradingMaster" -> "The TradingMaster") e troca
# maiúsculas por minúsculas em fontes pequenas. Nas ETIQUETAS isso é inofensivo — compara-se
# sem espaços nem acentos. Nos VALORES não se toca: uma password "corrigida" é uma password
# errada, e o participante ficava sem conseguir entrar sem ninguém perceber porquê.
def _normalizar(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", t.lower())


ETIQUETAS = {
    "login": ("login", "account", "conta", "numero", "number"),
    "password": ("password", "palavrapasse", "senha", "mainpassword", "master"),
    "investor": ("investor", "investidor", "investorpassword", "readonly"),
}


def ocr(imagem: str) -> list[tuple[float, float, float, str]]:
    """
    OCR local. No Mac usa o framework Vision (binário `ocr`); no VPS não existe, e cai no
    tesseract. Em qualquer dos casos corre NA MÁQUINA: as credenciais de uma conta nunca
    saem dali para um serviço de terceiros.
    """
    if not OCR.exists():
        return _ocr_tesseract(imagem)
    saida = subprocess.run([str(OCR), imagem], capture_output=True, text=True, timeout=60)
    if saida.returncode != 0:
        raise RuntimeError(f"OCR falhou: {saida.stderr.strip()[:200]}")
    linhas = []
    for l in saida.stdout.splitlines():
        partes = l.split("\t", 3)
        if len(partes) == 4:
            try:
                linhas.append((float(partes[0]), float(partes[1]), float(partes[2]), partes[3]))
            except ValueError:
                continue
    return linhas


def _ocr_tesseract(imagem: str) -> list:
    """Alternativa para Linux. Devolve (y, x, altura, texto) normalizados de 0 a 1.

    JUNTA AS PALAVRAS EM LINHAS. O tesseract em TSV dá uma palavra por registo; deixá-las
    soltas fazia "Login: 19009" chegar aqui como "Login" e "19009" em registos diferentes e a
    etiqueta emparelhava com o que lhe calhasse ao lado — leu-se "'ope:" como login. As
    colunas block/par/line dizem que palavras são da mesma linha.
    """
    try:
        dim = subprocess.run(
            ["identify", "-format", "%w %h", imagem], capture_output=True, text=True, timeout=30
        ).stdout.split()
        largura, altura = float(dim[0]), float(dim[1])
        r = subprocess.run(
            ["tesseract", imagem, "-", "--psm", "11", "tsv"],
            capture_output=True, text=True, timeout=120,
        )
    except Exception:
        return []

    agrupadas: dict = {}
    for l in r.stdout.splitlines()[1:]:
        c = l.split("\t")
        if len(c) < 12 or not c[11].strip():
            continue
        try:
            x, y, w, h = float(c[6]), float(c[7]), float(c[8]), float(c[9])
            ordem = int(c[5])
        except ValueError:
            continue
        g = agrupadas.setdefault((c[1], c[2], c[3], c[4]),
                                 {"p": [], "x0": x, "y0": y, "x1": x + w, "y1": y + h})
        g["p"].append((ordem, c[11].strip()))
        g["x0"] = min(g["x0"], x); g["y0"] = min(g["y0"], y)
        g["x1"] = max(g["x1"], x + w); g["y1"] = max(g["y1"], y + h)

    linhas = []
    for g in agrupadas.values():
        texto = " ".join(t for _, t in sorted(g["p"]))
        # Centro vertical, tal como no Vision: comparar topos falha quando uma etiqueta e um
        # número têm alturas diferentes.
        linhas.append((((g["y0"] + g["y1"]) / 2) / altura, g["x0"] / largura,
                       (g["y1"] - g["y0"]) / altura, texto))
    linhas.sort()
    return linhas


def extrair(imagem: str, login_conhecido: str | None = None) -> dict:
    """Devolve {'login':…, 'password':…, 'investor':…} com o que conseguir ler.

    `login_conhecido` vem do journal do MetaTrader, que regista a conta assim que ela nasce.
    Passá-lo evita o pior desfecho que este leitor já teve: o login sair ilegível, a leitura
    inteira ser dada como duvidosa, e uma password perfeitamente boa ser deitada fora com ela
    — com a conta já criada do lado da corretora.
    """
    blocos = ocr(imagem)
    achados: dict[str, str] = {}
    caixas: dict[str, tuple[float, float, float, float]] = {}
    duvidosos: list[str] = []

    for y, x, altura, texto in blocos:
        # "Login: 8049321" na mesma caixa — o caso fácil.
        m = re.match(r"^\s*([A-Za-zÀ-ÿ ]{3,20})\s*[:\-]\s*(\S.*)$", texto)
        if m:
            chave = _normalizar(m.group(1))
            for campo, alias in ETIQUETAS.items():
                if campo not in achados and any(chave == _normalizar(a) for a in alias):
                    achados[campo] = m.group(2).split()[0].strip()
                    caixas[campo] = (y, x, altura, x + 0.11)

        # Etiqueta sozinha: procura-se o valor MAIS À DIREITA na mesma linha. "Mesma linha" é
        # uma tolerância em y, não uma igualdade: o Vision não alinha as caixas ao pixel.
        chave = _normalizar(texto.rstrip(":"))
        for campo, alias in ETIQUETAS.items():
            if campo in achados or not any(chave == _normalizar(a) for a in alias):
                continue
            # "Mesma linha" é uma tolerância proporcional à ALTURA do texto, não um número
            # fixo: num diálogo pequeno 0,02 é meia linha, num grande é um terço de caractere.
            tolerancia = max(0.012, altura * 0.7)
            candidatos = [
                (xx, tt) for yy, xx, _h, tt in blocos
                if abs(yy - y) < tolerancia and xx > x + 0.01 and tt.strip()
            ]
            if candidatos:
                candidatos.sort()
                achados[campo] = candidatos[0][1].split()[0].strip()
                # A tira a reler vai do valor até ao que vier a seguir na mesma linha — na
                # linha da investor vem logo "(read only password)", e apanhá-lo colava-o à
                # password. Não havendo nada a seguir, 0,11 de largura chega para o valor.
                seguinte = candidatos[1][0] if len(candidatos) > 1 else candidatos[0][0] + 0.11
                caixas[campo] = (y, candidatos[0][0], altura, seguinte)

    # ── o valor vem da leitura AMPLIADA, não da do ecrã inteiro ────────────────────────────────────────────
    # A passagem de ecrã inteiro serve para SABER ONDE estão os valores, não para os ler: a
    # 11px lê "!pY2HdCq" como "tpy2Hacg" e "PcUmY*4r" como "PcumyY*4r" — plausíveis, e
    # errados. Ampliada, a mesma tira lê-se bem. Onde as três variantes não concordarem, o
    # campo cai: a conta entrega-se com aviso em vez de com uma password inventada.
    for campo in ("password", "investor"):
        if campo not in caixas:
            continue
        leituras = _ler_valor(imagem, *caixas[campo])
        distintas = list(dict.fromkeys(_com_simbolos(leituras)))
        if campo == "password":
            achados["candidatos"] = distintas
        if len(distintas) == 1:
            achados[campo] = distintas[0]
        else:
            duvidosos.append(campo)
            achados.pop(campo, None)

    # O login é sempre um número: se o OCR trouxe lixo à volta, fica só o número.
    if "login" in achados:
        so_digitos = re.sub(r"\D", "", achados["login"])
        achados["login"] = so_digitos if len(so_digitos) >= 4 else achados["login"]

    # ── o login tem DUAS fontes, e têm de concordar ──────────────────────────
    # O journal do MetaTrader diz que conta acabou de nascer; o ecrã diz de quem são estas
    # passwords. Enquanto uma coisa e outra baterem certo, a entrega é segura. Discordando,
    # não há entrega nenhuma: seria o login de uma conta com a password de outra, e o
    # participante ficaria sem conseguir entrar sem ninguém perceber onde é que aquilo torceu.
    if login_conhecido:
        do_ecra = achados.get("login", "")
        if do_ecra and do_ecra.isdigit() and do_ecra != str(login_conhecido):
            achados.clear()
            achados["conflito"] = f"o journal diz {login_conhecido} e o ecrã diz {do_ecra}"
            achados["_duvidosos"] = ["login"]
            return achados
        achados["login"] = str(login_conhecido)

    achados["_duvidosos"] = duvidosos
    return achados


# Seis maneiras de olhar para a mesma tira, de propósito DIFERENTES umas das outras.
#
# Variar só o filtro não chega: na conta 19011 as três primeiras deram a mesma leitura e
# estavam as três erradas — concordância não é prova. A escala é que muda o resultado a
# sério: a mesma password lia-se "!pY2HdCq" a 300% e "ipY2HdCq" a 350%, e só uma delas abria
# a conta. Recolhem-se todas e é o MetaTrader que escolhe, recusando as erradas na hora.
#
# E SEM binarizar: o `-threshold` que aqui esteve comia o pé do "!" e dava-lhe forma de "i".
VARIANTES = (
    ["-resize", "250%", "-colorspace", "Gray"],
    ["-resize", "300%", "-colorspace", "Gray"],
    ["-resize", "300%", "-colorspace", "Gray", "-sharpen", "0x1"],
    ["-filter", "Lanczos", "-resize", "300%", "-colorspace", "Gray"],
    ["-resize", "350%", "-colorspace", "Gray"],
    ["-resize", "500%", "-colorspace", "Gray"],
)


# Símbolos que a corretora aceita numa password. A ordem é a da frequência com que aparecem
# nas contas já criadas — a primeira tentativa acerta mais vezes assim.
SIMBOLOS = "!*@#%&$+-_=?"


def _com_simbolos(leituras: list[str]) -> list[str]:
    """Uma leitura com um BURACO no meio vale por doze candidatos, não por zero.

    A fonte do Wine não desenha alguns dos símbolos que a corretora exige, e o caractere
    aparece no ecrã como um espaço em branco: a password da conta 19011 lia-se «NeLw wP0» e a
    verdadeira tinha um símbolo onde está o vazio. Não há OCR que leia o que não foi
    desenhado. Mas o MetaTrader verifica cada tentativa localmente e recusa-a na hora, por
    isso experimentam-se os símbolos possíveis — sobre uma conta nossa, acabada de criar, e
    sem custo nenhum. É reconstruir o que o ecrã não mostrou, não adivinhar uma password.
    """
    saida = []
    for leitura in leituras:
        if " " in leitura.strip():
            saida += [leitura.replace(" ", c, 1) for c in SIMBOLOS]
        else:
            saida.append(leitura)
    return saida


def _ler_valor(imagem: str, y: float, x: float, altura: float, x_fim: float) -> list[str]:
    """Todas as leituras do valor à direita da etiqueta, uma por variante.

    Devolve a LISTA e não um vencedor. Concordarem as três não prova nada — na conta 19011
    concordaram e estavam as três erradas. Quem decide qual é a boa é o MetaTrader, que
    verifica a password actual localmente e a rejeita na hora: experimentam-se os candidatos
    e fica o que ele aceitar. Nenhum servindo, entrega-se o login com aviso — nunca uma
    password adivinhada.
    """
    try:
        dim = subprocess.run(["identify", "-format", "%w %h", imagem],
                             capture_output=True, text=True, timeout=30).stdout.split()
        largura_px, altura_px = float(dim[0]), float(dim[1])
    except Exception:
        return []

    h = max(int(altura * altura_px * 2.2), 20)
    topo = max(int(y * altura_px - h / 2), 0)
    esquerda = max(int(x * largura_px) - 4, 0)
    # A tira acaba onde acaba o valor: na linha da investor vem logo «(read only password)»
    # e apanhá-lo colava-o à password.
    largura_tira = max(int((x_fim - x) * largura_px), 40)
    corte = f"{largura_tira}x{h}+{esquerda}+{topo}"

    leituras: list[str] = []
    for variante in VARIANTES:
        try:
            subprocess.run(["convert", imagem, "-crop", corte, "+repage", *variante,
                            "/tmp/mtm-valor.png"], capture_output=True, timeout=60)
            r = subprocess.run(["tesseract", "/tmp/mtm-valor.png", "-", "--psm", "7"],
                               capture_output=True, text=True, timeout=60)
        except Exception:
            return []
        # Juntar os pedaços: ampliada, a fonte fica com folgas que o tesseract lê como
        # espaços — "RrNm*d3d" chegava partido em "RrNm" e "*d3d".
        leituras.append("".join(r.stdout.split()))
    return [v for v in leituras if len(v) >= 6]


def validar(achados: dict) -> list[str]:
    """Motivos para NÃO confiar nesta leitura. Vazio = leitura fiável."""
    problemas = []
    login = achados.get("login", "")
    if not login or not login.isdigit() or len(login) < 4:
        problemas.append("login ilegível ou não numérico")
    pw = achados.get("password", "")
    if not pw or len(pw) < 6:
        problemas.append("password ilegível ou demasiado curta")
    # Um espaço numa password é quase sempre o OCR a partir uma palavra em duas. Entregar
    # assim dava uma conta que não abre, e ninguém saberia porquê.
    if "password" in achados.get("_duvidosos", []):
        problemas.append("as leituras da password não coincidiram")
    if achados.get("conflito"):
        problemas.append(f"login em conflito: {achados['conflito']}")
    return problemas


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"erro": "uso: ler_credenciais.py <imagem> [login]"}))
        sys.exit(1)
    try:
        achados = extrair(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
        problemas = validar(achados)
        duvidosos = achados.pop("_duvidosos", [])
        # A investor é só de leitura: se as duas leituras não bateram certo, vai vazia — mas
        # não trava a entrega de uma conta cuja password principal está confirmada.
        if duvidosos:
            print(f"leitura descartada por divergência: {', '.join(duvidosos)}", file=sys.stderr)
        print(json.dumps({**achados, "problemas": problemas}, ensure_ascii=False))
        sys.exit(0 if not problemas else 2)
    except Exception as e:
        print(json.dumps({"erro": str(e)[:300]}))
        sys.exit(1)

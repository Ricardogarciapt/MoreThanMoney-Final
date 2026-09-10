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
    if not OCR.exists():
        raise RuntimeError(f"o binário de OCR não existe em {OCR} — corre ./instalar.sh")
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


def extrair(imagem: str) -> dict:
    """Devolve {'login':…, 'password':…, 'investor':…} com o que conseguir ler."""
    blocos = ocr(imagem)
    achados: dict[str, str] = {}

    for y, x, altura, texto in blocos:
        # "Login: 8049321" na mesma caixa — o caso fácil.
        m = re.match(r"^\s*([A-Za-zÀ-ÿ ]{3,20})\s*[:\-]\s*(\S.*)$", texto)
        if m:
            chave = _normalizar(m.group(1))
            for campo, alias in ETIQUETAS.items():
                if campo not in achados and any(chave == _normalizar(a) for a in alias):
                    achados[campo] = m.group(2).strip()

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
                achados[campo] = candidatos[0][1].strip()

    # O login é sempre um número: se o OCR trouxe lixo à volta, fica só o número.
    if "login" in achados:
        so_digitos = re.sub(r"\D", "", achados["login"])
        achados["login"] = so_digitos if len(so_digitos) >= 4 else achados["login"]

    return achados


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
    if " " in pw:
        problemas.append("password com espaço — leitura duvidosa")
    return problemas


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"erro": "uso: ler_credenciais.py <imagem>"}))
        sys.exit(1)
    try:
        achados = extrair(sys.argv[1])
        problemas = validar(achados)
        print(json.dumps({**achados, "problemas": problemas}, ensure_ascii=False))
        sys.exit(0 if not problemas else 2)
    except Exception as e:
        print(json.dumps({"erro": str(e)[:300]}))
        sys.exit(1)

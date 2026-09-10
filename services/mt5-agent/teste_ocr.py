#!/usr/bin/env python3
"""
Testa a leitura das credenciais contra diálogos gerados.

O que isto protege: uma password mal lida entrega uma conta que não abre, e o participante
fica sem saber porquê — a MTM diria que a conta foi emitida e ele diria que não entra.
Por isso o parser tem de acertar quando dá, e RECUSAR quando não dá. Recusar é o
comportamento certo: um pedido devolvido à fila resolve-se; uma password errada não.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("precisa de Pillow: pip3 install Pillow")
    sys.exit(1)

NORMAL = "/System/Library/Fonts/Supplemental/Arial.ttf"
NEGRITO = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def desenhar(caminho, linhas, tamanho=18, largura=560, coluna=210):
    img = Image.new("RGB", (largura, 60 + 40 * len(linhas)), "#efefef")
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(NORMAL, tamanho)
    fb = ImageFont.truetype(NEGRITO, tamanho)
    for i, (esq, dir_) in enumerate(linhas):
        d.text((26, 30 + 40 * i), esq, font=f, fill="#333")
        if dir_:
            d.text((coluna, 30 + 40 * i), dir_, font=fb, fill="#000")
    img.save(caminho)


def ler(caminho):
    r = subprocess.run(
        [sys.executable, str(AQUI / "ler_credenciais.py"), caminho],
        capture_output=True, text=True, timeout=90,
    )
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"erro": r.stdout[:120] or r.stderr[:120]}


CASOS = [
    # (nome, linhas, esperado_login, esperado_password, tem_de_recusar)
    ("etiqueta e valor separados",
     [("Login:", "8049321"), ("Password:", "Kp7$mQ2xLw"), ("Investor:", "Rv9!nT4bZs")],
     "8049321", "Kp7$mQ2xLw", False),
    ("tudo na mesma caixa",
     [("Login: 8049322", ""), ("Password: Zx4#pR8vNq", ""), ("Investor: Ab1@cD2eFg", "")],
     "8049322", "Zx4#pR8vNq", False),
    ("em portugues",
     [("Conta:", "8049323"), ("Palavra-passe:", "Qw3&rT5yUi"), ("Investidor:", "Op6*aS9dFg")],
     "8049323", "Qw3&rT5yUi", False),
    ("texto pequeno",
     [("Login:", "8049326"), ("Password:", "Th8%kL3mVc")],
     "8049326", "Th8%kL3mVc", False),
    # ── os que TÊM de ser recusados ──────────────────────────────────────────
    ("password partida ao meio",
     [("Login:", "8049324"), ("Password:", "Kp7 mQ2xLw")], None, None, True),
    ("sem password",
     [("Login:", "8049325"), ("Server:", "TheTradingMaster-Live")], None, None, True),
    ("dialogo vazio",
     [("Registration completed", ""), ("Please wait...", "")], None, None, True),
]


def main():
    ok = mau = 0
    tmp = Path(tempfile.mkdtemp())
    for nome, linhas, login, pw, recusa in CASOS:
        img = str(tmp / f"{nome.replace(' ', '_')}.png")
        desenhar(img, linhas, tamanho=13 if "pequeno" in nome else 18)
        r = ler(img)
        problemas = r.get("problemas", ["sem resposta"])

        if recusa:
            if problemas:
                ok += 1
            else:
                mau += 1
                print(f"✗ {nome}: devia ter RECUSADO e aceitou {r}")
            continue

        falhas = []
        if problemas:
            falhas.append(f"recusou sem motivo: {problemas}")
        if r.get("login") != login:
            falhas.append(f"login {r.get('login')!r} != {login!r}")
        if r.get("password") != pw:
            falhas.append(f"password {r.get('password')!r} != {pw!r}")
        if falhas:
            mau += 1
            print(f"✗ {nome}: {'; '.join(falhas)}")
        else:
            ok += 1

    print(f"\n{'✓' if mau == 0 else '✗'} {ok} passaram, {mau} falharam")
    sys.exit(0 if mau == 0 else 1)


if __name__ == "__main__":
    main()

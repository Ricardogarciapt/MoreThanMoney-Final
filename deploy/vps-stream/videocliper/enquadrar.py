#!/usr/bin/env python3
"""
Onde está a cara num excerto: python3 enquadrar.py <video> <recuo> <duracao>

Imprime uma linha JSON:
  {"w": 1920, "h": 1080, "cara": {"x":..,"y":..,"w":..,"h":..} | null, "tipo": "chamada"|"cara"|"nenhum"}

· "chamada": a cara é pequena (câmara num quadrado do canto, com ecrã partilhado à volta).
· "cara": a cara ocupa o plano (alguém a falar para a câmara).
· "nenhum": não se encontrou cara estável (o worker volta ao corte ao centro).

Usa o detector Haar do OpenCV, que vem com o pacote e corre em qualquer CPU. Sem OpenCV
devolve "nenhum" e o corte fica como antes.
"""
import json
import sys


def main():
    video, recuo, duracao = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    try:
        import cv2  # type: ignore
    except Exception:
        print(json.dumps({"tipo": "nenhum", "motivo": "sem opencv"}))
        return

    cap = cv2.VideoCapture(video)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    if not w or not h:
        print(json.dumps({"tipo": "nenhum", "motivo": "sem frames"}))
        return

    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    amostras = 12
    caras = []
    for i in range(amostras):
        t = recuo + duracao * (i + 0.5) / amostras
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if not ok:
            continue
        cinza = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        minimo = max(24, int(min(w, h) * 0.04))
        achadas = det.detectMultiScale(cinza, scaleFactor=1.1, minNeighbors=6, minSize=(minimo, minimo))
        if len(achadas):
            # a maior cara do frame (numa grelha de chamada é quem tem o quadrado maior)
            x, y, cw, ch = max(achadas, key=lambda r: r[2] * r[3])
            caras.append((int(x), int(y), int(cw), int(ch)))
    cap.release()

    # Precisa de aparecer em pelo menos um terço das amostras para ser «a câmara».
    if len(caras) < max(3, amostras // 3):
        print(json.dumps({"w": w, "h": h, "cara": None, "tipo": "nenhum"}))
        return

    def mediana(v):
        v = sorted(v)
        return v[len(v) // 2]

    cara = {
        "x": mediana([c[0] for c in caras]),
        "y": mediana([c[1] for c in caras]),
        "w": mediana([c[2] for c in caras]),
        "h": mediana([c[3] for c in caras]),
    }
    # Uma cara com menos de 14% da largura é uma câmara num quadrado, com o ecrã à volta.
    tipo = "chamada" if cara["w"] < w * 0.14 else "cara"
    print(json.dumps({"w": w, "h": h, "cara": cara, "tipo": tipo}))


if __name__ == "__main__":
    main()

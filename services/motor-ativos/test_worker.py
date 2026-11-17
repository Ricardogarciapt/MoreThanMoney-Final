#!/usr/bin/env python3
"""Testes do worker sem GPU: um site falso e um ComfyUI falso em localhost.
Corre: python3 services/motor-ativos/test_worker.py   (precisa de ffmpeg)"""
import importlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

AQUI = Path(__file__).resolve().parent
TMP = Path(tempfile.mkdtemp())
PNG = TMP / "ref.png"
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=640x480", "-frames:v", "1", str(PNG)], check=True)
MP4 = TMP / "clip.mp4"
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=736x1280:d=1:r=24", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(MP4)], check=True)

ESTADO = {"fila": [], "subidas": {}, "fechos": [], "pulsos": [], "grafos": []}


class Site(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/api/estudio/motor/geracao"):
            assert self.headers["authorization"] == "Bearer segredo"
            ESTADO["pulsos"].append(self.path)
            return self._json({"ok": True, "trabalho": ESTADO["fila"].pop(0) if ESTADO["fila"] else None})
        if self.path == "/ref.png":
            self.send_response(200); self.end_headers(); return self.wfile.write(PNG.read_bytes())
        # ComfyUI falso
        if self.path.startswith("/history/"):
            pid = self.path.split("/")[-1]
            no = ESTADO["grafos"][-1]["no"]
            return self._json({pid: {"status": {"status_str": "success", "completed": True}, "outputs": {no: {"images": [{"filename": "x", "subfolder": "", "type": "output"}]}}}})
        if self.path.startswith("/view"):
            src = MP4 if ESTADO["grafos"][-1]["video"] else PNG
            self.send_response(200); self.end_headers(); return self.wfile.write(src.read_bytes())
        self._json({}, 404)

    def do_PUT(self):
        n = int(self.headers["content-length"]); ESTADO["subidas"][self.path] = self.rfile.read(n)
        self._json({"Key": self.path})

    def do_POST(self):
        n = int(self.headers.get("content-length") or 0); corpo = self.rfile.read(n)
        if self.path == "/api/estudio/motor/geracao":
            ESTADO["fechos"].append(json.loads(corpo)); return self._json({"ok": True})
        if self.path == "/upload/image":
            return self._json({"name": "entrada.png", "subfolder": ""})
        if self.path == "/prompt":
            g = json.loads(corpo)["prompt"]
            video = any(v["class_type"] == "SaveVideo" for v in g.values())
            ESTADO["grafos"].append({"g": g, "no": "53" if video else "17", "video": video})
            return self._json({"prompt_id": "p1"})
        self._json({}, 404)


srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_port}"


def carregar(modo):
    os.environ.update({"MTM_SITE": URL, "MTM_MOTOR_SECRET": "segredo", "MOTOR_MODO": modo, "COMFY_URL": URL, "MOTOR_NOME": "teste", "MOTOR_CAPS": "cena,angulo,mover"})
    sys.path.insert(0, str(AQUI))
    import worker
    return importlib.reload(worker)


def trabalho(tipo, params, imagem=True, ext="png", mime="image/png"):
    return {"id": f"id-{tipo}", "tipo": tipo, "params": {"aspecto": "9:16", "seed": 7, **params},
            "imagem": {"url": f"{URL}/ref.png", "mime": "image/png", "tipo": "imagem"} if imagem else None, "audio": None,
            "saida": {"subir_url": f"{URL}/subir/{tipo}.{ext}", "caminho": f"ativos/ia/x.{ext}", "mime": mime, "ext": ext}}


class Testes(unittest.TestCase):
    def setUp(self):
        for k in ESTADO: ESTADO[k].clear()

    def test_frames_8n_mais_1(self):
        w = carregar("ensaio")
        for s in (2, 3, 5, 6, 8):
            self.assertEqual((w.frames_para(s) - 1) % 8, 0)
        self.assertEqual(w.frames_para(5), 121)

    def test_prompt_angulo(self):
        w = carregar("ensaio")
        self.assertEqual(w.prompt_angulo({"azimute": "left", "elevacao": "low", "distancia": "close"}, w.manifest()), "<sks> left side view low-angle shot close-up")

    def test_movimento_sem_lora_vai_por_prompt(self):
        w = carregar("ensaio")
        p = w.plano_mover({"movimento": "orbit-left", "aspecto": "9:16", "duracao_s": 4}, w.manifest())
        self.assertEqual(p["cameraLoraStrength"], 0.0)
        self.assertEqual((p["width"], p["height"]), (736, 1280))

    def test_ensaio_ciclo_completo(self):
        w = carregar("ensaio")
        ESTADO["fila"].append(trabalho("mover", {"duracao_s": 3}, ext="mp4", mime="video/mp4"))
        self.assertTrue(w.uma_volta())
        self.assertTrue(ESTADO["fechos"][0]["ok"], ESTADO["fechos"])
        self.assertGreater(len(ESTADO["subidas"]["/subir/mover.mp4"]), 1000)
        self.assertIn("motor=teste", ESTADO["pulsos"][0])

    def test_gpu_cena_aplica_bindings(self):
        w = carregar("gpu")
        ESTADO["fila"].append(trabalho("cena", {"prompt": "num estúdio de podcast"}))
        w.uma_volta()
        self.assertTrue(ESTADO["fechos"][0]["ok"], ESTADO["fechos"])
        g = ESTADO["grafos"][0]["g"]
        self.assertIn("podcast", g["10"]["inputs"]["prompt"])
        self.assertEqual(g["4"]["inputs"]["strength_model"], 0.0)   # sem LoRA de ângulos
        self.assertEqual(g["15"]["inputs"]["seed"], 7)

    def test_gpu_mover_aplica_bindings(self):
        w = carregar("gpu")
        ESTADO["fila"].append(trabalho("mover", {"duracao_s": 5, "movimento": "jib-up", "prompt": "o Ricardo sorri"}, ext="mp4", mime="video/mp4"))
        w.uma_volta()
        self.assertTrue(ESTADO["fechos"][0]["ok"], ESTADO["fechos"])
        g = ESTADO["grafos"][0]["g"]
        self.assertEqual(g["24"]["inputs"]["value"], 121)
        self.assertEqual(g["2"]["inputs"]["resize_type.height"], 1280)
        self.assertIn("jib-up", g["11"]["inputs"]["lora_name"])

    def test_falha_devolve_erro(self):
        w = carregar("gpu")
        ESTADO["fila"].append(trabalho("voz", {"texto": "olá"}, imagem=False, ext="wav", mime="audio/wav"))
        os.environ.pop("FISH_API_KEY", None)
        w.uma_volta()
        self.assertFalse(ESTADO["fechos"][0]["ok"])
        self.assertIn("sem motor de voz", ESTADO["fechos"][0]["erro"])


if __name__ == "__main__":
    unittest.main(verbosity=1)

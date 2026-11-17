#!/usr/bin/env python3
"""Lista os pesos a descarregar (pasta, ficheiro, url, GB) a partir do manifest do open-higgsfield.
Uso: pesos.py manifest.json angle[:gguf] [move] …   · CAMERA_LORAS=all|static,dolly-in,…"""
import json, os, sys
m = json.load(open(sys.argv[1]))
cams = os.environ.get("CAMERA_LORAS", "all")
cam_files = {c["lora"] for c in m["cameraMoves"] if c["lora"]}
quero = None if cams == "all" else {next((c["lora"] for c in m["cameraMoves"] if c["id"] == i), None) for i in cams.split(",")}
vistos = set()
for arg in sys.argv[2:]:
    etapa, _, var = arg.partition(":")
    modelos = m[etapa]["models"]
    if var:
        v = m[etapa]["variants"][var]
        modelos = [x for x in modelos if x["folder"] != v["replaces"]] + v["models"]
    for x in modelos:
        if x["file"] in cam_files and quero is not None and x["file"] not in quero: continue
        if x["file"] in vistos: continue
        vistos.add(x["file"])
        print(f'{x["folder"]}\t{x["file"]}\t{x["url"]}\t{x["sizeGB"]}')

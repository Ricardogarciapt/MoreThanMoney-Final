---
name: mtm-video
description: "Ponto de entrada ÚNICO para criar, editar ou renderizar qualquer vídeo MTM (reel, story, apresentação, promo, landing, bootcamp, demo B2B, clone HeyGen, Studify). Escolhe o motor, o perfil de marca e a pasta de saída do motor de vídeo único (video/motor)."
metadata:
  version: 1.0.0
  author: MTM
  updated: 2026-11-19
risk: safe
---

# Vídeo MTM — um só pipeline

Antes de escrever código ou renderizar, lê `video/motor/LEIA-ME.md` (tabela «Que motor usar»).

## Passos

1. **Marca.** Pergunta-te de quem é o vídeo: `morethanmoney` (casa, ouro), `ricardo-garcia`
   (@ricardogarciapt, ciano, Brand Kit em /marca/ricardogarciapt) ou um cliente B2B
   (`video/motor/marcas/b2b-<slug>.json`, copiado do `modelo-b2b.json`). Nunca misturar: vídeo de
   cliente sem logótipo, voz nem @ da MTM.
2. **Motor.** Pela tabela do LEIA-ME. Estilo cinemático (CGI, títulos palavra a palavra, música e
   SFX sintetizados, stock com grade) = `video/cinematico`, com um projecto novo em
   `src/projetos/<nome>/` que reutiliza `src/motor/util.tsx` (Titulo, Plano, Pelicula, Clarao).
   Take filmado = editor do `/estudio`. Clone = HeyGen (`/api/estudio/clone-reel`).
3. **Formato.** `reel` (1080×1920), `feed` (1080×1350), `quadrado`, `youtube` (1920×1080). 30 fps.
4. **Render.** Nada de `-c:v libx264 -crf …` nem `loudnorm=…` escritos à mão: `motor.codificar()`,
   `motor.LOUDNORM`, `motor.enquadrar()` (Node), `motor.codificar()` (Python),
   `finalizar()` para vídeos que vêm de fora (HeyGen, Studify, CapCut).
5. **Saída.** `node video/motor/motor.mjs saida <marca> <produto> <slug>` dá o caminho final.
6. **Verificar.** `node video/motor/motor.mjs verificar <mp4> --formato=<f>` → `ok: true`.
   Vê pelo menos um fotograma (ffmpeg -frames:v 1) antes de dizer que está pronto.

## Conteúdo (todas as marcas)

- PT-PT com «tu». Nenhum número de desempenho inventado; exemplo leva «Exemplo ilustrativo».
- Trading: disclaimer educativo (`marca.disclaimer`). Não nomear a plataforma dos cursos.
- Voz do Ricardo: Fish (PT-PT). Velocidade: tutoriais 1,12×, vendas 1,0×, bootcamps 1,03×.
- Música só sintetizada ou com licença livre registada em `MTM-Assets/stock/LICENCAS.md`.

## Skills de escrita que alimentam este pipeline

`video-script`, `reels-content-plan`, `short-form-video-plan`, `video-course-production`,
`hooks-swipe-file` escrevem o guião; esta skill decide como ele é renderizado.

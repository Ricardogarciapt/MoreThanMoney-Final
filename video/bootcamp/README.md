# Bootcamps MTM em vídeo

Cursos longos por estratégia, narrados na voz clonada do Ricardo (Fish), em PT e EN, para as playlists
de cada estratégia no YouTube (que o canal do educador MTM em /live/9739ae1a… já mostra).

- `guioes/<estrategia>.<lang>.json`: o guião. Cada cena tem um `tipo` (abertura, capitulo, pontos,
  checklist, grafico, camadas3d, pontuacao, plano, comparar, frase, aviso) e a `fala`.
- `cenas.html`: o motor visual. Os gráficos são **sintéticos e ilustrativos** (não são histórico real nem
  resultados), e o vídeo di-lo.
- `voz.mjs` (no Mac, onde está a FISH_API_KEY): `node video/bootcamp/voz.mjs defy all pt en`
- `render.mjs`: `node video/bootcamp/render.mjs defy 1 pt` → `saida/defy/bootcamp-defy-1-pt.mp4`, com
  `.vtt` (legendas para as CC do YouTube) e `-capitulos.txt` (capítulos para a descrição).
  `--preview` para rever o ritmo a 8 fps; `--de=SEG --ate=SEG` para um troço.
- `capa.mjs`: `node video/bootcamp/capa.mjs defy` → capas 1280×720 por módulo e língua.

Música opcional: `musica.mp3` nesta pasta entra baixa, com ducking pela voz.
`saida/` e `voz/` não vão para o git.

Regras: nomes de estratégias e definições não se traduzem; nunca taxas de acerto nem promessas;
aviso educativo no fim de cada módulo.

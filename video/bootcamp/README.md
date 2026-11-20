# Bootcamps MTM em vídeo

Cursos longos por estratégia, narrados na voz clonada do Ricardo (Fish), em PT e EN, para as playlists
de cada estratégia no YouTube (que o canal do educador MTM em /live/9739ae1a… já mostra).

- `guioes/<estrategia>.<lang>.json`: o guião. Cada cena tem um `tipo` (abertura, capitulo, pontos,
  checklist, grafico, camadas3d, pontuacao, plano, comparar, frase, aviso) e a `fala`.
- `cenas.html`: o motor visual. Os gráficos são **sintéticos e ilustrativos** (não são histórico real nem
  resultados), e o vídeo di-lo.
- **Gráfico fiel ao indicador** (regra do Ricardo, 07/11: vídeos de estratégia o mais próximos possível do
  código): `<motor>.js` reproduz o Pine da estratégia em cima de `motor-base.js` (ema, alma, pivots, ATR,
  supertrend e desenho estilo TradingView). Existem `trendshot.js` e `defy.js`. O `render.mjs` carrega
  `<motor>.js` (campo `motor` do guião, ou o nome da estratégia); a `fila.sh` só desenha estratégias que
  já têm motor. `testar-frames.mjs` tira screenshots de cenas para rever sem render completo.
- Séries que não são bootcamp (ex.: `defy-explica`, os 3 vídeos curtos do DEFY): `"playlist"` diz em que
  playlist entram, `"posicao":"inicio"` põe-nos no topo, `"serie"`/`"pilula"` mudam capa e título e
  `"tituloPlaylist"` renomeia a playlist. Os módulos dos bootcamps entram sempre no FIM da playlist.
- `publicar-youtube.mjs` (no Mac): sobe, põe capa e legendas, arruma a ordem das playlists;
  `--refazer <est> --tag <t>` substitui vídeos já publicados.
- `voz.mjs` (no Mac, onde está a FISH_API_KEY): `node video/bootcamp/voz.mjs defy all pt en`
- `render.mjs`: `node video/bootcamp/render.mjs defy 1 pt` → `saida/defy/bootcamp-defy-1-pt.mp4`, com
  `.vtt` (legendas para as CC do YouTube) e `-capitulos.txt` (capítulos para a descrição).
  `--preview` para rever o ritmo a 8 fps; `--de=SEG --ate=SEG` para um troço.
- `capa.mjs`: `node video/bootcamp/capa.mjs defy` → capas 1280×720 por módulo e língua.

## Cursos do Estúdio de Cursos (aulas narradas pelo gémeo)

Desde 20/11/2026 as aulas dos cursos pedidos no Estúdio de Cursos MTM (artefacto, coleção `cursos`)
saem por este mesmo motor, com o gémeo do Ricardo a narrar num círculo com aro dourado no canto
inferior esquerdo (o formato aprovado no vídeo de /apresentacao).

1. Guião da aula no formato dos bootcamps: `guioes/curso-<slug>.pt.json` (um `video` por aula).
2. Voz Fish do Ricardo (PT-PT): `node video/bootcamp/voz.mjs curso-<slug> all pt`.
3. Créditos antes de gastar: `node video/bootcamp/render.mjs curso-<slug> 1 pt --gemeo-estimar`
   (avatar_iii ≈ 7 créditos/min). Acima de 60 créditos faz-se uma aula de amostra e pede-se OK ao Ricardo.
4. Render com o gémeo: `node video/bootcamp/render.mjs curso-<slug> <aula> pt --gemeo` → `<base>-gemeo.mp4`.
   O passo é o `gemeo` do motor único (`video/motor/gemeo.mjs`): lip sync HeyGen sobre a narração,
   círculo, `finalizar` (1080p, -14 LUFS). `--gemeo=twin|trader|podcast` troca o look.
5. Se o curso tiver «Só voz» no estúdio, renderiza-se sem `--gemeo`.

Música opcional: `musica.mp3` nesta pasta entra baixa, com ducking pela voz.
`saida/` e `voz/` não vão para o git.

Regras: nomes de estratégias e definições não se traduzem; nunca taxas de acerto nem promessas;
aviso educativo no fim de cada módulo.

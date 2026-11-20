# Motor de vídeo único da MTM

Desde 19/11/2026 todos os vídeos da casa renderizam da mesma maneira e para o mesmo sítio.
Cada produto só traz a sua **cena** (guião, planos, animação) e escolhe um **perfil de marca**.
Tudo o resto (formato, 30 fps, H.264, AAC, -14 LUFS, grades de cor, fontes, pastas) vem daqui.

```
video/motor/
  formatos.json        formatos, qualidades, codec, volume, grades, pastas  ← fonte única
  marcas/*.json        perfis: morethanmoney · ricardo-garcia · modelo-b2b (clientes: b2b-<slug>.json)
  fontes/              Anton, Oswald, Kalam (as das marcas)
  motor.mjs            Node: motores ffmpeg e Playwright + CLI (verificar, finalizar, saida, pasta, marcas)
  motor.py             Python: reels do clone (PIL/numpy)
lib/video/motor.ts     o mesmo, do lado do site (Next.js): perfilMarca, formatoVideo, chaveRender
video/cinematico/      motor cinemático Remotion + Three.js (estilo /solucoes), marca por --props
```

## Que motor usar

| Pedido | Motor | Onde corre |
|---|---|---|
| Vídeo de apresentação, promo, landing, demo B2B (CGI, títulos, música, SFX) | `video/cinematico` (Remotion) | Mac ou nuvem: `bash video/cinematico/render.sh <Composicao> <marca>` |
| Reel a partir de um take filmado, «Montar com IA», editor com timeline | editor do `/estudio` (`services/estudio-editor`) | Mac (launchd) |
| Reel do Ricardo com o clone (HeyGen, looks verticais) | `/api/estudio/clone-reel` → editor do `/estudio` | HeyGen + Mac |
| Reel do Ricardo com fotos/voz Fish ou com take cortado plano a plano | `services/reels-ricardo` (`render.py`, `filmado.py`) | GitHub Actions / Mac |
| Reel/story de guião automático (voz TTS, cartões, Pexels) | Conteúdo Magnético (`services/conteudo-magnetico-render`) | VPS |
| Reels diários dos educadores | `tools/reels-educadores/diario.mjs` | GitHub Actions |
| Bootcamps de estratégia (YouTube, gráfico fiel ao Pine) | `video/bootcamp` | Mac (`fila.sh`) |
| Aulas dos cursos (Estúdio de Cursos) narradas pelo gémeo num círculo | `video/bootcamp/render.mjs … --gemeo` → passo `gemeo` | Mac + HeyGen |
| Vídeo de apresentação MTM em 7 línguas | `video/apresentacao` | Mac |
| Stories MTM | `video/stories-mtm` | Mac |
| **Gémeo do Ricardo a apresentar um vídeo que já existe** (círculo com aro da marca, lip sync HeyGen sobre o áudio do próprio vídeo: apresentações, cursos, bootcamps) | `node video/motor/motor.mjs gemeo <base> <saida> [--look=mentor] [--estimar]` (`video/motor/gemeo.mjs`) | onde houver `HEYGEN_API_KEY`; ≈ 7 créditos/min (`avatar_iii`) |
| Vídeo narrado de 1 imagem (app de desktop no Mac) | Studify (MCP `criar_video`) → depois `motor.mjs finalizar` | Mac |

Studify, HeyGen e qualquer vídeo que venha de fora passam sempre por `finalizar` antes de ir para
o Instagram, o site ou o YouTube, para sair com o mesmo formato e volume.

## Regras

1. **Nenhum motor escreve números de codificação à mão.** Usa `codificar()`, `codecVideo()`,
   `codecAudio()`, `LOUDNORM`, `enquadrar()` e `formato()`. Mudar a qualidade da casa é mudar
   `formatos.json` e mais nada.
2. **Cores, fontes, logótipo, grade e CTA vêm do perfil** (`marca('ricardo-garcia')`). Nenhuma cena
   tem `#D2A63C` fixo; no Remotion usa-se `OURO`, `OURO_CLARO`, `ouro(a)` de `src/motor/marca.ts`.
3. **Saída final:** `<raiz>/<marca>/<produto>/<AAAA-MM-DD>-<slug>.mp4`. A raiz é
   `MTM_RENDERS`, senão `/Volumes/Disco externo/MTM-Assets/renders` (Mac), senão
   `/mnt/project-files/renders` (nuvem). No Storage, `renders/<marca>/<produto>/<ficheiro>`.
4. **Ativos partilhados** (stock, música, capturas) ficam em `MTM_ASSETS` (Mac
   `/Volumes/Disco externo/MTM-Assets`, nuvem `/mnt/project-files/MTM-Assets`), nunca no git.
5. **Verificar antes de entregar:** `node video/motor/motor.mjs verificar <ficheiro> --formato=reel`
   tem de dar `ok: true` (formato certo, 30 fps, -14 LUFS ±1,5).
6. **Marcas de clientes B2B:** copiar `marcas/modelo-b2b.json` para `marcas/b2b-<slug>.json`.
   Os vídeos de um cliente nunca levam o logótipo, a voz ou o @ da MTM.
7. Os motores instalados fora do repo (editor do Mac, Conteúdo Magnético na VPS) levam uma cópia
   desta pasta em `./motor-video` (o `instalar.sh` / LEIA-ME de cada um já o faz).

## Perfis

| id | aliases | destaque | grade | voz |
|---|---|---|---|---|
| `morethanmoney` | mtm | ouro `#D2A63C` / `#E9C46A` sobre `#07070A` | ouro | Fish (Ricardo) |
| `ricardo-garcia` | ricardogarciapt | ciano `#0098B2` / `#1EAAE6`, faixa `#1256BE` | teal | Fish / HeyGen |
| `modelo-b2b` | — | do cliente | neutro | a do cliente |

Os ids `morethanmoney` e `ricardo-garcia` são os mesmos que já estão na base de dados
(`estudio_gravacoes.marca`, `estudio_geracoes.marca`, Conteúdo Magnético).

## Exemplos

```bash
node video/motor/motor.mjs marcas
node video/motor/motor.mjs finalizar heygen.mp4 "$(node video/motor/motor.mjs saida ricardo-garcia reels clone-01)" --formato=reel
bash video/cinematico/render.sh Solucoes ricardo-garcia --voz=narracao/voz --slug=landing-ricardo
bash video/cinematico/render.sh LandingRicardo ricardo-garcia --slug=landing   # vídeo da landing /ricardogarcia (avatar em MTM-Assets/stock/cinematico/landing-ricardo/raw.mp4)
bash video/cinematico/render.sh Solucoes modelo-b2b --cliente='{"nome":"Estúdio Ana","cores":{"destaque":"#C0392B","destaque2":"#E74C3C"}}'
```

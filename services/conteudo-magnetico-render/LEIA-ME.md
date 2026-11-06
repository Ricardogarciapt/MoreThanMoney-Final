# MTM Conteúdo Magnético — motor de render

O site (`/conteudomagnetico`) escreve o guião e desenha as peças. O **vídeo** dos reels é feito
aqui, fora da Vercel, porque precisa de ffmpeg e de minutos de CPU.

## Como funciona
1. O membro carrega em «Gerar vídeo» → linha em `conteudo_magnetico_renders` (estado `na_fila`).
2. O motor pergunta a `GET /api/conteudo-magnetico/motor` (Bearer `CRON_SECRET`), reclama o
   trabalho e recebe um URL assinado para subir o MP4 direto ao Storage (bucket `uploads`).
3. Por segmento: voz (edge-tts pt-PT, grátis; gTTS de reserva) → visual (cartão da marca desenhado
   pelo site, foto do apresentador, ou vídeo do Pexels) → zoom lento → legendas palavra a palavra
   → efeitos nos cortes → música com ducking → `loudnorm -14 LUFS`.
4. `POST /api/conteudo-magnetico/motor {id, estado}` fecha o trabalho; o ecrã mostra o vídeo.

## Instalar na VPS (recomendado)
```bash
sudo apt-get install -y ffmpeg python3-pip && pip3 install edge-tts gTTS
sudo mkdir -p /opt/mtm/conteudo-magnetico && sudo cp motor.mjs /opt/mtm/conteudo-magnetico/
sudo cp mtm-conteudo-magnetico.service /etc/systemd/system/
sudo tee /etc/mtm-conteudo-magnetico.env >/dev/null <<'ENV'
SITE_URL=https://www.morethanmoney.pt
CRON_SECRET=<o mesmo da Vercel>
MOTOR_NOME=vps
FFMPEG_THREADS=2
# PEXELS_API_KEY=<grátis em pexels.com/api>
# MUSICA_DIR=/opt/mtm/conteudo-magnetico/musica   (mp3 livres de direitos; o nome ajuda a escolher)
ENV
sudo systemctl daemon-reload && sudo systemctl enable --now mtm-conteudo-magnetico
journalctl -u mtm-conteudo-magnetico -f
```

## No Mac (alternativa)
`brew install ffmpeg && pip3 install edge-tts` e depois
`SITE_URL=… CRON_SECRET=… MOTOR_NOME=mac FFMPEG_THREADS=2 nice -n 10 node motor.mjs`.
Faz um render de cada vez e usa 2 threads: o Mac tem 16 GB e vive com o swap quase cheio — não
correr ao mesmo tempo que um Xcode, um `next build` ou outro render.

## Testar sem fila
`node motor.mjs --local guiao.json saida.mp4` (guião com `{guiao, marca, fundo_url}`).
`TTS_TESTE=1` troca a voz por silêncio, para testar sem rede.

## Fora do âmbito (de propósito)
- **Lip-sync / clone digital (Wav2Lip, SadTalker):** precisa de GPU; na VPS ou no Mac seria
  minutos por segundo de vídeo. O segmento «apresentador» usa a fotografia com zoom.
- **Whisper:** os tempos das palavras vêm da duração real de cada fala, repartida pelo tamanho de
  cada palavra. Para guiões curtos a diferença não se vê e poupa RAM.

## Ligado a outros MCPs (ArtCraft, Higgsfield, Canva, Studify…)

O gerador também está no servidor MCP do site (`/api/mcp`, Bearer `MCP_TOKEN`), com as ferramentas
`conteudo_criar_guiao`, `conteudo_listar`, `conteudo_ver`, `conteudo_editar_guiao`,
`conteudo_meter_media`, `conteudo_desenhar` e `conteudo_pedir_video`.

Fluxo: o guião traz um `prompt_visual` em inglês por lâmina e por segmento → o cliente (Claude)
gera a imagem/clip noutro MCP → `conteudo_meter_media` copia o ficheiro para o Storage e prende-o
→ `conteudo_desenhar` dá os PNGs; `conteudo_pedir_video` põe o reel na fila e este motor usa a
media do segmento (`media_url`) antes do Pexels e do cartão. Só aceita media que já esteja no
Storage da MTM ou no site. Nada é publicado pelo MCP.

Dono das peças criadas pelo MCP: `MCP_CONTEUDO_USER_ID` (opcional; sem ela, o primeiro admin activo).

# MTM Conteúdo — app local (Mac)

Painel local para o Conteúdo Magnético, no estilo do Studify: corre no Mac e junta o que o render
de vídeo precisa.

- **Motor de vídeo**: liga/desliga o motor (`../conteudo-magnetico-render/motor.mjs`) que faz os
  vídeos pedidos em «Gerar vídeo» no site. Um de cada vez, `nice 10`, 2 threads.
- **Fila do site**: vê os vídeos na fila, a montar, prontos ou falhados; tira da fila.
- **Render local**: cola um guião JSON e sai um MP4 em `~/Movies/MTM Conteudo`, sem passar pela fila.
- **Instalado?**: verifica e instala ffmpeg e as vozes grátis (edge-tts pt-PT, gTTS).
- **Ligações ao Claude**: um botão liga ao Claude Code o MCP do site (`MCP_TOKEN`) e o ArtCraft MCP
  (`~/mtm-artcraft/artcraft-mcp`, ver `/mnt/project-files/conteudo-magnetico/artcraft-mcp-mac.md`).
- **Definições**: site, `CRON_SECRET`, `MCP_TOKEN`, Pexels, voz, pasta de música, threads.
  Os segredos ficam em `~/Library/Application Support/MTM Conteudo/config.json` (600) e nunca vão
  para o browser.

## Instalar

```bash
cd services/conteudo-magnetico-app
bash instalar.sh              # cria ~/Applications/MTM Conteúdo.app
bash instalar.sh --arranque   # e arranca sozinha ao entrar no Mac
```

Duplo clique em **MTM Conteúdo** → abre http://127.0.0.1:4747. Na primeira vez: «Instalar ffmpeg»,
«Instalar vozes grátis», colar o `CRON_SECRET` (e o `MCP_TOKEN`) nas Definições, «Ligar».

## Segurança

Só ouve em `127.0.0.1`. Cada pedido à API leva um token aleatório que muda a cada arranque e só o
painel servido pela app conhece, por isso outra página aberta no browser não consegue dar ordens.

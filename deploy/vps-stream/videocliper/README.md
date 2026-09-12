# Videocliper — worker do VPS

Corta os clips que o painel aprova. Faz poll ao site; o site nunca chama esta máquina.

## O que precisa de estar instalado

```bash
sudo apt install -y ffmpeg python3-pip fonts-montserrat
sudo pip3 install -U yt-dlp
```

O `fonts-montserrat` importa: o ffmpeg procura a fonte pelo NOME que vai no ficheiro ASS
(`Montserrat Black`). Sem ela instalada no sistema, cai numa fonte qualquer e as legendas saem
com outra cara — sem erro nenhum, que é o pior modo de falhar.

## Variáveis

```
MTM_API_BASE=https://www.morethanmoney.pt
LMS_CAPTION_WORKER_SECRET=<o mesmo do worker das legendas>
GROQ_API_KEY=<para a transcrição>
POLL_SECONDS=20
```

## Serviço

```ini
[Unit]
Description=MTM Videocliper
After=network-online.target

[Service]
EnvironmentFile=/etc/mtm-videocliper.env
ExecStart=/usr/bin/node /opt/mtm/videocliper/videocliper-worker.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## A regra do disco

Nada fica aqui. Cada trabalho corre numa pasta temporária apagada no `finally`, aconteça o que
acontecer — e o clipe só é apagado depois de o site confirmar que gravou o endereço.

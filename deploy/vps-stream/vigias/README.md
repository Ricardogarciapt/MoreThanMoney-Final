# mtm-vigias (VPS)

Corre no VPS os monitores que eram crons de 1 min na Vercel (lista em `lib/vigias/tarefas.ts`).
A Vercel continua com os crons no `vercel.json`, mas cada um sai logo, sem trabalhar, enquanto o
pulso `servicos_pulso.mtm-vigias` disser que o VPS correu essa tarefa há menos de 2 min. Se o VPS
parar, a Vercel volta a fazer o trabalho sozinha. Nunca correm os dois ao mesmo tempo.

Não abre portas. Só fala com a Supabase, a MetaApi e o Telegram, como os crons.

## Instalar

```bash
# no Mac, na pasta do repo
git pull origin main && npm install
node_modules/.bin/esbuild services/vigias/worker.ts --bundle --platform=node --target=node18 --outfile=/tmp/vigias.js
scp /tmp/vigias.js deploy/vps-stream/vigias/mtm-vigias.service ubuntu@13.62.134.34:/tmp/

ssh ubuntu@13.62.134.34
  sudo mkdir -p /opt/mtm/vigias && sudo cp /tmp/vigias.js /opt/mtm/vigias/vigias.js
  sudo cp /tmp/mtm-vigias.service /etc/systemd/system/
  # Env: as mesmas chaves que a Vercel usa nestas funções (copiar do /etc/mtm-funded-motor.env + Vercel)
  sudo nano /etc/mtm-vigias.env
  sudo systemctl daemon-reload && sudo systemctl enable --now mtm-vigias
  journalctl -u mtm-vigias -f
```

`/etc/mtm-vigias.env`: estas funções lêem ~80 variáveis (MetaApi, bots Telegram, IA, Supabase…).
O mais seguro é trazer as de Produção da Vercel tal como estão e juntar as duas do worker:

```bash
# no Mac
vercel env pull --environment=production /tmp/vigias.env
echo 'VIGIAS_TAREFAS=signal-tracker' >> /tmp/vigias.env   # ligar aos poucos; «todas» = lista completa
echo 'VIGIAS_INTERVALO_MS=10000' >> /tmp/vigias.env
scp /tmp/vigias.env ubuntu@13.62.134.34:/tmp/ && rm /tmp/vigias.env
# no VPS
sudo install -m 600 /tmp/vigias.env /etc/mtm-vigias.env && rm /tmp/vigias.env
```

Ver o estado: `select em, estado from servicos_pulso where servico = 'mtm-vigias';`

## Voltar atrás

`sudo systemctl stop mtm-vigias`: a Vercel assume no minuto seguinte. Para a Vercel ignorar o VPS
mesmo com ele ligado, mete `VIGIAS_VERCEL_FORCAR=1` nas env da Vercel.

## Depois de 48 h estável

Tirar do `vercel.json` os crons das tarefas que estão no VPS. Até lá ficam como rede de segurança
(cada um custa só uma invocação curta por minuto).

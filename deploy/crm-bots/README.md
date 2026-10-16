# Consumidor VPS (opcional)

O agendamento Vercel já consta de `vercel.json`. Não é necessário instalar outro bot/CRM/n8n.
Este consumidor dá uma alternativa de agendamento na VPS; **não transporta mensagens nem substitui
os webhooks existentes**. Pode coexistir com Vercel (os leases evitam processar o mesmo item), mas
é preferível escolher um scheduler para não fazer pedidos inúteis. Cada chamada processa um item.

## Instalação automática — comandos simples

Na VPS, abre um checkout revisto deste PR (não uses `curl | bash`). Se ainda não tens o repositório:

```sh
git clone --branch vercel-agent/crm-omnicanal-bridge --single-branch https://github.com/Ricardogarciapt/MoreThanMoney-Final.git mtm-crm
cd mtm-crm
# Revê o instalador antes de executar como root:
less deploy/crm-bots/install.sh
sudo bash deploy/crm-bots/install.sh
```

Requer Node.js 22 em `/usr/bin/node` e systemd activo. O instalador não instala dependências do
site nem altera Node, Docker, firewall, base de dados ou serviços existentes. Pede `CRON_SECRET`
sem eco no terminal, cria configuração root-only e preserva-a em reinstalações. Usa o mesmo segredo
já configurado na Vercel; não inventa outro. Não passa segredos em argumentos ou URLs.

**Instalar não activa o timer e não publica o site.** Prepara primeiro as migrações 203/204, os
segredos Meta, um deployment Ready e o ensaio descrito em `docs/crm-operacao.md`. Depois:

```sh
sudo bash deploy/crm-bots/install.sh --enable
sudo bash deploy/crm-bots/install.sh --status
sudo journalctl -u mtm-crm-bots.service -n 20 --no-pager
```

`--enable` pede confirmação `ACTIVAR` e faz uma primeira chamada real (pode consumir um item).
Se falhar, não activa o timer. Para parar/actualizar:

```sh
sudo bash deploy/crm-bots/install.sh --disable
# Actualiza o checkout para a revisão aprovada, revê o diff e volta a instalar.
sudo bash deploy/crm-bots/install.sh
```

A instalação local foi validada com `bash -n` e teste isolado com comandos simulados; não foi
executada na tua VPS. O instalador não aplica SQL nem verifica a veracidade da confirmação do operador.

## Instalação manual alternativa pelo operador com SSH

Pré-requisitos: migrações 203/204 aplicadas, código publicado, variáveis server-side configuradas,
Node 22 em `/usr/bin/node`, systemd e HTTPS de saída autorizado. Conferir os caminhos, sem alterar
serviços existentes. Instalar a partir de um checkout/release revisto:

```sh
sudo install -d -m 0755 /opt/mtm-crm-bots
sudo install -m 0644 deploy/crm-bots/worker.mjs /opt/mtm-crm-bots/
sudo install -m 0644 deploy/crm-bots/mtm-crm-bots.service deploy/crm-bots/mtm-crm-bots.timer /etc/systemd/system/
sudo install -m 0600 /dev/null /etc/mtm-crm-bots.env
sudoedit /etc/mtm-crm-bots.env
```

No editor protegido, definir `CRON_SECRET` com o mesmo valor configurado na Vercel (pelo menos 32
caracteres aleatórios). Opcional: `CRM_WORKER_URL=https://www.morethanmoney.pt/api/cron/crm-bots`.
Não enviar o ficheiro pelo chat, não o colocar no Git e não passar o segredo em argumentos CLI.

```sh
sudo systemctl daemon-reload
sudo systemctl start mtm-crm-bots.service
sudo journalctl -u mtm-crm-bots.service -n 20 --no-pager
# Só depois de confirmar o ensaio:
sudo systemctl enable --now mtm-crm-bots.timer
systemctl list-timers mtm-crm-bots.timer
```

`vazio` não prova que o fluxo esteja activo: também ocorre com o interruptor desligado.
Teste real: enviar uma mensagem da conta de teste ao bot → observar a fila → negócio e score →
responsável no backoffice → marcar na agenda → confirmar etapa `marcado` sem perda de notas.
Sem este teste, o sistema não deve ser declarado operacional.

Rollback: `sudo systemctl disable --now mtm-crm-bots.timer`; desligar `crm_bots_ligado` na base.
Não reiniciar WhatsApp, relays de trading ou outros containers para instalar este consumidor.
Não existe dependência de uma imagem WACRM desconhecida nem exposição das portas 3001/5678.

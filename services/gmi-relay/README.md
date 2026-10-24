# Relay MTProto multi-fonte → MTM (sessão @RicardoSubtilGarcia)

Lê canais Telegram pela **sessão de utilizador do Ricardo** (Telethon/MTProto — os bots
foram removidos/não são admins nas fontes) e **re-publica** nos destinos MTM pelo bot
MoreThanMoney via relay-post. Multi-fonte desde 2026-09-09: hoje só GOLD DID
(e o que mais se puser em `RELAY_ROUTES`).

## Porque no VPS (e não na Vercel)
O Telethon precisa de uma ligação MTProto persistente + estado de sessão → não corre em
serverless. Roda como serviço no VPS (AWS EC2 do streaming).

## Sessão (leitor)
A leitura faz-se com a `GMI_SESSION_STRING` — sessão do UTILIZADOR. Gerar/renovar:
```bash
/opt/gmi-relay/.venv/bin/python make_session.py   # interativo: telefone + código + 2FA
```
A conta tem de ESTAR nos canais-fonte. A string é a sessão da conta — só no .env do VPS.

## Rotas — no backoffice (desde 23/10/2026)
As rotas editam-se em **Gestão → Telegram → Forwarder** (tabela `telegram_rotas`). O relay pede-as a
`/api/telegram/relay-rotas` de 2 em 2 min (`RELAY_ROTAS_SEC`) com o `RELAY_SECRET`. Se o site falhar,
fica com as que tinha; no arranque sem site usa o `RELAY_ROUTES` abaixo. `RELAY_ROTAS_SITE=0` desliga.
Rota nova criada no painel começa na última mensagem da fonte (não republica histórico).

## Rotas de recurso (`RELAY_ROUTES` no .env — JSON numa linha)
```json
[{"name":"signal-master-elite","source":-1003671953091,"dest":"-1002424441843","filter":"gold"}]
```
- `source`: id numérico OU título/username (resolvido dos diálogos da sessão no arranque).
- `dest`: chat MTM onde o bot publica; o relay-post deriva daí o canal da app/motor.
- `filter`: `gold` (setups/TP/SL/pips), `all` ou `astro`; `header` opcional; `enabled:false` desliga.
- Sem `RELAY_ROUTES`, o modo legado `GMI_SOURCE_ID`/`GMI_DEST_CHAT` continua a funcionar.

## O que é publicado
Só conteúdo de trading (filtro `gold`): `GOLD BUY/SELL SETUP|NOW|ZONE`, `HIT TP/SL`,
`running +PIPS`, `performance`, `NEW SIGNAL`. Remove branding da fonte (links/@handles).
Dedup por state por-rota + dedup atómico no servidor. `GMI_DRY_RUN=1` só imprime.

## Deploy / atualização (VPS)
```bash
# copiar relay.py + make_session.py + requirements.txt para /opt/gmi-relay
/opt/gmi-relay/.venv/bin/pip install -r /opt/gmi-relay/requirements.txt
nano /opt/gmi-relay/.env                # RELAY_ROUTES + GMI_SESSION_STRING (nova se preciso)
GMI_DRY_RUN=1 /opt/gmi-relay/.venv/bin/python /opt/gmi-relay/relay.py   # testar
sudo systemctl restart gmi-relay
journalctl -u gmi-relay -f              # ver logs
```

Ir live: pôr `GMI_DRY_RUN=0` no `.env` e `sudo systemctl restart gmi-relay`.

## Grupos e canais novos (desde 23/10)

Gestão → Telegram → Grupos e bots novos grava pedidos em `telegram_grupos_novos`. A cada leitura
das rotas, o relay pede os pendentes a `/api/telegram/relay-pedidos?max=N` (mesmo segredo), cria-os
com a sessão pessoal (`CreateChannelRequest`), põe o bot escolhido como administrador, exporta o
link de convite e devolve o resultado por POST ao mesmo endpoint.

- `RELAY_GRUPOS_MAX_DIA` (omissão 3): limite contado no state do relay, além do limite do site.
- `RELAY_GRUPOS_SITE=0` desliga. Com `GMI_DRY_RUN=1` nunca cria nada.
- Um pedido reservado que falhe a meio fica `a_criar` e não volta a sair: nunca se cria duas vezes.

# Relay MTProto multi-fonte → MTM (sessão @RicardoSubtilGarcia)

Lê canais Telegram pela **sessão de utilizador do Ricardo** (Telethon/MTProto — os bots
foram removidos/não são admins nas fontes) e **re-publica** nos destinos MTM pelo bot
MoreThanMoney via relay-post. Multi-fonte desde 2026-09-09: GOLD DID, GOLDEN ASTRO
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

## Rotas (`RELAY_ROUTES` no .env — JSON numa linha)
```json
[{"name":"gold-did","source":-1003452689502,"dest":"-1002424441843","filter":"gold"},
 {"name":"golden-astro","source":-1004428793414,"dest":"-1002424441843","filter":"gold","enabled":false}]
```
- `source`: id numérico OU título/username (resolvido dos diálogos da sessão no arranque).
- `dest`: chat MTM onde o bot publica; o relay-post deriva daí o canal da app/motor.
- `filter`: `gold` (setups/TP/SL/pips) ou `all`; `header` opcional; `enabled:false` desliga.
- Sem `RELAY_ROUTES`, o modo legado `GMI_SOURCE_ID`/`GMI_DEST_CHAT` continua a funcionar.
- O state antigo migra sozinho para a rota `gold-did` (não repete histórico).

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

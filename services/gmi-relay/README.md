# GMI → MTM Premium relay

Lê o canal **Global Market intelligence** (London + New York) pela **sessão do Ricardo**
(Telethon/MTProto — o bot não é admin lá) e **re-publica** os setups/TP/SL na **MTM Premium**
pelo **bot MoreThanMoney**. Sem forwarder externo.

## Porque no VPS (e não na Vercel)
O Telethon precisa de uma ligação MTProto persistente + estado de sessão → não corre em
serverless. Roda como serviço no VPS (AWS EC2 do streaming).

## O que é publicado
Só conteúdo de trading (filtro): `GOLD BUY/SELL SETUP|NOW|ZONE`, `HIT TP/SL`, `running +PIPS`,
`London/New York performance`, `NEW SIGNAL`. Remove o branding da fonte (Master Trades, VIP,
"money management", links/@handles). Dedup por `gmi_relay_state.json`. `GMI_DRY_RUN=1` só imprime.

## Deploy (VPS)
```bash
sudo mkdir -p /opt/gmi-relay && sudo chown ubuntu:ubuntu /opt/gmi-relay
# copiar relay.py + requirements.txt para /opt/gmi-relay
python3 -m venv /opt/gmi-relay/.venv
/opt/gmi-relay/.venv/bin/pip install -r /opt/gmi-relay/requirements.txt
cp .env.example /opt/gmi-relay/.env    # preencher secrets; testar com GMI_DRY_RUN=1
sudo cp gmi-relay.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now gmi-relay
journalctl -u gmi-relay -f              # ver logs
```

Ir live: pôr `GMI_DRY_RUN=0` no `.env` e `sudo systemctl restart gmi-relay`.

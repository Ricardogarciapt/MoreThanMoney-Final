#!/usr/bin/env python3
"""
Gera a GMI_SESSION_STRING — a sessão MTProto do UTILIZADOR (@RicardoSubtilGarcia)
que o relay usa para LER os canais (GOLD DID, GOLDEN ASTRO, GOLDEN MOVES…).

Correr UMA vez, interativamente (no VPS ou no teu computador):

    /opt/gmi-relay/.venv/bin/python make_session.py

Pede: api_id/api_hash (my.telegram.org → API development tools), o teu número de
telefone, o código que o Telegram te envia na app, e a password 2FA se tiveres.
No fim imprime a string — cola-a em GMI_SESSION_STRING no /opt/gmi-relay/.env.

⚠️ A string É a tua sessão: quem a tiver lê o Telegram como tu. Guarda-a só no .env
do VPS. Para revogar: Telegram → Definições → Dispositivos → terminar essa sessão.
"""
import os
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

api_id = int(os.environ.get("TELEGRAM_API_ID") or input("api_id: "))
api_hash = os.environ.get("TELEGRAM_API_HASH") or input("api_hash: ")

with TelegramClient(StringSession(), api_id, api_hash) as client:
    print("\nGMI_SESSION_STRING=" + client.session.save())
    me = client.get_me()
    print(f"\nSessão criada para: {me.first_name} (@{me.username})")
    print("Canais visíveis com 'gold' no nome:")
    for d in client.iter_dialogs():
        if "gold" in (d.name or "").lower():
            print(f"  {d.id}  {d.name}")

#!/usr/bin/env python3
"""
James → MTM Auto FOREX Swings relay.
Lê o canal-fonte (JAMES TRADING GROUP) pela SESSÃO do Ricardo (Telethon, MTProto) e RE-PUBLICA
os sinais no grupo "MTM Auto FOREX Swings" com branding MTM (a fonte fica OCULTA), pelo bot
MoreThanMoney via o endpoint do site (token válido na Vercel). Dedup por state file.

Formato-fonte:
  Moeda: EURUSD
  Ação:  🔵 Buy 🔵   (ou 🔴 Sell 🔴)
  Stoploss: 1.14910
  Takeprofit: 1.15630
(mensagens "⚠️ Em 2 minutos..." são ignoradas)

ENV:
  TELEGRAM_API_ID, TELEGRAM_API_HASH, FS_SESSION_STRING   (sessão de utilizador que lê a fonte)
  FS_SOURCE_ID   default -1001374090428  (JAMES TRADING GROUP)
  FS_DEST_CHAT   default -1004362819270  (MTM Auto FOREX Swings)
  RELAY_POST_URL default https://www.morethanmoney.pt/api/telegram/relay-post
  RELAY_SECRET   (= CRON_SECRET do site)
  FS_EXEC_URL    (opcional) endpoint de execução — se definido, POST do sinal parseado p/ execução
  FS_DRY_RUN     "1" imprime, "0" publica
  FS_STATE_FILE  default ./fs_relay_state.json
  FS_POLL_SEC    default 45
  FS_LOOKBACK_H  default 3
"""
import os, re, json, time, asyncio, datetime, urllib.request
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION = os.environ["FS_SESSION_STRING"]
SOURCE_ID = int(os.environ.get("FS_SOURCE_ID", "-1001374090428"))
DEST_CHAT = os.environ.get("FS_DEST_CHAT", "-1004362819270")
RELAY_POST_URL = os.environ.get("RELAY_POST_URL", "https://www.morethanmoney.pt/api/telegram/relay-post")
RELAY_SECRET = os.environ.get("RELAY_SECRET", "")
EXEC_URL = os.environ.get("FS_EXEC_URL", "").strip()
DRY_RUN = os.environ.get("FS_DRY_RUN", "1") == "1"
STATE_FILE = os.environ.get("FS_STATE_FILE", "fs_relay_state.json")
POLL_SEC = int(os.environ.get("FS_POLL_SEC", "45"))
LOOKBACK_H = int(os.environ.get("FS_LOOKBACK_H", "3"))

HEADER = "🌊 MTM Auto FOREX Swings"

RX_SYMBOL = re.compile(r"moeda\s*:\s*([A-Za-z]{6,8})", re.I)
RX_SIDE = re.compile(r"a[cç][aã]o\s*:.*?(buy|sell|compra|venda)", re.I | re.S)
RX_SL = re.compile(r"stop\s*loss\s*:?\s*([0-9]+\.?[0-9]*)", re.I)
RX_TP = re.compile(r"take\s*profit\s*:?\s*([0-9]+\.?[0-9]*)", re.I)


def parse_signal(text: str):
    """Devolve dict {symbol, side, sl, tp} ou None se não for um sinal completo."""
    low = text.lower()
    if "em 2 minutos" in low or "vou enviar" in low:
        return None  # pré-anúncio
    ms = RX_SYMBOL.search(text)
    mside = RX_SIDE.search(text.replace("Stoploss", "  ").replace("Takeprofit", "  "))
    if not mside:
        mside = RX_SIDE.search(text)
    msl = RX_SL.search(text.replace(" ", ""))
    mtp = RX_TP.search(text.replace(" ", ""))
    if not (ms and mside and msl and mtp):
        return None
    side_raw = mside.group(1).lower()
    side = "BUY" if side_raw in ("buy", "compra") else "SELL"
    return {
        "symbol": ms.group(1).upper(),
        "side": side,
        "sl": float(msl.group(1)),
        "tp": float(mtp.group(1)),
    }


def brand(sig: dict) -> str:
    arrow = "🔵" if sig["side"] == "BUY" else "🔴"
    return (
        f"{HEADER}\n\n"
        f"{arrow} {sig['symbol']} {sig['side']}\n"
        f"🎯 Take Profit: {sig['tp']}\n"
        f"🛡️ Stop Loss: {sig['sl']}\n\n"
        f"⚙️ Set & forget — gestão com trailing automático.\n"
        f"⚠️ Sem promessas de lucro. Usa gestão de risco adequada."
    )


def post_site(chat_id: str, text: str) -> bool:
    if DRY_RUN:
        print("──── PUBLICARIA ────\n" + text + "\n"); return True
    data = json.dumps({"chat_id": chat_id, "text": text}).encode()
    req = urllib.request.Request(
        RELAY_POST_URL, data=data,
        headers={"Content-Type": "application/json", "authorization": f"Bearer {RELAY_SECRET}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return bool(json.load(r).get("ok"))
    except Exception as e:
        print("erro relay-post:", e); return False


def maybe_exec(sig: dict):
    """Se FS_EXEC_URL definido, envia o sinal parseado p/ execução na conta MTM Auto Forex."""
    if not EXEC_URL or DRY_RUN:
        return
    body = {**sig, "comment": "Forex Swings", "trailing": True}
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        EXEC_URL, data=data,
        headers={"Content-Type": "application/json", "authorization": f"Bearer {RELAY_SECRET}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            print("exec:", json.load(r))
    except Exception as e:
        print("erro exec:", e)


def load_state():
    try:
        return json.load(open(STATE_FILE))
    except Exception:
        return {"last_id": 0}


def save_state(s):
    json.dump(s, open(STATE_FILE, "w"))


async def run_once(client, state):
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=LOOKBACK_H)
    batch = []
    async for m in client.iter_messages(SOURCE_ID, limit=60):
        if m.id <= state["last_id"]:
            break
        if m.date < cutoff and state["last_id"] == 0:
            break
        if m.message:
            batch.append(m)
    batch.reverse()
    sent = 0
    for m in batch:
        if m.id > state["last_id"]:
            state["last_id"] = m.id
        sig = parse_signal(m.message)
        if sig:
            if post_site(DEST_CHAT, brand(sig)):
                sent += 1
                maybe_exec(sig)
                await asyncio.sleep(1)
    save_state(state)
    return len(batch), sent


async def main():
    state = load_state()
    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        print("sessão não autorizada"); return
    print(f"[fs-relay] {'DRY-RUN' if DRY_RUN else 'LIVE'} | fonte {SOURCE_ID} → swings {DEST_CHAT} | exec={'ON' if EXEC_URL else 'OFF'}")
    while True:
        scanned, sent = await run_once(client, state)
        print(f"[fs-relay] passagem: {scanned} novas, {sent} publicadas (last_id={state['last_id']})")
        if POLL_SEC <= 0:
            break
        await asyncio.sleep(POLL_SEC)
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())

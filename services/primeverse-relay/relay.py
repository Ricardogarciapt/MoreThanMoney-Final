#!/usr/bin/env python3
"""
PrimeVerse (PѴ TRADE INSIGHTS) → MTM Sensei relay.
Lê o canal pela sessão do Ricardo (Telethon), filtra as ENTRADAS do TOP trader (kingfkg) em
XAUUSD + BTCUSD e faz POST do sinal parseado para o endpoint do site, que executa no MTM Auto
Sensei (+ perps Bybit p/ BTC). Não republica nada em Telegram — é só execução. Dedup por state.

Formato-fonte (1 mensagem):
  🔔 NEW SIGNAL ALERT by kingfkg
  📊 Pair: XAUUSD
  🔴 Type: SELL            (ou 🟢 BUY, às vezes "BUY (Buy Limit)")
  💰 Entry: 4075.00
  🎯 Take Profits: TP1..TP5
  🛡️ Stop Loss: 4083.00

ENV: TELEGRAM_API_ID/HASH, PV_SESSION_STRING, PV_SOURCE_ID(=-1003615007236),
     PV_EXEC_URL, RELAY_SECRET, PV_TRADER(=kingfkg), PV_SYMBOLS(=XAUUSD,BTCUSD),
     PV_DRY_RUN, PV_STATE_FILE, PV_POLL_SEC, PV_LOOKBACK_H
"""
import os, re, json, asyncio, datetime, urllib.request
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ["TELEGRAM_API_ID"]); API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION = os.environ["PV_SESSION_STRING"]
SOURCE_ID = int(os.environ.get("PV_SOURCE_ID", "-1003615007236"))
EXEC_URL = os.environ.get("PV_EXEC_URL", "https://www.morethanmoney.pt/api/telegram/primeverse-exec")
RELAY_SECRET = os.environ.get("RELAY_SECRET", "")
TRADER = os.environ.get("PV_TRADER", "kingfkg").lower()
SYMBOLS = set(s.strip().upper() for s in os.environ.get("PV_SYMBOLS", "XAUUSD,BTCUSD").split(","))
DRY_RUN = os.environ.get("PV_DRY_RUN", "1") == "1"
STATE_FILE = os.environ.get("PV_STATE_FILE", "pv_relay_state.json")
POLL_SEC = int(os.environ.get("PV_POLL_SEC", "30"))
LOOKBACK_H = int(os.environ.get("PV_LOOKBACK_H", "2"))

ZW = dict.fromkeys(list(range(0x200b, 0x2010)) + [0xfeff, 0x2060])
def clean(t): return (t or "").translate(ZW)

RX_TRADER = re.compile(r"NEW SIGNAL ALERT\s+by\s+([A-Za-z0-9_\-\.]+)", re.I)
RX_PAIR = re.compile(r"Pair:\s*([A-Za-z0-9/]+)", re.I)
RX_TYPE = re.compile(r"Type:\s*(BUY|SELL)", re.I)
RX_LIMIT = re.compile(r"\b(buy|sell)\s*limit\b", re.I)
RX_ENTRY = re.compile(r"Entry:\s*([0-9]+\.?[0-9]*)", re.I)
RX_SL = re.compile(r"Stop\s*Loss:\s*([0-9]+\.?[0-9]*)", re.I)
RX_TP = re.compile(r"TP\d\s*:\s*([0-9]+\.?[0-9]*)", re.I)

def norm_symbol(s):
    s = s.upper().strip()
    if "XAU" in s or "GOLD" in s: return "XAUUSD"
    if "BTC" in s: return "BTCUSD"
    if "ETH" in s: return "ETHUSD"
    return s.replace("/", "").replace(" ", "")

def parse_entry(text):
    t = clean(text)
    mtr = RX_TRADER.search(t)
    mp = RX_PAIR.search(t); mt = RX_TYPE.search(t); me = RX_ENTRY.search(t); ms = RX_SL.search(t)
    if not (mtr and mp and mt and me):
        return None
    tps = [float(x) for x in RX_TP.findall(t)]
    return {
        "trader": mtr.group(1).lower(),
        "symbol": norm_symbol(mp.group(1)),
        "direction": "sell" if mt.group(1).upper() == "SELL" else "buy",
        "orderType": "limit" if RX_LIMIT.search(t) else "market",
        "entry": float(me.group(1)),
        "sl": float(ms.group(1)) if ms else None,
        "tps": tps,
    }

def post_exec(sig):
    if DRY_RUN:
        print("──── EXECUTARIA ────\n" + json.dumps(sig) + "\n"); return True
    data = json.dumps(sig).encode()
    req = urllib.request.Request(EXEC_URL, data=data,
        headers={"Content-Type": "application/json", "authorization": f"Bearer {RELAY_SECRET}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.load(r); print("exec:", json.dumps(j)[:200]); return bool(j.get("ok"))
    except Exception as e:
        print("erro exec:", e); return False

def load_state():
    try: return json.load(open(STATE_FILE))
    except Exception: return {"last_id": 0}
def save_state(s): json.dump(s, open(STATE_FILE, "w"))

async def run_once(client, state):
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=LOOKBACK_H)
    batch = []
    async for m in client.iter_messages(SOURCE_ID, limit=80):
        if m.id <= state["last_id"]: break
        if m.date < cutoff and state["last_id"] == 0: break
        if m.message: batch.append(m)
    batch.reverse()
    sent = 0
    for m in batch:
        if m.id > state["last_id"]: state["last_id"] = m.id
        sig = parse_entry(m.message)
        if not sig: continue
        if sig["trader"] != TRADER: continue
        # PV_SYMBOLS="ALL" (ou vazio) → envia todas as classes (o endpoint roteia p/ o chat certo
        # e executa só XAU/BTC). Senão, filtra pela lista.
        if SYMBOLS and "ALL" not in SYMBOLS and sig["symbol"] not in SYMBOLS: continue
        if post_exec(sig): sent += 1
        await asyncio.sleep(1)
    save_state(state)
    return len(batch), sent

async def main():
    state = load_state()
    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        print("sessão não autorizada"); return
    print(f"[pv-relay] {'DRY-RUN' if DRY_RUN else 'LIVE'} | fonte {SOURCE_ID} | trader={TRADER} símbolos={sorted(SYMBOLS)}")
    while True:
        scanned, sent = await run_once(client, state)
        print(f"[pv-relay] passagem: {scanned} novas, {sent} executadas (last_id={state['last_id']})")
        if POLL_SEC <= 0: break
        await asyncio.sleep(POLL_SEC)
    await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())

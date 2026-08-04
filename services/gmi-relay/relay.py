#!/usr/bin/env python3
"""
GMI → MTM Premium relay.
Lê o canal "Global Market intelligence" (London + New York) pela SESSÃO do Ricardo (Telethon,
MTProto — o bot não é admin lá) e RE-PUBLICA os setups/TP/SL na Premium pelo bot MoreThanMoney
(sem precisar de outro forwarder). Dedup por state file. DRY_RUN=1 → só imprime o que publicaria.

ENV:
  TELEGRAM_API_ID, TELEGRAM_API_HASH, GMI_SESSION_STRING   (sessão de utilizador que lê a GMI)
  MTM_BOT_TOKEN                                            (bot MoreThanMoney, admin da Premium)
  GMI_SOURCE_ID   default -1003812659078  (Global Market intelligence)
  GMI_DEST_CHAT   default -1002424441843  (MTM Premium)
  GMI_DRY_RUN     "1" imprime, "0" publica
  GMI_STATE_FILE  default ./gmi_relay_state.json
  GMI_POLL_SEC    default 45  (loop; 0 = uma passagem só)
  GMI_LOOKBACK_H  default 3   (1ª passagem: quantas horas para trás considerar)
"""
import os, re, json, time, html, asyncio, datetime, urllib.request, urllib.parse
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION = os.environ["GMI_SESSION_STRING"]
BOT_TOKEN = os.environ.get("MTM_BOT_TOKEN", "")
SOURCE_ID = int(os.environ.get("GMI_SOURCE_ID", "-1003812659078"))
DEST_CHAT = os.environ.get("GMI_DEST_CHAT", "-1002424441843")
DRY_RUN = os.environ.get("GMI_DRY_RUN", "1") == "1"
STATE_FILE = os.environ.get("GMI_STATE_FILE", "gmi_relay_state.json")
POLL_SEC = int(os.environ.get("GMI_POLL_SEC", "45"))
LOOKBACK_H = int(os.environ.get("GMI_LOOKBACK_H", "3"))

# ── Filtro: só conteúdo de trading relevante ─────────────────────────────────
KEEP = [
    re.compile(r"gold\s+(buy|sell)\s+(setup|now|zone)", re.I),
    re.compile(r"gold\s+(buy|sell)\s+zone", re.I),
    re.compile(r"\b(sell|buy)\s+zone\b", re.I),
    re.compile(r"hit\s+(tp\d|sl)\b", re.I),
    re.compile(r"tp\d\s+hit", re.I),
    re.compile(r"running\s+[+-]?\d+\s*pips", re.I),
    re.compile(r"(london|new\s*york)\s+(performance|session)", re.I),
    re.compile(r"new\s+signal", re.I),
    re.compile(r"move\s+sl|breakeven|trail\s+sl", re.I),
]
# Linhas/frases da FONTE a REMOVER (só branding/promo deles). O conselho de risk management
# ("use suitable lot sizes / money management is key") FICA — é útil e alinhado com o guia.
STRIP_LINES = re.compile(
    r"(master\s+trades|master\s+circle|master\s+circle|\bvip\b|by\s+cr|join\s+|subscribe|"
    r"t\.me/|@\w+|another big day|see you tomorrow|great session)",
    re.I,
)
# Cabeçalho de marca MTM (comportamento como o canal Premium existente).
MTM_HEADER = "🏦 MTM Premium"

def sanitize(text: str) -> str:
    lines = []
    for ln in text.splitlines():
        if STRIP_LINES.search(ln):
            continue
        lines.append(ln.rstrip())
    out = "\n".join([l for l in lines if l.strip()])
    return out.strip()

def brand(text: str) -> str:
    """Aplica o branding MTM: cabeçalho no topo (evita duplicar se já lá estiver)."""
    if text.lower().startswith(MTM_HEADER.lower()):
        return text
    return f"{MTM_HEADER}\n\n{text}"

def should_forward(text: str) -> bool:
    if not text or len(text.strip()) < 4:
        return False
    low = text.lower()
    if low.strip() in ("standby", "good morning traders", "new position", "position closed 🔒", "position closed"):
        return False
    return any(rx.search(text) for rx in KEEP)

def load_state():
    try:
        return json.load(open(STATE_FILE))
    except Exception:
        return {"last_id": 0}

def save_state(s):
    json.dump(s, open(STATE_FILE, "w"))

def bot_send(text: str):
    if DRY_RUN:
        print("──── PUBLICARIA NA PREMIUM ────\n" + text + "\n")
        return True
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({
        "chat_id": DEST_CHAT, "text": text, "disable_web_page_preview": "true",
    }).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=20) as r:
            j = json.load(r)
            return bool(j.get("ok"))
    except Exception as e:
        print("erro sendMessage:", e); return False

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
    batch.reverse()  # cronológico
    sent = 0
    for m in batch:
        if m.id > state["last_id"]:
            state["last_id"] = m.id
        clean = sanitize(m.message)
        if should_forward(m.message) and clean:
            if bot_send(brand(clean)):
                sent += 1
                await asyncio.sleep(1)  # respeitar rate limit
    save_state(state)
    return len(batch), sent

async def main():
    state = load_state()
    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        print("sessão não autorizada"); return
    print(f"[gmi-relay] {'DRY-RUN' if DRY_RUN else 'LIVE'} | fonte {SOURCE_ID} → premium {DEST_CHAT}")
    while True:
        scanned, sent = await run_once(client, state)
        print(f"[gmi-relay] passagem: {scanned} novas, {sent} publicadas (last_id={state['last_id']})")
        if POLL_SEC <= 0:
            break
        await asyncio.sleep(POLL_SEC)
    await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())

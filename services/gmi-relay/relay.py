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

2026-08-10 — robustez das RESPOSTAS + execução:
  - NUNCA larga uma mensagem: o last_id só avança até à última msg REALMENTE tratada
    (filtrada ou publicada com sucesso). Se um envio falha, para aí e retenta no ciclo seguinte
    (preserva a ordem SETUP→HIT). Guarda-fim: msg venenosa desiste após 5 falhas.
  - Passa reply_to_text (texto do SINAL-PAI) + source_chat_id/source_message_id/reply_to_source_id
    ao endpoint → o executor casa a gestão ao sinal certo E o servidor faz dedup atómico por id
    da fonte (idempotente em retries, mesmo após restart/perda do state).
"""
import os, re, json, time, html, asyncio, datetime, urllib.request, urllib.parse
import hashlib
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
    # TP/SL hits — cobre formato Londres ("HIT TP2 +pips") E Nova Iorque ("TP 1 HIT", "TP1 ✅✅").
    re.compile(r"hit\s+(all\s+)?(tp\s*\d|sl)\b", re.I),
    re.compile(r"tp\s*\d\s*hit", re.I),
    re.compile(r"tp\s*\d[^\n]{0,4}✅", re.I),   # TP1 ✅ / TP4 ✅✅ (hit por checkmark)
    re.compile(r"\bsl\s*hit\b", re.I),
    re.compile(r"running\s+[+-]?\d+\s*pips", re.I),
    re.compile(r"[+-]?\d+\s*pips\b", re.I),          # qualquer resultado em pips
    re.compile(r"(london|new\s*york)\s+(performance|session)", re.I),
    re.compile(r"new\s+signal", re.I),
    re.compile(r"move\s+sl|breakeven|set\s+be\b|trail\s+sl", re.I),
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
    for ln in (text or "").splitlines():
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

RELAY_POST_URL = os.environ.get("RELAY_POST_URL", "https://www.morethanmoney.pt/api/telegram/relay-post")
RELAY_SECRET = os.environ.get("RELAY_SECRET", "")

def bot_send(text: str, reply_to=None, source_msg_id=None, reply_to_source_id=None, reply_to_text=None):
    """Publica via o ENDPOINT do site (token válido na Vercel).
    Devolve:
      int>0  → message_id publicado na Premium (para encadear updates como resposta)
      -1     → DRY_RUN (não publicou)
      -2     → o servidor devolveu skipped:'dup' (já relayado antes; sucesso, sem novo id)
      None   → FALHA (rede/erro) → o chamador NÃO deve avançar o last_id (retenta)."""
    if DRY_RUN:
        print(("──── PUBLICARIA" + (f" (reply→{reply_to})" if reply_to else "") + " ────\n") + text + "\n")
        return -1
    payload = {"chat_id": DEST_CHAT, "text": text}
    if reply_to:
        payload["reply_to_message_id"] = reply_to
    if source_msg_id is not None:
        payload["source_chat_id"] = str(SOURCE_ID)
        payload["source_message_id"] = int(source_msg_id)
    if reply_to_source_id:
        payload["reply_to_source_id"] = int(reply_to_source_id)
    if reply_to_text:
        payload["reply_to_text"] = reply_to_text
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        RELAY_POST_URL, data=data,
        headers={"Content-Type": "application/json", "authorization": f"Bearer {RELAY_SECRET}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            j = json.load(r)
            if not j.get("ok"):
                print("relay-post ok=false:", j.get("error")); return None
            if j.get("skipped") == "dup":
                return -2
            return j.get("messageId") or -1
    except Exception as e:
        print("erro relay-post:", e); return None

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
    state.setdefault("map", {})              # source_msg_id -> premium_msg_id (encadeamento)
    fails = state.setdefault("fails", {})    # source_msg_id -> nº de falhas de envio consecutivas
    text_by_id = {m.id: m.message for m in batch}
    sent = 0
    new_last = state["last_id"]              # só avança até à última msg REALMENTE tratada
    for m in batch:
        clean = sanitize(m.message or "")
        forwardable = should_forward(m.message or "") and bool(clean)
        if not forwardable:
            new_last = max(new_last, m.id)   # nada a publicar → seguro avançar
            continue
        # dedup de conteúdo (mesmo texto publicado há pouco)
        _h = hashlib.md5(re.sub(r"\s+", " ", clean.strip().lower()).encode()).hexdigest()
        _recent = state.setdefault("recent", [])
        if _h in _recent:
            new_last = max(new_last, m.id)
            continue
        # contexto do SINAL-PAI: encadear no destino (reply_to) + casar a execução (reply_to_text)
        reply_to = None
        reply_to_text = None
        src_reply = getattr(getattr(m, "reply_to", None), "reply_to_msg_id", None)
        if src_reply:
            if str(src_reply) in state["map"]:
                reply_to = state["map"][str(src_reply)]
            ptext = text_by_id.get(src_reply)
            if ptext is None:
                try:
                    pm = await client.get_messages(SOURCE_ID, ids=src_reply)
                    ptext = pm.message if pm else None
                except Exception:
                    ptext = None
            reply_to_text = sanitize(ptext) if ptext else None
        pid = bot_send(brand(clean), reply_to, source_msg_id=m.id,
                       reply_to_source_id=src_reply, reply_to_text=reply_to_text)
        if pid is None:
            # ENVIO FALHOU → NÃO avançar além desta msg; retenta no próximo ciclo (preserva ordem).
            n = fails.get(str(m.id), 0) + 1
            fails[str(m.id)] = n
            if n >= 5:
                print(f"[gmi-relay] DESISTO da msg {m.id} após {n} falhas — avanço para não bloquear.")
                fails.pop(str(m.id), None)
                new_last = max(new_last, m.id)
                continue
            print(f"[gmi-relay] envio falhou msg {m.id} (tentativa {n}) — paro aqui, retento a seguir.")
            break
        # sucesso (ou dup no servidor)
        fails.pop(str(m.id), None)
        _recent.append(_h); state["recent"] = _recent[-80:]
        if isinstance(pid, int) and pid > 0:
            state["map"][str(m.id)] = pid
            if len(state["map"]) > 800:  # limita o crescimento do state
                for k in list(state["map"])[:-500]:
                    del state["map"][k]
        new_last = max(new_last, m.id)
        sent += 1
        await asyncio.sleep(1)  # respeitar rate limit
    state["last_id"] = new_last
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

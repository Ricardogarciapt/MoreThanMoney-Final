#!/usr/bin/env python3
"""
Relay MTProto multi-fonte → MTM (via sessão de UTILIZADOR do Ricardo).

Lê canais Telegram onde o @RicardoSubtilGarcia está (o bot não precisa de lá estar —
2026-09-09: o bot foi removido do GOLD DID, e a leitura passa TODA pela sessão) e
RE-PUBLICA no destino MTM através do endpoint relay-post (bot MoreThanMoney).
Dedup por state file por-rota + dedup atómico no servidor. DRY_RUN=1 → só imprime.

ENV:
  TELEGRAM_API_ID, TELEGRAM_API_HASH, GMI_SESSION_STRING   (sessão de utilizador — make_session.py)
  RELAY_ROUTES  JSON de rotas; se ausente usa o modo legado GMI_* (uma rota).
      [{"name":"gold-did",     "source": -1003452689502,     "dest": "-1002424441843", "filter": "gold"},
       {"name":"golden-astro", "source": -1004428793414,     "dest": "-1002424441843", "filter": "gold", "enabled": false}]
      · source: id numérico OU título/username exato — resolvido dos diálogos da sessão no arranque.
      · dest: chat Telegram MTM onde o bot publica (o relay-post deriva daí o canal da app).
      · filter: "gold" (setups/TP/SL/pips — o filtro clássico) ou "all" (tudo o que não for lixo).
      · header: cabeçalho de marca opcional (default "🏦 MTM Premium" quando dest é a Premium).
      · enabled: false para desligar a rota sem a apagar.
      · app_only: true → NÃO publica no Telegram. Serve as fontes que só existem para executar
        na conta provedora (Golden Astro): o `dest` é o próprio id da FONTE, e o site resolve a
        estratégia por esse id. Nunca apontar uma destas ao chat Premium (-1002424441843): esse
        slug é o único que executa nas contas dos CLIENTES.
  GMI_SOURCE_ID / GMI_DEST_CHAT                            (modo legado, 1 rota)
  GMI_DRY_RUN     "1" imprime, "0" publica
  GMI_STATE_FILE  default ./gmi_relay_state.json
  GMI_POLL_SEC    default 45  (loop; 0 = uma passagem só)
  GMI_LOOKBACK_H  default 3   (1ª passagem de cada rota: horas para trás)

Robustez (herdada do relay GMI 2026-08-10, agora POR ROTA):
  - NUNCA larga uma mensagem: o last_id só avança até à última msg REALMENTE tratada.
    Envio falhado pára a rota nesse ponto e retenta no ciclo seguinte (preserva SETUP→HIT);
    msg venenosa desiste após 5 falhas.
  - Passa reply_to_text + source_chat_id/source_message_id/reply_to_source_id ao endpoint →
    threading no destino + dedup idempotente no servidor por id da fonte.
"""
import os, re, json, asyncio, datetime, hashlib, urllib.request
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION = os.environ["GMI_SESSION_STRING"]
DRY_RUN = os.environ.get("GMI_DRY_RUN", "1") == "1"
STATE_FILE = os.environ.get("GMI_STATE_FILE", "gmi_relay_state.json")
POLL_SEC = int(os.environ.get("GMI_POLL_SEC", "45"))
LOOKBACK_H = int(os.environ.get("GMI_LOOKBACK_H", "3"))
EDIT_LOOKBACK_H = int(os.environ.get("GMI_EDIT_LOOKBACK_H", "6"))
PREMIUM_DEST = "-1002424441843"

# ── Rotas ────────────────────────────────────────────────────────────────────
def load_routes():
    raw = os.environ.get("RELAY_ROUTES", "").strip()
    if raw:
        routes = json.loads(raw)
    else:
        # modo legado: uma rota a partir dos envs GMI_* (compatível com o .env atual do VPS)
        routes = [{
            "name": "legacy",
            "source": int(os.environ.get("GMI_SOURCE_ID", "-1003812659078")),
            "dest": os.environ.get("GMI_DEST_CHAT", PREMIUM_DEST),
            "filter": "gold",
        }]
    out = []
    for r in routes:
        if r.get("enabled") is False:
            continue
        r.setdefault("filter", "gold")
        r.setdefault("header", "🏦 MTM Premium" if str(r.get("dest")) == PREMIUM_DEST else None)
        out.append(r)
    return out

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
    # Setups genéricos (não-só-ouro) — usados pelo filtro "all"
    re.compile(r"\b(buy|sell)\b[^\n]{0,40}\b(tp|sl|entry|entrada)\b", re.I),
]
# Linhas/frases da FONTE a REMOVER (só branding/promo deles). O conselho de risk management
# ("use suitable lot sizes / money management is key") FICA — é útil e alinhado com o guia.
STRIP_LINES = re.compile(
    r"(master\s+trades|master\s+circle|\bvip\b|by\s+cr|join\s+|subscribe|"
    r"t\.me/|@\w+|another big day|see you tomorrow|great session)",
    re.I,
)

def sanitize(text: str) -> str:
    lines = []
    for ln in (text or "").splitlines():
        if STRIP_LINES.search(ln):
            continue
        lines.append(ln.rstrip())
    out = "\n".join([l for l in lines if l.strip()])
    return out.strip()

def impressao(texto: str) -> str:
    """Impressão ESTÁVEL do texto. O hash() do Python é aleatorizado por processo:
    guardado no state, deixava de bater certo a cada reinício e disparava uma rajada
    de edições no-op. sha1 é igual em todos os arranques."""
    return hashlib.sha1(texto.encode("utf-8")).hexdigest()

def brand(text: str, header) -> str:
    """Aplica o cabeçalho de marca da rota (evita duplicar se já lá estiver)."""
    if not header or text.lower().startswith(header.lower()):
        return text
    return f"{header}\n\n{text}"

NOISE = ("standby", "good morning traders", "new position", "position closed 🔒", "position closed")

# Formato do GOLDEN ASTRO: «XAUUSD I'm buying» + zona/stop/alvos, e follow-ups «Tp2 hit».
# O filtro "gold" não os apanha — exige «gold buy zone» ou pips, e ele não escreve nem uma
# coisa nem outra. Sem esta lista a rota lia o canal e não passava um único sinal.
ASTRO = [
    re.compile(r"i.?m\s+(buying|selling)", re.I),
    re.compile(r"entry\s*zone", re.I),
    re.compile(r"\btp\s*\d\s*hit", re.I),
    re.compile(r"\bsl\s*hit\b", re.I),
    re.compile(r"stop\s*loss\b", re.I),
    re.compile(r"\b(close|closed|be|break\s*even)\b", re.I),
]

def should_forward(text: str, mode: str) -> bool:
    if not text or len(text.strip()) < 4:
        return False
    if text.lower().strip() in NOISE:
        return False
    if mode == "all":
        return True
    if mode == "astro":
        return any(rx.search(text) for rx in ASTRO)
    return any(rx.search(text) for rx in KEEP)

# ── Estado por rota ──────────────────────────────────────────────────────────
def load_state():
    try:
        s = json.load(open(STATE_FILE))
    except Exception:
        s = {}
    # migração do state legado (flat) → por-rota, para não repetir o histórico do GOLD DID
    if "last_id" in s and "routes" not in s:
        s = {"routes": {"legacy": s, "gold-did": dict(s)}}
    s.setdefault("routes", {})
    return s

def save_state(s):
    json.dump(s, open(STATE_FILE, "w"))

RELAY_POST_URL = os.environ.get("RELAY_POST_URL", "https://www.morethanmoney.pt/api/telegram/relay-post")
RELAY_SECRET = os.environ.get("RELAY_SECRET", "")

def bot_send(dest, source_id, text, reply_to=None, source_msg_id=None, reply_to_source_id=None, reply_to_text=None, edit=False, app_only=False):
    """Publica via o ENDPOINT do site (token válido na Vercel).
    Devolve: int>0 message_id · -1 DRY_RUN · -2 dup no servidor · None FALHA (não avançar last_id)."""
    if DRY_RUN:
        print(("──── PUBLICARIA em " + str(dest) + (f" (reply→{reply_to})" if reply_to else "") + " ────\n") + text + "\n")
        return -1
    payload = {"chat_id": dest, "text": text}
    if edit:
        payload["edit"] = True
    if app_only:
        payload["app_only"] = True
    if reply_to:
        payload["reply_to_message_id"] = reply_to
    if source_msg_id is not None:
        payload["source_chat_id"] = str(source_id)
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

async def resolve_source(client, source):
    """id numérico → direto; string → procura por título/username nos diálogos da sessão."""
    if isinstance(source, int) or (isinstance(source, str) and re.fullmatch(r"-?\d+", source)):
        return int(source)
    wanted = str(source).strip().lstrip("@").lower()
    async for d in client.iter_dialogs():
        title = (d.name or "").strip().lower()
        uname = (getattr(d.entity, "username", None) or "").lower()
        if title == wanted or uname == wanted or wanted in title:
            print(f"[relay] fonte '{source}' resolvida → {d.id} ({d.name})")
            return d.id
    raise RuntimeError(f"fonte '{source}' não encontrada nos diálogos da sessão — entra no canal com a conta")

async def run_route(client, route, rstate):
    source_id = route["_source_id"]
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=LOOKBACK_H)
    batch = []
    async for m in client.iter_messages(source_id, limit=60):
        if m.id <= rstate["last_id"]:
            break
        if m.date < cutoff and rstate["last_id"] == 0:
            break
        if m.message:
            batch.append(m)
    batch.reverse()  # cronológico
    rstate.setdefault("map", {})              # source_msg_id -> dest_msg_id (encadeamento)
    fails = rstate.setdefault("fails", {})    # source_msg_id -> falhas de envio consecutivas
    text_by_id = {m.id: m.message for m in batch}
    sent = 0
    new_last = rstate["last_id"]              # só avança até à última msg REALMENTE tratada
    for m in batch:
        clean = sanitize(m.message or "")
        forwardable = should_forward(m.message or "", route["filter"]) and bool(clean)
        if not forwardable:
            new_last = max(new_last, m.id)   # nada a publicar → seguro avançar
            continue
        # NOTA: NÃO deduplicamos por conteúdo — o servidor faz dedup ATÓMICO por
        # (source_chat_id, source_message_id); ver comentário histórico no git.
        reply_to = None
        reply_to_text = None
        src_reply = getattr(getattr(m, "reply_to", None), "reply_to_msg_id", None)
        if src_reply:
            if str(src_reply) in rstate["map"]:
                reply_to = rstate["map"][str(src_reply)]
            ptext = text_by_id.get(src_reply)
            if ptext is None:
                try:
                    pm = await client.get_messages(source_id, ids=src_reply)
                    ptext = pm.message if pm else None
                except Exception:
                    ptext = None
            reply_to_text = sanitize(ptext) if ptext else None
        pid = bot_send(route["dest"], source_id, brand(clean, route.get("header")), reply_to,
                       source_msg_id=m.id, reply_to_source_id=src_reply, reply_to_text=reply_to_text,
                       app_only=bool(route.get("app_only")))
        if pid is None:
            n = fails.get(str(m.id), 0) + 1
            fails[str(m.id)] = n
            if n >= 5:
                print(f"[relay:{route['name']}] DESISTO da msg {m.id} após {n} falhas — avanço.")
                fails.pop(str(m.id), None)
                new_last = max(new_last, m.id)
                continue
            print(f"[relay:{route['name']}] envio falhou msg {m.id} (tentativa {n}) — paro, retento a seguir.")
            break
        fails.pop(str(m.id), None)
        rstate.setdefault("texts", {})[str(m.id)] = impressao(clean)
        rstate.setdefault("publicadas", {})[str(m.id)] = 1
        if isinstance(pid, int) and pid > 0:
            rstate["map"][str(m.id)] = pid
            if len(rstate["map"]) > 800:
                for k in list(rstate["map"])[:-500]:
                    del rstate["map"][k]
        new_last = max(new_last, m.id)
        sent += 1
        await asyncio.sleep(0.2)
    rstate["last_id"] = new_last

    # ── EDIÇÕES NA FONTE ─────────────────────────────────────────────────────
    # O trader corrige a mensagem no canal dele em vez de publicar uma correcção.
    # O ciclo principal só olha para ids NOVOS (m.id <= last_id → break), por isso a
    # edição passava despercebida e o cliente ficava com o texto velho. Relê-se a
    # janela recente e, se o texto mudou face ao que foi relayado, manda-se corrigir.
    editadas = 0
    try:
        vistos = rstate.setdefault("texts", {})   # source_msg_id -> impressão do texto relayado
        janela = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=EDIT_LOOKBACK_H)
        async for m in client.iter_messages(source_id, limit=80):
            if m.date < janela:
                break
            sid = str(m.id)
            if sid not in rstate.get("map", {}) and sid not in rstate.get("publicadas", {}):
                continue                          # nunca foi publicada → nada a editar
            atual = sanitize(m.message or "")
            if not atual:
                continue
            h = impressao(atual)
            if vistos.get(sid) == h:
                continue                          # igual ao que já foi publicado
            antigo = vistos.get(sid)
            # impressões antigas (hash() instável) não são comparáveis: reescreve sem editar
            if antigo is not None and not re.fullmatch(r"[0-9a-f]{40}", str(antigo)):
                vistos[sid] = h
                continue
            if sid in vistos:                     # mudou → é uma edição a sério
                if bot_send(route["dest"], source_id, brand(atual, route.get("header")),
                            source_msg_id=m.id, edit=True,
                            app_only=bool(route.get("app_only"))) is not None:
                    editadas += 1
                    print(f"[relay:{route['name']}] editada msg {m.id}")
            vistos[sid] = h
        for chave in ("texts", "publicadas"):
            d = rstate.setdefault(chave, {})
            if len(d) > 800:
                for k in list(d)[:-500]:
                    del d[k]
    except Exception as e:
        print(f"[relay:{route['name']}] aviso: varrimento de edições falhou: {e}")

    return len(batch), sent

async def main():
    routes = load_routes()
    state = load_state()
    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        print("sessão não autorizada — gera nova com make_session.py"); return
    for r in routes:
        r["_source_id"] = await resolve_source(client, r["source"])
        state["routes"].setdefault(r["name"], {"last_id": 0})
    print(f"[relay] {'DRY-RUN' if DRY_RUN else 'LIVE'} | rotas: " +
          ", ".join(f"{r['name']} {r['_source_id']}→{r['dest']}" for r in routes))
    while True:
        for r in routes:
            try:
                scanned, sent = await run_route(client, r, state["routes"][r["name"]])
                if scanned or sent:
                    print(f"[relay:{r['name']}] {scanned} novas, {sent} publicadas (last_id={state['routes'][r['name']]['last_id']})")
            except Exception as e:
                print(f"[relay:{r['name']}] erro na passagem: {e}")
        save_state(state)
        if POLL_SEC <= 0:
            break
        await asyncio.sleep(POLL_SEC)
    await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())

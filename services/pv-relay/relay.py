#!/usr/bin/env python3
"""
PrimeVerse (PѴ TRADE INSIGHTS) → MTM Sensei relay.
Lê o canal pela sessão do Ricardo (Telethon). Os sinais do kingfkg são ENTRADAS PENDENTES:
  1) 🔔 NEW SIGNAL ALERT by <trader> — SETUP (Pair/Type/Entry/SL/TP): nível pendente, o preço ainda
     NÃO lá está → só MOSTRA no chat (kind='setup'), NÃO executa.
  2) 🟢 ENTRY HIT | <PAIR> — (reply ao setup) o preço chegou ao Entry → EXECUTA a mercado
     (preço ≈ entry, logo o SL/TP do sinal ficam corretos). É este o gatilho de execução.
  3) TP/SL HIT / TRADE CLOSED — gestão: ignorada (a ordem já leva SL + TP1, o broker fecha sozinho).

Corrige o bug do SL enorme: antes executava-se no SETUP a mercado (preço longe do Entry) → SL a
dezenas de pontos e TPs do lado errado. Agora só se entra no ENTRY HIT.

26/10 — MTM AUTO EDGE SEGUE OS 2 TOP TRADERS (decisão do dono). O trader deixou de ser fixo:
  · RANKING: pips líquidos que cada trader anuncia no canal (TRADE CLOSED; sem ele, SL HIT; sem
    nenhum, o maior TP HIT) numa janela móvel de PV_TOP_DAYS dias, com pelo menos PV_TOP_MIN_TRADES
    trades. Ao arrancar relê o histórico da janela (só lê, nunca executa); depois actualiza a cada
    mensagem. Os PV_TOP_N primeiros são os que a Edge segue.
  · O ranking vai para o site (kind="ranking") quando muda e de hora a hora — o site guarda-o e só
    executa ENTRY HIT de quem lá estiver (lib/mestres/edge-pv.ts). PV_TRADERS=a,b fixa a lista à mão
    (substitui o ranking).
  · Só se mandam SETUP/ENTRY HIT dos traders do top; os seguimentos vão todos (o site só os aplica
    a entradas que abriu). Cada pedido leva msg_id e msg_date (o site recusa o que tiver > 3 min).

ENV: TELEGRAM_API_ID/HASH, PV_SESSION_STRING, PV_SOURCE_ID(=-1003615007236),
     PV_EXEC_URL, RELAY_SECRET, PV_SYMBOLS(=ALL),
     PV_DRY_RUN, PV_STATE_FILE, PV_POLL_SEC, PV_LOOKBACK_H,
     PV_TOP_N(=2), PV_TOP_DAYS(=14), PV_TOP_MIN_TRADES(=3), PV_TRADERS (opcional, fixa a lista),
     PV_LIFECYCLE / PV_FOLLOWUPS (="live" para a Edge fechar/BE com o trader)
"""
import os, re, json, asyncio, datetime, urllib.request
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ["TELEGRAM_API_ID"]); API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION = os.environ["PV_SESSION_STRING"]
SOURCE_ID = int(os.environ.get("PV_SOURCE_ID", "-1003615007236"))
EXEC_URL = os.environ.get("PV_EXEC_URL", "https://www.morethanmoney.pt/api/telegram/primeverse-exec")
RELAY_SECRET = os.environ.get("RELAY_SECRET", "")
TOP_N = int(os.environ.get("PV_TOP_N", "2"))
TOP_DAYS = int(os.environ.get("PV_TOP_DAYS", "14"))
TOP_MIN_TRADES = int(os.environ.get("PV_TOP_MIN_TRADES", "3"))
TRADERS_FIXOS = [t.strip().lower().lstrip("@") for t in os.environ.get("PV_TRADERS", "").split(",") if t.strip()]
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
RX_ENTRY_HIT = re.compile(r"entry\s*hit", re.I)   # "🟢 ENTRY HIT | XAUUSD"
# CICLO DE VIDA (reply ao setup): o trader CANCELA a ordem pendente ou FECHA a posição → apaga/fecha
# as ordens T2T dos seguidores. PV_LIFECYCLE: "shadow" (só regista, default) | "live" (envia kind).
RX_CANCEL = re.compile(r"\bcancel", re.I)                                   # cancel / cancelled / cancelling
RX_CLOSED = re.compile(r"trade\s*closed|closed\s*manually|manual\s*close|\bclos(e|ed|ing)\b", re.I)
PV_LIFECYCLE = os.environ.get("PV_LIFECYCLE", "shadow").strip().lower()      # shadow | live
# SEGUIMENTOS para as estratégias MTM Auto Edge/King/Wolf (092): TP HIT, SL → BE / BREAKEVEN, SL HIT.
# O site só os aceita depois do deploy do ramo estrategias-primeverse (antes disso, um kind novo era
# lido como ENTRY HIT!) → "off" por defeito | "shadow" (só regista) | "live" (envia).
PV_FOLLOWUPS = os.environ.get("PV_FOLLOWUPS", "off").strip().lower()
RX_TP_HIT = re.compile(r"\bTP(\d)\s*HIT", re.I)                  # "✅ TP2 HIT +60 pips ✅✅ 🔥🔥"
RX_SL_HIT = re.compile(r"\bSL\s*HIT", re.I)                       # "❌ SL HIT -100 pips"
RX_SL_BE = re.compile(r"SL\s*(?:→|->|to)\s*BE\b|\bBREAKEVEN\b", re.I)  # "🛡️ SL → BE | XAUUSD 🔴 | @ 4357.00 | fxedge"
RX_BE_PRICE = re.compile(r"@\s*([0-9]+\.?[0-9]*)")

RX_PIPS = re.compile(r"([+\-−]?\s*\d+(?:\.\d+)?)\s*pips", re.I)
RX_TRADE_CLOSED = re.compile(r"trade\s*closed", re.I)
RX_TRADER_FIM = re.compile(r"\|\s*@?([A-Za-z0-9_\-\.]+)\s*$")

def pips_do_texto(t):
    m = RX_PIPS.search(t)
    if not m: return None
    try: return float(m.group(1).replace("−", "-").replace(" ", ""))
    except ValueError: return None

def resultado_do_texto(text):
    """(tipo, pips, trader_no_texto) de um anúncio de resultado, ou None. tipo: closed | sl | tp."""
    t = clean(text).split("\n")[0].strip()
    pips = pips_do_texto(t)
    if pips is None: return None
    mt = RX_TRADER_FIM.search(t)
    trader = mt.group(1).lower() if mt else None
    if RX_TRADE_CLOSED.search(t): return "closed", pips, trader
    if RX_SL_HIT.search(t): return "sl", -abs(pips), trader
    if RX_TP_HIT.search(t): return "tp", abs(pips), trader
    return None

def registar_resultado(state, setup_id, trader, ts, tipo, pips):
    res = state.setdefault("resultados", {})
    r = res.setdefault(str(setup_id), {"trader": trader, "ts": ts})
    if trader: r["trader"] = trader
    r["ts"] = max(r.get("ts", ts), ts)
    if tipo == "tp": r["tp"] = max(r.get("tp", pips), pips)
    else: r[tipo] = pips

def valor_do_resultado(r):
    for k in ("closed", "sl", "tp"):
        if r.get(k) is not None: return r[k]
    return None

def ranking(state, agora=None):
    """[{trader, pips, trades}] ordenado por pips líquidos na janela (e só quem tem trades suficientes)."""
    agora = agora or datetime.datetime.now(datetime.timezone.utc).timestamp()
    corte = agora - TOP_DAYS * 86400
    tot = {}
    for r in state.get("resultados", {}).values():
        v = valor_do_resultado(r)
        if v is None or not r.get("trader") or r.get("ts", 0) < corte: continue
        a = tot.setdefault(r["trader"], {"trader": r["trader"], "pips": 0.0, "trades": 0})
        a["pips"] += v; a["trades"] += 1
    lista = [x for x in tot.values() if x["trades"] >= TOP_MIN_TRADES]
    lista.sort(key=lambda x: (-x["pips"], -x["trades"], x["trader"]))
    for x in lista: x["pips"] = round(x["pips"], 1)
    return lista

def top_traders(state):
    if TRADERS_FIXOS: return TRADERS_FIXOS[:max(TOP_N, len(TRADERS_FIXOS))]
    return [x["trader"] for x in ranking(state)[:TOP_N]]

def limpar_resultados(state, agora=None):
    agora = agora or datetime.datetime.now(datetime.timezone.utc).timestamp()
    corte = agora - (TOP_DAYS + 2) * 86400
    res = state.get("resultados", {})
    for k in [k for k, r in res.items() if r.get("ts", 0) < corte]: del res[k]

def captar_resultado(state, m, setup_trader_de):
    """Se a mensagem for um resultado anunciado, junta-o ao ranking. setup_trader_de(id) → trader ou None."""
    r = resultado_do_texto(m.message or "")
    if not r: return
    tipo, pips, trader = r
    parent_id = getattr(getattr(m, "reply_to", None), "reply_to_msg_id", None)
    if parent_id: trader = setup_trader_de(parent_id) or trader
    if not trader: return
    registar_resultado(state, parent_id or f"m{m.id}", trader, m.date.timestamp(), tipo, pips)

def followup_kind(text):
    t = clean(text).split("\n")[0]
    m = RX_TP_HIT.search(t)
    if m: return "tp_hit", {"level": int(m.group(1))}
    if RX_SL_HIT.search(t): return "sl_hit", {}
    if RX_SL_BE.search(t):
        mp = RX_BE_PRICE.search(t)
        return "sl_be", ({"price": float(mp.group(1))} if mp else {})
    return None, {}

def lifecycle_kind(text):
    t = clean(text)
    if RX_CANCEL.search(t): return "cancel"
    if RX_CLOSED.search(t): return "close"
    return None

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

def is_entry_hit(text):
    return bool(RX_ENTRY_HIT.search(clean(text)))

def symbol_allowed(sym):
    return not (SYMBOLS and "ALL" not in SYMBOLS and sym not in SYMBOLS)

def post_exec(sig):
    if DRY_RUN:
        print("──── " + ("SETUP(display)" if sig.get("kind") == "setup" else "ENTRY HIT(exec)") + " ────\n" + json.dumps(sig) + "\n"); return True
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

def info_msg(m):
    return {"msg_id": m.id, "msg_date": m.date.isoformat()}

async def backfill_ranking(client, state):
    """Relê a janela do ranking (SÓ LEITURA — nada é enviado para execução)."""
    corte = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=TOP_DAYS)
    msgs = []
    async for m in client.iter_messages(SOURCE_ID, limit=None):
        if m.date < corte: break
        if m.message: msgs.append(m)
    msgs.reverse()
    traders = {}
    for m in msgs:
        sig = parse_entry(m.message)
        if sig: traders[m.id] = sig["trader"]; continue
        captar_resultado(state, m, lambda pid: traders.get(pid))
    limpar_resultados(state)
    print(f"[pv-relay] ranking relido: {len(msgs)} mensagens em {TOP_DAYS} dias → {json.dumps(ranking(state)[:5])}")

def enviar_ranking(state, forcar=False):
    top = top_traders(state)
    agora = datetime.datetime.now(datetime.timezone.utc)
    ultimo = state.get("ranking_enviado") or {}
    if not forcar and ultimo.get("top") == top and agora.timestamp() - ultimo.get("ts", 0) < 3600: return
    rk = {x["trader"]: x for x in ranking(state)}
    payload = {"kind": "ranking", "janelaDias": TOP_DAYS, "em": agora.isoformat(), "fixo": bool(TRADERS_FIXOS),
               "top": [rk.get(t, {"trader": t, "pips": 0, "trades": 0}) for t in top]}
    if ultimo.get("top") != top: print(f"[pv-relay] TOP mudou: {ultimo.get('top')} → {top}")
    if post_exec(payload): state["ranking_enviado"] = {"top": top, "ts": agora.timestamp()}

async def run_once(client, state):
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=LOOKBACK_H)
    batch = []
    async for m in client.iter_messages(SOURCE_ID, limit=80):
        if m.id <= state["last_id"]: break
        if m.date < cutoff and state["last_id"] == 0: break
        if m.message: batch.append(m)
    batch.reverse()  # cronológico
    setups = state.setdefault("setups", {})   # str(msg_id) -> sig do SETUP
    done = state.setdefault("done", [])        # ids de ENTRY HIT já executados (dedup)
    fails = state.setdefault("fails", {})
    sent = 0
    new_last = state["last_id"]                # só avança até à última msg REALMENTE tratada
    for m in batch:
        txt = m.message or ""
        captar_resultado(state, m, lambda pid: (setups.get(str(pid)) or {}).get("trader"))
        top = top_traders(state)
        # 1) SETUP → guarda + regista no site (SEM executar) — só dos traders do top
        sig = parse_entry(txt)
        if sig:
            setups[str(m.id)] = sig
            if len(setups) > 400:
                for k in list(setups)[:-250]: del setups[k]
            if symbol_allowed(sig["symbol"]) and sig["trader"] in top:
                post_exec({**sig, "kind": "setup", **info_msg(m)})   # display-only; falha não bloqueia
            new_last = max(new_last, m.id)
            continue
        # 2) ENTRY HIT → executa a mercado com os dados do SETUP-pai
        if is_entry_hit(txt):
            if m.id in done:
                new_last = max(new_last, m.id); continue
            parent_id = getattr(getattr(m, "reply_to", None), "reply_to_msg_id", None)
            setup = setups.get(str(parent_id)) if parent_id else None
            if setup is None and parent_id:
                try:
                    pm = await client.get_messages(SOURCE_ID, ids=parent_id)
                    setup = parse_entry(pm.message) if pm and pm.message else None
                except Exception:
                    setup = None
            if not setup or not symbol_allowed(setup["symbol"]) or setup["trader"] not in top:
                if not setup:
                    print(f"[pv-relay] ENTRY HIT {m.id} sem setup-pai → ignoro")
                new_last = max(new_last, m.id); continue
            if post_exec({**setup, "kind": "entry_hit", "setup_msg_id": parent_id, **info_msg(m)}):
                done.append(m.id); state["done"] = done[-300:]
                fails.pop(str(m.id), None)
                new_last = max(new_last, m.id); sent += 1
                await asyncio.sleep(1)
            else:
                n = fails.get(str(m.id), 0) + 1; fails[str(m.id)] = n
                if n >= 5:
                    print(f"[pv-relay] DESISTO ENTRY HIT {m.id} após {n} falhas — avanço"); fails.pop(str(m.id), None); new_last = max(new_last, m.id); continue
                print(f"[pv-relay] ENTRY HIT {m.id} falhou (tentativa {n}) — paro aqui, retento"); break
            continue
        # 3) CICLO DE VIDA (CANCEL/CLOSE do trader) → reply ao setup: thread no chat + apaga/fecha as
        #    ordens T2T dos seguidores. TP/SL HIT automáticos continuam ignorados (o broker já fecha).
        cc = lifecycle_kind(txt)
        if cc:
            parent_id = getattr(getattr(m, "reply_to", None), "reply_to_msg_id", None)
            setup = setups.get(str(parent_id)) if parent_id else None
            if setup is None and parent_id:
                try:
                    pm = await client.get_messages(SOURCE_ID, ids=parent_id)
                    setup = parse_entry(pm.message) if pm and pm.message else None
                except Exception:
                    setup = None
            if setup and symbol_allowed(setup["symbol"]):
                payload = {"symbol": setup["symbol"], "direction": setup["direction"], "trader": setup["trader"], "entry": setup.get("entry"), "sl": setup.get("sl"), "kind": cc, "setup_msg_id": parent_id, **info_msg(m)}
                if PV_LIFECYCLE == "live":
                    post_exec(payload)
                else:
                    print(f"[pv-relay] SHADOW {cc.upper()} (msg {m.id} → setup {parent_id}): {json.dumps(payload)} | texto: {clean(txt)[:80]!r}")
            new_last = max(new_last, m.id)
            continue
        # 4) Gestão automática (TP HIT / SL → BE / SL HIT) → só para as estratégias MTM Auto (PV_FOLLOWUPS).
        #    O T2T continua a ignorá-los (a ordem já leva SL+TP1).
        fk, extra = followup_kind(txt)
        if fk and PV_FOLLOWUPS in ("shadow", "live"):
            parent_id = getattr(getattr(m, "reply_to", None), "reply_to_msg_id", None)
            setup = setups.get(str(parent_id)) if parent_id else None
            if setup and symbol_allowed(setup["symbol"]):
                payload = {"symbol": setup["symbol"], "direction": setup["direction"], "trader": setup["trader"], "entry": setup.get("entry"), "sl": setup.get("sl"), "tps": setup.get("tps") or [], "kind": fk, "setup_msg_id": parent_id, **extra, **info_msg(m)}
                if PV_FOLLOWUPS == "live":
                    post_exec(payload)
                else:
                    print(f"[pv-relay] SHADOW {fk.upper()} (msg {m.id} → setup {parent_id}): {json.dumps(payload)}")
        new_last = max(new_last, m.id)
    state["last_id"] = new_last
    limpar_resultados(state)
    enviar_ranking(state)
    save_state(state)
    return len(batch), sent

async def main():
    state = load_state()
    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        print("sessão não autorizada"); return
    if not TRADERS_FIXOS and not state.get("resultados"):
        await backfill_ranking(client, state); save_state(state)
    enviar_ranking(state, forcar=True)
    print(f"[pv-relay] {'DRY-RUN' if DRY_RUN else 'LIVE'} | fonte {SOURCE_ID} | top {TOP_N} em {TOP_DAYS}d = {top_traders(state)}{' (fixo)' if TRADERS_FIXOS else ''} | símbolos={sorted(SYMBOLS)} | exec SÓ no ENTRY HIT")
    while True:
        scanned, sent = await run_once(client, state)
        print(f"[pv-relay] passagem: {scanned} novas, {sent} entradas executadas (last_id={state['last_id']})")
        if POLL_SEC <= 0: break
        await asyncio.sleep(POLL_SEC)
    await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())

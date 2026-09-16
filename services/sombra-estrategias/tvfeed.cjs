// VENDORIZADO de ~/tradingview-mcp/src/tvfeed.js (repositório tradingview-mcp, 16/09/2026) para o
// serviço services/sombra-estrategias poder correr na VPS, onde o MCP não existe. Não editar aqui sem
// levar a mudança ao original (e vice-versa): é o MESMO cliente com que o estudo do histórico mede.
// tvfeed.js — Minimal TradingView (unofficial) historical-data websocket client.
// Pulls OHLCV bars for a symbol/interval, the same data you see on the chart.
// CommonJS, no build step. Depends on `ws`.
//
// Intellectual property of RicardoGarciaPT / MoreThanMoney.

const WebSocket = require('ws');

const WS_URL = 'wss://data.tradingview.com/socket.io/websocket';
const ORIGIN = 'https://www.tradingview.com';

// Map friendly interval labels -> TradingView resolution codes.
const INTERVALS = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '45m': '45', '1h': '60', '2h': '120', '3h': '180', '4h': '240',
  '1d': '1D', 'D': '1D', '1w': '1W', 'W': '1W', '1M': '1M',
  // also accept raw codes
  '1': '1', '5': '5', '15': '15', '60': '60', '240': '240', '1D': '1D', '1W': '1W',
};

// Convenient aliases for the 4 MTM assets (TradingView symbols).
// You can always pass a full "EXCHANGE:SYMBOL" instead.
const ALIASES = {
  // Indices / crypto / metals
  NAS100: 'CAPITALCOM:US100',
  US100: 'CAPITALCOM:US100',
  BTCUSD: 'BINANCE:BTCUSDT',
  BTCUSDT: 'BINANCE:BTCUSDT',
  ETHUSDT: 'BINANCE:ETHUSDT',
  ETHUSD: 'BINANCE:ETHUSDT',
  XAUUSD: 'OANDA:XAUUSD',
  GOLD: 'OANDA:XAUUSD',
  // Forex majors (OANDA — good intraday depth on the feed)
  EURUSD: 'OANDA:EURUSD',
  GBPUSD: 'OANDA:GBPUSD',
  USDJPY: 'OANDA:USDJPY',
  AUDUSD: 'OANDA:AUDUSD',
  USDCAD: 'OANDA:USDCAD',
  USDCHF: 'OANDA:USDCHF',
  NZDUSD: 'OANDA:NZDUSD',
  EURJPY: 'OANDA:EURJPY',
  GBPJPY: 'OANDA:GBPJPY',
  EURGBP: 'OANDA:EURGBP',
};

function resolveSymbol(sym) {
  if (!sym) throw new Error('symbol is required');
  const up = sym.toUpperCase();
  if (ALIASES[up]) return ALIASES[up];
  if (sym.includes(':')) return sym; // already EXCHANGE:SYMBOL
  return sym; // let TradingView try to resolve it
}

function resolveInterval(tf) {
  const key = String(tf);
  if (INTERVALS[key]) return INTERVALS[key];
  if (INTERVALS[key.toLowerCase()]) return INTERVALS[key.toLowerCase()];
  throw new Error(`Unknown interval "${tf}". Use one of: ${Object.keys(INTERVALS).join(', ')}`);
}

function randSession(prefix) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return prefix + s;
}

function wrap(msg) {
  return `~m~${msg.length}~m~${msg}`;
}

function frame(func, params) {
  return wrap(JSON.stringify({ m: func, p: params }));
}

// Split a raw socket payload into individual ~m~ packets.
function splitPackets(raw) {
  const out = [];
  const re = /~m~(\d+)~m~/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const len = parseInt(m[1], 10);
    const start = re.lastIndex;
    const body = raw.substr(start, len);
    out.push(body);
    re.lastIndex = start + len;
  }
  return out;
}

/**
 * Fetch historical bars.
 * @param {Object} opts
 * @param {string} opts.symbol  - alias (NAS100/BTCUSD/...) or "EXCHANGE:SYMBOL"
 * @param {string} opts.interval - 5m/15m/1h/4h/1d or raw code
 * @param {number} opts.nBars - number of bars to request (TV caps ~5000 unauthenticated)
 * @param {string} [opts.token] - TradingView auth token for deeper history (optional)
 * @param {number} [opts.timeoutMs] - overall timeout
 * @returns {Promise<{symbol:string,interval:string,bars:Array}>}
 */
function getHistory({ symbol, interval, nBars = 5000, token, timeoutMs = 60000 }) {
  const tvSymbol = resolveSymbol(symbol);
  const tvInterval = resolveInterval(interval);
  const authToken = token || process.env.TV_TOKEN || 'unauthorized_user_token';
  const target = Math.max(1, nBars);
  const FIRST_CHUNK = Math.min(target, 5000);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, { origin: ORIGIN, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const csSession = randSession('cs_');
    let settled = false;
    const barMap = new Map(); // time -> bar (de-dupes historical + live updates)
    let lastCount = 0;
    let stall = 0;
    let moreRequests = 0;
    let settleTimer = null;
    const MAX_MORE = 80;          // safety cap on pagination rounds
    const SETTLE_MS = 1500;       // quiet period after last update before we act

    const hardTimer = setTimeout(() => {
      if (barMap.size) finish(null);
      else finish(new Error(`Timeout after ${timeoutMs}ms with no data for ${tvSymbol} ${tvInterval}. The symbol may be wrong or the feed unavailable.`));
    }, timeoutMs);

    function bars() {
      return Array.from(barMap.values()).sort((a, b) => a.time - b.time);
    }

    function finish(err) {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      if (settleTimer) clearTimeout(settleTimer);
      try { ws.close(); } catch (e) {}
      if (err) reject(err);
      else resolve({ symbol: tvSymbol, interval: tvInterval, bars: bars().slice(-target) });
    }

    // Called once updates go quiet: paginate for more history or finish.
    function onSettle() {
      const count = barMap.size;
      if (count >= target) return finish(null);
      if (count <= lastCount) {
        stall += 1;
        if (stall >= 2) return finish(null); // no more history available
      } else {
        stall = 0;
      }
      lastCount = count;
      if (moreRequests >= MAX_MORE) return finish(null);
      moreRequests += 1;
      ws.send(frame('request_more_data', [csSession, 'sds_1', 5000]));
      scheduleSettle();
    }

    function scheduleSettle() {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(onSettle, SETTLE_MS);
    }

    function ingest(series) {
      if (!series || !Array.isArray(series.s)) return;
      for (const row of series.s) {
        const v = row.v;
        if (!v || v.length < 5) continue;
        barMap.set(v[0], {
          time: v[0], open: v[1], high: v[2], low: v[3], close: v[4],
          volume: v[5] !== undefined ? v[5] : 0,
        });
      }
    }

    ws.on('open', () => {
      ws.send(frame('set_auth_token', [authToken]));
      ws.send(frame('chart_create_session', [csSession, '']));
      ws.send(frame('resolve_symbol', [
        csSession,
        'sym_1',
        `={"adjustment":"splits","symbol":"${tvSymbol}"}`,
      ]));
      ws.send(frame('create_series', [csSession, 'sds_1', 's1', 'sym_1', tvInterval, FIRST_CHUNK, '']));
    });

    ws.on('message', (data) => {
      const raw = data.toString();
      // Heartbeat: echo back exactly.
      if (raw.includes('~h~')) {
        const packets = splitPackets(raw);
        for (const p of packets) {
          if (p.startsWith('~h~')) ws.send(wrap(p));
        }
        return;
      }
      const packets = splitPackets(raw);
      for (const p of packets) {
        if (!p.startsWith('{')) continue;
        let msg;
        try { msg = JSON.parse(p); } catch (e) { continue; }
        const fn = msg.m;
        // Historical batch ('timescale_update') and live updates ('du') share shape.
        if (fn === 'timescale_update' || fn === 'du') {
          try { ingest(msg.p[1] && msg.p[1].sds_1); } catch (e) { /* ignore */ }
          scheduleSettle();
        } else if (fn === 'series_completed') {
          scheduleSettle();
        } else if (fn === 'symbol_error' || fn === 'critical_error' || fn === 'protocol_error') {
          finish(new Error(`TradingView ${fn}: ${JSON.stringify(msg.p)}`));
        }
      }
    });

    ws.on('error', (err) => finish(err));
    ws.on('close', () => {
      if (!settled) finish(null);
    });
  });
}

function toCSV(bars) {
  const lines = ['time,open,high,low,close,volume'];
  for (const b of bars) {
    const dt = new Date(b.time * 1000).toISOString().replace('T', ' ').slice(0, 19);
    lines.push(`${dt},${b.open},${b.high},${b.low},${b.close},${b.volume}`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { getHistory, toCSV, resolveSymbol, resolveInterval, INTERVALS, ALIASES };

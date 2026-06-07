// ──────────────────────────────────────────────────────────────────────────
// Telegram Listener — usa o bot @MoreThanMoney_aibot (Bot API) para receber
// mensagens dos canais/grupos de sinais configurados pelos utilizadores.
//
// IMPORTANTE — limitação da Bot API: um bot só recebe mensagens de canais/
// grupos onde foi adicionado como administrador (ou membro, em grupos não
// privados com privacy mode desligado). Isto significa que, para cada canal
// que um utilizador queira copiar, o bot @MoreThanMoney_aibot tem de ser
// adicionado como admin a esse canal — normalmente pelo próprio utilizador
// ou pelo dono do canal de sinais.
//
// Se no futuro quiseres copiar canais de terceiros que não permitem adicionar
// bots, a alternativa é um "userbot" (Telethon/GramJS, login com número de
// telefone) — arquitetura diferente, ver nota no README.
// ──────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'
import { parseSignal, looksLikeManagementUpdate } from './signal-parser'
import { computeLotSize } from './lot-sizing'
import { placeMarketOrder, checkAccountHealth } from './metaapi-bridge'
import {
  getActiveConnections,
  markStatus,
  logSignal,
  type CopygramConnection,
} from './supabase-client'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  throw new Error('[telegram-listener] TELEGRAM_BOT_TOKEN em falta no .env')
}

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 30000)

// Cache em memória: canal (chat id ou @username normalizado) → ligações activas
// que querem copiar esse canal. Recarregado periodicamente da BD.
let channelMap = new Map<string, CopygramConnection[]>()

function normalizeChannel(raw: string | null | undefined): string | null {
  if (!raw) return null
  return raw.trim().toLowerCase().replace(/^https?:\/\/t\.me\//, '@').replace(/^@?/, '@')
}

async function refreshConnections() {
  const connections = await getActiveConnections()
  const map = new Map<string, CopygramConnection[]>()

  for (const conn of connections) {
    const key = normalizeChannel(conn.telegram_channel)
    if (!key) continue
    const list = map.get(key) ?? []
    list.push(conn)
    map.set(key, list)

    // Verificação de saúde da ligação MT5 (apenas se já provisionada no MetaApi)
    if (conn.metaapi_account_id) {
      const health = await checkAccountHealth(conn.metaapi_account_id)
      await markStatus(conn.id, {
        mt5_status: health.ok ? 'connected' : 'error',
        last_error: health.ok ? null : health.error,
      })
    }
  }

  channelMap = map
  console.log(`[telegram-listener] ${connections.length} ligação(ões) activa(s) · ${map.size} canal(is) monitorizados`)
}

async function handleIncomingMessage(bot: TelegramBot, msg: TelegramBot.Message) {
  const chat = msg.chat
  const text = msg.text || msg.caption
  if (!text) return

  const channelKey = normalizeChannel(chat.username ? `@${chat.username}` : String(chat.id))
  const subscribers = channelMap.get(channelKey)
  if (!subscribers || !subscribers.length) return

  console.log(`[telegram-listener] mensagem recebida de ${channelKey}: "${text.slice(0, 80)}..."`)

  if (looksLikeManagementUpdate(text)) {
    console.log('[telegram-listener] mensagem parece ser uma atualização de gestão — ignorada')
    return
  }

  const signal = parseSignal(text)
  if (!signal) {
    console.log('[telegram-listener] não foi possível extrair um sinal estruturado — ignorada')
    return
  }

  console.log(`[telegram-listener] sinal detectado → ${signal.symbol} ${signal.direction?.toUpperCase()} (entry=${signal.entry ?? 'mercado'}, sl=${signal.sl ?? '—'}, tp=${signal.tp.join('/') || '—'})`)

  for (const conn of subscribers) {
    await processSignalForConnection(conn, signal, text)
  }
}

async function processSignalForConnection(
  conn: CopygramConnection,
  signal: ReturnType<typeof parseSignal> & {},
  raw: string
) {
  if (!signal || !signal.symbol || !signal.direction) return

  // Filtro de símbolos (whitelist) — se configurado, só copia os símbolos permitidos
  if (conn.symbols_whitelist?.length && !conn.symbols_whitelist.includes(signal.symbol)) {
    await logSignal({
      user_id: conn.user_id, connection_id: conn.id,
      symbol: signal.symbol, direction: signal.direction,
      entry: signal.entry, sl: signal.sl, tp: signal.tp[0] ?? null,
      status: 'ignored', detail: 'Símbolo fora da whitelist do utilizador', raw_message: raw,
    })
    return
  }

  if (!conn.metaapi_account_id) {
    await logSignal({
      user_id: conn.user_id, connection_id: conn.id,
      symbol: signal.symbol, direction: signal.direction,
      entry: signal.entry, sl: signal.sl, tp: signal.tp[0] ?? null,
      status: 'received', detail: 'Conta MT5 ainda não provisionada no MetaApi (onboarding pendente)', raw_message: raw,
    })
    return
  }

  const direction = conn.reverse_signals
    ? (signal.direction === 'buy' ? 'sell' : 'buy')
    : signal.direction

  const lot = computeLotSize(conn, signal /*, accountBalance — obter via MetaApi se necessário para risk_percent */)

  const result = await placeMarketOrder({
    accountId: conn.metaapi_account_id,
    symbol: signal.symbol,
    direction,
    volume: lot,
    stopLoss: conn.copy_sl ? signal.sl : null,
    takeProfit: conn.copy_tp ? (signal.tp[0] ?? null) : null,
    comment: 'Copygram MTM',
  })

  await logSignal({
    user_id: conn.user_id, connection_id: conn.id,
    symbol: signal.symbol, direction,
    entry: signal.entry, sl: signal.sl, tp: signal.tp[0] ?? null, lot,
    status: result.success ? 'executed' : 'failed',
    detail: result.success ? `Ordem #${result.orderId} executada` : result.error,
    raw_message: raw,
  })

  await markStatus(conn.id, {
    last_signal_at: new Date().toISOString(),
    ...(result.success ? {} : { last_error: result.error }),
  })

  console.log(
    result.success
      ? `[telegram-listener] ✅ ordem executada para utilizador ${conn.user_id} (${signal.symbol} ${direction} ${lot} lotes)`
      : `[telegram-listener] ❌ falha ao executar para utilizador ${conn.user_id}: ${result.error}`
  )
}

export async function startListener() {
  const bot = new TelegramBot(token!, { polling: true })

  bot.on('polling_error', (err) => console.error('[telegram-listener] erro de polling:', err.message))
  bot.on('message', (msg) => handleIncomingMessage(bot, msg).catch((e) => console.error('[telegram-listener] erro ao processar mensagem:', e)))
  bot.on('channel_post', (msg) => handleIncomingMessage(bot, msg).catch((e) => console.error('[telegram-listener] erro ao processar post de canal:', e)))

  await refreshConnections()
  setInterval(() => refreshConnections().catch((e) => console.error('[telegram-listener] erro ao atualizar ligações:', e)), POLL_INTERVAL_MS)

  console.log('[telegram-listener] bot @MoreThanMoney_aibot a escutar canais de sinais Copygram...')
}

/**
 * Monitor de PREÇO das posições Tap to Trade — gere em TEMPO REAL as ordens abertas nas contas dos
 * SEGUIDORES, sem depender de mensagens/eventos da fonte. É o que permite ao MTM Scanner (que só
 * emite ENTRADAS, nunca follow-ups) ter gestão completa: o motor lê o preço e decide.
 *
 * Por cada posição T2T aberta (mtmcopy_signal_log com broker_position_id):
 *   • ENTRY HIT  → confirma a abertura no chat (1ª vez que a vê preenchida)
 *   • PARCIAIS   → ao tocar cada TP do sinal fecha a % do split (default 50/30/20)
 *   • BE         → SL para entrada +N pips A FAVOR (nunca entrada seca) ao atingir ratio do risco,
 *                  e sempre no Exit 1
 *   • TRAILING   → arranca após o Exit 1, ancorado ao risco
 *   • FECHO      → quando a posição desaparece (TP/SL/manual) marca closed + publica o desfecho
 *
 * Estado em site_settings 't2t_monitor_state' (sem migração de schema). Idempotente.
 * Switch: exec-switch `t2t_price_monitor` (default ON). Corre no mesmo loop ~1s do VPS.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getExecSwitches } from './exec-switches'
import { parseSignal } from './signal-parser'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import {
  readOpenPositions,
  readPendingOrders,
  cancelPendingOrdersForSymbol,
  getMarketPrice,
  modifyPositionSlTp,
  closePositionById,
  type MetaApiPosition,
  type MetaApiPendingOrder,
} from './metaapi'
import { lifecycleMessage, logStatusFor, type SignalEvent } from './signal-lifecycle'
import { pipSizeForSymbol } from './trade-outcome'
import { t2tUsaTrailing } from './t2t-source'

const STATE_KEY = 't2t_monitor_state'
/** Split dos parciais quando o sinal traz vários TPs. */
const SPLIT = [50, 30, 20]
/** BE = entrada + N pips a favor (nunca entrada seca). */
const BE_BUFFER_PIPS = Number(process.env.T2T_BE_BUFFER_PIPS) || 5
/** BE protetor cedo: lucro ≥ ratio × risco. */
const EARLY_BE_RATIO = Number(process.env.T2T_EARLY_BE_RATIO) || 0.4

interface RowState {
  exitsDone: number
  beDone: boolean
  trailing: boolean
  /** Stop mais alto (compra) / mais baixo (venda) que o motor já colocou — o ratchet. */
  trailSl?: number
  /** Já anunciámos o ENTRY HIT? (= a ordem chegou a encher) */
  announced: boolean
}

/** Horas que uma ordem pendente T2T pode esperar antes de ser considerada ideia morta. */
const PENDING_MAX_HOURS = Number(process.env.T2T_PENDING_MAX_HOURS) || 24
type StateMap = Record<string, RowState>

interface LogRow {
  id: string
  connection_id: string
  chat_message_id: string | null
  channel_key: string | null
  symbol: string | null
  direction: string | null
  entry: number | null
  sl: number | null
  tp: number | null
  lot: number | null
  raw_message: string | null
  broker_position_id: string | null
  created_at?: string | null
}

function pipSizeFor(symbol: string): number {
  return pipSizeForSymbol(symbol)
}
function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}
function symMatch(a: string, b: string): boolean {
  const x = a.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const y = b.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return x === y || x.includes(y) || y.includes(x)
}
/** BE a favor: entrada ± buffer. */
function beTarget(entry: number, dir: 'buy' | 'sell', symbol: string): number {
  const buf = BE_BUFFER_PIPS * pipSizeFor(symbol)
  return dir === 'buy' ? entry + buf : entry - buf
}
/** Lista de TPs do sinal: raw_message (multi-TP) com fallback ao tp da linha. */
function tpLevels(row: LogRow): number[] {
  const fromRaw = row.raw_message ? parseSignal(row.raw_message)?.tp ?? [] : []
  const list = (fromRaw.length ? fromRaw : [row.tp]).filter(
    (n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0,
  )
  return list.slice(0, 3)
}

async function loadState(): Promise<StateMap> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', STATE_KEY).maybeSingle()
    const v = data?.value
    return v && typeof v === 'object' ? (v as StateMap) : {}
  } catch {
    return {}
  }
}
async function saveState(state: StateMap): Promise<void> {
  await getSupabaseAdmin()
    .from('site_settings')
    .upsert(
      { key: STATE_KEY, value: state, description: 'Estado do monitor de preço T2T', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
}

/** Publica no chat do sinal (thread na entrada) + push. Concisa e sem alvo/TP → nunca vira entrada T2T. */
async function postToChat(chatMessageId: string | null, slug: string | null, content: string): Promise<void> {
  if (!slug) return
  try {
    const insert: Record<string, unknown> = {
      channel_slug: slug, user_id: null, content, message_type: 'telegram_forward', notified: true,
    }
    if (chatMessageId) insert.reply_to_id = chatMessageId
    const { data } = await getSupabaseAdmin().from('chat_messages').insert(insert).select('id').single()
    await sendTelegramChannelPush({ slug, content, chatMessageId: data?.id as string }).catch(() => {})
  } catch (e) {
    console.warn('[t2t-monitor] post erro:', e instanceof Error ? e.message : String(e))
  }
}

/**
 * Publica um evento do ciclo de vida com o texto CANÓNICO (o mesmo em chat, Telegram e push),
 * e devolve o estado a gravar no log. Ver lib/mtmcopy/signal-lifecycle.ts.
 */
async function publishEvent(
  row: LogRow,
  event: SignalEvent,
  ctx: Parameters<typeof lifecycleMessage>[1],
): Promise<string> {
  const { text } = lifecycleMessage(event, ctx)
  await postToChat(row.chat_message_id, row.channel_key, text)
  return logStatusFor(event)
}

export async function runT2TPriceMonitor(): Promise<{
  ran: boolean
  reason?: string
  managed: number
  actions: string[]
  ilegiveis?: number
}> {
  const actions: string[] = []
  const switches = await getExecSwitches()
  if (!switches.t2t_price_monitor) return { ran: false, reason: 'switch off', managed: 0, actions }

  const admin = getSupabaseAdmin()
  let { data: rows } = await admin
    .from('mtmcopy_signal_log')
    .select('id, connection_id, chat_message_id, channel_key, symbol, direction, entry, sl, tp, lot, raw_message, broker_position_id, created_at')
    .in('status', ['open', 'ok', 'active', 'filled'])
    .not('broker_position_id', 'is', null)
    .gte('created_at', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
    .limit(200)
  if (!rows?.length) return { ran: true, managed: 0, actions }

  /**
   * SET & FORGET: fontes que o motor NÃO gere.
   *
   * As Ideias de Forex Swings são swings — entram e ficam. Mexer-lhes no stop a meio (break-even
   * ao primeiro alvo, trailing atrás do preço) é aplicar a gestão de um scalp a uma trade que
   * precisa de espaço para respirar, e o resultado é ser fechado no ruído antes de o movimento
   * acontecer. Aqui só se ACOMPANHA: se bateu no TP, no SL ou no break-even, regista-se e diz-se.
   *
   * A trade continua a ser gerida — pela ordem que o próprio sinal trouxe, com o stop e os
   * alvos escritos nele. O que não há é uma segunda mão a mexer por cima.
   */
  const SEM_GESTAO = new Set(['ideias-e-sinais'])
  const geríveis = rows.filter((r) => !SEM_GESTAO.has(String((r as LogRow).channel_key ?? '')))
  if (geríveis.length !== rows.length) {
    actions.push(`${rows.length - geríveis.length} posições set & forget — só acompanhadas`)
  }
  rows = geríveis as typeof rows

  // Conta MetaApi de cada conexão.
  const connIds = [...new Set(rows.map((r) => (r as LogRow).connection_id))]
  const { data: conns } = await admin.from('mtmcopy_connections').select('id, metaapi_account_id').in('id', connIds)
  const accById = new Map((conns ?? []).map((c) => [c.id as string, (c.metaapi_account_id as string | null) ?? null]))

  // Posições abertas E ordens pendentes por conta (1 chamada de cada, reutilizada).
  // Sem as pendentes, uma ordem-limite que ainda não encheu não aparecia em lado nenhum e o
  // monitor dava-a como "posição fechada" no minuto seguinte à aceitação — anúncio falso e,
  // pior, o registo morria: quando a ordem enchesse já ninguém a geria.
  const posByAcc = new Map<string, MetaApiPosition[] | null>()
  const pendByAcc = new Map<string, MetaApiPendingOrder[] | null>()
  /** Contas cuja leitura falhou nesta passagem — nada se conclui sobre elas. */
  let ilegiveis = 0
  const priceCache = new Map<string, number | null>()
  const state = await loadState()
  let managed = 0

  for (const raw of rows) {
    const row = raw as LogRow
    const accountId = accById.get(row.connection_id)
    if (!accountId || !row.symbol || !row.broker_position_id) continue
    const dir: 'buy' | 'sell' = row.direction === 'sell' ? 'sell' : 'buy'
    const st: RowState = state[row.id] ?? { exitsDone: 0, beDone: false, trailing: false, announced: false }

    try {
      // Leitura ESTRITA: null = não consegui ler. Nesse caso não se conclui nada sobre a
      // posição — salta-se a conta nesta passagem e tenta-se no segundo seguinte. Antes, uma
      // falha de leitura era lida como "a posição fechou" e a trade ficava órfã na corretora.
      if (!posByAcc.has(accountId)) posByAcc.set(accountId, await readOpenPositions(accountId))
      if (!pendByAcc.has(accountId)) pendByAcc.set(accountId, await readPendingOrders(accountId))
      const positions = posByAcc.get(accountId)
      const pendentes = pendByAcc.get(accountId)
      if (positions == null || pendentes == null) {
        ilegiveis++
        continue
      }
      const pos = positions.find((p) => p.id === row.broker_position_id) ?? null
      const pend = pendentes.find((o) => o.id === row.broker_position_id) ?? null

      // `entry` viaja no contexto para que o cabeçalho de cada evento traga o desfecho em pips e
      // percentagem (ver signal-lifecycle.headline). Sem entrada, o cabeçalho fica só com o par.
      const evCtx = {
        symbol: row.symbol,
        direction: dir,
        source: row.channel_key,
        entry: row.entry ?? pos?.openPrice ?? null,
      }

      // ── AINDA PENDENTE: a ordem não encheu. Decidir se a ideia continua viva.
      if (!pos && pend) {
        const tpsP = tpLevels(row)
        const key0 = `${accountId}|${row.symbol}`
        if (!priceCache.has(key0)) priceCache.set(key0, await getMarketPrice(accountId, row.symbol))
        const px = priceCache.get(key0) ?? null

        let morte: SignalEvent | null = null
        let motivo: string | null = null

        if (px != null && px > 0 && tpsP.length) {
          // Todos os alvos já foram atingidos SEM a entrada encher → não há movimento a aproveitar.
          const todosBatidos = tpsP.every((t) => (dir === 'buy' ? px >= t : px <= t))
          if (todosBatidos) morte = 'targets_before_entry'
        }
        if (!morte && px != null && px > 0 && row.sl != null && row.sl > 0) {
          // O stop foi varrido antes de a entrada encher → a ideia morreu.
          const slBatido = dir === 'buy' ? px <= row.sl : px >= row.sl
          if (slBatido) { morte = 'discarded'; motivo = 'O stop foi atingido antes de a entrada encher.' }
        }
        if (!morte) {
          const idadeH = (Date.now() - new Date(row.created_at ?? Date.now()).getTime()) / 3_600_000
          if (idadeH >= PENDING_MAX_HOURS) {
            morte = 'discarded'
            motivo = `A ordem esperou ${Math.floor(idadeH)}h sem encher.`
          }
        }

        if (morte) {
          // Grava o estado PRIMEIRO e só anuncia se a escrita passou — senão o tick seguinte
          // volta a encontrar a linha 'open' e repete o anúncio para sempre (aconteceu quando
          // o CHECK da tabela não conhecia 'discarded': loop de pushes a cada ~6s).
          const { error: upErr } = await admin
            .from('mtmcopy_signal_log')
            .update({ status: logStatusFor(morte), detail: motivo ?? 'Ideia descartada (monitor T2T)' })
            .eq('id', row.id)
          if (upErr) {
            console.warn('[t2t-monitor] update de estado falhou (não anuncia):', row.id, upErr.message)
            continue
          }
          try { await cancelPendingOrdersForSymbol(accountId, row.symbol) } catch { /* ignora */ }
          await publishEvent(row, morte, { ...evCtx, reason: motivo })
          delete state[row.id]
          actions.push(`${morte} ${row.symbol}`)
          continue
        }
        // Continua a aguardar — sem ruído no chat.
        managed++
        continue
      }

      // ── DESAPARECEU: nem posição nem pendente.
      if (!pos) {
        // Se nunca chegou a encher, não foi um fecho — foi uma ordem que morreu por cancelar/expirar.
        // Estado PRIMEIRO, anúncio depois — uma escrita falhada não pode repetir o anúncio (anti-loop).
        const event: SignalEvent = st.announced ? 'closed' : 'discarded'
        const { error: upErr } = await admin
          .from('mtmcopy_signal_log')
          .update({ status: logStatusFor(event), detail: `${event} (monitor T2T)` })
          .eq('id', row.id)
        if (upErr) {
          console.warn('[t2t-monitor] update de estado falhou (não anuncia):', row.id, upErr.message)
          continue
        }
        // Fecho real (a posição existia): o cabeçalho tem de trazer pips e percentagem. O preço
        // de saída não vem da corretora neste caminho — a posição simplesmente desapareceu — por
        // isso usamos a cotação do momento, que é o valor a que ela acabou de fechar.
        let exitPx: number | null = null
        if (event === 'closed') {
          const keyF = `${accountId}|${row.symbol}`
          if (!priceCache.has(keyF)) priceCache.set(keyF, await getMarketPrice(accountId, row.symbol))
          exitPx = priceCache.get(keyF) ?? null
        }
        await publishEvent(row, event, {
          ...evCtx,
          price: exitPx,
          reason: st.announced ? null : 'A ordem foi cancelada ou expirou antes de encher.',
        })
        delete state[row.id]
        actions.push(`${event} ${row.symbol}`)
        continue
      }

      managed++
      const key = `${accountId}|${row.symbol}`
      if (!priceCache.has(key)) priceCache.set(key, await getMarketPrice(accountId, row.symbol))
      const price = priceCache.get(key) ?? null
      if (price == null || !(price > 0)) continue

      const entry = row.entry ?? pos.openPrice ?? null
      const sl = row.sl ?? null
      // Trailing por FONTE: o Forex Swings (James) fica de fora — é swing de vários dias e um
      // stop a seguir o preço tirava-o da trade no primeiro recuo normal.
      const podeTrailing = t2tUsaTrailing(row.channel_key, row.raw_message)
      const tps = tpLevels(row)
      const pip = pipSizeFor(row.symbol)

      // ── ENTRY HIT: 1ª vez que vemos a posição preenchida → confirma no chat.
      if (!st.announced) {
        st.announced = true
        await publishEvent(row, 'entry_hit', { ...evCtx, entry: null, price: entry })
        actions.push(`entry_hit ${row.symbol}`)
      }

      // ── PARCIAIS por PREÇO: fecha a % do split ao tocar cada TP.
      const nextLevel = st.exitsDone + 1
      const nextTp = tps[nextLevel - 1]
      const reached = nextTp != null && (dir === 'buy' ? price >= nextTp : price <= nextTp)
      if (reached && pos.volume && pos.volume > 0) {
        const pct = SPLIT[nextLevel - 1] ?? 100
        const isLast = nextLevel >= tps.length
        const vol = isLast ? pos.volume : roundLot((row.lot ?? pos.volume) * (pct / 100))
        const closeAll = isLast || vol >= pos.volume
        const r = await closePositionById(accountId, pos.id, closeAll ? undefined : vol)
        if (r.success) {
          st.exitsDone = nextLevel
          actions.push(`exit${nextLevel} ${row.symbol}`)
          // Desfecho em pips + % de flutuação no anúncio (pedido Ricardo 2026-08-20).
          let outcomeTxt: string | null = null
          if (entry && entry > 0 && nextTp != null) {
            const move = dir === 'buy' ? nextTp - entry : entry - nextTp
            const pips = Math.round((move / pip) * 10) / 10
            const pctMove = Math.round(((move / entry) * 100) * 100) / 100
            outcomeTxt = `${pips >= 0 ? '+' : ''}${pips} pips (${pctMove >= 0 ? '+' : ''}${pctMove}%).`
          }
          await publishEvent(row, closeAll ? 'target_final' : 'partial', { ...evCtx, level: nextLevel, pct, price, reason: outcomeTxt })
          if (closeAll) {
            await admin.from('mtmcopy_signal_log').update({ status: 'closed', detail: `Fechada no alvo ${nextLevel}` }).eq('id', row.id)
            delete state[row.id]
            continue
          }
          // Exit 1 → BE (+buffer) + trailing ancorado ao risco.
          if (nextLevel === 1 && entry && !st.trailing) {
            // BREAK-EVEN PARA TODAS AS FONTES, incluindo o James: proteger o risco depois do
            // primeiro alvo não é trailing, é higiene. O que o James não leva é o RATCHET
            // (bloco abaixo), que num swing de vários dias o tirava da trade no primeiro recuo.
            //
            // E o trailing, quando entra, é do MOTOR e não da corretora: nem todos os brokers o
            // honram, e o nosso passo é de 1 segundo — seguimos o preço mais de perto que eles.
            await modifyPositionSlTp(accountId, pos.id, beTarget(entry, dir, row.symbol), undefined,
              undefined, row.symbol)
            st.beDone = true
            st.trailing = podeTrailing
            st.trailSl = beTarget(entry, dir, row.symbol)
            await publishEvent(row, 'break_even', evCtx)
            if (podeTrailing) await publishEvent(row, 'trailing', evCtx)
            actions.push(`${podeTrailing ? 'be_trail' : 'be'} ${row.symbol}`)
          }
          state[row.id] = st
          continue
        }
      }

      // ── BE PROTETOR CEDO (antes do Exit 1): lucro ≥ ratio × risco → SL para entrada +buffer.
      if (!st.beDone && st.exitsDone === 0 && entry && sl) {
        const riskDist = Math.abs(entry - sl)
        const profit = dir === 'buy' ? price - entry : entry - price
        if (riskDist > 0 && profit >= EARLY_BE_RATIO * riskDist) {
          const r = await modifyPositionSlTp(accountId, pos.id, beTarget(entry, dir, row.symbol), undefined, undefined, row.symbol)
          if (r.success) {
            st.beDone = true
            actions.push(`early_be ${row.symbol}`)
            await publishEvent(row, 'break_even', evCtx)
          }
        }
      }
      // ── TRAILING PELO MOTOR (ratchet a cada passagem) ────────────────────────────
      // Depois de o stop estar protegido, sobe-o para preço − distância a cada passagem e NUNCA
      // o desce. É isto que transforma o trailing stop em trailing de LUCRO: o que já foi ganho
      // fica travado, e num movimento rápido o stop vai atrás do preço em vez de esperar pelo
      // alvo. O piso é sempre o break-even — nunca volta a ficar abaixo da entrada.
      if (podeTrailing && st.beDone && entry && sl) {
        const riskPips = Math.max(1, Math.abs(entry - sl) / pip)
        const distancia = riskPips * pip
        const piso = beTarget(entry, dir, row.symbol)
        const candidato = dir === 'buy' ? price - distancia : price + distancia
        const alvo = dir === 'buy' ? Math.max(candidato, piso) : Math.min(candidato, piso)
        const atual = st.trailSl ?? pos.stopLoss ?? null
        const melhora = atual == null
          ? true
          : dir === 'buy' ? alvo > atual + pip * 0.5 : alvo < atual - pip * 0.5
        if (melhora) {
          const r = await modifyPositionSlTp(accountId, pos.id, alvo, pos.takeProfit, undefined, row.symbol)
          if (r.success) {
            st.trailSl = alvo
            st.trailing = true
            actions.push(`trail ${row.symbol} → ${alvo.toFixed(2)}`)
          }
        }
      }

      state[row.id] = st
    } catch (e) {
      console.warn('[t2t-monitor] erro na linha', row.id, e instanceof Error ? e.message : String(e))
    }
  }

  await saveState(state)
  if (ilegiveis) actions.push(`${ilegiveis} conta(s) ilegível(eis) — nada concluído sobre elas`)
  return { ran: true, managed, actions, ilegiveis }
}

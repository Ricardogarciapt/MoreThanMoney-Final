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
import { canalPublicadoPelaMestre } from '@/lib/mestres/servidor/canais-publicados'
import { idsDeLigacao } from './ids-de-ligacao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getExecSwitches } from './exec-switches'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import {
  readOpenPositions,
  readPendingOrders,
  cancelPendingOrdersForSymbol,
  modifyPositionSlTp,
  closePositionById,
  type MetaApiPosition,
  type MetaApiPendingOrder,
} from './metaapi'
import { lifecycleMessage, logStatusFor, type SignalEvent } from './signal-lifecycle'
import { precoParaMonitor } from './metaapi-snapshot'
import { filtrarContasExistentes } from './metaapi-inexistentes'
import { t2tUsaTrailing } from './t2t-source'
import { podeSaltarLeitura } from './market-hours'
import { configT2TDoAmbiente, gerirPosicaoT2T, tpLevels, type EstadoT2T, type LinhaT2T } from '@/lib/gestao-real/t2t'
import { contaGeridaPeloMotorReal } from '@/lib/gestao-real/contas-live'
import { estadoMudou, fotografiaEstado } from './estado-monitor'

const STATE_KEY = 't2t_monitor_state'
/** Parciais 50/30/20, BE (+T2T_BE_BUFFER_PIPS, 5) e BE cedo (T2T_EARLY_BE_RATIO, 0.4): lib/gestao-real/t2t.ts */
const CFG_T2T = configT2TDoAmbiente()
type RowState = EstadoT2T

/** Horas que uma ordem pendente T2T pode esperar antes de ser considerada ideia morta. */
const PENDING_MAX_HOURS = Number(process.env.T2T_PENDING_MAX_HOURS) || 24
type StateMap = Record<string, RowState>

type LogRow = LinhaT2T

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
  // Canal publicado pela mestre: a gestão da posição do cliente continua, o anúncio não (é da mestre).
  if (await canalPublicadoPelaMestre(slug)) return
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
   *
   * O canal `ideias-e-sinais` FECHOU a 04/10/2026 (fonte e grupo saíram); a entrada fica só para
   * qualquer posição T2T antiga que ainda esteja aberta com esse channel_key — não é catálogo vivo.
   */
  const SEM_GESTAO = new Set(['ideias-e-sinais'])
  const geríveis = rows.filter((r) => !SEM_GESTAO.has(String((r as LogRow).channel_key ?? '')))
  if (geríveis.length !== rows.length) {
    actions.push(`${rows.length - geríveis.length} posições set & forget — só acompanhadas`)
  }
  rows = geríveis as typeof rows

  // Conta MetaApi de cada conexão.
  // Linhas sem ligação ficam de fora: um null no `.in()` recusava o pedido inteiro (erro de uuid).
  const connIds = idsDeLigacao(rows as ReadonlyArray<{ connection_id?: unknown }>)
  // Ligações desligadas e contas que não existem na MetaApi ficam de fora (15/09: pedidos a contas
  // apagadas estrangularam o token inteiro). Sem conta = null = a linha não se lê nesta passagem.
  const { data: conns } = await admin
    .from('mtmcopy_connections')
    .select('id, metaapi_account_id')
    .in('id', connIds)
    .neq('mt5_status', 'disconnected')
  const existentes = new Set(await filtrarContasExistentes((conns ?? []).map((c) => c.metaapi_account_id as string | null)))
  const accById = new Map(
    (conns ?? []).map((c) => {
      const acc = (c.metaapi_account_id as string | null) ?? null
      return [c.id as string, acc && existentes.has(acc) ? acc : null]
    }),
  )

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
  const estadoLido = fotografiaEstado(state)
  let managed = 0

  /**
   * MERCADO FECHADO (fim de semana): contas em que TODAS as linhas são não-cripto não se leem —
   * nem posições, nem pendentes, nem preços. As linhas ficam como estão (nada se conclui, nada se
   * anuncia). Uma única linha cripto na conta mantém a conta inteira a ser lida.
   * Interruptor SALTAR_LEITURAS_MERCADO_FECHADO (ver market-hours.ts).
   */
  const simbolosPorConta = new Map<string, Array<string | null>>()
  for (const raw of rows) {
    const r = raw as LogRow
    const acc = accById.get(r.connection_id)
    if (!acc) continue
    if (!simbolosPorConta.has(acc)) simbolosPorConta.set(acc, [])
    simbolosPorConta.get(acc)!.push(r.symbol)
  }
  const contasSaltadas = new Set(
    [...simbolosPorConta].filter(([, simbolos]) => podeSaltarLeitura(simbolos)).map(([acc]) => acc),
  )
  if (contasSaltadas.size) actions.push(`${contasSaltadas.size} conta(s) sem cripto com o mercado fechado — leitura saltada`)

  for (const raw of rows) {
    const row = raw as LogRow
    const accountId = accById.get(row.connection_id)
    if (!accountId || !row.symbol || !row.broker_position_id) continue
    if (contasSaltadas.has(accountId)) continue
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
        if (!priceCache.has(key0)) priceCache.set(key0, await precoParaMonitor(accountId, row.symbol))
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
          if (!priceCache.has(keyF)) priceCache.set(keyF, await precoParaMonitor(accountId, row.symbol))
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
      // CONTA GERIDA PELO MOTOR EM TEMPO REAL (live para T2T nesta conta, motor vivo): a decisão por
      // preço é dele. Enquanto o T2T não estiver em TIPOS_LIVE_SUPORTADOS este guarda devolve sempre
      // false e nada muda.
      if (await contaGeridaPeloMotorReal(accountId, 't2t')) continue
      const key = `${accountId}|${row.symbol}`
      if (!priceCache.has(key)) priceCache.set(key, await precoParaMonitor(accountId, row.symbol))
      const price = priceCache.get(key) ?? null
      if (price == null || !(price > 0)) continue

      // Trailing por FONTE: o Forex Swings (James) fica de fora — é swing de vários dias e um
      // stop a seguir o preço tirava-o da trade no primeiro recuo normal.
      // As regras (parciais, BE, ratchet) vivem em lib/gestao-real/t2t.ts — a mesma fonte do motor
      // em tempo real do VPS.
      const simbolo = row.symbol
      const fim = await gerirPosicaoT2T(
        { ...row, symbol: simbolo },
        pos,
        price,
        st,
        { ...CFG_T2T, podeTrailing: t2tUsaTrailing(row.channel_key, row.raw_message) },
        {
          fechar: (volume) => closePositionById(accountId, pos.id, volume),
          modificar: (sl, tp) => modifyPositionSlTp(accountId, pos.id, sl, tp, undefined, simbolo),
          publicar: async (event, ctx) => { await publishEvent(row, event, ctx) },
          encerrar: async (nivel) => {
            await admin.from('mtmcopy_signal_log').update({ status: 'closed', detail: `Fechada no alvo ${nivel}` }).eq('id', row.id)
          },
        },
        actions,
      )
      if (fim === 'apagar') {
        delete state[row.id]
        continue
      }

      state[row.id] = st
    } catch (e) {
      console.warn('[t2t-monitor] erro na linha', row.id, e instanceof Error ? e.message : String(e))
    }
  }

  // Só grava se a passagem mudou alguma coisa (ver estado-monitor.ts).
  if (estadoMudou(estadoLido, state)) await saveState(state)
  if (ilegiveis) actions.push(`${ilegiveis} conta(s) ilegível(eis) — nada concluído sobre elas`)
  return { ran: true, managed, actions, ilegiveis }
}

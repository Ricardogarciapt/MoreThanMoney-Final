import { estadoAposFalha } from './falha-transitoria'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isPremiumTp1HitConfirmed } from './channel-context'
import {
  buildPremiumSingleOrder,
  claimSignalOnce,
  releaseSignalClaim,
  findPremiumSinglePosition,
  scaleLotForSmallCapital,
  shouldSkipDuplicatePremiumEntry,
} from './premium-single'
import { formatTrailingDistance, riskPipsFromEntrySl, tradeIdeasDynamicTrailing } from './pip-points'
import {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_SENSEI_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  SENSEI_PROVIDER_ACCOUNT_ID,
  senseiPronto, mesmaConta,
} from './provider-constants'
import { connectionCopyMethod, prefersDirectExecution } from './copy-limits'
import { direitoMtmAuto } from '@/lib/entitlements'
import { chatMatchesAllowlist, connectionMatchesChannel, connectionMatchesSignalSource } from './sources'
import {
  getActiveConnections,
  getCopyConnections,
  logMtmcopySignal,
  markConnectionStatus,
  hasRecentDuplicate,
  hasRecentProviderDuplicate,
  countExecutedToday,
} from './db'
import { computeLotSize, getLotSizingSkipReason, signalForRiskSizing } from './lot-sizing'
import { symbolMatchesCanonical } from './symbol-resolver'
import { channelSymbolSkipReason } from './signal-rules'
import {
  fetchLotSizingContext,
  getAccountSnapshot,
  getRiskTickContext,
  getSymbolSpecification,
  isMetaApiConfigured,
  listOpenPositions,
  modifyPositionSlTp,
  placeOrdersSequential,
  type OrderResult,
} from './metaapi'
import { isMarketOpen } from './market-hours'
import { isCopyFactoryEnabled } from './copyfactory'
import {
  openT2TRowsForManagement,
  reconcileT2TPositionsClosed,
  type OpenT2TPosition,
} from './t2t-management'
import type { MtmcopyChannelKey } from './channel-context'
import { resolveChannelFromChat, shouldIgnoreChannelMessage } from './channel-context'
import { hasMtmProviderConfigured, type MtmChannelProvider } from './provider-accounts'
import {
  executionProfileToConnectionFields,
  formatExecutionSummary,
  getProviderExecutionProfile,
  SENSEI_PROVIDER_EXECUTION,
} from './provider-execution'
import { resolveMtmProvidersForSignal, resolveMtmProviderForStrategyId } from './provider-resolution'
import {
  CANONICAL_SENSEI_STRATEGY_ID,
  CANONICAL_TRADE_IDEAS_STRATEGY_ID,
  CANONICAL_GOLDKILLER_STRATEGY_ID,
  CANONICAL_GOLDKILLER_ACCOUNT_ID,
} from './provider-constants'
import {
  SLUG_GOLDKILLER,
  SLUG_SENSEI,
  carregarContasDeEstrategia,
  contaDaEstrategiaEmCache,
  slugDaConta,
} from './contas-provider-estrategia'
import {
  applyManagementToAccount,
  applyTrailingToLatestPosition,
  trailingDistanceForConnection,
  trailingDistanceForManagement,
  trailingPointsForConnection,
} from './position-management'
import { applyPremiumManagement, classifyPremiumMessage } from './premium-management-exec'
import { usesPriceMonitor } from './exit-engine'
import { getPremiumZoneConfig, zoneEntryDecision } from './premium-zone-config'
import { buildTelegramMessageContext } from './reply-context'
import {
  looksLikeManagementOrReplyInstruction,
  parseManagementUpdate,
  parseSignal,
} from './signal-parser'
import { formatExecutionDetail, logProviderSignalEvent } from './signal-log'
import {
  applyValidationToSignal,
  formatAiValidationDetail,
  isOfficialMtmTelegramFormat,
  shouldExecuteSignal,
  validateSignalWithAi,
  type AiSignalValidation,
} from './signal-ai-validator'
import type { MTMcopierConnection } from './types'
import type { OrderRequest } from './metaapi'
import {
  applySymbolFromProfile,
  getAiMinConfidence,
  isWithinTradingSchedule,
  mtCommentForProfile,
  resolveLotForSymbol,
  resolveSlTpForSignal,
  shouldExecuteForProfile,
  shouldSkipSymbolForProfile,
} from './provider-profile-apply'

/**
 * Premium é um provider de confiança e estruturado: executa pela validação LOCAL sem
 * esperar pelo LLM (corta ~0.5–1.2s → menos slippage). As mensagens de gestão (HIT TP,
 * Trade Active…) são filtradas antes deste ponto. Reversível: MTMCOPY_PREMIUM_FAST_EXEC=false.
 */
const PREMIUM_FAST_EXEC = process.env.MTMCOPY_PREMIUM_FAST_EXEC !== 'false'

export interface TelegramMessage {
  message_id?: number
  text?: string
  caption?: string
  /** Hora ORIGINAL de envio (Unix s). Em mensagens editadas mantém-se a original. */
  date?: number
  /** Hora da edição (Unix s) — NÃO usar para o guard de gestão (ver processManagementUpdate). */
  edit_date?: number
  reply_to_message?: {
    message_id?: number
    text?: string
    caption?: string
  }
  chat?: { id?: number; username?: string; title?: string; type?: string }
}

async function buildProviderConnection(
  channel: MtmcopyChannelKey,
  routeExecution?: import('./signal-sources-config').ProviderExecutionProfile | null,
): Promise<MTMcopierConnection> {
  const execution = await getProviderExecutionProfile(channel, routeExecution)
  return {
    id: 'mtm-provider',
    user_id: 'mtm-provider',
    telegram_channel: null,
    telegram_status: 'connected',
    mt5_login_last4: null,
    mt5_server: null,
    mt5_status: 'connected',
    ...executionProfileToConnectionFields(execution),
    is_active: true,
    last_signal_at: null,
    last_error: null,
  }
}

function buildOrderRequest(
  conn: Pick<
    MTMcopierConnection,
    'copy_sl' | 'copy_tp' | 'reverse_signals' | 'auto_trailing_stop' | 'trailing_stop_points'
  >,
  accountId: string,
  signal: NonNullable<ReturnType<typeof parseSignal>>,
  lot: number,
  comment: string,
): OrderRequest {
  const direction = conn.reverse_signals
    ? signal.direction === 'buy'
      ? 'sell'
      : 'buy'
    : signal.direction!

  return {
    accountId,
    symbol: signal.symbol!,
    direction,
    volume: lot,
    orderType: signal.orderType ?? 'market',
    openPrice: signal.entry,
    stopLoss: conn.copy_sl ? signal.sl : null,
    takeProfit: conn.copy_tp ? (signal.tp[0] ?? null) : null,
    comment,
    // Trailing por canal/perna (Premium: trail nas pernas 2/3 só no HIT TP1)
    trailingStop: null,
  }
}

/** Aborta a colocação de ordem se a MetaAPI pendurar além de `ms` → converte um hang
 *  (que mataria a função Vercel sem logar) num erro apanhável que é logado como 'error'. */
function withOrderTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout ${ms}ms ao colocar ordem (${label}) — MetaAPI não respondeu`)),
        ms,
      ),
    ),
  ])
}

/** Um timeout/falha de rede não diz que a ordem não foi — só que não veio resposta. */
export function falhaTransitoria(erro: string | undefined): boolean {
  if (!erro) return false
  return /timeout|não respondeu|nao respondeu|econn|socket|network|fetch failed|502|503|504|sem resposta/i.test(
    erro,
  )
}

/**
 * Procura na conta uma ordem/posição que corresponda ao pedido e seja recente.
 *
 * A MetaAPI dá timeout com a ordem já colocada mais vezes do que se pensa. Sem esta leitura, uma
 * segunda tentativa abria a MESMA trade duas vezes na conta mestre — e, por CopyFactory, em toda
 * a gente atrás dela.
 */
async function ordemJaEstaNaConta(
  accountId: string,
  req: { symbol: string; direction: 'buy' | 'sell' },
  desde: number,
): Promise<boolean> {
  const { readOpenPositions, readPendingOrders } = await import('./metaapi')
  const recente = (t?: string): boolean => {
    if (!t) return true // sem hora → assume recente; duplicar é pior do que perder
    const ms = Date.parse(t)
    return !Number.isFinite(ms) || ms >= desde - 60_000
  }
  const mesmoLado = (tipo: string): boolean =>
    req.direction === 'buy' ? /BUY/i.test(tipo) : /SELL/i.test(tipo)
  const mesmoSimbolo = (sym: string): boolean =>
    sym.toUpperCase().startsWith(req.symbol.toUpperCase().slice(0, 6))

  const posicoes = await readOpenPositions(accountId)
  if (posicoes?.some((p) => mesmoSimbolo(p.symbol) && mesmoLado(p.type) && recente(p.time))) return true
  const ordens = await readPendingOrders(accountId)
  if (ordens?.some((o) => mesmoSimbolo(o.symbol) && mesmoLado(o.type) && recente(o.time ?? o.brokerTime)))
    return true
  // Leitura falhada (null) devolve false: quem chama volta a tentar só se a falha foi transitória,
  // e uma leitura impossível costuma vir com a conta indisponível — repetir não piora nada.
  return false
}

/**
 * Coloca a ordem da conta MESTRE com uma segunda tentativa.
 *
 * A 2026-08-25 o primeiro sinal de Nova Iorque («Gold Buy Zone 4615 - 4610») morreu num
 * `Timeout 20000ms ao colocar ordem`: uma tentativa, sem rede de segurança, e o Premium não abriu
 * para ninguém. Repetir às cegas era pior — por isso a retentativa só acontece depois de confirmar
 * na conta que nada lá ficou.
 */
async function colocarOrdemDoProvedor(
  accountId: string,
  req: OrderRequest,
  label: string,
): Promise<OrderResult> {
  const tentar = async (): Promise<OrderResult> => {
    try {
      const [r] = await withOrderTimeout(placeOrdersSequential(accountId, [req]), 20_000, label)
      return r ?? { success: false, error: 'Sem resposta MetaAPI' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  const inicio = Date.now()
  const primeira = await tentar()
  if (primeira.success || !falhaTransitoria(primeira.error)) return primeira

  if (await ordemJaEstaNaConta(accountId, req, inicio)) {
    console.log(`[mtmcopy] ${label}: timeout mas a ordem está na conta — não repito`)
    return { success: true, brokerSymbol: req.symbol }
  }

  console.log(`[mtmcopy] ${label}: ${primeira.error} — nada na conta, segunda tentativa`)
  const segunda = await tentar()
  if (segunda.success) return segunda
  return { ...segunda, error: `${primeira.error} · 2ª tentativa: ${segunda.error}` }
}

/** Subscritores elegíveis para log/estado — nunca expandir a todas as contas CopyFactory. */
async function resolveLogTargets(subscribers: MTMcopierConnection[]): Promise<MTMcopierConnection[]> {
  return subscribers
}

async function filterEligibleSubscribers(
  connections: MTMcopierConnection[],
  channel: MtmcopyChannelKey,
): Promise<MTMcopierConnection[]> {
  const candidates = connections.filter(
    (conn) => conn.is_active && connectionMatchesChannel(conn, channel),
  )
  if (!candidates.length) return []

  // Fase 1: a cópia só corre para quem tem direito ao MTM Auto (regra única direito_mtm_auto —
  // admin, Premium/VIP, subscritor do MTM Auto ou MTM Copy legado pago e datado). Uma pergunta
  // por utilizador, não por ligação.
  const userIds = [...new Set(candidates.map((c) => c.user_id))]
  const direitos = new Map<string, boolean>()
  await Promise.all(
    userIds.map(async (id) => {
      try {
        direitos.set(id, (await direitoMtmAuto(id)).tem)
      } catch {
        direitos.set(id, false) // na dúvida, não se abre ordem na conta de ninguém
      }
    }),
  )
  const eligible = candidates.filter((conn) => direitos.get(conn.user_id) === true)

  return eligible
}

/** Métodos 1 e 2 — execução directa MetaAPI na conta do utilizador (parser → MT5). */
function isDirectExecutionSubscriber(conn: MTMcopierConnection): boolean {
  return prefersDirectExecution(conn)
}

async function resolveMatchedSubscribers(
  message: TelegramMessage,
  channel: MtmcopyChannelKey,
): Promise<{ matchedConnections: MTMcopierConnection[]; subscribers: MTMcopierConnection[] }> {
  const allConnections = await getCopyConnections()
  const isTelegramCopyTarget = (c: MTMcopierConnection) =>
    (c.account_role ?? 'slave') !== 'master' && (c.sender_mode ?? 'telegram') !== 'master_account'

  const matched = await Promise.all(
    allConnections.map(async (c) => ({
      c,
      ok: await connectionMatchesSignalSource(c, message.chat!),
    })),
  )
  const matchedConnections = matched
    .filter((m) => m.ok && isTelegramCopyTarget(m.c) && connectionMatchesChannel(m.c, channel))
    .map((m) => m.c)
  const subscribers = await filterEligibleSubscribers(matchedConnections, channel)
  return { matchedConnections, subscribers }
}

export async function processMtmcopyTelegramMessage(message: TelegramMessage) {
  if (!message.chat) return

  const channel = resolveChannelFromChat(message.chat)
  const ctx = await buildTelegramMessageContext(message, channel)
  const text = ctx.text
  if (!text) return

  if (!isMetaApiConfigured()) {
    console.warn('[mtmcopy] METAAPI_TOKEN em falta — sinais não serão executados no MT5')
  }

  const chatAllowed = await chatMatchesAllowlist(message.chat)
  if (!chatAllowed) {
    console.log(
      `[mtmcopy] chat ignorado (não está nos canais activos): id=${message.chat.id} title=${message.chat.title ?? ''}`,
    )
    return
  }

  if (shouldIgnoreChannelMessage(text)) {
    console.log(`[mtmcopy] mensagem ignorada (${channel}): ${text.slice(0, 80)}`)
    return
  }

  const mtmProvidersPreview = await resolveMtmProvidersForSignal(channel, message.chat?.id)
  const mtmProvider = mtmProvidersPreview[0] ?? null

  if (looksLikeManagementOrReplyInstruction(text, channel, ctx)) {
    const { matchedConnections, subscribers } = await resolveMatchedSubscribers(message, channel)
    const management = parseManagementUpdate(text, channel, ctx.parentText)
    if (management) {
      const targets = subscribers.length ? subscribers : matchedConnections
      if (targets.length || mtmProvider) {
        await processManagementUpdate(
          targets,
          management,
          text,
          message.message_id,
          channel,
          ctx,
          message.date ? message.date * 1000 : undefined,
        )
      }
    } else {
      await logProviderSignalEvent({
        channel,
        provider: mtmProvider,
        raw: text,
        telegramMessageId: message.message_id,
        status: 'skipped',
        detail: ctx.isReply
          ? 'Instrução em resposta não reconhecida'
          : 'Gestão não reconhecida pelo parser',
      })
    }
    return
  }

  const signal = parseSignal(text)
  if (!signal?.symbol || !signal.direction) {
    console.log('[mtmcopy] mensagem sem sinal estruturado:', text.slice(0, 120))
    await logProviderSignalEvent({
      channel,
      provider: mtmProvider,
      raw: text,
      telegramMessageId: message.message_id,
      status: 'skipped',
      detail: 'Sinal não reconhecido pelo parser',
    })
    return
  }

  // EDIÇÃO de SL pelo canal (Ricardo): quando o Premium EDITA a mensagem para mover o SL, e já
  // existe posição aberta desse símbolo, corrige o SL na conta-mestre (o CopyFactory replica aos
  // copiadores). Detetado por `edit_date`. Se não há posição aberta, segue o fluxo normal.
  if (message.edit_date && channel === 'premium-signals' && signal.symbol && signal.sl != null && signal.sl > 0) {
    try {
      const positions = await listOpenPositions(CANONICAL_PREMIUM_ACCOUNT_ID)
      const pos = findPremiumSinglePosition(positions, signal.symbol)
      if (pos?.id) {
        const r = await modifyPositionSlTp(CANONICAL_PREMIUM_ACCOUNT_ID, pos.id, signal.sl, pos.takeProfit ?? undefined)
        await logProviderSignalEvent({
          channel,
          provider: mtmProvider,
          raw: text,
          telegramMessageId: message.message_id,
          status: r.success ? 'executed' : 'error',
          detail: r.success
            ? `Edição do canal: SL ${signal.symbol} → ${signal.sl} aplicado na conta-mestre (CopyFactory replica)`
            : `Edição do canal: falha ao mover SL (${r.error ?? '?'})`,
        })
        return
      }
      // sem posição aberta desse símbolo → não é edição de trade viva; segue o fluxo normal
    } catch (e) {
      console.error('[mtmcopy] edição de SL falhou:', e)
    }
  }

  const subscribersPromise = resolveMatchedSubscribers(message, channel)
  const primaryProfile = await getProviderExecutionProfile(
    channel,
    mtmProvidersPreview[0]?.execution,
  )
  const officialFormat = isOfficialMtmTelegramFormat(text)
  const validation = await validateSignalWithAi(text, signal, {
    skipAi: primaryProfile.ai_validation_enabled === false,
    minConfidence: getAiMinConfidence(primaryProfile),
    // Premium: fast-path (sem esperar pelo LLM) quando o parser local valida o sinal.
    forceFastPath: officialFormat || (PREMIUM_FAST_EXEC && channel === 'premium-signals'),
    channel,
    strategyPrompt:
      channel === 'premium-signals'
        ? mtmProvidersPreview[0]?.aiStrategyPrompt ?? null
        : null,
  })
  const enriched = applyValidationToSignal(signal, validation)
  const aiDetail = formatAiValidationDetail(validation)

  console.log(
    `[mtmcopy] ${enriched.symbol} ${enriched.direction} · ${channel} · ${aiDetail} · ${validation.latencyMs.toFixed(0)}ms`,
  )

  const { matchedConnections, subscribers } = await subscribersPromise
  const logTargets = subscribers.length ? subscribers : matchedConnections
  const directTargets = subscribers.filter(
    (c) => connectionCopyMethod(c) === 'telegram_group' && isDirectExecutionSubscriber(c),
  )
  const canExecute = shouldExecuteSignal(validation)

  const method2Task =
    mtmProvidersPreview.length > 0
      ? Promise.all(
          mtmProvidersPreview.map(async (prov) => {
            const routeProfile = await getProviderExecutionProfile(channel, prov.execution)
            if (!canExecute || !shouldExecuteForProfile(validation, routeProfile)) {
              const minPct = Math.round(getAiMinConfidence(routeProfile) * 100)
              await logProviderSignalEvent({
                channel,
                provider: prov,
                signal: enriched,
                raw: text,
                telegramMessageId: message.message_id,
                status: 'skipped',
                detail: canExecute
                  ? `${aiDetail} · confiança < ${minPct}%`
                  : `${aiDetail} · validação abaixo do mínimo`,
              })
              return
            }
            await executeViaMtmProvider(
              logTargets,
              enriched,
              text,
              message.message_id,
              prov,
              channel,
              validation,
            )
          }),
        )
      : Promise.resolve()

  const directTask =
    canExecute && directTargets.length > 0
      ? Promise.all(
          directTargets.map((conn) =>
            processSignalDirect(conn, enriched, text, message.message_id, validation, channel),
          ),
        )
      : Promise.resolve()

  await Promise.all([method2Task, directTask])

  if (!mtmProvidersPreview.length && !directTargets.length) {
    await logProviderSignalEvent({
      channel,
      provider: mtmProvider,
      signal: enriched,
      raw: text,
      telegramMessageId: message.message_id,
      status: 'skipped',
      detail: subscribers.length
        ? 'Subscribers activos usam CopyFactory/estratégia — aguardam conta provider'
        : 'Sem subscribers nem rota provider para este canal',
    })
  }
}

async function applyTrailingToCopyFactorySlaves(
  subscribers: MTMcopierConnection[],
  symbol: string,
) {
  await new Promise((r) => setTimeout(r, 5000))
  for (const conn of subscribers) {
    if (!conn.auto_trailing_stop || !conn.metaapi_account_id) continue
    const trailing = trailingDistanceForConnection(conn)
    if (!trailing) continue
    const trail = await applyTrailingToLatestPosition(conn.metaapi_account_id, symbol, trailing)
    if (!trail.success && trail.error) {
      console.warn(`[mtmcopy] trailing slave ${conn.user_id}: ${trail.error}`)
    }
  }
}

async function processManagementUpdate(
  subscribers: MTMcopierConnection[],
  management: NonNullable<ReturnType<typeof parseManagementUpdate>>,
  raw: string,
  telegramMessageId?: number,
  channel: MtmcopyChannelKey = 'unknown',
  ctx?: { isReply?: boolean; parentText?: string | null; parentMessageId?: number | null },
  /** Hora ORIGINAL da mensagem (ms). Gestão não atua em posições abertas DEPOIS disto. */
  messageTimeMs?: number,
) {
  const tgRef = telegramMessageId != null ? `tg:${telegramMessageId}` : ''
  const replyRef = ctx?.isReply && ctx.parentMessageId != null ? ` · reply tg:${ctx.parentMessageId}` : ''
  const trailingFromChannel = management.trailing
    ? management.trailing
    : management.trailingPips
      ? ({ mode: 'pips' as const, pips: management.trailingPips })
      : null

  if (
    channel === 'premium-signals' &&
    management.tpLevel === 1 &&
    isPremiumTp1HitConfirmed(raw)
  ) {
    const pseudoSignal = parseSignal(raw) ?? {
      symbol: management.symbol ?? 'XAUUSD',
      direction: 'buy' as const,
      entry: null,
      sl: null,
      tp: [],
      orderType: 'market' as const,
      raw,
    }
    const previewProviders = await resolveMtmProvidersForSignal(channel)
    const validation = await validateSignalWithAi(raw, pseudoSignal, {
      channel,
      strategyPrompt:
        channel === 'premium-signals'
          ? previewProviders[0]?.aiStrategyPrompt ?? null
          : null,
    })
    if (!shouldExecuteSignal(validation)) {
      await logProviderSignalEvent({
        channel,
        provider: previewProviders[0] ?? null,
        raw,
        telegramMessageId,
        status: 'skipped',
        detail: `${formatAiValidationDetail(validation)} · HIT TP1 não confirmado`,
        symbol: management.symbol,
      })
      return
    }
  }

  console.log(
    `[mtmcopy] gestão ${management.type}${management.symbol ? ' ' + management.symbol : ''}${management.tpLevel ? ` TP${management.tpLevel}` : ''}${ctx?.isReply ? ' (reply)' : ''} · ${channel} → ${subscribers.length} subscritor(es)`,
  )

  const mtmProviders = await resolveMtmProvidersForSignal(channel)
  const accountIds = new Set<string>()
  for (const p of mtmProviders) {
    accountIds.add(p.accountId)
  }
  for (const conn of subscribers) {
    if (conn.metaapi_account_id && prefersDirectExecution(conn)) {
      accountIds.add(conn.metaapi_account_id)
    }
  }

  // T2T: estende a gestão do mestre às contas Tap to Trade com posição aberta neste
  // canal+símbolo (se a estratégia está ativa no T2T). Mesma lógica por estratégia.
  let t2tPositions: OpenT2TPosition[] = []
  try {
    t2tPositions = await openT2TRowsForManagement(channel, management.symbol)
    for (const p of t2tPositions) accountIds.add(p.accountId)
    if (t2tPositions.length) {
      console.log(`[mtmcopy] gestão T2T: +${t2tPositions.length} posição(ões) Tap to Trade`)
    }
  } catch (e) {
    console.warn('[mtmcopy] T2T management resolve falhou:', e)
  }

  const managementOutcomes = new Map<
    string,
    { updated: number; closed: number; cancelled: number; errors: string[] }
  >()

  // Regra: se chega um CLOSE/EXIT do Premium e ainda existe uma entrada de zona PENDENTE
  // (nunca abriu por estar fora da zona), descarta-a — não esperar pela ativação. Corre UMA
  // vez por mensagem, antes do loop por conta (idempotente: só atua em status='pending').
  if (channel === 'premium-signals') {
    const closeKind = classifyPremiumMessage(raw)?.kind
    const isClose =
      closeKind === 'hit_all' ||
      closeKind === 'hit_tp1' ||
      closeKind === 'hit_tp2' ||
      closeKind === 'hit_tp3' ||
      closeKind === 'sl_hit' ||
      closeKind === 'trade_active_close_all' ||
      closeKind === 'trade_active_close_half'
    if (isClose) {
      try {
        const { cancelPremiumPendingOnClose } = await import('./premium-zone-monitor')
        const n = await cancelPremiumPendingOnClose(management.symbol ?? null, `close "${closeKind}" antes de entrar`)
        if (n > 0) {
          console.log(`[mtmcopy] Premium: ${n} entrada(s) de zona pendente(s) descartada(s) — ${closeKind}`)
        }
      } catch (e) {
        console.warn('[mtmcopy] cancelar pendente de zona falhou:', e)
      }
    }
  }

  for (const accountId of accountIds) {
    const providerMatch = mtmProviders.find((p) => p.accountId === accountId)
    const related = subscribers.filter(
      (c) =>
        c.metaapi_account_id === accountId ||
        (providerMatch && accountId === providerMatch.accountId),
    )
    const isProviderAccount = Boolean(providerMatch)
    const providerConn = isProviderAccount
      ? await buildProviderConnection(channel, providerMatch?.execution)
      : null
    const connTrailing = isProviderAccount && providerConn
      ? trailingDistanceForConnection(providerConn)
      : related.find((c) => c.auto_trailing_stop)
        ? trailingDistanceForConnection(related.find((c) => c.auto_trailing_stop)!)
        : null
    const trailing = trailingDistanceForManagement(management, trailingFromChannel ?? connTrailing)

    const mgmt =
      management.type === 'enable_trailing' && trailing
        ? management
        : management.type === 'enable_trailing'
          ? null
          : management

    if (!mgmt) continue

    // Monitor de preço Premium LIGADO = autoridade dos PARCIAIS POR TP (fecha 75/15/10 ao
    // preço). Só se saltam as mensagens de HIT TP (que o monitor já trata) para não fechar
    // a dobrar. Os overrides MANUAIS (Close all now / Close half / BE / SL) NÃO são
    // detetáveis por preço → passam sempre, senão uma saída manual com lucro falhava e a
    // trade podia reverter ao SL tendo pips de lucro no canal.
    if (channel === 'premium-signals') {
      const { getExecSwitches } = await import('./exec-switches')
      const sw = await getExecSwitches()
      if (sw.premium_price_monitor) {
        const pk = classifyPremiumMessage(raw)?.kind
        // Monitor LIGADO = AUTORIDADE ÚNICA das saídas (parciais 75/15/10 por preço + BE e
        // trailing SÓ depois do TP1). Saltam-se as mensagens que o monitor já trata por preço:
        // HIT TP E os BE/close prematuros do "trade active"/"breakeven" — que estavam a fechar
        // as trades no break-even ANTES do TP1 (0 parciais em 27 trades). Só o SL-hit real passa.
        const monitorOwns =
          pk === 'hit_tp1' ||
          pk === 'hit_tp2' ||
          pk === 'hit_tp3' ||
          pk === 'hit_all' ||
          pk === 'breakeven' ||
          pk === 'trade_active_close_all' ||
          pk === 'trade_active_close_half'
        if (monitorOwns) {
          console.log(`[mtmcopy] Premium: gestão por mensagem ignorada (monitor trata por preço) — ${pk}`)
          continue
        }
        console.log(`[mtmcopy] Premium: override aplicado apesar do monitor — ${pk ?? 'n/d'}`)
      }
    }

    // Premium: nova lógica de gestão (premium-management-plan/exec) — por PREÇO,
    // zona vantajosa, sem BE/trailing prematuros. Demais canais: caminho legado.
    const outcome =
      channel === 'premium-signals'
        ? await applyPremiumManagement(accountId, raw, ctx?.parentText ?? null, management.symbol, messageTimeMs)
        : await applyManagementToAccount(accountId, mgmt, trailing)
    managementOutcomes.set(accountId, outcome)
    const trailingLabel = trailing ? formatTrailingDistance(trailing) : '0'
    console.log(
      `[mtmcopy] gestão ${accountId}: ${outcome.updated} SL/trailing (${trailingLabel}), ${outcome.closed} fechadas, ${outcome.cancelled} ordens canceladas`,
    )

    if (providerMatch && accountId === providerMatch.accountId) {
      const slNote =
        management.sl != null
          ? ` · SL ${management.sl}`
          : management.slPoints != null
            ? ` · SL ${management.slPoints} pts`
            : ''
      await logProviderSignalEvent({
        channel,
        provider: providerMatch,
        raw,
        telegramMessageId,
        status: outcome.errors.length && !outcome.updated && !outcome.closed && !outcome.cancelled ? 'error' : 'executed',
        detail: `Gestão ${management.type}${management.symbol ? ` ${management.symbol}` : ''}${management.tpLevel ? ` TP${management.tpLevel}` : ''}${slNote}${replyRef}${outcome.cancelled ? ` · ${outcome.cancelled} ordens canceladas` : ''}`.trim(),
        symbol: management.symbol,
      })
    }
  }

  // T2T: marca como fechadas as posições Tap to Trade que a gestão do mestre encerrou
  if (t2tPositions.length) {
    await reconcileT2TPositionsClosed(t2tPositions).catch((e) =>
      console.warn('[mtmcopy] T2T reconcile falhou:', e),
    )
  }

  // T2T em contas TradeLocker: a mesma gestão, aplicada pela API TradeLocker.
  try {
    const { gestaoT2TTradeLocker } = await import('@/lib/tradelocker/mtmcopy-branch')
    await gestaoT2TTradeLocker(channel, management)
  } catch (e) {
    console.warn('[mtmcopy] gestão T2T TradeLocker falhou:', e)
  }

  for (const conn of subscribers) {
    // MTM Funded (074): nunca pela MetaApi/TradeLocker — a gestão é do motor simulado.
    if (conn.mt5_platform === 'mtmfunded') continue
    if (conn.mt5_platform === 'tradelocker') {
      if (prefersDirectExecution(conn) && conn.is_active) {
        const { gestaoSubscritorTradeLocker } = await import('@/lib/tradelocker/mtmcopy-branch')
        await gestaoSubscritorTradeLocker({ conn, management, raw, refs: `${replyRef} ${tgRef}`.trim() })
      }
      continue
    }
    const trailingNote = management.trailing
      ? ` · trailing ${formatTrailingDistance(management.trailing)}`
      : management.trailingPips
        ? ` · trailing ${management.trailingPips} pips`
        : ''

    let status: 'received' | 'executed' | 'skipped' | 'error' = 'received'
    let detailSuffix = ''

    if (!conn.metaapi_account_id) {
      status = 'skipped'
      detailSuffix = ' · conta MT5 não ligada'
    } else if (conn.mt5_status === 'error') {
      status = 'skipped'
      detailSuffix = ` · ${conn.last_error ?? 'conta MT5 em erro'}`
    } else if (!prefersDirectExecution(conn)) {
      status = 'received'
      detailSuffix = ' · via CopyFactory (replica do provider/mestre)'
    } else {
      const outcome = managementOutcomes.get(conn.metaapi_account_id)
      if (!outcome) {
        status = 'skipped'
        detailSuffix = ' · gestão não aplicada nesta conta'
      } else if (outcome.errors.length && !outcome.updated && !outcome.closed && !outcome.cancelled) {
        status = 'error'
        detailSuffix = ` · ${outcome.errors[0]}`
      } else if (outcome.updated || outcome.closed || outcome.cancelled) {
        status = 'executed'
        detailSuffix = ` · ${outcome.updated} SL/trail · ${outcome.closed} fechadas`
      }
    }

    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: management.symbol,
      direction: null,
      status,
      detail: `Gestão: ${management.type}${management.tpLevel ? ` TP${management.tpLevel}` : ''}${trailingNote}${detailSuffix}${replyRef} ${tgRef}`.trim(),
      raw_message: raw,
    })
    await markConnectionStatus(conn.id, {
      last_signal_at: new Date().toISOString(),
      // Uma falha NOSSA (timeout, quota, socket) não marca a conta do cliente — ver
      // `falha-transitoria.ts`. Antes marcava, e o painel escondia-lhe o saldo por causa disso.
      ...(status === 'error' && detailSuffix
        ? estadoAposFalha(detailSuffix.replace(/^ · /, ''))
        : status === 'executed'
          ? { mt5_status: 'connected', last_error: null }
          : {}),
    })
  }
}

function subscriberLogAfterProviderExecution(
  conn: MTMcopierConnection,
  opts: {
    anySuccess: boolean
    aiDetail: string
    providerTag: string
    orderLabel: string
    executionSummary: string
    trailingNote: string
    tgRef: string
    resultError?: string
  },
): {
  status: 'received' | 'error'
  detail: string
  connectionPatch: Record<string, unknown>
} {
  const {
    anySuccess,
    aiDetail,
    providerTag,
    orderLabel,
    executionSummary,
    trailingNote,
    tgRef,
    resultError,
  } = opts

  if (!anySuccess) {
    // CopyFactory: falha na conta provider não deve marcar o subscriber como erro MT5
    if (conn.copyfactory_subscribed && !prefersDirectExecution(conn)) {
      return {
        status: 'skipped',
        detail: `${aiDetail} · ${providerTag} mestre: ${resultError ?? 'erro'} (sem replica — conta subscriber intacta) ${tgRef}`.trim(),
        connectionPatch: {},
      }
    }
    return {
      status: 'error',
      detail: `${aiDetail} · ${providerTag} mestre: ${resultError ?? 'erro'} ${tgRef}`.trim(),
      connectionPatch: {
        last_error: resultError ?? 'Erro na conta mestre',
        mt5_status: 'error',
      },
    }
  }

  const base = `${aiDetail} · ${providerTag} mestre · ${orderLabel} · ${executionSummary}`
  if (conn.copyfactory_subscribed) {
    return {
      status: 'received',
      detail: `${base} · CopyFactory replica (confirma no MT5)${trailingNote} ${tgRef}`.trim(),
      connectionPatch: { last_error: null },
    }
  }
  if (prefersDirectExecution(conn)) {
    return {
      status: 'received',
      detail: `${base} · aguarda execução na tua conta${trailingNote} ${tgRef}`.trim(),
      connectionPatch: {},
    }
  }
  return {
    status: 'received',
    detail: `${base}${trailingNote} ${tgRef}`.trim(),
    connectionPatch: {},
  }
}

/** Sinal executado na conta MTM do canal; CopyFactory replica para slaves subscritos */
/**
 * Executa um sinal APENAS na conta provedora da rota — sem tocar em contas de clientes.
 *
 * O caminho normal (`processMtmcopyTelegramMessage`) faz duas coisas ao mesmo tempo: executa na
 * conta da rota E procura clientes que sigam aquele canal. Para as fontes que só executam na
 * conta provedora só se quer a primeira: a conta provedora é a estratégia, e quem quiser copiar
 * subscreve-a no MTM Copy. Os clientes que ainda não escolheram canal nenhum casam com QUALQUER
 * chat da allowlist — e foi assim que um dia o Forex Swings entrou rotulado de Premium e abriu
 * nas contas de toda a gente. Aqui isso não pode acontecer: a lista de clientes vai vazia.
 */
export async function executeSignalOnRouteProvider(opts: {
  chatId: string | number
  text: string
  telegramMessageId?: number
  parentText?: string | null
}): Promise<{ ok: boolean; reason?: string; provider?: string }> {
  const providers = await resolveMtmProvidersForSignal('unknown', opts.chatId)
  const provider = providers[0]
  if (!provider) return { ok: false, reason: 'sem rota para este chat' }

  const signal = parseSignal(opts.text)
  if (!signal?.symbol || !signal.direction) return { ok: false, reason: 'não é um sinal de entrada' }

  const profile = await getProviderExecutionProfile('unknown', provider.execution)
  const validation = await validateSignalWithAi(opts.text, signal, {
    skipAi: profile.ai_validation_enabled === false,
    minConfidence: getAiMinConfidence(profile),
    forceFastPath: isOfficialMtmTelegramFormat(opts.text),
    channel: 'unknown',
    strategyPrompt: provider.aiStrategyPrompt ?? null,
  })
  if (!shouldExecuteSignal(validation) || !shouldExecuteForProfile(validation, profile)) {
    await logProviderSignalEvent({
      channel: 'unknown', provider, signal, raw: opts.text,
      telegramMessageId: opts.telegramMessageId, status: 'skipped',
      detail: formatAiValidationDetail(validation),
    })
    return { ok: false, reason: 'validação abaixo do mínimo', provider: provider.tag }
  }

  const enriquecido = applyValidationToSignal(signal, validation)

  await executeViaMtmProvider([], enriquecido, opts.text, opts.telegramMessageId, provider, 'unknown', validation)
  return { ok: true, provider: provider.tag }
}

async function executeViaMtmProvider(
  subscribers: MTMcopierConnection[],
  signal: NonNullable<ReturnType<typeof parseSignal>>,
  raw: string,
  telegramMessageId: number | undefined,
  provider: MtmChannelProvider,
  channel: MtmcopyChannelKey,
  validation: AiSignalValidation,
) {
  const aiDetail = formatAiValidationDetail(validation)
  const tgRef = telegramMessageId != null ? `tg:${telegramMessageId}` : ''

  const [isDuplicate, executionProfile, providerConn] = await Promise.all([
    hasRecentProviderDuplicate(raw, telegramMessageId),
    getProviderExecutionProfile(channel, provider.execution),
    buildProviderConnection(channel, provider.execution),
  ])

  if (isDuplicate) {
    console.log(`[mtmcopy] duplicado ignorado (${provider.tag})`)
    await logProviderSignalEvent({
      channel,
      provider,
      signal,
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: 'Duplicado ignorado',
    })
    return
  }

  if (!isWithinTradingSchedule(executionProfile, signal.symbol)) {
    await logProviderSignalEvent({
      channel,
      provider,
      signal,
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: 'Fora do horário de trading configurado',
    })
    return
  }

  // Backstop anti-runaway: teto diário de trades POR canal na conta-mestre. Só existe para
  // travar um loop/misfire — NÃO deve travar volume legítimo. Reset à meia-noite UTC, o que
  // fazia a sessão asiática (logo a seguir ao reset) correr livre e depois Londres bater no
  // teto a meio da manhã. O canal trade-ideas faz ~40+ trades/dia reais, por isso o default
  // tem de ficar bem acima disso (default 120, era 40). Override global
  // MTMCOPY_MAX_PROVIDER_DAILY ou por-canal MTMCOPY_MAX_PROVIDER_DAILY_<CANAL>
  // (ex.: MTMCOPY_MAX_PROVIDER_DAILY_TRADE_IDEAS=200). 0 desliga. Falha-aberto: um erro na
  // própria verificação NUNCA bloqueia um trade legítimo.
  try {
    // Canal Premium: SEM teto (por decisão). Restantes canais: backstop configurável (global
    // ou por-canal). Default 120 → margem 3x sobre o volume legítimo, ainda trava runaways.
    const perChannelCapEnv =
      process.env[`MTMCOPY_MAX_PROVIDER_DAILY_${channel.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`]
    const providerDailyCap =
      channel === 'premium-signals'
        ? 0
        : Number(perChannelCapEnv ?? process.env.MTMCOPY_MAX_PROVIDER_DAILY ?? 120)
    if (providerDailyCap > 0) {
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0)
      const { count: execToday } = await getSupabaseAdmin()
        .from('mtmcopy_signal_log')
        .select('id', { count: 'exact', head: true })
        .eq('channel_key', channel)
        .eq('status', 'executed')
        .gte('created_at', dayStart.toISOString())
      if ((execToday ?? 0) >= providerDailyCap) {
        console.warn(`[mtmcopy] BACKSTOP: teto diário do canal ${channel} atingido (${execToday}/${providerDailyCap}) — trade ignorado`)
        await logProviderSignalEvent({
          channel,
          provider,
          signal,
          raw,
          telegramMessageId,
          status: 'skipped',
          detail: `Backstop: teto diário do canal atingido (${execToday}/${providerDailyCap})`,
        })
        return
      }
    }
  } catch (e) {
    console.warn('[mtmcopy] backstop cap: verificação falhou, a permitir o trade —', e instanceof Error ? e.message : e)
  }

  const mappedSymbol = applySymbolFromProfile(signal.symbol!, executionProfile)
  // Risco por trade FORÇADO (sobrepõe config da conta provider; CopyFactory replica por saldo):
  //   Premium (Ouro/BTC), GoldKiller E Forex (MTM Auto Forex) → 0.5% (pedido do Ricardo,
  //   2026-08-06 — forex repõe 0.5%, TODAS as cotações; sizing por tickValue real abaixo).
  const FX_CODES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'])
  const clean6 = mappedSymbol.toUpperCase().replace(/[^A-Z]/g, '')
  const isForexSym = clean6.length === 6 && FX_CODES.has(clean6.slice(0, 3)) && FX_CODES.has(clean6.slice(3, 6))
  const isGoldKillerProvider =
    mesmaConta(provider.accountId, CANONICAL_GOLDKILLER_ACCOUNT_ID) ||
    slugDaConta(provider.accountId) === SLUG_GOLDKILLER ||
    provider.strategyId === CANONICAL_GOLDKILLER_STRATEGY_ID
  const forceRisk05 = channel === 'premium-signals' || isForexSym || isGoldKillerProvider
  const forcedRiskPct = 0.5
  const skipSymbol = shouldSkipSymbolForProfile(mappedSymbol, executionProfile)
  if (skipSymbol) {
    await logProviderSignalEvent({
      channel,
      provider,
      signal: { ...signal, symbol: mappedSymbol },
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: skipSymbol,
    })
    return
  }

  const slTp = resolveSlTpForSignal(signal, executionProfile)
  if (slTp.skipReason) {
    await logProviderSignalEvent({
      channel,
      provider,
      signal: { ...signal, symbol: mappedSymbol },
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: slTp.skipReason,
    })
    return
  }

  const signalForExec = {
    ...signal,
    symbol: mappedSymbol,
    sl: slTp.sl,
    tp: slTp.tp != null ? [slTp.tp, ...signal.tp.slice(1)] : signal.tp,
    direction: executionProfile.reverse_signals
      ? signal.direction === 'buy'
        ? ('sell' as const)
        : ('buy' as const)
      : signal.direction,
  }

  const executionSummary = formatExecutionSummary(executionProfile)
  let balance: number | null = null
  let marketPrice: number | null = null

  // Chamadas MetaAPI independentes em paralelo (corta ~200ms vs. sequencial):
  //  - lot sizing context (só risk_percent)
  //  - account snapshot (equity, sempre)
  //  - symbol specification (só trade-ideas, para trailing dinâmico)
  const needsSpec = channel === 'trade-ideas'
  const needsRisk = executionProfile.lot_mode === 'risk_percent' || forceRisk05
  const [lotCtx, snapshot, symbolSpec, tickCtx] = await Promise.all([
    needsRisk
      ? fetchLotSizingContext(provider.accountId, mappedSymbol, signalForExec.direction!)
      : Promise.resolve(null),
    getAccountSnapshot(provider.accountId),
    needsSpec
      ? getSymbolSpecification(provider.accountId, mappedSymbol)
      : Promise.resolve(null),
    // tickValue REAL (currency-agnostic) → sizing exato p/ QUALQUER par (JPY, USD-base, cruzados).
    needsRisk
      ? getRiskTickContext(provider.accountId, mappedSymbol, signalForExec.direction!)
      : Promise.resolve(null),
  ])

  if (lotCtx) {
    balance = lotCtx.balance
    marketPrice = lotCtx.marketPrice
  }

  // Forex: SL máximo 20 pips (200 pontos) da entrada; TP fica conforme sinal.
  if (isForexSym && signalForExec.sl != null && signalForExec.sl > 0) {
    const entryRef = signalForExec.entry ?? marketPrice
    if (entryRef && entryRef > 0) {
      const pip = clean6.includes('JPY') ? 0.01 : 0.0001
      const maxDist = 20 * pip
      const dist = Math.abs(entryRef - signalForExec.sl)
      if (dist > maxDist) {
        signalForExec.sl = signalForExec.direction === 'buy' ? entryRef - maxDist : entryRef + maxDist
      }
    }
  }

  // Risco forçado: Premium/GoldKiller 0.5% · Forex 0.05% (ver forcedRiskPct acima).
  const lotConn = forceRisk05
    ? { ...providerConn, lot_mode: 'risk_percent' as const, lot_value: forcedRiskPct }
    : providerConn

  const signalForLot = signalForRiskSizing(signalForExec, marketPrice)
  let totalLot = computeLotSize(lotConn, signalForLot, balance)
  // Sizing EXATO por tickValue real da MetaApi (currency-agnostic): substitui a heurística de
  // contractSize, que subestimava JPY/USD-base/cruzados e os clampava a 0.01. Só quando risco%.
  if (needsRisk && tickCtx && tickCtx.tickSize > 0 && tickCtx.tickValue > 0 && balance && balance > 0) {
    const entryForLot = signalForLot.entry ?? marketPrice
    const slForLot = signalForLot.sl
    if (entryForLot && slForLot && entryForLot > 0 && slForLot > 0) {
      const slDist = Math.abs(entryForLot - slForLot)
      const valuePerLot = (slDist / tickCtx.tickSize) * tickCtx.tickValue // perda por 1.0 lote se bater SL
      const riskPctUsed = Number((lotConn as { lot_value?: number | string }).lot_value) || forcedRiskPct
      if (slDist > 0 && valuePerLot > 0) {
        const raw = (balance * (riskPctUsed / 100)) / valuePerLot
        const cap = lotConn.max_risk_percent != null && lotConn.max_risk_percent > 0 ? Math.min(50, lotConn.max_risk_percent) : 50
        const exact = Math.min(cap, Math.max(0.01, Math.round(raw * 100) / 100))
        if (exact > 0) totalLot = exact
      }
    }
  }
  totalLot = resolveLotForSymbol(mappedSymbol, totalLot, executionProfile)

  const equity = snapshot?.equity ?? snapshot?.balance ?? balance
  totalLot = scaleLotForSmallCapital(totalLot, equity)

  // Guarda de sanidade de stops (todas as classes de ativo): um SL a mais de 25% do preço é
  // lixo de parse/sinal. Em vez de abrir com um stop absurdo (risco enorme ou rejeição
  // "invalid stops" pelo broker), saltamos a entrada. O forex já foi apertado a 20 pips acima.
  {
    const entryRefSane = signalForExec.entry ?? marketPrice
    if (entryRefSane && entryRefSane > 0 && signalForExec.sl != null && signalForExec.sl > 0) {
      const frac = Math.abs(entryRefSane - signalForExec.sl) / entryRefSane
      if (frac > 0.25) {
        await logProviderSignalEvent({
          channel,
          provider,
          signal: signalForExec,
          raw,
          telegramMessageId,
          status: 'skipped',
          detail: `${aiDetail} · SL absurdo (${(frac * 100).toFixed(0)}% do preço) — entrada saltada por segurança · ${executionSummary}`,
        })
        return
      }
    }
  }

  // O MTM Auto Premium negoceia OURO e mais nada — guarda por SÍMBOLO, independente de como o
  // sinal foi classificado. (20/08: um relay entrou rotulado como Premium e abriu forex.)
  const canalSkip = channelSymbolSkipReason(channel, signalForExec.symbol)
  if (canalSkip) {
    await logProviderSignalEvent({
      channel,
      provider,
      signal: signalForExec,
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: canalSkip,
    })
    return
  }

  const lotSkip = getLotSizingSkipReason(
    lotConn,
    signalForExec,
    balance,
    totalLot,
    marketPrice,
  )
  if (lotSkip) {
    await logProviderSignalEvent({
      channel,
      provider,
      signal: signalForExec,
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: `${aiDetail} · ${lotSkip} · ${executionSummary}`,
    })
    return
  }

  const mtComment = mtCommentForProfile(executionProfile, provider.tag)
  const logTargets = await resolveLogTargets(subscribers)

  await logProviderSignalEvent({
    channel,
    provider,
    signal: signalForExec,
    raw,
    telegramMessageId,
    lot: totalLot,
    status: 'received',
    detail: `${aiDetail} · A abrir ${signalForExec.symbol} ${signalForExec.direction} · ${executionSummary}`,
  })

  const isPremiumProvider = channel === 'premium-signals'
  // Mecânica "1 posição + parciais por Exit": Premium usa sempre; outras rotas por opt-in
  // (execution.partial_exits) — programável nas configurações da rota, sem afetar ativos.
  const usePartialExits = isPremiumProvider || executionProfile.partial_exits === true
  const exitPcts = {
    tp1: executionProfile.exit_pct_tp1,
    tp2: executionProfile.exit_pct_tp2,
    tp3: executionProfile.exit_pct_tp3,
  }

  /** 1 posição + parciais por Exit (fecho por preço via monitor). */
  const premiumProviderSingle = usePartialExits
    ? buildPremiumSingleOrder(signalForExec, totalLot, exitPcts, equity)
    : null

  if (usePartialExits && !premiumProviderSingle) {
    await logProviderSignalEvent({
      channel,
      provider,
      signal: signalForExec,
      raw,
      telegramMessageId,
      status: 'skipped',
      detail: `${aiDetail} · Sem TP no sinal — provider Premium exige pelo menos 1 exit`,
    })
    return
  }

  // A chave que esta chegada reclamou. Fica guardada para ser DEVOLVIDA se no fim não abrir
  // nada (só pendente): quem não abriu não pode bloquear a chegada seguinte, que abre.
  let premiumClaimKey: string | null = null

  if (isPremiumProvider && premiumProviderSingle) {
    // Guard ATÓMICO anti-triplicação: a fonte (NY/Londres) às vezes repete o sinal em várias
    // mensagens e o forwarder externo mete outra cópia → 2-3 chegadas em segundos. A 1.ª reclama
    // a chave; as restantes são rejeitadas ANTES de criar pendente/abrir ordem (à prova de corrida).
    // Chave inclui o NÍVEL (SL arredondado): reenvios do MESMO sinal (mesmo nível, segundos depois —
    // a fonte repete e o par com-TP/só-SL) colapsam; mas uma NOVA entrada da sessão (o trader faz
    // "close now" e reentra noutro nível) NÃO é bloqueada. TTL curto (180s) só apanha a rajada de
    // reenvios — não trava reentradas legítimas minutos depois. (Antes: símbolo:direção 900s → bloqueava
    // todas as reentradas de ouro durante 15 min.)
    const dedupLevel = Math.round(Number(signalForExec.sl ?? signalForExec.entry ?? 0))
    premiumClaimKey = `premium:${mappedSymbol}:${signalForExec.direction}:${dedupLevel}`
    const claimed = await claimSignalOnce(premiumClaimKey, 180)
    if (!claimed) {
      premiumClaimKey = null
      await logProviderSignalEvent({
        channel,
        provider,
        signal: signalForExec,
        raw,
        telegramMessageId,
        status: 'skipped',
        detail: `${aiDetail} · Sinal duplicado ignorado (guard anti-triplicação: ${mappedSymbol} ${signalForExec.direction})`,
      })
      return
    }
    const dup = await shouldSkipDuplicatePremiumEntry(
      provider.accountId,
      mappedSymbol,
      signalForExec.direction!,
    )
    if (dup.skip) {
      await logProviderSignalEvent({
        channel,
        provider,
        signal: signalForExec,
        raw,
        telegramMessageId,
        lot: totalLot,
        status: 'skipped',
        detail: `${aiDetail} · ${dup.reason}`,
      })
      return
    }
  }

  // ── Entrada por ZONA + reação (Premium) ──────────────────────────────────────
  // Em vez de entrar a mercado no instante do sinal, guarda o sinal como PENDENTE com a zona
  // e entra só quando um gatilho dispara (A=TradingView, C=reconfirmação, B=toque). Isto dá
  // entrada na zona com reação de preço em vez de às cegas. mode='off' → nada muda;
  // 'shadow' → abre a mercado como hoje E regista o que a zona teria feito; 'live' → só entra no gatilho.
  if (isPremiumProvider && premiumProviderSingle && Array.isArray((signalForExec as any).zone)) {
    const zoneCfg = await getPremiumZoneConfig()
    if (zoneCfg.mode !== 'off') {
      const [zA, zB] = (signalForExec as any).zone as [number, number]
      const zoneLow = Math.min(zA, zB)
      const zoneHigh = Math.max(zA, zB)
      // EXPEDITO (decisão Ricardo 2026-08): entra a MERCADO já quando o preço está na zona (favorável)
      // ou já fugiu além da ponta; só fica PENDENTE na PONTA da zona (janela ±flee_pips) → aguarda reação.
      const zonePx = marketPrice ?? signalForExec.entry ?? 0
      const zoneTp1 = Array.isArray(signalForExec.tp) && signalForExec.tp.length ? Number(signalForExec.tp[0]) : null
      const zoneDecision: 'market' | 'pending' | 'skip' =
        zoneCfg.mode === 'shadow'
          ? 'market'
          : zoneEntryDecision({
              direction: signalForExec.direction === 'sell' ? 'sell' : 'buy',
              price: zonePx,
              zoneLow,
              zoneHigh,
              tp1: zoneTp1,
              symbol: mappedSymbol,
              fleePips: zoneCfg.flee_pips,
              minRoomPips: zoneCfg.min_room_pips,
            })
      // CAMADAS (position building na zona). 1 perna = lote total (clássico). 2 pernas = MESMO lote/risco
      // dividido em duas: a 1ª na metade da zona mais perto do preço (entra na reação inicial), a 2ª na
      // metade mais funda (entra se o preço aprofundar). Ambas seguem a zona pelo monitor. Só 'live'.
      const nLegs =
        zoneCfg.mode === 'live' && Number(zoneCfg.layers) >= 2 && premiumProviderSingle.lot >= 0.02 ? 2 : 1
      const zoneMid = (zoneLow + zoneHigh) / 2
      const isBuyDir = signalForExec.direction !== 'sell'
      const legZoneFor = (i: number): [number, number] => {
        if (nLegs === 1) return [zoneLow, zoneHigh]
        // i=0 = camada RASA (perto do preço); i=1 = camada FUNDA. buy: preço desce (perto=high); sell: sobe (perto=low).
        if (isBuyDir) return i === 0 ? [zoneMid, zoneHigh] : [zoneLow, zoneMid]
        return i === 0 ? [zoneLow, zoneMid] : [zoneMid, zoneHigh]
      }
      const legLotFor = (i: number): number => {
        if (nLegs === 1) return premiumProviderSingle!.lot
        const half = Math.max(0.01, Math.round((premiumProviderSingle!.lot / nLegs) * 100) / 100)
        // última perna absorve o resto para o somatório bater certo com o lote total (mantém o risco)
        return i < nLegs - 1
          ? half
          : Math.max(0.01, Math.round((premiumProviderSingle!.lot - half * (nLegs - 1)) * 100) / 100)
      }
      // Cria pendente quando NÃO entra já a mercado (single) OU sempre que há 2 camadas (ambas seguem
      // a zona pelo monitor). Shadow cria sempre (registo comparativo). 'skip' nunca cria.
      const createPending =
        nLegs >= 2 ? zoneDecision !== 'skip' : zoneDecision !== 'market' || zoneCfg.mode === 'shadow'
      if (createPending) {
      try {
        const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
        for (let i = 0; i < nLegs; i++) {
          const [lz, hz] = legZoneFor(i)
          await getSupabaseAdmin().from('mtmcopy_premium_pending').insert({
            account_id: provider.accountId,
            channel,
            symbol: mappedSymbol,
            direction: signalForExec.direction,
            zone_low: lz,
            zone_high: hz,
            entry: signalForExec.entry ?? marketPrice ?? null,
            sl: signalForExec.sl ?? null,
            tp: signalForExec.tp ?? [],
            exit_pct_tp1: premiumProviderSingle.exitPcts.tp1,
            exit_pct_tp2: premiumProviderSingle.exitPcts.tp2,
            exit_pct_tp3: premiumProviderSingle.exitPcts.tp3,
            lot: legLotFor(i),
            equity,
            comment: premiumProviderSingle.comment,
            telegram_message_id: telegramMessageId ?? null,
            mode: zoneCfg.mode,
            status: 'pending',
            expires_at: new Date(Date.now() + zoneCfg.expiry_min * 60_000).toISOString(),
          })
        }
      } catch {
        /* não bloquear a execução por falha ao gravar o pendente */
      }
      }

      if (zoneCfg.mode === 'live') {
        if (nLegs >= 2) {
          // 2 camadas: ambas ficam pendentes; o monitor entra cada uma quando o preço chega à sua
          // metade da zona (rasa → funda). Nada entra a mercado aqui (evita duplicar a 1ª perna).
          if (zoneDecision === 'skip') {
            await logProviderSignalEvent({
              channel, provider, signal: signalForExec, raw, telegramMessageId,
              status: 'skipped',
              detail: `${aiDetail} · Zona ${zoneLow}–${zoneHigh}: sem espaço até ao TP1 — não persegue`,
            })
            if (premiumClaimKey) await releaseSignalClaim(premiumClaimKey)
            return
          }
          await logProviderSignalEvent({
            channel, provider, signal: signalForExec, raw, telegramMessageId, lot: totalLot,
            status: 'received',
            detail: `${aiDetail} · Zona ${zoneLow}–${zoneHigh}: ${nLegs} camadas pendentes (${legLotFor(0)}+${legLotFor(1)} lote, rasa→funda) — segue a zona · ${executionSummary}`,
          })
          if (premiumClaimKey) await releaseSignalClaim(premiumClaimKey)
          return
        }
        if (zoneDecision === 'pending') {
          await logProviderSignalEvent({
            channel,
            provider,
            signal: signalForExec,
            raw,
            telegramMessageId,
            lot: totalLot,
            status: 'received',
            detail: `${aiDetail} · Zona ${zoneLow}–${zoneHigh}: PENDENTE (ponta da zona) — aguarda reação · ${executionSummary}`,
          })
          // Ficou só à espera: devolve a chave. Se a fonte reenviar o sinal (é o que faz quando
          // o preço reage), a chegada seguinte tem de poder abrir a mercado.
          if (premiumClaimKey) await releaseSignalClaim(premiumClaimKey)
          return
        }
        if (zoneDecision === 'skip') {
          await logProviderSignalEvent({
            channel,
            provider,
            signal: signalForExec,
            raw,
            telegramMessageId,
            status: 'skipped',
            detail: `${aiDetail} · Zona ${zoneLow}–${zoneHigh}: sem espaço até ao TP1 (movimento esgotado) — não persegue`,
          })
          if (premiumClaimKey) await releaseSignalClaim(premiumClaimKey)
          return
        }
        // 'market': preço na zona/favorável → entra a MERCADO JÁ (expedito). Cai para a execução.
        await logProviderSignalEvent({
          channel,
          provider,
          signal: signalForExec,
          raw,
          telegramMessageId,
          lot: totalLot,
          status: 'received',
          detail: `${aiDetail} · Zona ${zoneLow}–${zoneHigh}: entra a MERCADO (preço na zona/favorável) · ${executionSummary}`,
        })
      }
      // shadow: continua e abre a mercado como hoje; o pendente regista o que a zona teria feito.
    }
  }

  type LegResult = { success: boolean; orderId?: string; brokerSymbol?: string; error?: string; label: string; lot: number }
  const results: LegResult[] = []

  try {
    // FLUXO PARA A CONTA MESTRE: quando premium_master_exec=false o Premium é SEMI-AUTOMÁTICO —
    // não abre nada na conta real mestre; cada subscritor recebe a trade por execução direta.
    const premiumMasterOff =
      isPremiumProvider && (await (await import('./exec-switches')).getExecSwitches()).premium_master_exec === false
    if (premiumMasterOff) {
      console.log('[mtmcopy] Premium semi-automático: perna da conta MESTRE ignorada (premium_master_exec=off)')
    }
    if (premiumProviderSingle && !premiumMasterOff) {
      const req = buildOrderRequest(
        providerConn,
        provider.accountId,
        signalForExec,
        premiumProviderSingle.lot,
        premiumProviderSingle.comment,
      )
      // TP na ordem = rede de segurança (último TP do sinal); o monitor de preço gere parciais/BE por cima.
      req.takeProfit = premiumProviderSingle.takeProfit
      const r = await colocarOrdemDoProvedor(
        provider.accountId,
        req,
        `PREM ${req.symbol} ${req.direction}`,
      )
      results.push({
        ...r,
        label: `PREM · parciais ${premiumProviderSingle.exitPcts.tp1}/${premiumProviderSingle.exitPcts.tp2}/${premiumProviderSingle.exitPcts.tp3}%`,
        lot: premiumProviderSingle.lot,
      })
      // Regista a trade ativa para o monitor de preço (fecha parciais por PREÇO).
      // Premium sempre; outras rotas só se tiverem price_monitor ligado na config.
      if (r?.success && (isPremiumProvider || usesPriceMonitor(executionProfile))) {
        try {
          const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
          const tps = signalForExec.tp ?? []
          await getSupabaseAdmin().from('mtmcopy_premium_active').insert({
            account_id: provider.accountId,
            symbol: mappedSymbol,
            direction: signalForExec.direction,
            entry: signalForExec.entry ?? marketPrice ?? null,
            sl: signalForExec.sl ?? null,
            tp1: tps[0] ?? null,
            tp2: tps[1] ?? null,
            tp3: tps[2] ?? null,
            exit_pct_tp1: premiumProviderSingle.exitPcts.tp1,
            exit_pct_tp2: premiumProviderSingle.exitPcts.tp2,
            exit_pct_tp3: premiumProviderSingle.exitPcts.tp3,
            original_lot: premiumProviderSingle.lot,
            small_account: premiumProviderSingle.smallAccount === true,
            exits_done: 0,
            trailing_started: false,
            status: 'open',
            // Premium mantém a gestão dele (escada de saídas). As outras rotas que usam o motor
            // — Sensei e afins — entram no perfil 'trailing': BE proporcional ao risco e stop a
            // seguir o preço, sem escada, com o TP da ordem como alvo final.
            profile: isPremiumProvider ? null : 'trailing',
            // Liga a trade à mensagem que a originou: é por aqui que o monitor de preço encontra
            // o cartão no chat para anunciar o fecho e tirar o botão de Tap to Trade.
            telegram_message_id: telegramMessageId ?? null,
          })
        } catch (e) {
          console.error('[mtmcopy] persist premium active falhou:', e)
        }
      }
    } else {
      const req = buildOrderRequest(providerConn, provider.accountId, signalForExec, totalLot, mtComment)
      if (channel === 'trade-ideas') {
        const isSensei =
          mesmaConta(provider.accountId, CANONICAL_SENSEI_ACCOUNT_ID) ||
          slugDaConta(provider.accountId) === SLUG_SENSEI ||
          provider.strategyId === CANONICAL_SENSEI_STRATEGY_ID
        if (isSensei) {
          // Sensei: abre só com SL — TP/parciais geridos pelos alertas (25% por TP).
          req.takeProfit = null
          req.trailingStop = null
        } else {
          // Forex (Trade Ideas): TP do sinal + trailing BE@25 pips (inalterado).
          const spec = symbolSpec
          const entry = signalForExec.entry ?? marketPrice
          const riskPips = spec ? riskPipsFromEntrySl(entry, signalForExec.sl, spec, mappedSymbol) : null
          const targetPips = spec ? riskPipsFromEntrySl(entry, signalForExec.tp?.[0] ?? null, spec, mappedSymbol) : null
          req.trailingStop = tradeIdeasDynamicTrailing(riskPips, targetPips)
        }
      }
      // GoldKiller + Sensei: scanners scored (a entrada É a decisão do scanner) → abrem SEMPRE
      // a MERCADO. A ordem LIMIT no preço exato pendurava (não enchia) e a função Vercel morria
      // em timeout SEM abrir a trade nem logar — por isso os sinais chegavam mas nada abria na
      // conta. Mercado enche na hora. (Sensei abre só com SL; TP/parciais geridos pelos alertas.)
      if (
        mesmaConta(provider.accountId, CANONICAL_GOLDKILLER_ACCOUNT_ID) ||
        mesmaConta(provider.accountId, CANONICAL_SENSEI_ACCOUNT_ID) ||
        slugDaConta(provider.accountId) === SLUG_GOLDKILLER ||
        slugDaConta(provider.accountId) === SLUG_SENSEI ||
        provider.strategyId === CANONICAL_GOLDKILLER_STRATEGY_ID ||
        provider.strategyId === CANONICAL_SENSEI_STRATEGY_ID
      ) {
        req.orderType = 'market'
        req.openPrice = null
      }
      // Trade-Ideas (forex): LIMIT no lado errado do mercado → a MetaAPI rejeita "Invalid price"
      // (buy-limit tem de estar ABAIXO do mercado; sell-limit ACIMA). Quando o preço já cruzou a
      // entrada, o LIMIT fica inválido MAS o mercado já está igual ou MELHOR que a entrada
      // pretendida → abre-se a MERCADO (fill igual-ou-melhor) em vez de perder o sinal com erro.
      if (
        req.orderType === 'limit' &&
        req.openPrice != null &&
        marketPrice != null &&
        marketPrice > 0
      ) {
        const wrongSide =
          (req.direction === 'buy' && req.openPrice >= marketPrice) ||
          (req.direction === 'sell' && req.openPrice <= marketPrice)
        if (wrongSide) {
          req.orderType = 'market'
          req.openPrice = null
        }
      }
      // Gate de horário: não tentar abrir com o mercado FECHADO (fim de semana / rollover) —
      // evita as falhas "market closed" do GoldKiller (ouro) e do forex. Cripto passa sempre.
      // (bloco linear, não loop → if/else em vez de continue).
      const mh = isMarketOpen(req.symbol)
      if (!mh.open) {
        results.push({ success: false, error: `mercado fechado (${mh.reason}) — ordem ignorada`, label: 'SKIP', lot: totalLot })
      } else {
        const r = await colocarOrdemDoProvedor(
          provider.accountId,
          req,
          `${provider.tag} ${req.symbol} ${req.direction}`,
        )
        results.push({
          ...r,
          label: req.orderType === 'limit' ? 'LIMIT' : 'MARKET',
          lot: totalLot,
        })
      }
    }
  } catch (execErr) {
    const msg = execErr instanceof Error ? execErr.message : 'Erro fatal na execução MetaAPI'
    await logProviderSignalEvent({
      channel,
      provider,
      signal: signalForExec,
      raw,
      telegramMessageId,
      lot: totalLot,
      status: 'error',
      detail: `${aiDetail} · ${msg}`,
    })
    throw execErr
  }

  const result: LegResult = results[results.length - 1] ?? {
    success: false,
    error: 'Sem ordens',
    label: '—',
    lot: 0,
  }
  const anySuccess = results.some((r) => r.success)
  const orderLabel = premiumProviderSingle
    ? `1 perna · parciais ${premiumProviderSingle.exitPcts.tp1}/${premiumProviderSingle.exitPcts.tp2}/${premiumProviderSingle.exitPcts.tp3}%`
    : signalForExec.orderType === 'limit' && signalForExec.entry != null
      ? `LIMIT @ ${signalForExec.entry}`
      : 'MARKET'

  await logProviderSignalEvent({
    channel,
    provider,
    signal: signalForExec,
    raw,
    telegramMessageId,
    lot: totalLot,
    result: { ...result, success: anySuccess },
    status: anySuccess ? 'executed' : 'error',
    detail: `${aiDetail} · ${results.map((r) => `${r.label}: ${r.success ? `#${r.orderId}` : r.error}`).join(' · ')} · ${executionSummary}`,
  })

  void Promise.all(
    logTargets.map(async (conn) => {
      // Whitelist por FAMÍLIA de símbolo (tolera sufixos/prefixos de corretora: XAUUSD.S ↔ XAUUSD)
      if (conn.symbols_whitelist?.length && !conn.symbols_whitelist.some((w) => symbolMatchesCanonical(signalForExec.symbol, w))) {
        await logMtmcopySignal({
          user_id: conn.user_id,
          connection_id: conn.id,
          symbol: signalForExec.symbol,
          direction: signalForExec.direction,
          status: 'skipped',
          detail: 'Símbolo fora da whitelist',
          raw_message: raw,
        })
        return
      }

      const direction = conn.reverse_signals
        ? signalForExec.direction === 'buy'
          ? 'sell'
          : 'buy'
        : signalForExec.direction!

      const trailingNote = conn.auto_trailing_stop
        ? ` · trailing ${trailingPointsForConnection(conn)}pts`
        : ''

      const slaveLog = subscriberLogAfterProviderExecution(conn, {
        anySuccess,
        aiDetail,
        providerTag: provider.tag,
        orderLabel,
        executionSummary,
        trailingNote,
        tgRef,
        resultError: result.error,
      })

      await logMtmcopySignal({
        user_id: conn.user_id,
        connection_id: conn.id,
        channel_key: channel,
        telegram_message_id: telegramMessageId ?? null,
        symbol: signalForExec.symbol,
        direction,
        entry: signalForExec.entry,
        sl: signalForExec.sl,
        tp: signalForExec.tp[0] ?? null,
        lot: totalLot,
        status: slaveLog.status,
        detail: slaveLog.detail,
        raw_message: raw,
      })

      await markConnectionStatus(conn.id, {
        telegram_status: 'connected',
        last_signal_at: new Date().toISOString(),
        ...slaveLog.connectionPatch,
      })
    }),
  )

  console.log(
    anySuccess
      ? `[mtmcopy] ✅ ${provider.tag} ${result.brokerSymbol ?? signalForExec.symbol} ${signalForExec.direction} ${totalLot} ${orderLabel} (${executionSummary}) → ${logTargets.length} slave(s)`
      : `[mtmcopy] ❌ ${provider.tag}: ${result.error}`,
  )
}

async function processSignalDirect(
  conn: MTMcopierConnection,
  signal: NonNullable<ReturnType<typeof parseSignal>>,
  raw: string,
  telegramMessageId?: number,
  validation?: AiSignalValidation,
  channel: MtmcopyChannelKey = 'unknown',
) {
  const tgRef = telegramMessageId != null ? `tg:${telegramMessageId}` : ''
  const aiDetail = validation ? formatAiValidationDetail(validation) : ''
  const aiPrefix = aiDetail ? `${aiDetail} · ` : ''

  // Copy trader (método 3): replica via CopyFactory da conta mestre — não executar aqui
  if (conn.copyfactory_subscribed && isCopyFactoryEnabled() && !prefersDirectExecution(conn)) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      status: 'received',
      detail: `CopyFactory activo — aguarda execução na conta mestre ${tgRef}`.trim(),
      raw_message: raw,
    })
    return
  }

  if (await hasRecentDuplicate(conn.id, raw, telegramMessageId)) {
    console.log(`[mtmcopy] duplicado ignorado (${conn.user_id})`)
    return
  }

  // Whitelist por FAMÍLIA de símbolo (tolera sufixos/prefixos de corretora: XAUUSD.S ↔ XAUUSD)
  if (conn.symbols_whitelist?.length && !conn.symbols_whitelist.some((w) => symbolMatchesCanonical(signal.symbol, w))) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      entry: signal.entry,
      sl: signal.sl,
      tp: signal.tp[0] ?? null,
      status: 'skipped',
      detail: `Símbolo fora da whitelist ${tgRef}`.trim(),
      raw_message: raw,
    })
    return
  }

  // MTM Funded (074): nunca executa por aqui (sem MetaApi/TradeLocker) — só o motor simulado.
  if (conn.mt5_platform === 'mtmfunded') return

  // Conta TradeLocker: execução própria (sem MetaApi). O caminho MT5 abaixo fica intocado.
  if (conn.mt5_platform === 'tradelocker') {
    const { processarSinalDirectoTradeLocker } = await import('@/lib/tradelocker/mtmcopy-branch')
    await processarSinalDirectoTradeLocker({ conn, signal, raw, telegramMessageId, channel, aiPrefix })
    return
  }

  if (!conn.metaapi_account_id) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      entry: signal.entry,
      sl: signal.sl,
      tp: signal.tp[0] ?? null,
      status: 'received',
      detail: `Sinal recebido — liga a conta MT5 ${tgRef}`.trim(),
      raw_message: raw,
    })
    await markConnectionStatus(conn.id, {
      telegram_status: 'connected',
      last_signal_at: new Date().toISOString(),
    })
    return
  }

  if (!isMetaApiConfigured()) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      status: 'error',
      detail: 'METAAPI_TOKEN não configurado no servidor',
      raw_message: raw,
    })
    return
  }

  const maxDaily = Number(process.env.MTMCOPY_MAX_DAILY_TRADES) || 30
  const executedToday = await countExecutedToday(conn.id)
  if (executedToday >= maxDaily) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      status: 'skipped',
      detail: `Limite diário de operações atingido (${executedToday}/${maxDaily})`,
      raw_message: raw,
    })
    return
  }

  let balance: number | null = null
  let marketPrice: number | null = null
  const execDirection = conn.reverse_signals
    ? signal.direction === 'buy'
      ? 'sell'
      : 'buy'
    : signal.direction!
  if (conn.lot_mode === 'risk_percent') {
    const ctx = await fetchLotSizingContext(
      conn.metaapi_account_id,
      signal.symbol!,
      execDirection,
    )
    balance = ctx.balance
    marketPrice = ctx.marketPrice
  }

  const signalForLot = signalForRiskSizing(signal, marketPrice)
  let lot = computeLotSize(conn, signalForLot, balance)

  const snapshot = conn.metaapi_account_id
    ? await getAccountSnapshot(conn.metaapi_account_id)
    : null
  const equity = snapshot?.equity ?? snapshot?.balance ?? balance
  lot = scaleLotForSmallCapital(lot, equity)

  const canalSkipSub = channelSymbolSkipReason(channel, signal.symbol)
  if (canalSkipSub) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      status: 'skipped',
      detail: canalSkipSub,
      raw_message: raw,
    })
    return
  }

  const lotSkip = getLotSizingSkipReason(conn, signal, balance, lot, marketPrice)
  if (lotSkip) {
    await logMtmcopySignal({
      user_id: conn.user_id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      status: 'skipped',
      detail: lotSkip,
      raw_message: raw,
    })
    return
  }

  const direction = execDirection

  /** Método 1 — grupos Telegram: 1 posição + parciais 33/33/34% via mensagens HIT TP. */
  const isPremium = channel === 'premium-signals'
  const premiumSingle = isPremium
    ? buildPremiumSingleOrder(
        signal,
        lot,
        {
          tp1: conn.exit_pct_tp1 ?? 75,
          tp2: conn.exit_pct_tp2 ?? 15,
          tp3: conn.exit_pct_tp3 ?? 10,
        },
        equity,
        { manual: conn.copy_as_manual === true },
      )
    : null

  if (isPremium && premiumSingle && conn.metaapi_account_id) {
    // Guard atómico por conta: cada subscritor abre 1x — chegadas duplicadas do sinal são rejeitadas.
    const subLevel = Math.round(Number(signal.sl ?? signal.entry ?? 0))
    const claimed = await claimSignalOnce(`premium-sub:${conn.metaapi_account_id}:${signal.symbol}:${direction}:${subLevel}`, 180)
    if (!claimed) {
      await logMtmcopySignal({
        user_id: conn.user_id,
        connection_id: conn.id,
        symbol: signal.symbol,
        direction: signal.direction,
        status: 'skipped',
        detail: 'Sinal duplicado ignorado (guard anti-triplicação)',
        raw_message: raw,
      })
      return
    }
    const dup = await shouldSkipDuplicatePremiumEntry(
      conn.metaapi_account_id,
      signal.symbol!,
      direction,
    )
    if (dup.skip) {
      await logMtmcopySignal({
        user_id: conn.user_id,
        connection_id: conn.id,
        symbol: signal.symbol,
        direction: signal.direction,
        status: 'skipped',
        detail: dup.reason ?? 'Exposição Premium activa',
        raw_message: raw,
      })
      return
    }
  }

  await logMtmcopySignal({
    user_id: conn.user_id,
    connection_id: conn.id,
    channel_key: channel,
    telegram_message_id: telegramMessageId ?? null,
    symbol: signal.symbol,
    direction,
    entry: signal.entry,
    sl: signal.sl,
    tp: signal.tp[0] ?? null,
    lot,
    status: 'received',
    detail: `${aiPrefix}A abrir ${signal.symbol} ${direction} · lot ${lot} ${tgRef}`.trim(),
    raw_message: raw,
  })

  let result: OrderResult
  if (premiumSingle && conn.metaapi_account_id) {
    const req = buildOrderRequest(
      conn,
      conn.metaapi_account_id,
      signal,
      premiumSingle.lot,
      premiumSingle.comment,
    )
    req.takeProfit = premiumSingle.takeProfit // TP de segurança (último TP); monitor gere parciais/BE
    const [single] = await placeOrdersSequential(conn.metaapi_account_id, [req])
    result = single ?? { success: false, error: 'Sem resposta MetaAPI' }
    // MODO SEMI-AUTOMÁTICO (Premium direto ao subscritor): regista a posição no monitor de PREÇO,
    // para ele gerir parciais/BE/trailing NA CONTA DO SUBSCRITOR. Sem isto, com a conta mestre
    // desligada, a trade ficava sem gestão (o monitor só conhecia as posições do mestre).
    if (result.success && channel === 'premium-signals') {
      try {
        const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
        const tpsSub = signal.tp ?? []
        await getSupabaseAdmin().from('mtmcopy_premium_active').insert({
          account_id: conn.metaapi_account_id,
          symbol: signal.symbol,
          direction: signal.direction,
          entry: signal.entry ?? null,
          sl: signal.sl ?? null,
          tp1: tpsSub[0] ?? null,
          tp2: tpsSub[1] ?? null,
          tp3: tpsSub[2] ?? null,
          exit_pct_tp1: premiumSingle.exitPcts.tp1,
          exit_pct_tp2: premiumSingle.exitPcts.tp2,
          exit_pct_tp3: premiumSingle.exitPcts.tp3,
          original_lot: premiumSingle.lot,
          small_account: premiumSingle.smallAccount === true,
          exits_done: 0,
          trailing_started: false,
          status: 'open',
        })
      } catch (e) {
        console.error('[mtmcopy] persist premium active (subscritor) falhou:', e)
      }
    }
  } else {
    const req = buildOrderRequest(conn, conn.metaapi_account_id, signal, lot, 'MTMcopier')
    if (channel === 'trade-ideas' && conn.metaapi_account_id) {
      const spec = await getSymbolSpecification(conn.metaapi_account_id, signal.symbol!)
      const entry = signal.entry ?? marketPrice
      const riskPips = spec ? riskPipsFromEntrySl(entry, signal.sl, spec, signal.symbol!) : null
      const targetPips = spec ? riskPipsFromEntrySl(entry, signal.tp?.[0] ?? null, spec, signal.symbol!) : null
      req.trailingStop = tradeIdeasDynamicTrailing(riskPips, targetPips)
    }
    const [single] = await placeOrdersSequential(conn.metaapi_account_id!, [req])
    result = single ?? { success: false, error: 'Sem resposta MetaAPI' }

    // GESTÃO A 1 SEGUNDO para os restantes grupos de sinais (Sensei, Forex, Forex Swings,
    // GoldKiller, Aurum Flow). Estes copiam-se por EXECUÇÃO DIRECTA — não há conta mestre nem
    // estratégia CopyFactory — por isso, sem esta linha, a trade ficava na conta do cliente sem
    // ninguém a geri-la: sem parciais nos alvos, sem break-even, sem trailing. Registá-la aqui
    // põe-na debaixo do mesmo monitor de preço que gere o Premium, na conta DELE.
    if (result.success && conn.metaapi_account_id && signal.symbol && signal.direction) {
      try {
        const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
        const { defaultExitPcts } = await import('./copy-methods')
        const pcts = defaultExitPcts()
        const tpsDir = signal.tp ?? []
        await getSupabaseAdmin().from('mtmcopy_premium_active').insert({
          account_id: conn.metaapi_account_id,
          symbol: signal.symbol,
          direction: signal.direction,
          entry: signal.entry ?? marketPrice ?? null,
          sl: signal.sl ?? null,
          tp1: tpsDir[0] ?? null,
          tp2: tpsDir[1] ?? null,
          tp3: tpsDir[2] ?? null,
          exit_pct_tp1: pcts.tp1,
          exit_pct_tp2: pcts.tp2,
          exit_pct_tp3: pcts.tp3,
          original_lot: lot,
          small_account: false,
          exits_done: 0,
          trailing_started: false,
          status: 'open',
        })
      } catch (e) {
        console.error('[mtmcopy] persist activa (execução directa) falhou:', e)
      }
    }
  }

  const trailingNote = conn.auto_trailing_stop
    ? ` · trailing ${trailingPointsForConnection(conn)}pts`
    : ''

  await logMtmcopySignal({
    user_id: conn.user_id,
    connection_id: conn.id,
    symbol: signal.symbol,
    direction,
    entry: signal.entry,
    sl: signal.sl,
    tp: signal.tp[0] ?? null,
    lot,
    status: result.success ? 'executed' : 'error',
    detail: result.success
      ? `${aiPrefix}Ordem #${result.orderId} · ${result.brokerSymbol ?? signal.symbol}${trailingNote} ${tgRef}`.trim()
      : `${aiPrefix}${result.error} ${tgRef}`.trim(),
    raw_message: raw,
  })

  await markConnectionStatus(conn.id, {
    telegram_status: 'connected',
    last_signal_at: new Date().toISOString(),
    ...(result.success
      ? { mt5_status: 'connected', last_error: null }
      : { last_error: result.error ?? 'Erro na execução', mt5_status: 'error' }),
  })

  console.log(
    result.success
      ? `[mtmcopy] ✅ ${conn.user_id} ${result.brokerSymbol} ${direction} ${lot}`
      : `[mtmcopy] ❌ ${conn.user_id}: ${result.error}`,
  )
}

/**
 * Execução provider a partir de webhook TradingView.
 * target='sensei' (default) → conta Sensei (Ouro/BTC).
 * target='forex' → conta MTM Auto Forex (5IHE), resolvida por strategy id,
 * sem tocar na rota canónica nem no caminho Telegram.
 */
/**
 * Conta do Sensei Scanner — a dele, não a do Premium.
 *
 * Antes o Sensei caía no `resolveMtmProvidersForSignal('trade-ideas')` porque não havia canal
 * para ele: abria na conta MESTRE do Premium, com o comentário `MTM-TI` e o risco de 0,05% do
 * perfil Trade Ideas, e a CopyFactory levava a trade a todos os subscritores do Premium.
 * Agora tem conta e perfil próprios (0,5%, sem trailing, comentário `MTM-SENSEI`).
 */
/**
 * A rota desta estratégia está pausada pelo admin?
 *
 * O `senseiProvider()` é fixo no código de propósito — é o que impede o Sensei de cair na conta
 * do Premium. Mas fixo assim também não passava pela pausa: desligar a cópia no painel não
 * travava nada nesta conta. Uma pausa que só vale para alguns caminhos não é uma pausa.
 */
async function rotaPausada(strategyId: string): Promise<boolean> {
  try {
    const { getSignalSourcesConfig } = await import('./signal-sources-config')
    const { normalizeProviderRoutes } = await import('./provider-routes')
    const routes = normalizeProviderRoutes(await getSignalSourcesConfig())
    const r = routes.find((x) => x.strategy_id?.trim() === strategyId)
    return r ? r.enabled === false : false
  } catch {
    return false // config em baixo não é motivo para parar de executar
  }
}

/**
 * A conta do Sensei, pela ordem: env → conta provider MT5 na base (19037, The Trading Master) →
 * constante. Era só o env, e o env está vazio: `senseiPronto()` dizia que não e o webhook
 * respondia «Rota provider Sensei não configurada» a todos os sinais, com a conta a existir e
 * ligada. Quem cria as contas é o agente do VPS, e o que ele grava é a linha na base.
 */
function contaSensei(): string {
  return (
    process.env.METAAPI_PROVIDER_SENSEI_ACCOUNT_ID?.trim() ||
    SENSEI_PROVIDER_ACCOUNT_ID ||
    contaDaEstrategiaEmCache(SLUG_SENSEI)?.accountId ||
    ''
  )
}

/** O Sensei tem conta mestre? (a versão que também olha para a base de dados) */
async function senseiTemConta(): Promise<boolean> {
  if (senseiPronto()) return true
  await carregarContasDeEstrategia().catch(() => undefined)
  return contaSensei().length > 0
}

function senseiProvider(): MtmChannelProvider {
  return {
    channel: 'trade-ideas',
    accountId: contaSensei(),
    tag: 'Conta Sensei',
    strategyId:
      process.env.METAAPI_COPY_STRATEGY_SENSEI_ID?.trim() || CANONICAL_SENSEI_STRATEGY_ID,
    execution: SENSEI_PROVIDER_EXECUTION,
  }
}

export async function processMtmcopyWebhookSignal(opts: {
  raw: string
  signal: NonNullable<ReturnType<typeof parseSignal>>
  validation: AiSignalValidation
  externalRef?: string
  target?: 'sensei' | 'forex' | 'goldkiller'
}): Promise<{ executed: boolean; detail?: string }> {
  if (!isMetaApiConfigured()) {
    return { executed: false, detail: 'MetaAPI não configurado' }
  }

  const channel: MtmcopyChannelKey = 'trade-ideas'
  const providers =
    opts.target === 'forex'
      ? await (async () => {
          const p = await resolveMtmProviderForStrategyId(CANONICAL_TRADE_IDEAS_STRATEGY_ID)
          return p ? [p] : []
        })()
      : opts.target === 'goldkiller'
        ? await (async () => {
            const p = await resolveMtmProviderForStrategyId(CANONICAL_GOLDKILLER_STRATEGY_ID)
            return p ? [p] : []
          })()
        : opts.target === 'sensei'
          ? // Sem conta mestre não se abre nada: o Sensei foi reformado da 34744071 a 04/09 e
            // espera pela MT5 35044320. Um accountId vazio aqui era mandar a ordem para o
            // vazio — ou pior, para o default de quem estiver a seguir na cadeia.
            (!(await senseiTemConta()) || (await rotaPausada(CANONICAL_SENSEI_STRATEGY_ID))
              ? []
              : [senseiProvider()])
          : await resolveMtmProvidersForSignal(channel, null, { signalSource: 'webhook' })
  if (!providers.length) {
    return {
      executed: false,
      detail:
        opts.target === 'forex'
          ? 'Rota MTM Auto Forex não configurada'
          : opts.target === 'goldkiller'
            ? 'Rota MTM Auto GoldKiller não configurada'
            : 'Rota provider Sensei não configurada',
    }
  }

  const enriched = applyValidationToSignal(opts.signal, opts.validation)
  const canExecute = shouldExecuteSignal(opts.validation)

  if (!canExecute) {
    await logProviderSignalEvent({
      channel,
      provider: providers[0],
      signal: enriched,
      raw: opts.raw,
      status: 'skipped',
      detail: `${formatAiValidationDetail(opts.validation)} · validação abaixo do mínimo`,
    })
    return { executed: false, detail: 'Sinal rejeitado pela validação' }
  }

  for (const prov of providers) {
    const routeProfile = await getProviderExecutionProfile(channel, prov.execution)
    if (!shouldExecuteForProfile(opts.validation, routeProfile)) {
      const minPct = Math.round(getAiMinConfidence(routeProfile) * 100)
      await logProviderSignalEvent({
        channel,
        provider: prov,
        signal: enriched,
        raw: opts.raw,
        status: 'skipped',
        detail: `${formatAiValidationDetail(opts.validation)} · confiança < ${minPct}%`,
      })
      continue
    }

    await executeViaMtmProvider(
      [],
      enriched,
      opts.raw,
      undefined,
      prov,
      channel,
      opts.validation,
    )
  }

  return {
    executed: true,
    detail: `${opts.target === 'forex' ? 'Auto Forex' : opts.target === 'goldkiller' ? 'Auto GoldKiller' : 'Sensei'} · ${providers.map((p) => p.strategyId ?? CANONICAL_SENSEI_STRATEGY_ID).join(',')}`,
  }
}

/**
 * Gestão automática Sensei (webhook): TP1-4 / BE / SL → parciais + BE + trailing
 * ou fecho, na conta Sensei. CopyFactory replica aos subscritores.
 */
export async function processMtmcopyWebhookManagement(opts: {
  symbol: string
  direction: 'buy' | 'sell' | null
  alertType: import('./signal-parser').SenseiAlertType
  tpLevel: number | null
  entry: number | null
  target?: 'sensei' | 'goldkiller'
}): Promise<{ applied: boolean; detail?: string }> {
  if (!isMetaApiConfigured()) return { applied: false, detail: 'MetaAPI não configurado' }

  const channel: MtmcopyChannelKey = 'trade-ideas'
  const providers =
    opts.target === 'goldkiller'
      ? await (async () => {
          const p = await resolveMtmProviderForStrategyId(CANONICAL_GOLDKILLER_STRATEGY_ID)
          return p ? [p] : []
        })()
      : await resolveMtmProvidersForSignal(channel, null, { signalSource: 'webhook' })
  if (!providers.length) {
    return { applied: false, detail: opts.target === 'goldkiller' ? 'Rota GoldKiller não configurada' : 'Rota Sensei não configurada' }
  }

  const { applySenseiManagement } = await import('./sensei-management-exec')
  const details: string[] = []
  let anyApplied = false
  for (const prov of providers) {
    // Se a rota tem price_monitor ON, as saídas (parciais/BE/TP) são geridas por PREÇO no
    // premium-price-monitor (realtime, sobre a posição REAL). A gestão por ALERTAS aqui passa a
    // atrapalhar (dava "sem posição ativa" nos flips + risco de duplo-fecho) → saltamos.
    const senseiProfile = await getProviderExecutionProfile(channel, prov.execution)
    if (usesPriceMonitor(senseiProfile)) {
      details.push('price-monitor ativo → saída por PREÇO (alerta de gestão ignorado)')
      continue
    }
    const outcome = await applySenseiManagement({
      accountId: prov.accountId,
      symbol: opts.symbol,
      direction: opts.direction,
      alertType: opts.alertType,
      tpLevel: opts.tpLevel,
      entry: opts.entry,
    })
    if (outcome.closed || outcome.updated) anyApplied = true
    await logProviderSignalEvent({
      channel,
      provider: prov,
      symbol: opts.symbol,
      raw: `sensei-mgmt ${opts.alertType}${opts.tpLevel ? ` TP${opts.tpLevel}` : ''}`,
      status: outcome.errors.length && !outcome.closed && !outcome.updated ? 'error' : 'executed',
      detail: `Gestão Sensei ${opts.alertType}${opts.tpLevel ? ` TP${opts.tpLevel}` : ''} · ${outcome.actions.join(', ') || outcome.errors.join('; ') || 'sem ação'}`,
    })
    details.push(outcome.actions.join(', ') || outcome.errors.join('; '))
  }
  return { applied: anyApplied, detail: details.join(' · ') }
}

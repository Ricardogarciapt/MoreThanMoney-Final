/**
 * Gestão contínua das posições abertas via Tap to Trade.
 *
 * O T2T abre a posição na conta dedicada do membro (mtmcopy_connections.purpose='tap_to_trade')
 * e grava o broker_position_id em mtmcopy_signal_log (status='open'). Quando o MESTRE faz
 * gestão (mover SL, breakeven, trailing, fecho parcial/total), o processManagementUpdate
 * estende a mesma ação às contas T2T com posição aberta nesse canal+símbolo — desde que a
 * estratégia esteja ATIVA no Tap to Trade.
 */
import { canalPublicadoPelaMestre } from '@/lib/mestres/servidor/canais-publicados'
import { idsDeLigacao } from './ids-de-ligacao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  readOpenPositions,
  readPendingOrders,
  closePositionById,
  modifyPositionSlTp,
} from './metaapi'
import { tapToTradeEnabledChannels, T2T_SENDER_TO_CHAT } from './tap-to-trade-channels'
import { lifecycleMessage } from './signal-lifecycle'
import { precoParaMonitor } from './metaapi-snapshot'
import { filtrarContasExistentes } from './metaapi-inexistentes'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'

// Cliente criado a pedido, nao no topo do modulo. Antes, importar este ficheiro
// exigia ja as credenciais do Supabase (o getSupabaseAdmin() lanca sem elas), o que
// fazia rebentar quem so queria uma funcao pura de quem o importa — era por isso que
// lib/mtmcopy/__tests__/ordem-retentativa.check.ts nao conseguia sequer arrancar.
let clienteAdmin: ReturnType<typeof getSupabaseAdmin> | null = null
function db(): ReturnType<typeof getSupabaseAdmin> {
  if (!clienteAdmin) clienteAdmin = getSupabaseAdmin()
  return clienteAdmin
}

function normSym(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Match de símbolo SEGURO: igualdade canónica (evita EUR ⊂ EURUSD ou US30 ⊂ US3000)
 * mas tolera sufixos de broker (ex.: XAUUSD.r) exigindo prefixo com ≥6 chars.
 */
function symbolsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normSym(a)
  const y = normSym(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short.length >= 6 && long.startsWith(short)
}

export interface OpenT2TPosition {
  rowId: string
  accountId: string
  symbol: string
  brokerPositionId: string | null
}

/**
 * Posições T2T ABERTAS para um canal de gestão + símbolo, apenas se o provider está
 * ATIVO no Tap to Trade. Devolve as contas a incluir no loop de gestão do mestre.
 */
export async function openT2TRowsForManagement(
  channel: string,
  symbol?: string | null,
): Promise<OpenT2TPosition[]> {
  const slugs = T2T_SENDER_TO_CHAT[channel] ?? []
  if (!slugs.length) return []

  const enabled = await tapToTradeEnabledChannels()
  const activeSlugs = enabled ? slugs.filter((s) => enabled.has(s)) : slugs
  if (!activeSlugs.length) return []

  const { data: rows } = await db()
    .from('mtmcopy_signal_log')
    .select('id, connection_id, symbol, broker_position_id')
    .eq('status', 'open')
    .not('broker_position_id', 'is', null)
    .in('channel_key', activeSlugs)
    .limit(500)
  if (!rows?.length) return []

  const matched = symbol
    ? rows.filter((r) => symbolsMatch(r.symbol as string | null, symbol))
    : rows
  if (!matched.length) return []

  // Sem `connection_id` não há conta a gerir — e um null no `.in()` recusava o pedido inteiro.
  const connIds = idsDeLigacao(matched)
  if (!connIds.length) return []
  const { data: conns } = await db()
    .from('mtmcopy_connections')
    .select('id, metaapi_account_id')
    .in('id', connIds)
    .neq('mt5_status', 'disconnected')
  // Contas inexistentes na MetaApi ficam de fora (15/09) — nem leituras nem gestão.
  const existentes = new Set(await filtrarContasExistentes((conns ?? []).map((c) => c.metaapi_account_id as string | null)))
  const accById = new Map(
    (conns ?? []).map((c) => {
      const acc = (c.metaapi_account_id as string | null) ?? null
      return [c.id as string, acc && existentes.has(acc) ? acc : null]
    }),
  )

  const out: OpenT2TPosition[] = []
  for (const r of matched) {
    const accountId = accById.get(r.connection_id as string)
    if (accountId) {
      out.push({
        rowId: r.id as string,
        accountId,
        symbol: ((r.symbol as string | null) ?? '').toString(),
        brokerPositionId: (r.broker_position_id as string | null) ?? null,
      })
    }
  }
  return out
}

/** Resolve posições T2T abertas por canal de chat (slug direto) + símbolo. */
async function resolveOpenT2TByChannelSlug(
  channelSlug: string,
  symbol?: string | null,
): Promise<OpenT2TPosition[]> {
  const { data: rows } = await db()
    .from('mtmcopy_signal_log')
    .select('id, connection_id, symbol, broker_position_id')
    .eq('status', 'open')
    .not('broker_position_id', 'is', null)
    .eq('channel_key', channelSlug)
    .limit(500)
  if (!rows?.length) return []

  const matched = symbol
    ? rows.filter((r) => symbolsMatch(r.symbol as string | null, symbol))
    : rows
  if (!matched.length) return []

  // Sem `connection_id` não há conta a gerir — e um null no `.in()` recusava o pedido inteiro.
  const connIds = idsDeLigacao(matched)
  if (!connIds.length) return []
  const { data: conns } = await db()
    .from('mtmcopy_connections')
    .select('id, metaapi_account_id')
    .in('id', connIds)
    .neq('mt5_status', 'disconnected')
  // Contas inexistentes na MetaApi ficam de fora (15/09) — nem leituras nem gestão.
  const existentes = new Set(await filtrarContasExistentes((conns ?? []).map((c) => c.metaapi_account_id as string | null)))
  const accById = new Map(
    (conns ?? []).map((c) => {
      const acc = (c.metaapi_account_id as string | null) ?? null
      return [c.id as string, acc && existentes.has(acc) ? acc : null]
    }),
  )

  const out: OpenT2TPosition[] = []
  for (const r of matched) {
    const accountId = accById.get(r.connection_id as string)
    if (accountId) {
      out.push({
        rowId: r.id as string,
        accountId,
        symbol: ((r.symbol as string | null) ?? '').toString(),
        brokerPositionId: (r.broker_position_id as string | null) ?? null,
      })
    }
  }
  return out
}

/** Master FECHOU (detetado por polling) → fecha as posições T2T slave correspondentes. */
export async function closeT2TForSlaves(channelSlug: string, symbol: string): Promise<number> {
  const rows = await resolveOpenT2TByChannelSlug(channelSlug, symbol)
  let n = 0
  for (const r of rows) {
    if (!r.brokerPositionId) continue
    try {
      await closePositionById(r.accountId, r.brokerPositionId)
      await db()
        .from('mtmcopy_signal_log')
        .update({ status: 'closed' })
        .eq('id', r.rowId)
        .then(undefined, () => {})
      n++
    } catch (e) {
      console.warn('[t2t-management] close slave falhou', r.accountId, e)
    }
  }
  return n
}

/** Master EDITOU SL/TP (detetado por polling) → aplica nas posições T2T slave. */
export async function editT2TForSlaves(
  channelSlug: string,
  symbol: string,
  sl: number | null,
  tp: number | null,
): Promise<number> {
  const rows = await resolveOpenT2TByChannelSlug(channelSlug, symbol)
  let n = 0
  for (const r of rows) {
    if (!r.brokerPositionId) continue
    try {
      await modifyPositionSlTp(r.accountId, r.brokerPositionId, sl, tp, null, r.symbol)
      n++
    } catch (e) {
      console.warn('[t2t-management] edit slave falhou', r.accountId, e)
    }
  }
  return n
}

/**
 * Após a gestão, marca 'closed' as posições T2T cujo símbolo já não tem posição aberta
 * nem ordem pendente na conta (fecho total do mestre ou SL/TP atingido).
 */
export async function reconcileT2TPositionsClosed(rows: OpenT2TPosition[]): Promise<void> {
  if (!rows.length) return

  const byAccount = new Map<string, OpenT2TPosition[]>()
  for (const r of rows) {
    const arr = byAccount.get(r.accountId) ?? []
    arr.push(r)
    byAccount.set(r.accountId, arr)
  }

  const closedRowIds: string[] = []
  for (const [accountId, accRows] of byAccount) {
    try {
      const [positions, pending] = await Promise.all([
        readOpenPositions(accountId),
        readPendingOrders(accountId),
      ])
      // Leitura falhada não é "a posição fechou": salta-se a conta e tenta-se na próxima ronda.
      if (positions == null || pending == null) {
        console.warn('[t2t-management] leitura falhou, conta ignorada nesta ronda:', accountId)
        continue
      }
      const openSymbols = [
        ...positions.map((p) => p.symbol?.toUpperCase()).filter(Boolean),
        ...pending.map((p) => p.symbol?.toUpperCase()).filter(Boolean),
      ] as string[]

      for (const r of accRows) {
        const stillOpen = r.symbol
          ? openSymbols.some((s) => symbolsMatch(s, r.symbol))
          : false
        if (!stillOpen) closedRowIds.push(r.rowId)
      }
    } catch (e) {
      console.warn('[t2t-management] reconcile falhou para conta', accountId, e)
    }
  }

  if (closedRowIds.length) {
    // Antes de marcar, guardar a que SINAL pertencem: o fecho tem de ser anunciado ao cliente.
    // Sem isto, uma posição T2T encerrada pela gestão do mestre era fechada em silêncio — e o
    // monitor de preço já não a via (deixa de estar 'open'), por isso ninguém a anunciava.
    const { data: fechadas } = await db()
      .from('mtmcopy_signal_log')
      .select('id, chat_message_id, channel_key, symbol, direction, entry')
      .in('id', closedRowIds)

    await db()
      .from('mtmcopy_signal_log')
      .update({ status: 'closed' })
      .in('id', closedRowIds)
      .then(undefined, (e) => console.warn('[t2t-management] update closed falhou:', e))

    // Uma conta qualquer das que acabámos de reconciliar serve para ler a cotação: o preço de
    // mercado do símbolo é o mesmo, muda só o spread da corretora.
    const contaParaPreco = [...byAccount.keys()][0] ?? null

    // Um anúncio por SINAL (não por conta) — vários seguidores do mesmo sinal não geram várias
    // mensagens iguais no chat.
    const jaAnunciado = new Set<string>()
    for (const f of fechadas ?? []) {
      const row = f as {
        chat_message_id?: string | null; channel_key?: string | null
        symbol?: string | null; direction?: string | null; entry?: number | null
      }
      const msgId = row.chat_message_id
      const slug = row.channel_key
      if (!msgId || !slug || jaAnunciado.has(msgId)) continue
      jaAnunciado.add(msgId)
      try {
        // Preço de fecho: a posição já não existe na corretora, por isso lê-se o preço de
        // mercado agora. É o mesmo instante em que a gestão a encerrou, com a diferença de
        // uma ronda do monitor — chega para o cliente saber com quanto fechou.
        const precoFecho = row.symbol && contaParaPreco
          ? await precoParaMonitor(contaParaPreco, row.symbol).catch(() => null)
          : null
        const { text } = lifecycleMessage('closed', {
          symbol: row.symbol ?? '',
          direction: row.direction === 'sell' ? 'sell' : row.direction === 'buy' ? 'buy' : null,
          entry: row.entry ?? null,
          price: precoFecho,
          reason: 'Encerrada pela gestão da fonte.',
        })
        if (await canalPublicadoPelaMestre(slug)) continue
        const { data: msg } = await db()
          .from('chat_messages')
          .insert({ channel_slug: slug, user_id: null, content: text, message_type: 'telegram_forward', notified: true, reply_to_id: msgId })
          .select('id')
          .single()
        await sendTelegramChannelPush({ slug, content: text, chatMessageId: msg?.id as string }).catch(() => {})
      } catch (e) {
        console.warn('[t2t-management] anúncio de fecho falhou:', e instanceof Error ? e.message : String(e))
      }
    }
  }
}

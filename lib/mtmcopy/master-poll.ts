/**
 * Polling das contas-MESTRE (MetaApi) para Tap to Trade SEM canal Telegram.
 *
 * Para cada rota provider com tap_to_trade ativo, lê as posições da conta-mestre
 * (account_id) via MetaApi e compara com o snapshot (mtmcopy_master_positions):
 *  - NOVA posição  → gera um sinal T2T (chat_message no app_channel da rota) + push,
 *                    permitindo providers SEM Telegram. Os clientes aceitam (tap).
 *  - FECHADA       → fecha as posições T2T slave correspondentes.
 *  - SL/TP editado → aplica a alteração nas posições T2T slave.
 *
 * Não usa CopyFactory (é o motor próprio do Tap to Trade). Idempotente via snapshot.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSignalSourcesConfig } from './signal-sources-config'
import { normalizeProviderRoutes } from './provider-routes'
import { appChannelsForRoute } from './tap-to-trade-channels'
import { listOpenPositions, type MetaApiPosition } from './metaapi'
import { closeT2TForSlaves, editT2TForSlaves } from './t2t-management'
import { syncProviderRouteChannels } from './provider-channels-sync'
import { notifyChatChannelMessage } from '@/lib/chat-channel-notify'

const supabase = getSupabaseAdmin()

function directionFromType(type: string | undefined): 'buy' | 'sell' {
  return (type ?? '').toUpperCase().includes('SELL') ? 'sell' : 'buy'
}

function formatSignalText(p: MetaApiPosition, dir: 'buy' | 'sell'): string {
  // Símbolo + direção na 1.ª linha (parser fiável) e SEM "entrada" → o cliente entra
  // a MERCADO, espelhando a posição já viva do mestre. SL/TP dão o preço (p/ o filtro
  // isEntrySignal). "Ref" só quando não há SL/TP (não é interpretado como entrada).
  const tag = dir === 'buy' ? '🟢' : '🔴'
  const lines = [`${tag} ${p.symbol} ${dir.toUpperCase()}`]
  if (p.stopLoss) lines.push(`SL: ${p.stopLoss}`)
  if (p.takeProfit) lines.push(`TP: ${p.takeProfit}`)
  if (!p.stopLoss && !p.takeProfit && p.openPrice) lines.push(`Ref: ${p.openPrice}`)
  return lines.join('\n')
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface MasterPollResult {
  accounts: number
  opened: number
  closed: number
  edited: number
}

export async function pollMasterAccounts(): Promise<MasterPollResult> {
  const result: MasterPollResult = { accounts: 0, opened: 0, closed: 0, edited: 0 }

  // Mantém os canais de chat dedicados em sync (ativo→aparece, inativo→desaparece)
  await syncProviderRouteChannels().catch((e) =>
    console.warn('[master-poll] sync canais falhou:', e),
  )

  const routes = normalizeProviderRoutes(await getSignalSourcesConfig())
  // Contas-mestre a vigiar: rota ativa + com account_id + ativa no Tap to Trade.
  const masters = routes.filter(
    (r) => r.enabled !== false && r.account_id?.trim() && r.tap_to_trade === true,
  )

  const seen = new Set<string>()
  for (const route of masters) {
    const accountId = route.account_id.trim()
    if (seen.has(accountId)) continue
    seen.add(accountId)
    result.accounts++

    // Canal onde o sinal aparece no feed T2T. Para rotas custom sem app_channel,
    // usa 'trade-ideas-setup' (canal de sinais genérico) — evita o filtro estrito do
    // 'sensei-scanner' (que exige "entrada activada"). Editável via route.app_channel.
    const appChannel =
      route.app_channel?.trim() ||
      appChannelsForRoute(route).find((c) => c !== 'sensei-scanner') ||
      'trade-ideas-setup'

    let current: MetaApiPosition[] = []
    try {
      current = await listOpenPositions(accountId)
    } catch (e) {
      console.warn('[master-poll] listOpenPositions falhou', accountId, e)
      continue
    }

    const { data: snap } = await supabase
      .from('mtmcopy_master_positions')
      .select('id, broker_position_id, symbol, stop_loss, take_profit')
      .eq('master_account_id', accountId)
      .eq('status', 'open')
    const snapById = new Map((snap ?? []).map((s) => [String(s.broker_position_id), s]))
    const currentIds = new Set(current.map((p) => String(p.id)))

    // NOVAS + EDITADAS
    for (const p of current) {
      const id = String(p.id)
      const dir = directionFromType(p.type)
      const existing = snapById.get(id)

      if (!existing) {
        // Reserva ATÓMICA do snapshot (unique master_account_id+broker_position_id).
        // Só quem INSERE (ganha o claim) gera o sinal + notifica → sem duplicados entre
        // execuções de cron sobrepostas, e snapshot gravado antes de notificar.
        const { data: claimed } = await supabase
          .from('mtmcopy_master_positions')
          .upsert(
            {
              master_account_id: accountId,
              broker_position_id: id,
              channel_key: appChannel,
              symbol: p.symbol,
              direction: dir,
              volume: p.volume ?? null,
              open_price: p.openPrice ?? null,
              stop_loss: p.stopLoss ?? null,
              take_profit: p.takeProfit ?? null,
              status: 'open',
            },
            { onConflict: 'master_account_id,broker_position_id', ignoreDuplicates: true },
          )
          .select('id')
        if (!claimed?.length) continue // outra execução já tratou esta posição
        result.opened++

        // Gera sinal T2T (funciona mesmo sem Telegram)
        if (appChannel) {
          const text = formatSignalText(p, dir)
          const { data: msg, error: msgErr } = await supabase
            .from('chat_messages')
            .insert({
              channel_slug: appChannel,
              user_id: null,
              content: text,
              message_type: 'master_poll_signal',
              telegram_sender: route.label ?? route.tag ?? 'MTM Provider',
              created_at: new Date().toISOString(),
            })
            .select('id')
            .single()
          if (msgErr || !msg?.id) {
            // Falha a criar o sinal (ex.: canal de chat ainda não existe / FK) → LIBERTA o
            // claim do snapshot para a próxima ronda voltar a tentar (auto-recuperação),
            // em vez de "consumir" a posição sem nunca gerar o sinal.
            console.error('[master-poll] sinal não criado, a libertar claim:', appChannel, msgErr?.message)
            await supabase
              .from('mtmcopy_master_positions')
              .delete()
              .eq('master_account_id', accountId)
              .eq('broker_position_id', id)
              .then(undefined, () => {})
            result.opened--
            continue
          }
          const signalMsgId = String(msg.id)
          await supabase
            .from('mtmcopy_master_positions')
            .update({ signal_chat_message_id: signalMsgId })
            .eq('master_account_id', accountId)
            .eq('broker_position_id', id)
            .then(undefined, () => {})
          await notifyChatChannelMessage({
            channelSlug: appChannel,
            title: `📈 Novo sinal ${p.symbol}`,
            body: text.split('\n')[0],
            messageId: signalMsgId,
            notificationType: 'trade_ideas',
          }).catch(() => {})
        }
      } else {
        const slChanged = num(existing.stop_loss) !== num(p.stopLoss)
        const tpChanged = num(existing.take_profit) !== num(p.takeProfit)
        if ((slChanged || tpChanged) && appChannel && p.symbol) {
          const n = await editT2TForSlaves(appChannel, p.symbol, p.stopLoss ?? null, p.takeProfit ?? null)
          if (n) console.log(`[master-poll] edição ${p.symbol} → ${n} slave(s) T2T`)
          await supabase
            .from('mtmcopy_master_positions')
            .update({
              stop_loss: p.stopLoss ?? null,
              take_profit: p.takeProfit ?? null,
              last_seen_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
            .then(undefined, () => {})
          result.edited++
        } else {
          await supabase
            .from('mtmcopy_master_positions')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', existing.id)
            .then(undefined, () => {})
        }
      }
    }

    // FECHADAS: no snapshot mas já não estão abertas na conta-mestre
    for (const [id, s] of snapById) {
      if (currentIds.has(id)) continue
      const sym = (s.symbol as string | null) ?? ''
      if (appChannel && sym) {
        const n = await closeT2TForSlaves(appChannel, sym)
        if (n) console.log(`[master-poll] fecho ${sym} → ${n} slave(s) T2T`)
      }
      await supabase
        .from('mtmcopy_master_positions')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', s.id)
        .then(undefined, () => {})
      result.closed++
    }
  }

  return result
}

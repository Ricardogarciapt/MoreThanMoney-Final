import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  listOpenPositions,
  closePositionById,
  modifyPositionSlTp,
  type MetaApiPosition,
} from './metaapi'
import type { TrailingDistance } from './pip-points'
import { getExecSwitches } from './exec-switches'
import { contasSubscritoras, decidirSubscritor } from '@/lib/gestao-real/espelho-premium'

/**
 * Espelhagem dos EXITS Premium diretamente em cada conta de subscritor via MetaAPI.
 *
 * PORQUÊ: o Premium faz os parciais (Exit 1/2/3) só na conta-mestre e conta que o CopyFactory
 * replique aos slaves — MAS o CopyFactory NÃO replica fechos PARCIAIS de forma fiável (e contas
 * a 0.01 nem conseguem escalar). Resultado: os subscritores ficavam com a posição inteira até um
 * fecho total. Aqui aplicamos o MESMO exit em cada conta, cada uma escalando conforme o seu lote.
 *
 * SEGURANÇA: só toca em contas que copiam a estratégia Premium (strategy method, ligadas), casa a
 * posição por SÍMBOLO+DIREÇÃO e, se houver ambiguidade (>1 posição), NÃO age (não arrisca fechar a
 * posição errada de outra pessoa). Gated pelo kill-switch exec `premium_subscriber_exits`.
 */

export type PremiumMirrorAction =
  | { kind: 'close_frac'; frac: number } // fração da posição ATUAL do subscritor a fechar
  | { kind: 'close_all' }
  | { kind: 'be_trailing'; beSl: number; trailing: TrailingDistance }

/** Contas de subscritor que copiam a estratégia Premium por CopyFactory, ativas e ligadas. */
export async function getPremiumSubscriberAccountIds(): Promise<string[]> {
  const admin = getSupabaseAdmin()
  const { data } = await admin
    .from('mtmcopy_connections')
    .select(
      'metaapi_account_id, copy_method, is_active, mt5_status, copyfactory_strategy_id, copyfactory_strategy_pick, strategy_lots',
    )
    .eq('is_active', true)
    .eq('mt5_status', 'connected')
  const rows = (data ?? []) as Array<{
    metaapi_account_id?: string | null
    copy_method?: string | null
    copyfactory_strategy_id?: string | null
    copyfactory_strategy_pick?: string | null
    strategy_lots?: Record<string, number> | null
  }>
  // Quem copia o Premium (pick = ID da estratégia, 'premium', strategy_lots): lib/gestao-real/espelho-premium.ts
  return contasSubscritoras(rows)
}

export interface MirrorResult {
  accounts: number
  acted: number
  skipped: number
  detail: string[]
}

/**
 * Aplica `action` à posição Premium correspondente em cada conta de subscritor.
 * Política de lote POR SUBSCRITOR (escalar só quando o lote dá):
 *  - close_frac: fecha `frac` da posição atual, arredondado p/ baixo a 0.01. Se der < 0.01 →
 *    NÃO fecha (segura); se o que sobra < 0.01 → fecha tudo (evita pó).
 */
export async function mirrorPremiumExit(
  symbol: string,
  direction: 'buy' | 'sell',
  action: PremiumMirrorAction,
): Promise<MirrorResult> {
  const out: MirrorResult = { accounts: 0, acted: 0, skipped: 0, detail: [] }

  const sw = await getExecSwitches()
  if (!sw.premium_subscriber_exits) {
    out.detail.push('premium_subscriber_exits OFF')
    return out
  }

  const accountIds = await getPremiumSubscriberAccountIds()
  out.accounts = accountIds.length

  for (const accountId of accountIds) {
    let positions: MetaApiPosition[]
    try {
      positions = await listOpenPositions(accountId)
    } catch {
      out.skipped++
      out.detail.push(`${accountId.slice(0, 8)}: sem posições (erro)`)
      continue
    }
    // Casamento, ambiguidade e política de lote: lib/gestao-real/espelho-premium.ts (a mesma decisão
    // que o motor em tempo real regista em sombra).
    const d = decidirSubscritor(positions, symbol, direction, action)
    if (d.tipo === 'sem_posicao') {
      out.skipped++
      continue
    }
    if (d.tipo === 'ambiguo') {
      // Ambíguo → NÃO arrisca fechar a errada.
      out.skipped++
      out.detail.push(`${accountId.slice(0, 8)}: ${d.n} posições ${symbol} ${direction} — ambíguo, ignorado`)
      continue
    }
    if (d.tipo === 'sem_volume') {
      out.skipped++
      continue
    }
    const { pos, vol } = d

    try {
      if (d.tipo === 'fechar_tudo') {
        const r = await closePositionById(accountId, pos.id)
        if (r.success) { out.acted++; out.detail.push(`${accountId.slice(0, 8)}: fecha tudo (${vol})`) }
        else if (r.error) out.detail.push(`${accountId.slice(0, 8)}: fecho falhou ${r.error}`)
      } else if (d.tipo === 'be_trailing' && action.kind === 'be_trailing') {
        const r = await modifyPositionSlTp(accountId, pos.id, action.beSl, pos.takeProfit, action.trailing, pos.symbol)
        if (r.success) { out.acted++; out.detail.push(`${accountId.slice(0, 8)}: BE+trailing`) }
        else if (r.error) out.detail.push(`${accountId.slice(0, 8)}: BE falhou ${r.error}`)
      } else if (action.kind === 'close_frac') {
        if (d.tipo === 'segura') {
          out.skipped++
          out.detail.push(`${accountId.slice(0, 8)}: lote ${vol} não escala (${(action.frac * 100).toFixed(0)}%) → segura`)
        } else if (d.tipo === 'fechar_resto') {
          const r = await closePositionById(accountId, pos.id)
          if (r.success) { out.acted++; out.detail.push(`${accountId.slice(0, 8)}: fecha resto (${vol})`) }
          else if (r.error) out.detail.push(`${accountId.slice(0, 8)}: fecho falhou ${r.error}`)
        } else if (d.tipo === 'parcial') {
          const r = await closePositionById(accountId, pos.id, d.volume)
          if (r.success) { out.acted++; out.detail.push(`${accountId.slice(0, 8)}: fecha ${(action.frac * 100).toFixed(0)}% (${d.volume})`) }
          else if (r.error) out.detail.push(`${accountId.slice(0, 8)}: fecho falhou ${r.error}`)
        }
      }
    } catch (e) {
      out.detail.push(`${accountId.slice(0, 8)}: exceção ${e instanceof Error ? e.message : '?'}`)
    }
  }

  // Auditoria persistente (os logs da Vercel rodam): 1 linha por espelhagem que tocou contas.
  if (out.acted || out.skipped) {
    try {
      await getSupabaseAdmin()
        .from('mtmcopy_signal_log')
        .insert({
          symbol,
          direction,
          status: 'executed',
          channel_key: 'premium-signals',
          detail: `[premium-mirror] ${action.kind}: ${out.acted} subs agiram, ${out.skipped} seguraram/ignoraram (${out.accounts} contas) — ${out.detail.slice(0, 6).join(' | ')}`.slice(0, 500),
        })
    } catch {
      /* auditoria best-effort — não bloqueia a gestão */
    }
  }
  return out
}

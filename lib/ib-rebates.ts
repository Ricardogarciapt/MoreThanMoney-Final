/**
 * REBATES DO IB NA PU PRIME — o acordo e a estimativa a partir do que o NOSSO sistema copiou.
 *
 * PORQUE É UMA ESTIMATIVA E NÃO UM EXTRACTO
 * A API da PU Prime que temos (PrimeGate) só diz se um email/UID é cliente do IB; não dá volume
 * nem comissão. O que se sabe ao certo é o que a cópia mandou para as contas PU Prime dos clientes
 * (copia_posicoes, por lote e por símbolo). As trades manuais deles não passam por aqui, por isso
 * isto é um MÍNIMO — o extracto do portal IB é que fecha o número.
 *
 * O acordo (print do dono, 30/09/2026): rebate em pips por lote nos STP (FX 2,6 · XAU 3 · OIL 3 ·
 * XAG 2,6) e em USD por milhão de notional nos outros (cripto 65 · índices 35 · acções/ETF/bonds
 * 18). O mark-up de 2 pips fica de fora: é o que o cliente paga a mais no spread, não é rebate.
 *
 * O PIP DO OURO É A INCERTEZA. Se a corretora contar o pip a 0,01 $ (cotação a 2 casas), 3 pips
 * são 3 $/lote; a 0,10 $, são 30 $/lote. Dá-se o intervalo e diz-se porquê, em vez de escolher.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ClasseIB = 'FX' | 'XAU' | 'XAG' | 'OIL' | 'CRYPTO' | 'INDEX' | 'OUTRO'

/** USD por lote (padrão 100 000 / 100 oz) ou por milhão de notional, conforme a classe. */
export const ACORDO_PU_PRIME = {
  porLote: {
    FX: 2.6 * 10,    // 2,6 pips × 10 $/pip no lote padrão
    XAG: 2.6 * 50,   // 2,6 pips × 50 $/pip (5 000 oz, pip 0,01)
    OIL: 3 * 10,     // 3 pips × 10 $/pip (1 000 barris, pip 0,01)
  } as Record<string, number>,
  /** Ouro: 3 pips/lote, com o valor do pip em aberto. */
  xauPorLote: { baixo: 3 * 1, alto: 3 * 10 },
  porMilhao: { CRYPTO: 65, INDEX: 35 } as Record<string, number>,
} as const

export function classeDoSimbolo(simbolo: string | null | undefined): ClasseIB {
  const s = (simbolo ?? '').toUpperCase()
  if (!s) return 'OUTRO'
  if (/^XAU/.test(s)) return 'XAU'
  if (/^XAG/.test(s)) return 'XAG'
  if (/OIL|WTI|BRENT|XTI|XBR/.test(s)) return 'OIL'
  if (/BTC|ETH|SOL|XRP|LTC|DOGE|ADA|BNB|DOT|AVAX|LINK/.test(s)) return 'CRYPTO'
  if (/NAS|US30|US100|US500|SPX|SP500|DJI|GER|DAX|UK100|FTSE|JPN|JP225|NIKKEI|HK50|AUS200|FRA40|EU50|STOXX/.test(s)) return 'INDEX'
  if (/^[A-Z]{6}/.test(s)) return 'FX'
  return 'OUTRO'
}

export interface LinhaRebate {
  mes: string            // AAAA-MM
  conta: string          // login MT5
  classe: ClasseIB
  ordens: number
  lotes: number
  notionalUsd: number    // só faz sentido em CRYPTO/INDEX
  rebateBaixo: number
  rebateAlto: number
}

/** Tamanho do contrato por lote, para o notional. A PU Prime usa 1 unidade/lote na cripto e nos índices. */
function contratoPorLote(classe: ClasseIB): number {
  return classe === 'CRYPTO' || classe === 'INDEX' ? 1 : 0
}

export function rebateDe(classe: ClasseIB, lotes: number, notionalUsd: number): { baixo: number; alto: number } {
  if (classe === 'XAU') return { baixo: lotes * ACORDO_PU_PRIME.xauPorLote.baixo, alto: lotes * ACORDO_PU_PRIME.xauPorLote.alto }
  const porLote = ACORDO_PU_PRIME.porLote[classe]
  if (porLote) return { baixo: lotes * porLote, alto: lotes * porLote }
  const porMilhao = ACORDO_PU_PRIME.porMilhao[classe]
  if (porMilhao) {
    const v = (notionalUsd / 1_000_000) * porMilhao
    return { baixo: v, alto: v }
  }
  return { baixo: 0, alto: 0 }
}

/**
 * Agrupa as cópias executadas em contas PU Prime por mês, conta e classe, e aplica o acordo.
 * Só o que ENTROU (aberta/parcial/fechada com lote > 0): recusas e ordens que expiraram não geram volume.
 */
export async function estimarRebatesPuPrime(db: SupabaseClient, desde?: string): Promise<LinhaRebate[]> {
  const { data: rotas } = await db
    .from('copia_rotas')
    .select('id, destino_chave')
    .ilike('destino_chave', '%puprime%')
  const porRota = new Map<string, string>()
  for (const r of (rotas ?? []) as Array<{ id: string; destino_chave: string | null }>) {
    const m = /^mt:(\d+)@/i.exec(r.destino_chave ?? '')
    if (m) porRota.set(r.id, m[1])
  }
  if (porRota.size === 0) return []

  let q = db
    .from('copia_posicoes')
    .select('rota_id, destino_simbolo, volume_destino_abertura, preco_destino, estado, created_at')
    .in('rota_id', [...porRota.keys()])
    .in('estado', ['aberta', 'parcial', 'fechada'])
    .gt('volume_destino_abertura', 0)
    .limit(20000)
  if (desde) q = q.gte('created_at', desde)
  const { data } = await q

  const agreg = new Map<string, LinhaRebate>()
  for (const p of (data ?? []) as Array<{ rota_id: string; destino_simbolo: string | null; volume_destino_abertura: number | string | null; preco_destino: number | string | null; created_at: string }>) {
    const conta = porRota.get(p.rota_id)
    if (!conta) continue
    const lotes = Number(p.volume_destino_abertura ?? 0)
    if (!(lotes > 0)) continue
    const classe = classeDoSimbolo(p.destino_simbolo)
    const mes = p.created_at.slice(0, 7)
    const preco = Number(p.preco_destino ?? 0)
    const notional = lotes * contratoPorLote(classe) * (preco > 0 ? preco : 0)
    const k = `${mes}|${conta}|${classe}`
    const l = agreg.get(k) ?? { mes, conta, classe, ordens: 0, lotes: 0, notionalUsd: 0, rebateBaixo: 0, rebateAlto: 0 }
    l.ordens++
    l.lotes += lotes
    l.notionalUsd += notional
    agreg.set(k, l)
  }
  for (const l of agreg.values()) {
    const r = rebateDe(l.classe, l.lotes, l.notionalUsd)
    l.rebateBaixo = r.baixo
    l.rebateAlto = r.alto
  }
  return [...agreg.values()].sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : a.conta.localeCompare(b.conta)))
}

/**
 * Peças partilhadas pelos adaptadores das contas REAIS (TradeLocker e MT5).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { criarLimitador } from './regras'
import { frescuraDoPreco } from '../frescura-preco'
import type { PrecoWT } from './tipos'

/** Um limitador por instância do servidor, partilhado por todos os utilizadores e separadores. */
export const limitador = criarLimitador()

/**
 * Preço do NOSSO feed (funded_precos) para o símbolo canónico — grátis, serve o gráfico e o ticket.
 * Marcado `indicativo`: a ordem a mercado executa ao preço da corretora, que pode diferir uns pips.
 */
export async function precoIndicativo(symbol: string): Promise<PrecoWT | null> {
  const s = symbol.toUpperCase()
  const { data } = await getSupabaseAdmin().from('funded_precos').select('symbol, bid, ask, em').eq('symbol', s).maybeSingle()
  if (!data) return null
  const bid = Number(data.bid)
  const ask = Number(data.ask)
  if (!(bid > 0) || !(ask > 0)) return null
  /**
   * O preço vai SEMPRE com a idade. Não se recusa um preço velho — ao fim-de-semana o último
   * preço é legitimamente o de sexta — mas também não se deixa passar por actual. Medido a
   * 01/10: dos 201 símbolos deste feed, 155 estavam parados há mais de uma hora e 80 há mais de
   * uma semana, e todos eram servidos como se fossem de agora.
   */
  const f = frescuraDoPreco(data.em)
  return {
    symbol: s, bid, ask, em: String(data.em), indicativo: true,
    grau: f.grau, idadeSegundos: Math.round(f.idadeSegundos), fresco: f.fresco, rotulo: f.rotulo,
  }
}

export const numOuNull = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

export const isoDe = (v: unknown): string | null => {
  if (v == null || v === '') return null
  const t = typeof v === 'number' ? v : Date.parse(String(v))
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

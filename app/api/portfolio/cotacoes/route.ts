import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { cotacoesCripto, cotacoesEtf, parBinance } from '@/lib/portfolios/cotacoes'

/**
 * As cotações da /portfolios, tal como o cron as deixou (migração 234). Só lê a base: nenhum
 * visitante dispara pedidos à Binance, ao Yahoo, ao CoinGecko ou à IA.
 *
 * Rede de segurança: se a tabela ainda não existir ou estiver vazia (antes da 234 / da primeira
 * passagem do cron), vai às mesmas fontes grátis UMA vez e a CDN guarda a resposta 60 s.
 */
export const dynamic = 'force-dynamic'
const CACHE = { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' }

export async function GET() {
  const db = getSupabaseAdmin()
  const cotacoes: Record<string, unknown> = {}
  try {
    const { data } = await db
      .from('portfolio_cotacoes')
      .select('symbol, tipo, preco, var_24h_pct, fonte, atualizado_em, tp1, tp2, tp3, stop_loss, ia_validado, ia_em')
    for (const r of data ?? []) cotacoes[String(r.symbol)] = r
  } catch {
    /* tabela ainda por criar: segue para a rede de segurança */
  }
  if (Object.keys(cotacoes).length) return NextResponse.json({ success: true, origem: 'base', cotacoes }, { headers: CACHE })

  try {
    const [{ data: cr }, { data: et }] = await Promise.all([
      db.from('admin_crypto_portfolio').select('symbol'),
      db.from('admin_etf_portfolio').select('symbol'),
    ])
    const [pc, pe] = await Promise.all([
      cotacoesCripto((cr ?? []).map((r) => parBinance(String(r.symbol)))),
      cotacoesEtf((et ?? []).map((r) => String(r.symbol))),
    ])
    for (const c of [...Object.values(pc), ...Object.values(pe)]) {
      cotacoes[c.symbol] = { symbol: c.symbol, preco: c.preco, var_24h_pct: c.var24hPct, fonte: c.fonte, ia_validado: false }
    }
    return NextResponse.json({ success: true, origem: 'directo', cotacoes }, { headers: CACHE })
  } catch (e) {
    return NextResponse.json({ success: false, cotacoes: {}, erro: e instanceof Error ? e.message : 'erro' })
  }
}

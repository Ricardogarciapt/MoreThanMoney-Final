/**
 * Cron das cotações da /portfolios — de 15 em 15 minutos (vercel.json).
 *
 * Escreve `portfolio_cotacoes` (migração 234) com fontes grátis (lib/portfolios/cotacoes.ts) para os
 * activos de `admin_crypto_portfolio` e `admin_etf_portfolio`. A página lê a tabela e deixa de ir
 * fora por visitante — era isso que falhava (451 da Binance na Vercel, limite do CoinGecko) e que
 * pagava IA a cada 2 minutos por visita.
 *
 * TP/SL da IA: no máximo 3 activos por passagem e cada um só se a análise tiver mais de 24 h. São
 * ~11 chamadas por dia no total, pela porta única `chamarIA` (grátis primeiro).
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { cotacoesCripto, cotacoesEtf, parBinance } from '@/lib/portfolios/cotacoes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const IA_POR_PASSAGEM = 3
const IA_VALIDADE_MS = 24 * 3600_000

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()

  const [{ data: cr }, { data: et }] = await Promise.all([
    db.from('admin_crypto_portfolio').select('symbol, entry_price'),
    db.from('admin_etf_portfolio').select('symbol'),
  ])
  const cripto = (cr ?? []).map((r) => parBinance(String(r.symbol))).filter(Boolean)
  const etfs = (et ?? []).map((r) => String(r.symbol)).filter(Boolean)

  const [pc, pe] = await Promise.all([cotacoesCripto(cripto), cotacoesEtf(etfs)])
  const agora = new Date().toISOString()
  const linhas = [
    ...Object.values(pc).map((c) => ({ symbol: c.symbol, tipo: 'cripto', preco: c.preco, var_24h_pct: c.var24hPct, fonte: c.fonte, atualizado_em: agora })),
    ...Object.values(pe).map((c) => ({ symbol: c.symbol, tipo: 'etf', preco: c.preco, var_24h_pct: c.var24hPct, fonte: c.fonte, atualizado_em: agora })),
  ]
  if (linhas.length) {
    const { error } = await db.from('portfolio_cotacoes').upsert(linhas, { onConflict: 'symbol' })
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }

  // TP/SL da IA, devagar: os mais antigos primeiro.
  const ia: string[] = []
  const { data: guardadas } = await db.from('portfolio_cotacoes').select('symbol, preco, ia_em').eq('tipo', 'cripto')
  const entrada = new Map((cr ?? []).map((r) => [parBinance(String(r.symbol)), Number(r.entry_price) || 0]))
  const porFazer = (guardadas ?? [])
    .filter((g) => cripto.includes(String(g.symbol)) && (!g.ia_em || Date.now() - Date.parse(String(g.ia_em)) > IA_VALIDADE_MS))
    .sort((a, b) => (a.ia_em ? Date.parse(String(a.ia_em)) : 0) - (b.ia_em ? Date.parse(String(b.ia_em)) : 0))
    .slice(0, IA_POR_PASSAGEM)
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').trim()
  for (const g of porFazer) {
    try {
      const preco = entrada.get(String(g.symbol)) || Number(g.preco) || 0
      const r = await fetch(`${site}/api/portfolio/ai-tp-sl?symbol=${encodeURIComponent(String(g.symbol))}&entryPrice=${preco}`, { cache: 'no-store', signal: AbortSignal.timeout(25_000) })
      const j = r.ok ? await r.json() : null
      const tp = j?.take_profit_levels
      await db.from('portfolio_cotacoes').update({
        tp1: tp?.tp1?.price ?? null, tp2: tp?.tp2?.price ?? null, tp3: tp?.tp3?.price ?? null,
        stop_loss: j?.stop_loss?.price ?? null, ia_validado: j?.ai_validated === true, ia_em: new Date().toISOString(),
      }).eq('symbol', g.symbol)
      ia.push(`${g.symbol}:${j?.ai_validated === true ? 'ia' : 'tecnico'}`)
    } catch (e) {
      ia.push(`${g.symbol}:erro`)
    }
  }

  const semPreco = [...cripto.filter((s) => !pc[s]), ...etfs.filter((s) => !pe[s])]
  return NextResponse.json({ ok: true, gravadas: linhas.length, semPreco, ia })
}

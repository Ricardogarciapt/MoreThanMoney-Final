/**
 * Cron SEMANAL do DCA das contas de portefólio (PORTF-CRIPTO e PORTF-ETF) — sábado de manhã.
 *
 * Pedido do Ricardo (05/11/2026): «às sextas fazer esses DCA automaticamente, pois eu estou a fazer
 * o mesmo». O plano e as regras estão em lib/portfolios/dca-semanal.ts.
 *
 * Para a última sexta já FECHADA (ou `?data=YYYY-MM-DD`, para repor uma semana), em cada conta:
 *  1) se já há compras «DCA semanal · sexta» nessa data, não faz nada (pode correr duas vezes);
 *  2) vai buscar o fecho de sexta de cada activo (Binance 1d / Yahoo 1d) — se faltar UM, a conta
 *     fica por gravar e a resposta diz qual; nunca se grava meia semana;
 *  3) grava as compras, um ponto novo em `portefolio_curva` e o saldo da conta: `sim_saldo` =
 *     contribuído, `sim_equity` = valor de mercado (é o que a página /portfolios lê).
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  MOTIVO_DCA, PLANOS_DCA, carteira, comprasDaSemana, liquidez, totalDoPlano, ultimaSextaFechada, valorDeMercado,
  type FontePreco,
} from '@/lib/portfolios/dca-semanal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; MTM/1.0)' }

async function json(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers: UA, cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

/** Fecho diário da Binance da vela que abre às 00:00 UTC de `data`. */
async function fechoBinance(symbol: string, data: string): Promise<number | null> {
  const ms = Date.parse(`${data}T00:00:00Z`)
  for (const base of ['https://data-api.binance.vision', 'https://api.binance.com']) {
    const k = await json(`${base}/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${ms}&limit=1`)
    if (Array.isArray(k) && Array.isArray(k[0]) && Number(k[0][0]) === ms) {
      const c = Number(k[0][4])
      if (Number.isFinite(c) && c > 0) return c
    }
  }
  return null
}

/** Fecho da sessão de `data` no Yahoo. */
async function fechoYahoo(symbol: string, data: string): Promise<number | null> {
  const p1 = Date.parse(`${data}T00:00:00Z`) / 1000
  for (const host of ['query1', 'query2']) {
    const j = (await json(`https://${host}.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${p1}&period2=${p1 + 2 * 86400}&interval=1d`)) as
      | { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } }
      | null
    const r = j?.chart?.result?.[0]
    const ts = r?.timestamp ?? []
    const cl = r?.indicators?.quote?.[0]?.close ?? []
    for (let i = 0; i < ts.length; i++) {
      if (new Date(ts[i] * 1000).toISOString().slice(0, 10) === data && Number(cl[i]) > 0) return Number(cl[i])
    }
  }
  return null
}

const fecho = (f: FontePreco, s: string, d: string) => (f === 'binance' ? fechoBinance(s, d) : fechoYahoo(s, d))

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const pedida = req.nextUrl.searchParams.get('data')
  const data = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : ultimaSextaFechada(new Date())
  const db = getSupabaseAdmin()
  const resultado: Array<Record<string, unknown>> = []

  for (const plano of PLANOS_DCA) {
    try {
      const { data: conta } = await db
        .from('mtm_trading_accounts')
        .select('id, metricas')
        .eq('mt5_login', plano.login)
        .eq('conta_portefolio', true)
        .maybeSingle()
      if (!conta) { resultado.push({ conta: plano.login, estado: 'conta não encontrada' }); continue }

      const { count } = await db
        .from('portefolio_movimentos')
        .select('id', { count: 'exact', head: true })
        .eq('conta_id', conta.id).eq('tipo', 'compra').eq('data', data).eq('motivo', MOTIVO_DCA)
      if ((count ?? 0) > 0) { resultado.push({ conta: plano.login, data, estado: 'já feito' }); continue }

      const { data: movs } = await db
        .from('portefolio_movimentos')
        .select('symbol, tipo, unidades, valor')
        .eq('conta_id', conta.id)
        .lte('data', data)
      const antes = carteira(movs ?? [])
      const simbolos = [...new Set([...Object.keys(plano.reforco), ...Object.keys(antes)])]
      const precos: Record<string, number | null> = {}
      await Promise.all(simbolos.map(async (s) => { precos[s] = await fecho(plano.fonte, s, data) }))
      const semPreco = simbolos.filter((s) => !precos[s])

      const compras = comprasDaSemana(plano, precos)
      if (!compras || semPreco.length) {
        resultado.push({ conta: plano.login, data, estado: 'sem cotação', semPreco })
        continue
      }

      const novas = compras.map((c) => ({ conta_id: conta.id, symbol: c.symbol, tipo: 'compra', data, unidades: c.unidades, preco: c.preco, valor: c.valor, motivo: MOTIVO_DCA }))
      const { error: e1 } = await db.from('portefolio_movimentos').insert(novas)
      if (e1) throw e1

      const todos = [...(movs ?? []), ...novas]
      const valor = valorDeMercado(carteira(todos), precos, liquidez(todos))
      const { data: ult } = await db
        .from('portefolio_curva').select('contribuido').eq('conta_id', conta.id).lt('data', data)
        .order('data', { ascending: false }).limit(1).maybeSingle()
      const contribuido = Math.round((Number(ult?.contribuido ?? 0) + totalDoPlano(plano)) * 100) / 100

      if (valor != null) {
        await db.from('portefolio_curva').insert({ conta_id: conta.id, data, contribuido, valor })
        const metricas = { ...((conta.metricas ?? {}) as Record<string, unknown>), saldo: contribuido, contribuido, valor: Math.round(valor) }
        await db.from('mtm_trading_accounts').update({ sim_saldo: contribuido, sim_equity: valor, metricas }).eq('id', conta.id)
      }
      resultado.push({ conta: plano.login, data, estado: 'gravado', compras: novas.length, contribuido, valor })
    } catch (e) {
      resultado.push({ conta: plano.login, data, estado: 'erro', erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return NextResponse.json({ ok: true, data, resultado })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * VELAS HISTÓRICAS para o gráfico do WebTrader.
 *
 * GET ?symbol=XAUUSD&tf=M1|M5|M15|H1|H4|D1&limit=300[&ate=<unix s>] → { velas: [{ t, o, h, l, c, v }], fonte }
 * (`v` = volume de ticks da MetaApi, para o painel de volume do gráfico; 0 quando não vem)
 *
 * `ate` pede as velas ANTERIORES a esse instante: é assim que o gráfico do TradingView (Advanced
 * Charts) pede mais histórico quando se arrasta para trás. Sem `ate`, as últimas até agora.
 *
 * Sem isto o gráfico abria vazio e só ganhava velas com o tempo que o trader lá ficasse. As velas
 * vêm do MESMO sítio que a reposição de desempenho (lib/mtmauto/reconstruir-desempenho): o
 * histórico da MetaApi lido através de uma conta provider já ligada — as velas são do mercado, não
 * da conta, e pedir por uma conta é só a forma como a MetaApi serve histórico. Custo marginal zero.
 *
 * Falhar é normal (MetaApi a desligar contas ociosas, símbolo sem histórico): devolve lista vazia
 * e o gráfico constrói-se pelos preços ao vivo, dizendo-o.
 *
 * Cache de 30 s por símbolo+tf nesta instância e na CDN: dez pessoas no ouro não são dez pedidos.
 */

const MERCADO = 'https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai'
const TF: Record<string, string> = { M1: '1m', M5: '5m', M15: '15m', H1: '1h', H4: '4h', D1: '1d' }
const CACHE_MS = 30_000
const cache = new Map<string, { em: number; corpo: unknown }>()

let contaLeitura: { id: string | null; em: number } = { id: null, em: 0 }
async function contaDeLeitura(): Promise<string | null> {
  if (contaLeitura.id && Date.now() - contaLeitura.em < 10 * 60_000) return contaLeitura.id
  const { data } = await getSupabaseAdmin()
    .from('mtm_trading_accounts').select('metaapi_account_id')
    .eq('tipo', 'provider').not('metaapi_account_id', 'is', null).limit(1)
  contaLeitura = { id: (data?.[0]?.metaapi_account_id as string) ?? null, em: Date.now() }
  return contaLeitura.id
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const symbol = (sp.get('symbol') ?? '').toUpperCase()
  const tf = (sp.get('tf') ?? 'M5').toUpperCase()
  const limit = Math.min(1000, Math.max(20, Number(sp.get('limit') ?? 300) || 300))
  if (!/^[A-Z0-9._#-]{1,24}$/.test(symbol) || !TF[tf]) {
    return NextResponse.json({ error: 'symbol/tf inválidos' }, { status: 400 })
  }
  // Arredondado ao minuto: dois pedidos de histórico ao mesmo ponto partilham a cache.
  const ateNum = Number(sp.get('ate'))
  const ate = Number.isFinite(ateNum) && ateNum > 946684800 ? Math.floor(ateNum / 60) * 60 : null
  const chave = `${symbol}:${tf}:${limit}:${ate ?? 'agora'}`
  const guardado = cache.get(chave)
  const cabecalhos = { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }
  if (guardado && Date.now() - guardado.em < CACHE_MS) return NextResponse.json(guardado.corpo, { headers: cabecalhos })

  const vazio = (motivo: string) => ({ symbol, tf, velas: [], fonte: null, motivo })
  const token = process.env.METAAPI_TOKEN
  if (!token) return NextResponse.json(vazio('sem histórico configurado'), { headers: cabecalhos })

  const { data: s } = await getSupabaseAdmin().from('funded_symbols').select('simbolo_fonte').eq('symbol', symbol).maybeSingle()
  if (!s) return NextResponse.json(vazio('símbolo desconhecido'), { status: 404 })
  const conta = await contaDeLeitura()
  if (!conta) return NextResponse.json(vazio('sem conta de leitura'), { headers: cabecalhos })

  let corpo: unknown = vazio('histórico indisponível')
  try {
    // A MetaApi pagina para TRÁS: `startTime` = agora devolve as `limit` velas anteriores.
    const url = `${MERCADO}/users/current/accounts/${conta}/historical-market-data/symbols/` +
      `${encodeURIComponent(String(s.simbolo_fonte || symbol))}/timeframes/${TF[tf]}/candles` +
      `?startTime=${new Date(ate ? ate * 1000 : Date.now()).toISOString()}&limit=${limit}`
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 8000)
    const r = await fetch(url, { headers: { 'auth-token': token }, signal: ctl.signal }).finally(() => clearTimeout(t))
    if (r.ok) {
      const lote = (await r.json()) as Array<Record<string, unknown>>
      const velas = lote
        .map((v) => ({
          t: Math.floor(new Date(String(v.time)).getTime() / 1000),
          o: Number(v.open), h: Number(v.high), l: Number(v.low), c: Number(v.close),
          v: Number(v.tickVolume ?? v.volume ?? 0) || 0,
        }))
        .filter((v) => Number.isFinite(v.t) && v.o > 0 && v.h > 0 && v.l > 0 && v.c > 0 && (ate == null || v.t < ate))
        .sort((a, b) => a.t - b.t)
      corpo = { symbol, tf, velas, fonte: 'metaapi' }
    }
  } catch {
    /* vazio — o cliente constrói pelos preços ao vivo */
  }
  cache.set(chave, { em: Date.now(), corpo })
  return NextResponse.json(corpo, { headers: cabecalhos })
}

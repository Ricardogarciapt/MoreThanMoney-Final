import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'

/**
 * VELAS PARA OS GRÁFICOS DO AGENTE CRIPTO (só leitura, endpoints públicos).
 *
 *  · perp: Bybit v5 kline linear (inclui a vela em curso, para o gráfico mexer).
 *  · spot: GeckoTerminal — a pool com mais liquidez do token (mint) e as velas dela.
 *
 * `t` sai em SEGUNDOS unix, como o Lightweight Charts e os nossos estudos (lib/estudos) esperam.
 * Corre em Frankfurt: a Bybit recusa pedidos de algumas regiões.
 */
export const dynamic = 'force-dynamic'
export const preferredRegion = 'fra1'

const TFS = new Set([1, 3, 5, 15, 60])

async function json(url: string): Promise<any> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(7000), cache: 'no-store', headers: { accept: 'application/json' } })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const q = request.nextUrl.searchParams
  const mercado = q.get('mercado') === 'spot' ? 'spot' : 'perp'
  const id = (q.get('id') ?? '').trim()
  const tf = TFS.has(Number(q.get('tf'))) ? Number(q.get('tf')) : 5
  const limite = Math.min(1000, Math.max(50, Number(q.get('limite')) || 400))

  if (mercado === 'perp') {
    if (!/^[A-Z0-9]{2,20}USDT$/.test(id)) return NextResponse.json({ ok: false, error: 'Símbolo inválido.' }, { status: 400 })
    const j = await json(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${id}&interval=${tf}&limit=${limite}`)
    const velas = ((j?.result?.list ?? []) as string[][])
      .map((x) => ({ t: Math.floor(Number(x[0]) / 1000), o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }))
      .filter((v) => Number.isFinite(v.c))
      .reverse()
    return NextResponse.json({ ok: velas.length > 0, velas, fonte: 'Bybit' })
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) return NextResponse.json({ ok: false, error: 'Mint inválido.' }, { status: 400 })
  const pools = await json(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${id}/pools?page=1`)
  const lista = (pools?.data ?? []) as { attributes?: { address?: string; reserve_in_usd?: string; name?: string } }[]
  const melhor = [...lista].sort((a, b) => Number(b.attributes?.reserve_in_usd ?? 0) - Number(a.attributes?.reserve_in_usd ?? 0))[0]?.attributes
  if (!melhor?.address) return NextResponse.json({ ok: false, error: 'Sem pool para este token.', velas: [] })
  const tipo = tf >= 60 ? 'hour' : 'minute'
  const agg = tf >= 60 ? 1 : tf
  const o = await json(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${melhor.address}/ohlcv/${tipo}?aggregate=${agg}&limit=${limite}&currency=usd`)
  const velas = ((o?.data?.attributes?.ohlcv_list ?? []) as number[][])
    .map((x) => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] }))
    .filter((v) => Number.isFinite(v.c))
    .sort((a, b) => a.t - b.t)
  return NextResponse.json({ ok: velas.length > 0, velas, fonte: `GeckoTerminal · ${melhor.name ?? 'pool'}` })
}

import { NextRequest, NextResponse } from 'next/server'
import { MAX_VELAS, TF_METAAPI, obterVelas } from '@/lib/mtmfunded/simulado/velas'

export const dynamic = 'force-dynamic'

/**
 * VELAS HISTÓRICAS para o gráfico do WebTrader.
 *
 * GET ?symbol=XAUUSD&tf=M1|M5|M15|H1|H4|D1&limit=300[&ate=<unix s>]
 *   → { symbol, tf, velas: [{ t, o, h, l, c, v }], fonte, simboloFonte?, motivo? }
 * (`v` = volume de ticks da MetaApi — painel de volume e MTM Sensei; 0 quando não vem)
 *
 * `limit` vai até 5000 (o Sensei pede 3000; a MetaApi dá 1000 por página e o helper pagina para
 * trás). `ate` pede as velas ANTERIORES a esse instante: é assim que se pede mais histórico quando
 * se arrasta para trás. Sem `ate`, as últimas até agora.
 *
 * Toda a lógica (resolução do nome do símbolo na conta de leitura, paginação, cache LRU + pedidos
 * em curso partilhados) está em lib/mtmfunded/simulado/velas.ts — ver lá o porquê do XAUUSD.s.
 *
 * Falhar é normal (MetaApi a desligar contas ociosas, símbolo sem histórico): devolve lista vazia
 * e o gráfico constrói-se pelos preços ao vivo, dizendo-o.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const symbol = (sp.get('symbol') ?? '').toUpperCase()
  const tf = (sp.get('tf') ?? 'M5').toUpperCase()
  const limit = Math.min(MAX_VELAS, Math.max(20, Number(sp.get('limit') ?? 300) || 300))
  if (!/^[A-Z0-9._#-]{1,24}$/.test(symbol) || !TF_METAAPI[tf]) {
    return NextResponse.json({ error: 'symbol/tf inválidos' }, { status: 400 })
  }
  // Arredondado ao minuto: dois pedidos de histórico ao mesmo ponto partilham a cache.
  const ateNum = Number(sp.get('ate'))
  const ate = Number.isFinite(ateNum) && ateNum > 946684800 ? Math.floor(ateNum / 60) * 60 : null
  const corpo = await obterVelas(symbol, tf, limit, ate)
  return NextResponse.json(corpo, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
}

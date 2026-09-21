import { NextRequest, NextResponse } from 'next/server'
import { JANELA_RECENTE, MAX_VELAS, TF_METAAPI, obterVelas } from '@/lib/mtmfunded/simulado/velas'
import { paraColunas } from '@/lib/webtrader/velas'

export const dynamic = 'force-dynamic'

/**
 * VELAS HISTÓRICAS para o gráfico do WebTrader.
 *
 * GET ?symbol=XAUUSD&tf=M1|M5|M15|H1|H4|D1&limit=300[&ate=<unix s>][&f=a]
 *   → { symbol, tf, velas: [{ t, o, h, l, c, v }], fonte, simboloFonte?, motivo? }
 *   → com `f=a` (formato do gráfico): { symbol, tf, col: { t:[], o:[], h:[], l:[], c:[], v:[] }, fonte, … }
 * (`v` = volume de ticks da MetaApi — painel de volume e MTM Sensei; 0 quando não vem)
 *
 * `limit` vai até 5000 (o Sensei pede 3000; a MetaApi dá 1000 por página e o helper pagina para
 * trás). `ate` pede as velas ANTERIORES a esse instante: é assim que se pede mais histórico quando
 * se arrasta para trás. Sem `ate`, as últimas até agora.
 *
 * Toda a lógica (resolução do nome do símbolo na conta de leitura, paginação, cache LRU + pedidos
 * em curso partilhados) está em lib/mtmfunded/simulado/velas.ts — ver lá o porquê do XAUUSD.s.
 *
 * Sem MetaApi (2026-09-21: conta de leitura UNDEPLOYED, sem créditos) as velas vêm das reservas
 * públicas — Binance spot (cripto, PAXG para o ouro) e Yahoo (forex, metais, índices, energia,
 * acções) — reescaladas ao nosso nível; `fonte`/`simboloFonte`/`reescala` dizem de onde e quanto.
 * A MetaApi tem 3 s e corre em PARALELO com a reserva (VELAS_METAAPI=0 tira-a de todo).
 * Só sem nenhuma das duas vem a lista vazia e o gráfico constrói-se pelos preços ao vivo.
 *
 * Cache (2026-09, «rápido como o TradingView»): as velas são do mercado, iguais para toda a gente,
 * por isso servem-se da CDN — `s-maxage` curto conforme o timeframe (uma vela de M1 muda a cada
 * minuto, uma de D1 quase nada) e `stale-while-revalidate=300`: a CDN responde logo com a cópia e
 * revalida por trás. O gráfico cola o preço ao vivo por cima da última vela, por isso uma cópia com
 * segundos não se nota. `max-age` curto deixa o browser reaproveitar o pedido pré-aquecido (hover no
 * link, pré-carga) ao mudar de página; o ETag faz a revalidação responder 304 sem corpo.
 * Nada disto lê ou escreve na base: a resolução do símbolo lê o catálogo uma vez por instância (6 h).
 */
const S_MAXAGE: Record<string, number> = { M1: 5, M5: 10, M15: 15, H1: 30, H4: 60, D1: 120 }

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const symbol = (sp.get('symbol') ?? '').toUpperCase()
  const tf = (sp.get('tf') ?? 'M5').toUpperCase()
  const limit = Math.min(MAX_VELAS, Math.max(20, Number(sp.get('limit') ?? 300) || 300))
  const compacto = sp.get('f') === 'a'
  if (!/^[A-Z0-9._#-]{1,24}$/.test(symbol) || !TF_METAAPI[tf]) {
    return NextResponse.json({ error: 'symbol/tf inválidos' }, { status: 400 })
  }
  // Arredondado ao minuto: dois pedidos de histórico ao mesmo ponto partilham a cache.
  const ateNum = Number(sp.get('ate'))
  const ate = Number.isFinite(ateNum) && ateNum > 946684800 ? Math.floor(ateNum / 60) * 60 : null
  const corpo = await obterVelas(symbol, tf, limit, ate)

  // Histórico para trás (`ate`) não muda: longo. Sem velas (falha passageira): quase nada, para o
  // gráfico não ficar vazio na CDN quando a conta de leitura voltar.
  const n = corpo.velas.length
  const cache = n === 0
    ? 'public, max-age=0, s-maxage=5'
    : ate != null
      ? 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
      : `public, max-age=${limit > JANELA_RECENTE ? 5 : 2}, s-maxage=${S_MAXAGE[tf] ?? 15}, stale-while-revalidate=300`

  const u = n ? corpo.velas[n - 1] : null
  const etag = `W/"${[symbol, tf, limit, ate ?? '', compacto ? 'a' : 'o', n, n ? corpo.velas[0].t : '', u?.t ?? '', u?.c ?? '', u?.h ?? '', u?.l ?? '', u?.v ?? ''].join('-')}"`
  const headers = { 'Cache-Control': cache, ETag: etag }
  if (request.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers })

  if (!compacto) return NextResponse.json(corpo, { headers })
  const { velas, ...resto } = corpo
  return NextResponse.json({ ...resto, col: paraColunas(velas) }, { headers })
}

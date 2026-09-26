import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { simboloDaLinha, precoFresco } from '@/lib/mtmfunded/simulado/ordens'
import { registarPedidosDePreco } from '@/lib/mtmfunded/simulado/pedidos-precos'
import { CLASSE_CRIPTO, CRIPTO_SEGUIDA } from '@/lib/cripto-seguida'

export const dynamic = 'force-dynamic'

/**
 * PREÇOS E CATÁLOGO DO WEBTRADER.
 *
 * GET ?symbols=A,B[&specs=1] → último bid/ask/em desses símbolos (máx. 60) e, com specs, a ficha
 *   de cada um. Chamado a cada 1–2 s pela lista e pelo gráfico, por isso NÃO pede sessão: o preço
 *   é público (qualquer autenticado já o lê por RLS) e validar um JWT a cada 1,5 s por utilizador
 *   era pôr o serviço de auth a trabalhar para nada.
 * GET ?q=&classe=&pagina=&porPagina= → pesquisa no catálogo (centenas de símbolos: forex, metais,
 *   índices, energia, ações, cripto).
 *
 * Pedido de preços → `funded_precos_pedidos` (se a tabela existir): é assim que o motor sabe que
 * alguém está a OLHAR para um símbolo e subscreve-o, em vez de subscrever o catálogo inteiro.
 */

// ── Caches por instância (2026-09, depois da sobrecarga do Supabase) ─────────────────────────
// Cada ecrã aberto pede preços de 1,5 em 1,5 s. Sem cache, dez pessoas no ouro eram dez leituras
// por segundo à mesma linha. Agora a mesma instância serve a mesma linha durante 1 s, e a CDN
// (s-maxage=1) poupa a própria função quando o URL se repete. A ficha (especificações) muda quase
// nunca: 2 min em memória.
const PRECO_TTL_MS = 1_000
const FICHA_TTL_MS = 120_000
const cachePrecos = new Map<string, { em: number; linha: { symbol: string; bid: unknown; ask: unknown; em: unknown } | null }>()
const cacheFichas = new Map<string, { em: number; linha: Record<string, unknown> | null }>()

async function lerPrecos(db: ReturnType<typeof getSupabaseAdmin>, symbols: string[]) {
  const agora = Date.now()
  const faltam = symbols.filter((s) => { const c = cachePrecos.get(s); return !c || agora - c.em > PRECO_TTL_MS })
  if (faltam.length) {
    const { data, error } = await db.from('funded_precos').select('symbol, bid, ask, em').in('symbol', faltam)
    if (!error) {
      const porSimbolo = new Map((data ?? []).map((p) => [String(p.symbol), p]))
      for (const s of faltam) cachePrecos.set(s, { em: agora, linha: porSimbolo.get(s) ?? null })
    }
  }
  return symbols.map((s) => cachePrecos.get(s)?.linha).filter(Boolean) as Array<{ symbol: string; bid: unknown; ask: unknown; em: unknown }>
}

async function lerFichas(db: ReturnType<typeof getSupabaseAdmin>, symbols: string[]) {
  const agora = Date.now()
  const faltam = symbols.filter((s) => { const c = cacheFichas.get(s); return !c || agora - c.em > FICHA_TTL_MS })
  if (faltam.length) {
    const { data, error } = await db.from('funded_symbols').select('*').in('symbol', faltam).eq('ativo', true)
    if (!error) {
      const porSimbolo = new Map((data ?? []).map((r) => [String(r.symbol), r as Record<string, unknown>]))
      // Os que não existem também ficam (null): um link com cinco candidatos não relê a base a cada abertura.
      for (const s of faltam) cacheFichas.set(s, { em: agora, linha: porSimbolo.get(s) ?? null })
    }
    if (cacheFichas.size > 2000) cacheFichas.clear()
  }
  return symbols.map((s) => cacheFichas.get(s)?.linha).filter(Boolean) as Array<Record<string, unknown>>
}

/**
 * As classes vêm do catálogo e não de uma lista fixa (quando entram energia ou acções, o filtro
 * aparece sozinho) — mas eram ~1000 linhas lidas a CADA pesquisa/página do catálogo. Mudam quase
 * nunca: 10 min por instância, paginado (o PostgREST corta a 1000 e já há 1026 símbolos).
 */
let cacheClasses: { em: number; lista: string[] } | null = null
async function lerClasses(db: ReturnType<typeof getSupabaseAdmin>): Promise<string[]> {
  if (cacheClasses && Date.now() - cacheClasses.em < 10 * 60_000) return cacheClasses.lista
  const todas = new Set<string>()
  for (let de = 0; de < 10_000; de += 1000) {
    const { data, error } = await db.from('funded_symbols').select('classe').eq('ativo', true).order('symbol').range(de, de + 999)
    if (error) return cacheClasses?.lista ?? []
    for (const c of data ?? []) todas.add(String(c.classe))
    if (!data || data.length < 1000) break
  }
  cacheClasses = { em: Date.now(), lista: [...todas].sort() }
  return cacheClasses.lista
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const db = getSupabaseAdmin()
  const symbolsParam = sp.get('symbols')

  if (symbolsParam != null) {
    const symbols = [...new Set(symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9._#-]{1,24}$/.test(s)))].slice(0, 60)
    if (!symbols.length) return NextResponse.json({ precos: [] })
    const comSpecs = sp.get('specs') === '1'
    const [precos, specs] = await Promise.all([
      lerPrecos(db, symbols),
      comSpecs ? lerFichas(db, symbols) : Promise.resolve(null),
    ])
    void registarPedidosDePreco(symbols)
    const agora = Date.now()
    return NextResponse.json(
      {
        agora: new Date(agora).toISOString(),
        precos: precos.map((p) => ({
          symbol: p.symbol, bid: Number(p.bid), ask: Number(p.ask), em: p.em, fresco: precoFresco(p.em as string, agora),
        })),
        ...(specs ? { simbolos: specs.map((r) => ({ ...simboloDaLinha(r), nome: r.nome, horario: r.horario, sessoes: r.sessoes ?? null })) } : {}),
      },
      // Preço público (ver acima): 1 s na CDN + 2 s a servir o anterior enquanto revalida. O ecrã
      // pede de 1,5 em 1,5 s, por isso nunca vê um preço com mais de ~3 s — e o motor continua a
      // saber quem está a olhar (cada revalidação passa pela função e por registarPedidosDePreco).
      { headers: { 'Cache-Control': 'public, s-maxage=1, stale-while-revalidate=2' } },
    )
  }

  // ── catálogo ──
  const q = (sp.get('q') ?? '').trim().replace(/[%,()*]/g, '').slice(0, 30)
  const classe = (sp.get('classe') ?? '').trim()
  const porPagina = Math.min(200, Math.max(1, Number(sp.get('porPagina') ?? 50) || 50))
  const pagina = Math.max(0, Number(sp.get('pagina') ?? 0) || 0)
  let query = db.from('funded_symbols')
    .select('symbol, nome, classe, moeda_lucro, digits, contract_size, pip_size, spread_pontos, comissao_lote, volume_min, volume_step, volume_max, alavancagem_max, horario', { count: 'exact' })
    .eq('ativo', true)
    /**
     * O cripto do catálogo aparece reduzido às quatro de `lib/cripto-seguida.ts`.
     *
     * Filtra-se AQUI, e não depois de ler a página, porque é esta lista que gera a procura: cada
     * símbolo que aparece no ecrã é pedido de 1,5 em 1,5 s e passa a `funded_precos_pedidos`, que é
     * como o motor decide quem subscrever. Uma única visita à página do cripto punha 50 e tantos
     * símbolos a escrever na base 24 horas por dia — e o cripto não fecha ao fim de semana.
     *
     * A regra é pela CLASSE (a coluna do catálogo), nunca pelas letras do símbolo, e o `count`
     * continua exacto por vir do mesmo pedido: a paginação não fica com buracos.
     */
    .or(`classe.neq.${CLASSE_CRIPTO},symbol.in.(${CRIPTO_SEGUIDA.join(',')})`)
  if (classe) query = query.eq('classe', classe)
  if (q) query = query.or(`symbol.ilike.%${q}%,nome.ilike.%${q}%`)
  const [{ data, count, error }, classes] = await Promise.all([
    query.order('ordem').order('symbol').range(pagina * porPagina, pagina * porPagina + porPagina - 1),
    lerClasses(db),
  ])
  if (error) return NextResponse.json({ error: 'catálogo indisponível' }, { status: 500 })
  return NextResponse.json(
    {
      simbolos: (data ?? []).map((r) => ({ ...simboloDaLinha(r), nome: r.nome, horario: r.horario })),
      total: count ?? 0, pagina, porPagina,
      classes,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  )
}

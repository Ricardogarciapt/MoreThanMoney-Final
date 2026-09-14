import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { simboloDaLinha, precoFresco } from '@/lib/mtmfunded/simulado/ordens'

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

// Por instância: não se reescreve o mesmo pedido mais do que de 15 em 15 s — o motor só precisa de
// saber que alguém ainda está a ver, não de cada poll.
const ultimoPedido = new Map<string, number>()
const REPEDIR_MS = 15_000
let tabelaDePedidos: boolean | null = null

async function registarPedidos(symbols: string[]) {
  if (tabelaDePedidos === false) return
  const agora = Date.now()
  const novos = symbols.filter((s) => agora - (ultimoPedido.get(s) ?? 0) > REPEDIR_MS)
  if (!novos.length) return
  novos.forEach((s) => ultimoPedido.set(s, agora))
  try {
    const em = new Date(agora).toISOString()
    const { error } = await getSupabaseAdmin().from('funded_precos_pedidos')
      .upsert(novos.map((symbol) => ({ symbol, pedido_em: em })), { onConflict: 'symbol' })
    if (error) {
      // 42P01 / PGRST205 = a tabela ainda não existe (é do motor). Deixa de tentar nesta instância.
      if (/42P01|PGRST205|does not exist|Could not find the table/i.test(`${error.code} ${error.message}`)) tabelaDePedidos = false
      return
    }
    tabelaDePedidos = true
  } catch {
    /* sem pedidos não se perde nada — o motor continua com os símbolos que já segue */
  }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const db = getSupabaseAdmin()
  const symbolsParam = sp.get('symbols')

  if (symbolsParam != null) {
    const symbols = [...new Set(symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9._#-]{1,24}$/.test(s)))].slice(0, 60)
    if (!symbols.length) return NextResponse.json({ precos: [] })
    const [{ data: precos }, specs] = await Promise.all([
      db.from('funded_precos').select('symbol, bid, ask, em').in('symbol', symbols),
      sp.get('specs') === '1'
        ? db.from('funded_symbols').select('*').in('symbol', symbols).eq('ativo', true)
        : Promise.resolve({ data: null }),
    ])
    void registarPedidos(symbols)
    const agora = Date.now()
    return NextResponse.json(
      {
        agora: new Date(agora).toISOString(),
        precos: (precos ?? []).map((p) => ({
          symbol: p.symbol, bid: Number(p.bid), ask: Number(p.ask), em: p.em, fresco: precoFresco(p.em as string, agora),
        })),
        ...(specs.data ? { simbolos: specs.data.map((r) => ({ ...simboloDaLinha(r), nome: r.nome, horario: r.horario })) } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } },
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
  if (classe) query = query.eq('classe', classe)
  if (q) query = query.or(`symbol.ilike.%${q}%,nome.ilike.%${q}%`)
  const [{ data, count, error }, { data: todasClasses }] = await Promise.all([
    query.order('ordem').order('symbol').range(pagina * porPagina, pagina * porPagina + porPagina - 1),
    // As classes vêm do catálogo e não de uma lista fixa: quando entrarem energia ou ações, o
    // filtro aparece sozinho.
    db.from('funded_symbols').select('classe').eq('ativo', true),
  ])
  if (error) return NextResponse.json({ error: 'catálogo indisponível' }, { status: 500 })
  return NextResponse.json(
    {
      simbolos: (data ?? []).map((r) => ({ ...simboloDaLinha(r), nome: r.nome, horario: r.horario })),
      total: count ?? 0, pagina, porPagina,
      classes: [...new Set((todasClasses ?? []).map((c) => String(c.classe)))].sort(),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  )
}

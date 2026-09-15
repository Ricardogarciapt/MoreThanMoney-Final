import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * SENTIMENTO DOS TRADERS MTM FUNDED por símbolo — % de volume comprado vs vendido nas posições
 * ABERTAS de todas as contas simuladas (como o «Traders' sentiment» das plataformas de corretora).
 *
 * GET ?symbol=XAUUSD → { compras, vendas, pctCompras, contas }
 *
 * Só agregados: nunca contas, logins nem volumes individuais. Público como os preços; em cache 30 s
 * por instância (é uma contagem, não um preço — não precisa de ser do segundo).
 */
const cache = new Map<string, { em: number; corpo: unknown }>()

export async function GET(request: NextRequest) {
  const symbol = String(request.nextUrl.searchParams.get('symbol') ?? '').toUpperCase()
  if (!/^[A-Z0-9._#-]{1,24}$/.test(symbol)) return NextResponse.json({ error: 'símbolo inválido' }, { status: 400 })
  const c = cache.get(symbol)
  if (c && Date.now() - c.em < 30_000) return NextResponse.json(c.corpo)
  const { data } = await getSupabaseAdmin().from('funded_positions').select('account_id, direcao, volume')
    .eq('symbol', symbol).eq('estado', 'aberta').limit(5000)
  let compras = 0
  let vendas = 0
  const contas = new Set<string>()
  for (const r of data ?? []) {
    contas.add(String(r.account_id))
    if (r.direcao === 'buy') compras += Number(r.volume)
    else vendas += Number(r.volume)
  }
  const total = compras + vendas
  // Menos de 3 contas não é sentimento, é uma pessoa: não se mostra.
  const corpo = contas.size < 3
    ? { symbol, contas: contas.size, pctCompras: null }
    : { symbol, contas: contas.size, pctCompras: Math.round((compras / total) * 100), compras: Math.round(compras * 100) / 100, vendas: Math.round(vendas * 100) / 100 }
  cache.set(symbol, { em: Date.now(), corpo })
  return NextResponse.json(corpo)
}

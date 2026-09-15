import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ErroOrdem, autorizarConta, carregarPrecos, carregarSimbolos } from '@/lib/mtmfunded/simulado/execucao'
import { condicaoDoAlerta } from '@/lib/mtmfunded/simulado/avancadas'

export const dynamic = 'force-dynamic'

/**
 * ALERTAS DE PREÇO DO WEBTRADER (funded_alertas, 072). O motor do VPS vigia-os e, quando o bid
 * chega ao nível, desactiva o alerta e pede ao site o push (/api/mtmfunded/simulado/motor).
 *
 * GET ?accountId=                     → alertas desta conta (activos e os últimos disparados)
 * POST { accountId, symbol, preco, nota? } → cria; a condição (acima/abaixo) sai do lado do preço de agora
 * DELETE ?accountId=&id=
 *
 * Os alertas são do DONO da conta (é a ele que chega o push): quem entrou com login+password de
 * outra pessoa não cria alertas no telemóvel do dono — só master com dono.
 */

function falhou(e: unknown) {
  if (e instanceof ErroOrdem) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error('[funded/alertas]', e)
  return NextResponse.json({ error: 'erro interno' }, { status: 500 })
}

const MAX_ATIVOS = 50

export async function GET(request: NextRequest) {
  try {
    const { conta } = await autorizarConta(request, request.nextUrl.searchParams.get('accountId') ?? '')
    const { data, error } = await getSupabaseAdmin().from('funded_alertas').select('*')
      .eq('account_id', conta.id).order('ativo', { ascending: false }).order('criado_em', { ascending: false }).limit(100)
    if (error) throw new ErroOrdem(503, 'alertas indisponíveis (migração 072 por aplicar?)')
    return NextResponse.json({ alertas: data ?? [] })
  } catch (e) { return falhou(e) }
}

export async function POST(request: NextRequest) {
  try {
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { conta, modo } = await autorizarConta(request, String(b.accountId ?? ''))
    if (modo !== 'master' || !conta.user_id) throw new ErroOrdem(403, 'só o dono da conta cria alertas')
    const symbol = String(b.symbol ?? '').toUpperCase()
    const preco = Number(b.preco)
    if (!(preco > 0)) throw new ErroOrdem(422, 'indica o preço do alerta')
    const s = (await carregarSimbolos([symbol]))[symbol]
    if (!s) throw new ErroOrdem(400, `símbolo ${symbol} não disponível`)
    const db = getSupabaseAdmin()
    const { count } = await db.from('funded_alertas').select('id', { count: 'exact', head: true }).eq('user_id', conta.user_id as string).eq('ativo', true)
    if ((count ?? 0) >= MAX_ATIVOS) throw new ErroOrdem(429, `no máximo ${MAX_ATIVOS} alertas activos`)
    const { precos } = await carregarPrecos([symbol])
    const nivel = Number(preco.toFixed(s.digits))
    const bid = precos[symbol]?.bid ?? null
    if (bid != null && Math.abs(bid - nivel) < Math.pow(10, -s.digits) / 2) throw new ErroOrdem(422, 'o alerta está no preço de agora')
    const { data, error } = await db.from('funded_alertas').insert({
      user_id: conta.user_id, account_id: conta.id, symbol, preco: nivel, condicao: condicaoDoAlerta(nivel, bid),
      nota: b.nota ? String(b.nota).slice(0, 200) : null,
    }).select('*').single()
    if (error) throw new ErroOrdem(500, 'não foi possível criar o alerta')
    return NextResponse.json({ alerta: data })
  } catch (e) { return falhou(e) }
}

export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const { conta, modo } = await autorizarConta(request, sp.get('accountId') ?? '')
    if (modo !== 'master') throw new ErroOrdem(403, 'sessão investor — só leitura')
    const { error } = await getSupabaseAdmin().from('funded_alertas').delete().eq('id', sp.get('id') ?? '').eq('account_id', conta.id)
    if (error) throw new ErroOrdem(500, 'não foi possível apagar o alerta')
    return NextResponse.json({ ok: true })
  } catch (e) { return falhou(e) }
}

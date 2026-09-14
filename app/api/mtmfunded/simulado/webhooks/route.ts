import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ErroOrdem, autorizarConta } from '@/lib/mtmfunded/simulado/execucao'

export const dynamic = 'force-dynamic'

/**
 * GERIR O WEBHOOK DO TRADINGVIEW de uma conta simulada.
 *
 * GET    ?accountId=  → { ligado, criadoEm, ultimoEm, ultimoErro, ultimoResultado } (nunca o token)
 * POST   { accountId } → gera um token NOVO (desliga os anteriores) e devolve o URL UMA vez
 * DELETE ?accountId=  → desliga
 *
 * Só master: o token negoceia, por isso quem só vê (investor) não o pode criar nem ver o estado.
 */

const BASE = 'https://www.morethanmoney.pt/api/mtmfunded/simulado/webhook/'

function falhou(e: unknown) {
  if (e instanceof ErroOrdem) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error('[funded/webhooks]', e)
  return NextResponse.json({ error: 'erro interno' }, { status: 500 })
}

async function master(request: NextRequest, accountId: string) {
  const { conta, modo } = await autorizarConta(request, accountId)
  if (modo !== 'master') throw new ErroOrdem(403, 'sessão investor — só leitura')
  return conta
}

export async function GET(request: NextRequest) {
  try {
    const conta = await master(request, request.nextUrl.searchParams.get('accountId') ?? '')
    const { data } = await getSupabaseAdmin().from('funded_webhooks')
      .select('ativo, criado_em, ultimo_em, ultimo_erro, ultimo_resultado')
      .eq('account_id', conta.id).eq('ativo', true).order('criado_em', { ascending: false }).limit(1)
    const h = data?.[0]
    return NextResponse.json({
      ligado: Boolean(h), criadoEm: h?.criado_em ?? null, ultimoEm: h?.ultimo_em ?? null,
      ultimoErro: h?.ultimo_erro ?? null, ultimoResultado: h?.ultimo_resultado ?? null,
    })
  } catch (e) {
    return falhou(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const b = await request.json().catch(() => ({})) as { accountId?: string }
    const conta = await master(request, String(b.accountId ?? ''))
    const db = getSupabaseAdmin()
    // Um webhook activo por conta: gerar outro é rodar a chave (o antigo deixa de funcionar).
    await db.from('funded_webhooks').update({ ativo: false }).eq('account_id', conta.id).eq('ativo', true)
    const token = `fw_${randomBytes(24).toString('base64url')}`
    const { error } = await db.from('funded_webhooks').insert({
      account_id: conta.id, token_hash: createHash('sha256').update(token).digest('hex'), ativo: true,
    })
    if (error) throw new ErroOrdem(500, 'não foi possível criar o webhook')
    return NextResponse.json({ ok: true, url: `${BASE}${token}` })
  } catch (e) {
    return falhou(e)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const conta = await master(request, request.nextUrl.searchParams.get('accountId') ?? '')
    await getSupabaseAdmin().from('funded_webhooks').update({ ativo: false }).eq('account_id', conta.id).eq('ativo', true)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return falhou(e)
  }
}

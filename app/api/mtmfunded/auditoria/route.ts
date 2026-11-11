import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ErroOrdem, autorizarConta } from '@/lib/mtmfunded/simulado/execucao'
import { gerarTokenAuditoria } from '@/lib/mtmfunded/auditoria'

export const dynamic = 'force-dynamic'

/**
 * LINK PÚBLICO DE AUDITORIA DA CONTA — a ficha «Partilhar» da área de conta do WebTrader.
 *
 * GET    ?accountId=           → o link activo (ou nenhum). Dono ou investor podem ver.
 * POST   { accountId, mostrarLogin } → cria (ou devolve o activo; com `novo: true` roda o token). Só master.
 * DELETE ?accountId=           → revoga o link activo. Só master.
 *
 * A página pública é /mtmfunded/auditoria/<token> (lib/mtmfunded/auditoria-servidor.ts).
 */

const caminho = (token: string) => `/mtmfunded/auditoria/${token}`

async function linkActivo(accountId: string) {
  const { data } = await getSupabaseAdmin().from('funded_auditoria_links')
    .select('token, mostrar_login, created_at, visitas').eq('account_id', accountId).eq('ativo', true).is('revogado_em', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data ? { url: caminho(String(data.token)), mostrarLogin: !!data.mostrar_login, criadoEm: data.created_at, visitas: data.visitas ?? 0 } : null
}

function erro(e: unknown) {
  if (e instanceof ErroOrdem) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error('[funded/auditoria]', e)
  return NextResponse.json({ error: 'erro interno' }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
    await autorizarConta(request, accountId)
    return NextResponse.json({ link: await linkActivo(accountId) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { return erro(e) }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { accountId?: string; mostrarLogin?: boolean; novo?: boolean }
    const accountId = String(body.accountId ?? '')
    const { conta, modo } = await autorizarConta(request, accountId)
    if (modo !== 'master') throw new ErroOrdem(403, 'só o dono da conta pode partilhar')
    const db = getSupabaseAdmin()
    const atual = await linkActivo(accountId)
    if (atual && !body.novo) {
      if (typeof body.mostrarLogin === 'boolean' && body.mostrarLogin !== atual.mostrarLogin) {
        await db.from('funded_auditoria_links').update({ mostrar_login: body.mostrarLogin })
          .eq('account_id', accountId).eq('ativo', true).is('revogado_em', null)
      }
      return NextResponse.json({ link: await linkActivo(accountId) })
    }
    if (atual) {
      await db.from('funded_auditoria_links').update({ ativo: false, revogado_em: new Date().toISOString() })
        .eq('account_id', accountId).eq('ativo', true).is('revogado_em', null)
    }
    const token = gerarTokenAuditoria((n) => randomBytes(n))
    const { error } = await db.from('funded_auditoria_links').insert({
      account_id: accountId, token, mostrar_login: !!body.mostrarLogin, criado_por: (conta.user_id as string | null) ?? null,
    })
    if (error) throw error
    return NextResponse.json({ link: await linkActivo(accountId) })
  } catch (e) { return erro(e) }
}

export async function DELETE(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
    const { modo } = await autorizarConta(request, accountId)
    if (modo !== 'master') throw new ErroOrdem(403, 'só o dono da conta pode revogar')
    await getSupabaseAdmin().from('funded_auditoria_links').update({ ativo: false, revogado_em: new Date().toISOString() })
      .eq('account_id', accountId).eq('ativo', true).is('revogado_em', null)
    return NextResponse.json({ link: null })
  } catch (e) { return erro(e) }
}

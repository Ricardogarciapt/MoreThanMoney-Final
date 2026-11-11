import { NextRequest, NextResponse } from 'next/server'
import { ErroOrdem, autorizarConta } from '@/lib/mtmfunded/simulado/execucao'
import { garantirLink, linkActivo, revogarLink } from '@/lib/mtmfunded/auditoria-links'

export const dynamic = 'force-dynamic'

/**
 * LINK PÚBLICO DE AUDITORIA DA CONTA — a ficha «Partilhar» da área de conta do WebTrader.
 *
 * GET    ?accountId=           → o link activo (ou nenhum). Dono ou investor podem ver.
 * POST   { accountId, mostrarLogin } → cria (ou devolve o activo; com `novo: true` roda o token). Só master.
 * DELETE ?accountId=           → revoga o link activo. Só master.
 *
 * A página pública é /mtmfunded/auditoria/<token> (lib/mtmfunded/auditoria-servidor.ts). As rotas de
 * estratégia (contas-mestre da casa) emitem-se no admin: /api/admin/mtmfunded/auditoria-rotas.
 */

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
    const link = await garantirLink(accountId, { mostrarLogin: body.mostrarLogin, novo: body.novo, criadoPor: (conta.user_id as string | null) ?? null })
    return NextResponse.json({ link })
  } catch (e) { return erro(e) }
}

export async function DELETE(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
    const { modo } = await autorizarConta(request, accountId)
    if (modo !== 'master') throw new ErroOrdem(403, 'só o dono da conta pode revogar')
    await revogarLink(accountId)
    return NextResponse.json({ link: null })
  } catch (e) { return erro(e) }
}

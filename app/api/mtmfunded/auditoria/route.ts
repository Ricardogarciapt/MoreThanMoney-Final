import { NextRequest, NextResponse } from 'next/server'
import { ErroOrdem, autorizarConta } from '@/lib/mtmfunded/simulado/execucao'
import { garantirLink, garantirLinkRef, linkActivo, linkActivoRef, revogarLink, revogarLinkRef } from '@/lib/mtmfunded/auditoria-links'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { adaptadorDoDono } from '@/lib/webtrader/contas'
import { lerRefConta, refTexto } from '@/lib/webtrader/corretoras/regras'
import { ErroCorretora } from '@/lib/webtrader/corretoras/tipos'

export const dynamic = 'force-dynamic'

/**
 * LINK PÚBLICO DE AUDITORIA DA CONTA — a ficha «Partilhar» da área de conta do WebTrader.
 *
 * Conta REAL ligada (250): em vez de `accountId` vem `ref` (`mt5:auto:<uuid>`, `tradelocker:site:<uuid>`…);
 * a posse confirma-se abrindo a conta com o user_id da sessão, como no WebTrader.
 *
 * GET    ?accountId=           → o link activo (ou nenhum). Dono ou investor podem ver.
 * POST   { accountId, mostrarLogin } → cria (ou devolve o activo; com `novo: true` roda o token). Só master.
 * DELETE ?accountId=           → revoga o link activo. Só master.
 *
 * A página pública é /mtmfunded/auditoria/<token> (lib/mtmfunded/auditoria-servidor.ts). As rotas de
 * estratégia (contas-mestre da casa) emitem-se no admin: /api/admin/mtmfunded/auditoria-rotas.
 */

function erro(e: unknown) {
  if (e instanceof ErroOrdem || e instanceof ErroCorretora) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error('[funded/auditoria]', e)
  return NextResponse.json({ error: 'erro interno' }, { status: 500 })
}

/** Conta real do utilizador da sessão: devolve a referência normalizada e o dono, ou falha. */
async function contaReal(request: NextRequest, refBruta: string): Promise<{ ref: string; dono: string }> {
  const plataforma = refBruta.split(':')[0]
  const r = plataforma === 'mt5' || plataforma === 'tradelocker' ? lerRefConta(plataforma, refBruta) : null
  if (!r || r.plataforma === 'mtmfunded') throw new ErroCorretora(400, 'conta inválida')
  if (r.origem === 'sessao') throw new ErroCorretora(409, 'Esta conta TradeLocker só abre com o separador aberto — liga-a na app MTM Auto para a poderes partilhar.')
  const dono = await userIdDoPedido(request)
  if (!dono) throw new ErroCorretora(401, 'Entra com a tua conta MTM.')
  await adaptadorDoDono(dono, r.plataforma, refBruta) // posse + quota; atira se não for dele
  return { ref: refTexto(r), dono }
}

export async function GET(request: NextRequest) {
  try {
    const refBruta = request.nextUrl.searchParams.get('ref')
    if (refBruta) {
      const { ref, dono } = await contaReal(request, refBruta)
      return NextResponse.json({ link: await linkActivoRef(ref, dono) }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
    await autorizarConta(request, accountId)
    return NextResponse.json({ link: await linkActivo(accountId) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { return erro(e) }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { accountId?: string; ref?: string; mostrarLogin?: boolean; novo?: boolean }
    if (body.ref) {
      const { ref, dono } = await contaReal(request, String(body.ref))
      return NextResponse.json({ link: await garantirLinkRef(ref, dono, { novo: body.novo }) })
    }
    const accountId = String(body.accountId ?? '')
    const { conta, modo } = await autorizarConta(request, accountId)
    if (modo !== 'master') throw new ErroOrdem(403, 'só o dono da conta pode partilhar')
    const link = await garantirLink(accountId, { mostrarLogin: body.mostrarLogin, novo: body.novo, criadoPor: (conta.user_id as string | null) ?? null })
    return NextResponse.json({ link })
  } catch (e) { return erro(e) }
}

export async function DELETE(request: NextRequest) {
  try {
    const refBruta = request.nextUrl.searchParams.get('ref')
    if (refBruta) {
      const { ref, dono } = await contaReal(request, refBruta)
      await revogarLinkRef(ref, dono)
      return NextResponse.json({ link: null })
    }
    const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
    const { modo } = await autorizarConta(request, accountId)
    if (modo !== 'master') throw new ErroOrdem(403, 'só o dono da conta pode revogar')
    await revogarLink(accountId)
    return NextResponse.json({ link: null })
  } catch (e) { return erro(e) }
}

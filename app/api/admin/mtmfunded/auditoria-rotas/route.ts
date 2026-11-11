import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { requireAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { garantirLink, linksActivos, revogarLink } from '@/lib/mtmfunded/auditoria-links'
import { inicioDoCiclo } from '@/lib/mtmfunded/ciclos-estrategia'

export const dynamic = 'force-dynamic'

/**
 * LINKS DE AUDITORIA DAS ROTAS DE ESTRATÉGIA (admin).
 *
 * Cada estratégia do MTM Auto tem a sua conta-mestre MTM Funded (`mtmauto_providers.funded_account_id`).
 * As contas-mestre são da casa, por isso o dono não as abre no WebTrader para partilhar: emite-as o
 * admin aqui. A página pública é a mesma (/mtmfunded/auditoria/<token>) e respeita o novo ciclo
 * da estratégia (lib/mtmfunded/ciclos-estrategia.ts).
 *
 * GET                              → as rotas com a conta-mestre, o ciclo e o link activo.
 * POST   { accountId, novo? }      → cria o link (ou roda o token com `novo`).
 * DELETE ?accountId=               → revoga.
 * Só aceita contas que sejam a mestre de uma estratégia.
 */

interface Rota { slug: string; nome: string; arquivada: boolean; accountId: string }

async function rotas(): Promise<Rota[]> {
  const { data } = await getSupabaseAdmin().from('mtmauto_providers')
    .select('slug, nome, arquivada_em, funded_account_id').is('apagado_em', null).not('funded_account_id', 'is', null).order('nome')
  return (data ?? []).map((p) => ({
    slug: String(p.slug), nome: String(p.nome ?? p.slug), arquivada: !!p.arquivada_em, accountId: String(p.funded_account_id),
  }))
}

async function exigirRota(accountId: string) {
  const r = (await rotas()).find((x) => x.accountId === accountId)
  if (!r) throw Object.assign(new Error('esta conta não é a mestre de nenhuma estratégia'), { status: 404 })
  return r
}

function erro(e: unknown) {
  const status = (e as { status?: number })?.status ?? 500
  if (status === 500) console.error('[admin/auditoria-rotas]', e)
  return NextResponse.json({ error: status === 500 ? 'erro interno' : (e as Error).message }, { status })
}

export async function GET(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado
  try {
    const lista = await rotas()
    const links = await linksActivos(lista.map((r) => r.accountId))
    return NextResponse.json({
      rotas: lista.map((r) => ({ ...r, cicloDesde: inicioDoCiclo(r.slug), link: links.get(r.accountId) ?? null })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { return erro(e) }
}

export async function POST(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado
  try {
    const body = await req.json().catch(() => ({})) as { accountId?: string; novo?: boolean }
    const rota = await exigirRota(String(body.accountId ?? ''))
    const { userId } = await verifyAdminAccess()
    const link = await garantirLink(rota.accountId, { novo: !!body.novo, criadoPor: userId ?? null })
    return NextResponse.json({ link })
  } catch (e) { return erro(e) }
}

export async function DELETE(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado
  try {
    const rota = await exigirRota(req.nextUrl.searchParams.get('accountId') ?? '')
    await revogarLink(rota.accountId)
    return NextResponse.json({ link: null })
  } catch (e) { return erro(e) }
}

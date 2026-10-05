/**
 * QUEM ESTÁ A DECIDIR — admin do site (vê e decide tudo) ou admin da MTM Auto (a sua equipa).
 *
 * A MTM Auto partilha a base de autenticação com o site: o admin de lá manda o seu Bearer e o
 * `verifyAdminAccess` valida a assinatura e devolve o id MESMO quando a pessoa não é admin do site.
 * A partir daí lê-se `mtmauto_users` pela id verificada — nada do que o cliente envia escolhe a equipa.
 * A regra (pura) é `decidirQuem` em `estrategia-escrita-plano.ts`.
 */
import { db } from './base'
import { decidirQuem, type QuemDecide } from '../estrategia-escrita-plano'

export async function quemDecide(): Promise<QuemDecide | null> {
  const { verifyAdminAccess } = await import('@/lib/admin-api-helpers')
  const r = await verifyAdminAccess().catch(() => ({ isAdmin: false, userId: undefined }))
  if (!r.userId) return null
  if (r.isAdmin) return decidirQuem({ userId: r.userId, adminDoSite: true, mtmauto: null })
  const { data } = await db().from('mtmauto_users').select('papel, super_admin, tenant_id').eq('user_id', r.userId).maybeSingle()
  return decidirQuem({ userId: r.userId, adminDoSite: false, mtmauto: data as Record<string, unknown> | null })
}

/**
 * As fachadas antigas só deixavam passar o admin do site (`requireAdmin`/`soAdmin` já verificaram):
 * o «quem» delas é sempre o do site, com tudo.
 */
export function quemAdminDoSite(adminId: string): QuemDecide {
  return { adminId, tudo: true, tenantId: null, origem: 'site' }
}

/**
 * Envolve um handler como o `soAdmin`, mas deixa entrar também o admin da MTM Auto (só a sua equipa).
 * Nega ANTES de correr qualquer coisa; erros não rebentam a rota.
 */
export function soQuemDecide<A extends unknown[]>(handler: (quem: QuemDecide, ...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const { NextResponse } = await import('next/server')
    const quem = await quemDecide().catch(() => null)
    if (!quem) return NextResponse.json({ error: 'Só administradores.' }, { status: 403 })
    try {
      return await handler(quem, ...args)
    } catch (e) {
      return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 })
    }
  }
}

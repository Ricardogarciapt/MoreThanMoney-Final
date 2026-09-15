import { NextResponse } from 'next/server'

/**
 * Guarda das rotas /api/admin/mtmauto-copia/*: só administradores (user_type='admin' e activo,
 * pela sessão de cookies OU Bearer — verifyAdminAccess). Devolve o id do admin para auditoria.
 *
 * O verificador é injectável só para o teste (lib/copia-contas/__tests__/admin-auth.check.ts).
 */
export type Verificador = () => Promise<{ isAdmin: boolean; userId?: string; error?: string }>

async function verificadorReal(): ReturnType<Verificador> {
  const { verifyAdminAccess } = await import('@/lib/admin-api-helpers')
  return verifyAdminAccess()
}

export async function exigirAdmin(verificar: Verificador = verificadorReal): Promise<{ negado: NextResponse } | { negado: null; adminId: string }> {
  const r = await verificar().catch(() => ({ isAdmin: false, error: 'erro ao verificar' }) as Awaited<ReturnType<Verificador>>)
  if (!r.isAdmin || !r.userId) {
    return { negado: NextResponse.json({ error: r.error || 'Acesso negado', message: 'Apenas administradores' }, { status: 403 }) }
  }
  return { negado: null, adminId: r.userId }
}

/** Envolve um handler: nega antes de correr qualquer coisa. */
export function soAdmin<A extends unknown[]>(
  handler: (adminId: string, ...args: A) => Promise<Response>,
  verificar?: Verificador,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const g = await exigirAdmin(verificar)
    if (g.negado) return g.negado
    try {
      return await handler(g.adminId, ...args)
    } catch (e) {
      return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 })
    }
  }
}

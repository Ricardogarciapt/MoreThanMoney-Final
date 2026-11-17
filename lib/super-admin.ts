import { NextRequest, NextResponse } from "next/server"

/**
 * SUPER ADMIN — o que só o dono vê (decisão do Ricardo, 16/11/2026).
 *
 * Ser `admin` em `profiles` chega para o /admin do dia a dia. As páginas do antigo AIOS que
 * ficaram no site (/dashboard-gestao e /admin/agentes) e as APIs que as servem mostram receita
 * por agente, códigos de atribuição e um chat com ferramentas na nossa conta: ficam só para o
 * super admin. A lista vem de SUPER_ADMIN_EMAILS (separada por vírgulas) e, sem ela, do email do
 * dono. A chave do AIOS local (/api/agent/v1, requireAgentAccess) não passa por aqui.
 */
import { eSuperAdmin } from "./super-admin-regras"
export { caminhoSuperAdmin, eSuperAdmin, emailsSuperAdmin } from "./super-admin-regras"

/** Guarda das APIs: admin activo E email na lista de super admin. */
export async function requireSuperAdmin(_request: NextRequest): Promise<NextResponse | null> {
  const { verifyAdminAccess } = await import("./admin-api-helpers")
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin || !eSuperAdmin(auth.email)) {
    return NextResponse.json(
      { error: "Acesso negado", message: "Reservado ao super admin" },
      { status: 403 },
    )
  }
  return null
}

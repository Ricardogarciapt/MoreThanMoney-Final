/** Regras puras do super admin (sem dependências de servidor, servem o middleware). Ver lib/super-admin.ts. */
export const DONO = "ricardogarciapt@proton.me"

export function emailsSuperAdmin(env: string | undefined = process.env.SUPER_ADMIN_EMAILS): string[] {
  const lista = (env ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return lista.length ? lista : [DONO]
}

export function eSuperAdmin(email: string | null | undefined, env?: string): boolean {
  if (!email) return false
  return emailsSuperAdmin(env).includes(email.trim().toLowerCase())
}

/** Caminhos de página que só o super admin abre. */
export function caminhoSuperAdmin(pathname: string): boolean {
  return /^\/dashboard-gestao(\/|$)/.test(pathname) || /^\/admin\/agentes(\/|$)/.test(pathname) || /^\/mtmos(\/|$)/.test(pathname)
}

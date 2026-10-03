import { REGISTER_NOT_FOUND_MESSAGE } from "@/lib/oauth-flow"

/** Rotas de membro que exigem perfil em public.profiles (pagamento/registo concluído). */
export function isMemberProtectedPath(pathname: string): boolean {
  if (pathname.startsWith("/app-mobile/login") || pathname.startsWith("/app-mobile/register")) {
    return false
  }
  if (pathname.startsWith("/app-mobile")) return true
  if (pathname.startsWith("/member-area")) return true
  return false
}

export function registerRedirectUrl(
  origin: string,
  options?: { message?: string; mobile?: boolean }
): string {
  const path = options?.mobile ? "/app-mobile/register" : "/register"
  const url = new URL(path, origin)
  url.searchParams.set("message", options?.message ?? REGISTER_NOT_FOUND_MESSAGE)
  return url.pathname + url.search
}

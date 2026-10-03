import { supabase } from "@/lib/supabase"

/** Safari/WKWebView: a sessão pode demorar — APIs com RLS exigem auth.uid(). */
export async function waitForSupabaseSession(timeoutMs = 5000): Promise<string | null> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await Promise.race([
        supabase.auth.getSession(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
      ])
      if (!result || typeof result !== "object" || !("data" in result)) {
        await new Promise((r) => setTimeout(r, 250))
        continue
      }
      const token = result.data.session?.access_token
      if (token) return token
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return null
}

export function isSafariBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg/i.test(ua)
}

/** Safari/WKWebView: desactivar animações pesadas, translate e blur que bloqueiam o UI. */
export function shouldReduceSafariEffects(): boolean {
  if (typeof window === "undefined") return false
  if (isSafariBrowser()) return true
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  } catch {
    return false
  }
}

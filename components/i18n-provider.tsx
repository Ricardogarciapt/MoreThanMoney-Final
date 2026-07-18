"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import {
  DEFAULT_LANG,
  I18N_COOKIE,
  I18N_LOCAL_STORAGE_KEY,
  isRtl,
  normalizeLang,
  type Lang,
} from "@/lib/i18n/config"
import { translate } from "@/lib/i18n/translate"
import type { MessageKey } from "@/lib/i18n/messages"

interface I18nContextValue {
  lang: Lang
  t: (key: MessageKey) => string
  setLang: (lang: string) => void
}

const I18nContext = createContext<I18nContextValue>({
  lang: DEFAULT_LANG,
  t: (key) => translate(key, DEFAULT_LANG),
  setLang: () => {},
})

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"))
  return m ? decodeURIComponent(m[1]) : null
}

/** Resolve o idioma no cliente: cookie → localStorage → navegador → PT. */
function detectLang(): Lang {
  const cookie = readCookie(I18N_COOKIE)
  if (cookie) return normalizeLang(cookie)
  try {
    const ls = localStorage.getItem(I18N_LOCAL_STORAGE_KEY)
    if (ls) return normalizeLang(ls)
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined" && navigator.language) return normalizeLang(navigator.language)
  return DEFAULT_LANG
}

/**
 * Provider i18n. `initialLang` vem do servidor (cookie) para evitar flash de PT.
 * `setLang` grava o cookie `mtm_lang` + localStorage e reflete imediatamente na UI.
 */
export function I18nProvider({
  children,
  initialLang,
}: {
  children: React.ReactNode
  initialLang?: string
}) {
  const [lang, setLangState] = useState<Lang>(normalizeLang(initialLang))

  useEffect(() => {
    // Reconcilia com o que o cliente realmente tem (cookie/localStorage/navegador).
    const detected = detectLang()
    if (detected !== lang) setLangState(detected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    document.documentElement.lang = lang
    document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr"
  }, [lang])

  const setLang = useCallback((next: string) => {
    const n = normalizeLang(next)
    try {
      document.cookie = `${I18N_COOKIE}=${n};path=/;max-age=31536000;samesite=lax`
      localStorage.setItem(I18N_LOCAL_STORAGE_KEY, n)
    } catch {
      /* ignore */
    }
    setLangState(n)
    // Persiste o idioma no perfil (conduz app, emails e suporte). Fire-and-forget:
    // se o utilizador não estiver autenticado, a rota devolve 401 e ignoramos.
    try {
      void fetch("/api/profile/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: { preferred_language: n } }),
        keepalive: true,
      }).catch(() => {})
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo<I18nContextValue>(
    () => ({ lang, t: (key) => translate(key, lang), setLang }),
    [lang, setLang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}

/** Atalho: só a função de tradução. */
export function useT(): (key: MessageKey) => string {
  return useContext(I18nContext).t
}

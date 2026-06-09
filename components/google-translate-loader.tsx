"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

/** Lê o idioma destino do cookie googtrans (ex: /pt/en → en). */
function getTranslateTarget(): string | null {
  if (typeof document === "undefined") return null

  const cookieRow = document.cookie.split("; ").find((r) => r.startsWith("googtrans="))
  if (!cookieRow) return null

  const raw = decodeURIComponent(cookieRow.slice("googtrans=".length))
  if (!raw || raw === "/pt/pt" || raw === "/auto/pt") return null

  const segments = raw.split("/").filter(Boolean)
  const target = segments[segments.length - 1]
  return target && target !== "pt" ? target : null
}

const TRANSLATE_BLOCKED_PREFIXES = ["/admin", "/register", "/login", "/success", "/app-mobile"]

function isTranslateBlocked(path: string): boolean {
  return TRANSLATE_BLOCKED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
}

function setPageTranslatable(enabled: boolean) {
  const html = document.documentElement
  const body = document.body
  if (!html || !body) return

  if (enabled) {
    html.removeAttribute("translate")
    html.classList.remove("notranslate")
    body.removeAttribute("translate")
    body.classList.remove("notranslate")
  } else {
    html.setAttribute("translate", "no")
    html.classList.add("notranslate")
    body.setAttribute("translate", "no")
    body.classList.add("notranslate")
  }
}

/**
 * Carrega o Google Translate apenas quando o utilizador escolheu idioma manualmente
 * (cookie googtrans). Evita o crash do React por mutação do DOM em visitas normais.
 */
export function GoogleTranslateLoader() {
  const pathname = usePathname()
  const scriptAppendedRef = useRef(false)

  useEffect(() => {
    if (typeof document === "undefined") return
    const path = pathname || ""

    if (isTranslateBlocked(path)) {
      setPageTranslatable(false)
      const holder = document.getElementById("google_translate_element")
      if (holder) holder.replaceChildren()
      document.querySelectorAll(".goog-te-banner-frame, .goog-te-menu-frame").forEach((n) => n.remove())
      return
    }

    const target = getTranslateTarget()
    if (!target) {
      setPageTranslatable(false)
      return
    }

    setPageTranslatable(true)
  }, [pathname])

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return
    const path = pathname || ""
    if (isTranslateBlocked(path)) return

    const target = getTranslateTarget()
    if (!target) return

    if (document.getElementById("google-translate-cbh")) {
      scriptAppendedRef.current = true
      return
    }
    if (scriptAppendedRef.current) return
    scriptAppendedRef.current = true

    type TranslateElementCtor = {
      new (opts: Record<string, unknown>, id: string): unknown
      InlineLayout?: { SIMPLE?: number }
    }
    const w = window as unknown as {
      google?: { translate?: { TranslateElement: TranslateElementCtor } }
      googleTranslateElementInit?: () => void
    }

    w.googleTranslateElementInit = () => {
      try {
        const Ctor = w.google?.translate?.TranslateElement
        if (!Ctor) return
        new Ctor(
          {
            pageLanguage: "pt",
            includedLanguages: "pt,en,es,fr,de,it,nl,zh-CN,ja,ar,ru,hi,sr,hr,bs,sq,bg,ro,pl,uk,tr",
            layout: Ctor.InlineLayout?.SIMPLE,
            autoDisplay: false,
            multilanguagePage: true,
          },
          "google_translate_element"
        )
      } catch {
        /* Safari / bloqueio de scripts */
      }
    }

    const s = document.createElement("script")
    s.id = "google-translate-cbh"
    s.async = true
    s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
    document.body.appendChild(s)
  }, [pathname])

  return <div id="google_translate_element" style={{ display: "none" }} aria-hidden />
}

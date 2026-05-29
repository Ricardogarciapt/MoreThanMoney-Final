"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

/**
 * Carrega o widget do Google Translate só fora de /admin.
 * O script global no <head> quebrava formulários pesados no Safari (DOM reescrito / hidratação).
 * Ao entrar em /admin, remove restos do widget e marca a página como não traduzível.
 */
export function GoogleTranslateLoader() {
  const pathname = usePathname()
  const scriptAppendedRef = useRef(false)

  useEffect(() => {
    if (typeof document === "undefined") return
    const path = pathname || ""
    if (path.startsWith("/admin")) {
      document.documentElement.setAttribute("translate", "no")
      document.documentElement.classList.add("notranslate")
      const holder = document.getElementById("google_translate_element")
      if (holder) holder.replaceChildren()
      document.querySelectorAll(".goog-te-banner-frame, .goog-te-menu-frame").forEach((n) => n.remove())
      return
    }

    document.documentElement.removeAttribute("translate")
    document.documentElement.classList.remove("notranslate")
  }, [pathname])

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return
    const path = pathname || ""
    if (path.startsWith("/admin")) return
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
        /* Safari / extensões / bloqueio de scripts */
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

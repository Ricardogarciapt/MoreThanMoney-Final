"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { installGoogleTranslateDomGuard } from "@/lib/google-translate-safe"

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

// Rotas onde NÃO carregamos o Google Translate: dashboards internos/interativos
// (tabelas, gráficos em tempo real, apps) onde a mutação do DOM pelo Translate não
// compensa e pode interferir com componentes vivos.
//
// O FUNIL DE CONVERSÃO é traduzível de propósito — um visitante estrangeiro precisa
// de perceber /register, /login, /success, /upgrade e as páginas legais na sua língua
// (era aqui que encalhava). O guard de DOM (installGoogleTranslateDomGuard) protege
// contra o crash do React em Safari/WKWebView.
const TRANSLATE_BLOCKED_PREFIXES = [
  "/admin",
  "/dashboard",
  "/dashboard-gestao",
  // "/mtmcopy" removido (2026-07-27): a página /mtmcopy deve ser traduzível pelo seletor de
  // idioma. O guard anti-crash React (lib/google-translate-safe.ts) protege a mutação do DOM.
  "/member-area",
  "/scanner",
  // "/app-mobile" removido (2026-07-17): o app iOS/mobile carrega /app-mobile e o
  // seletor de idioma (nativo + web) precisa do Google Translate a aplicar aqui.
  // O guard anti-crash React vive em lib/google-translate-safe.ts.
  "/aios",
  "/jarvis",
  "/tradingfloor",
  "/mtm-terminal",
]

function isTranslateBlocked(path: string): boolean {
  return TRANSLATE_BLOCKED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
}

function safeRemoveNode(node: Element) {
  try {
    if (node.parentNode) node.parentNode.removeChild(node)
  } catch {
    /* Safari: nó já removido pelo Translate — evita NotFoundError */
  }
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

    // Patch de DOM tolerante — permite Google Translate em Safari/WKWebView sem crashar o React.
    installGoogleTranslateDomGuard()

    if (isTranslateBlocked(path)) {
      setPageTranslatable(false)
      const holder = document.getElementById("google_translate_element")
      if (holder) {
        try {
          holder.replaceChildren()
        } catch {
          /* ignore */
        }
      }
      document
        .querySelectorAll(".goog-te-banner-frame, .goog-te-menu-frame, .skiptranslate")
        .forEach(safeRemoveNode)
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

    // Garante o patch de DOM antes de o widget mutar a página (Safari/WKWebView).
    installGoogleTranslateDomGuard()

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

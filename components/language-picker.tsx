"use client"

import { useState } from "react"
import { Check, Globe } from "lucide-react"
import { useI18n } from "@/components/i18n-provider"
import { applyGoogleTranslate } from "@/lib/i18n/googtrans"
import {
  OTHER_LANGUAGES,
  PRIORITY_LANGUAGES,
  languageOption,
  type LanguageOption,
} from "@/lib/i18n/languages"

/**
 * Seletor de idioma para páginas SEM navbar — registo, upgrade e afins.
 *
 * O selector da marca vive na navbar; estas páginas não a têm, e por isso quem chegava a elas
 * num idioma que não o português não tinha como mudar. É a primeira página que um cliente
 * estrangeiro vê, e estava fechada em português.
 *
 * Conduz os DOIS sistemas, tal como o da navbar: o dicionário nativo (páginas migradas) e o
 * cookie do Google Translate (as restantes). Uma escolha, um resultado.
 */
export default function LanguagePicker({
  className = "",
  align = "right",
}: {
  className?: string
  align?: "left" | "right"
}) {
  const { lang, setLang } = useI18n()
  const [aberto, setAberto] = useState(false)
  const atual = languageOption(lang) ?? PRIORITY_LANGUAGES[0]

  const escolher = (opcao: LanguageOption) => {
    setAberto(false)
    if (opcao.code === lang) return
    setLang(opcao.code)          // dicionário nativo + cookie mtm_lang + perfil
    applyGoogleTranslate(opcao.code) // páginas ainda não migradas
    // O Google Translate só reprocessa a página no carregamento seguinte.
    setTimeout(() => window.location.reload(), 120)
  }

  const Linha = ({ o }: { o: LanguageOption }) => (
    <button
      type="button"
      onClick={() => escolher(o)}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5"
      lang={o.code}
    >
      <span aria-hidden>{o.flag}</span>
      <span className="flex-1 truncate">{o.nativeName}</span>
      {o.code === lang && <Check className="h-3.5 w-3.5 text-[#D2A63C]" />}
    </button>
  )

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label="Language"
        className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-[#D2A63C]/60"
      >
        <Globe className="h-3.5 w-3.5 text-[#D2A63C]" />
        <span aria-hidden>{atual.flag}</span>
        <span className="hidden sm:inline">{atual.nativeName}</span>
      </button>

      {aberto && (
        <>
          {/* Clicar fora fecha — sem isto o menu ficava aberto por cima do formulário. */}
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} aria-hidden />
          <div
            role="listbox"
            className={`absolute z-50 mt-1 max-h-[60vh] w-52 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-2xl ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {PRIORITY_LANGUAGES.map((o) => (
              <Linha key={o.code} o={o} />
            ))}
            <div className="my-1 border-t border-zinc-800" />
            {OTHER_LANGUAGES.map((o) => (
              <Linha key={o.code} o={o} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

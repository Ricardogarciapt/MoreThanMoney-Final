"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { Check, Globe } from "lucide-react"
import { IDIOMAS, NOME_IDIOMA, criarTradutor, type Dicionario, type Idioma, type Tradutor } from "@/lib/site-solucoes/i18n/base"

/**
 * O idioma do /solucoes no browser. A página (servidor) escolhe o idioma e passa só o dicionário
 * desse idioma; os componentes usam useT() para t()/tf()/n().
 */

const Ctx = createContext<Tradutor>(criarTradutor("pt"))

export function IdiomaSolucoes({ idioma, dic, children }: { idioma: Idioma; dic: Dicionario; children: React.ReactNode }) {
  const valor = useMemo(() => criarTradutor(idioma, dic), [idioma, dic])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useT(): Tradutor {
  return useContext(Ctx)
}

/** O seletor: grava a escolha no cookie do site (mtm_lang) e recarrega com ?lang=. */
export function SeletorIdioma({ idioma, rotulo }: { idioma: Idioma; rotulo: string }) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false)
    document.addEventListener("mousedown", fora)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", fora)
      document.removeEventListener("keydown", esc)
    }
  }, [aberto])

  function escolher(l: Idioma) {
    document.cookie = `mtm_lang=${l};path=/;max-age=31536000;samesite=lax`
    try {
      localStorage.setItem("mtm_preferred_language", l)
    } catch {
      /* sem armazenamento: o cookie chega */
    }
    const u = new URL(window.location.href)
    u.searchParams.set("lang", l)
    window.location.assign(u.toString())
  }

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={() => setAberto((x) => !x)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={rotulo}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/15 px-3 text-sm font-semibold uppercase text-zinc-300 transition hover:border-[#D2A63C]/60 hover:text-white"
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        {idioma}
      </button>
      {aberto && (
        <ul
          role="listbox"
          aria-label={rotulo}
          className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-white/10 bg-[#12151C] py-1 shadow-2xl"
        >
          {IDIOMAS.map((l) => (
            <li key={l} role="option" aria-selected={l === idioma}>
              <button
                type="button"
                lang={l}
                onClick={() => escolher(l)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06]"
              >
                {NOME_IDIOMA[l]}
                {l === idioma && <Check className="h-4 w-4 text-[#E9C46A]" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

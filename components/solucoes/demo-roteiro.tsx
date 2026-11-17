"use client"

import { useEffect, useRef, useState } from "react"
import { Bot, Play, RotateCcw, Server, User, UserRound } from "lucide-react"
import type { Passo, Quem } from "@/lib/site-solucoes/demos-diarias"
import { useT } from "@/components/solucoes/idioma"

const PASSO_MS = 1600

const ROTULO: Record<Quem, string> = { cliente: "Cliente", agente: "Agente MTM", sistema: "Sistema", dono: "Tu" }
const ICONE: Record<Quem, typeof Bot> = { cliente: User, agente: Bot, sistema: Server, dono: UserRound }

/**
 * O ecrã da demo: o roteiro aparece passo a passo, como num telemóvel. Com movimento reduzido mostra
 * tudo de uma vez. Botão para repetir; nada roda sem a pessoa ver (só arranca quando entra no ecrã).
 */
export function DemoRoteiro({ roteiro }: { roteiro: Passo[] }) {
  const { t } = useT()
  const [n, setN] = useState(0)
  const [a_correr, setACorrer] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(roteiro.length)
      return
    }
    const el = raiz.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setACorrer(true)
        obs.disconnect()
      }
    }, { threshold: 0.4 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [roteiro.length])

  useEffect(() => {
    if (!a_correr) return
    if (n >= roteiro.length) {
      setACorrer(false)
      return
    }
    const t = window.setTimeout(() => setN((x) => x + 1), n === 0 ? 300 : PASSO_MS)
    return () => window.clearTimeout(t)
  }, [a_correr, n, roteiro.length])

  const repetir = () => {
    setN(0)
    setACorrer(true)
  }

  return (
    <div ref={raiz} className="mx-auto w-full max-w-sm">
      <div className="rounded-[2rem] border border-white/10 bg-[#0E1015] p-3 shadow-2xl shadow-black/40">
        <div className="mb-2 flex items-center justify-between px-2 pt-1 text-[11px] text-zinc-500">
          <span>{t("Demonstração")}</span>
          <span>{Math.min(n, roteiro.length)}/{roteiro.length}</span>
        </div>
        <ol className="flex min-h-[420px] flex-col gap-2.5 rounded-[1.5rem] bg-[#08090C] p-3" aria-live="polite">
          {roteiro.slice(0, n).map((p, i) => {
            const Icone = ICONE[p.quem]
            const direita = p.quem === "cliente"
            const sistema = p.quem === "sistema"
            return (
              <li
                key={i}
                className={`flex max-w-[88%] flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-300 ${direita ? "self-end items-end" : "self-start"}`}
              >
                <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <Icone className="h-3 w-3" aria-hidden="true" /> {t(ROTULO[p.quem])}
                </span>
                <p
                  className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    direita
                      ? "rounded-br-sm bg-[#D2A63C] text-[#08090C]"
                      : sistema
                        ? "border border-dashed border-[#D2A63C]/40 bg-transparent text-[#E9C46A]"
                        : "rounded-bl-sm bg-white/[0.06] text-zinc-100"
                  }`}
                >
                  {t(p.texto)}
                </p>
              </li>
            )
          })}
        </ol>
      </div>
      <button
        type="button"
        onClick={repetir}
        className="mx-auto mt-4 flex min-h-[44px] items-center gap-2 rounded-full border border-white/10 px-5 text-sm text-zinc-300 transition hover:border-[#D2A63C]/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D2A63C]"
      >
        {n === 0 ? <Play className="h-4 w-4" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
        {n === 0 ? t("Ver a demo") : t("Repetir")}
      </button>
    </div>
  )
}

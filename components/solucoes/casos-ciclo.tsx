"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { ArrowUpRight, Check, ChevronLeft, ChevronRight } from "lucide-react"
import type { Caso } from "@/lib/site-solucoes/conteudo"

const INTERVALO_MS = 7000

/**
 * Projectos reais em ciclo: um de cada vez, em destaque, a rodar sozinho. Pára quando o rato ou o
 * foco estão em cima, quando o separador está escondido e com movimento reduzido. As setas e os
 * separadores deixam escolher à mão.
 */
export function CasosCiclo({ casos }: { casos: Caso[] }) {
  const [i, setI] = useState(0)
  const [pausa, setPausa] = useState(false)
  const [reduzido, setReduzido] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const n = casos.length

  useEffect(() => {
    setReduzido(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useEffect(() => {
    if (n < 2 || pausa || reduzido) return
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setI((x) => (x + 1) % n)
    }, INTERVALO_MS)
    return () => window.clearInterval(t)
  }, [n, pausa, reduzido, i])

  if (!n) return null
  const c = casos[i]
  const ir = (k: number) => setI(((k % n) + n) % n)

  return (
    <div
      ref={raiz}
      className="mt-10"
      onMouseEnter={() => setPausa(true)}
      onMouseLeave={() => setPausa(false)}
      onFocus={() => setPausa(true)}
      onBlur={(e) => {
        if (!raiz.current?.contains(e.relatedTarget as Node)) setPausa(false)
      }}
      aria-roledescription="carrossel"
      aria-label="Projectos reais"
    >
      <div role="tablist" aria-label="Escolher projecto" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {casos.map((x, k) => (
          <button
            key={x.cliente}
            role="tab"
            aria-selected={k === i}
            onClick={() => ir(k)}
            className={`relative shrink-0 overflow-hidden rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              k === i ? "border-[#D2A63C]/60 bg-[#D2A63C]/10 text-[#E9C46A]" : "border-white/10 text-zinc-400 hover:text-white"
            }`}
          >
            {x.cliente}
            {k === i && n > 1 && !reduzido && (
              <span
                key={`${i}-${pausa}`}
                className="absolute bottom-0 left-0 h-0.5 bg-[#D2A63C]"
                style={{ animation: pausa ? "none" : `casoBarra ${INTERVALO_MS}ms linear forwards`, width: pausa ? "100%" : undefined }}
              />
            )}
          </button>
        ))}
      </div>

      <article
        key={c.cliente}
        aria-live={pausa ? "polite" : "off"}
        className="mt-5 grid overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 md:min-h-[440px] md:grid-cols-[1.25fr_1fr]"
      >
        {c.img ? (
          <Image src={c.img} alt={`Site de ${c.cliente}`} width={1366} height={900} className="h-full max-h-[460px] w-full object-cover object-top" />
        ) : (
          <div className="relative flex min-h-[220px] flex-col justify-end overflow-hidden bg-[radial-gradient(120%_90%_at_20%_0%,rgba(210,166,60,0.28),transparent_60%),linear-gradient(160deg,#121318,#08090C)] p-8">
            <span aria-hidden className="pointer-events-none absolute -right-4 -top-10 select-none text-[180px] font-black leading-none text-white/[0.04]">
              {c.cliente.slice(0, 2)}
            </span>
            <p className="text-sm text-[#E9C46A]">{c.setor}</p>
            <p className="mt-2 max-w-[22ch] text-2xl font-bold leading-tight text-white md:text-3xl">{c.feito[0]}</p>
          </div>
        )}
        <div className="flex flex-col p-7 md:p-9">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[#E9C46A]">{c.setor}</p>
            <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300">{c.estado}</span>
          </div>
          <h3 className="mt-2 text-2xl font-bold">
            {c.cliente}
            {c.anonimo && <span className="ml-2 align-middle text-xs font-normal text-zinc-500">projecto anónimo</span>}
          </h3>
          <p className="mt-3 text-sm italic text-zinc-400">«{c.problema}»</p>
          <ul className="mt-5 space-y-2 text-sm text-zinc-300">
            {c.feito.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" /> {f}
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-center justify-between gap-3 pt-6">
            {c.url ? (
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[#E9C46A] hover:underline">
                Ver o projecto <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : (
              <span />
            )}
            {n > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-zinc-500">
                  {i + 1} / {n}
                </span>
                <button type="button" onClick={() => ir(i - 1)} aria-label="Projecto anterior" className="rounded-full border border-white/10 p-2 text-zinc-300 transition hover:border-[#D2A63C]/60 hover:text-white active:scale-95">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => ir(i + 1)} aria-label="Projecto seguinte" className="rounded-full border border-white/10 p-2 text-zinc-300 transition hover:border-[#D2A63C]/60 hover:text-white active:scale-95">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </article>
      <style>{`@keyframes casoBarra{from{width:0}to{width:100%}}`}</style>
    </div>
  )
}

"use client"

import { useRef } from "react"
import Image from "next/image"

/**
 * Screenshot real de um projecto numa moldura de browser, com inclinação 3D a seguir o rato,
 * reflexo de luz e um travelling lento pela página (Ken Burns). Com movimento reduzido fica quieta.
 */
export function EcraProjeto({ src, alt, url, className = "", prioridade = false }: { src: string; alt: string; url?: string; className?: string; prioridade?: boolean }) {
  const caixa = useRef<HTMLDivElement>(null)

  const mover = (e: React.PointerEvent) => {
    const el = caixa.current
    if (!el || e.pointerType === "touch") return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`)
    el.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`)
    el.style.setProperty("--lx", `${((x + 0.5) * 100).toFixed(1)}%`)
    el.style.setProperty("--ly", `${((y + 0.5) * 100).toFixed(1)}%`)
  }
  const sair = () => {
    const el = caixa.current
    if (!el) return
    el.style.setProperty("--rx", "0deg")
    el.style.setProperty("--ry", "0deg")
  }

  const dominio = url ? url.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : ""

  return (
    <div className={`[perspective:1400px] ${className}`} onPointerMove={mover} onPointerLeave={sair}>
      <div
        ref={caixa}
        className="ecra-projeto relative overflow-hidden rounded-2xl border border-white/10 bg-[#0B0C10] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(210,166,60,0.08)] transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: "rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))", transformStyle: "preserve-3d" }}
      >
        <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]/80" />
          {dominio && <span className="ml-3 truncate rounded-md bg-black/40 px-2.5 py-0.5 text-[11px] text-zinc-400">{dominio}</span>}
        </div>
        <div className="relative aspect-[16/10] overflow-hidden">
          <Image src={src} alt={alt} fill sizes="(min-width: 768px) 640px, 100vw" priority={prioridade} className="ecra-pan object-cover object-top" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 [.ecra-projeto:hover_&]:opacity-100"
            style={{ background: "radial-gradient(600px circle at var(--lx,50%) var(--ly,0%), rgba(233,196,106,0.16), transparent 45%)" }}
          />
        </div>
      </div>
      <style>{`
        @keyframes ecraPan { 0%,12% { transform: scale(1.06) translateY(0) } 55%,70% { transform: scale(1.12) translateY(-3%) } 100% { transform: scale(1.06) translateY(0) } }
        @media (prefers-reduced-motion: no-preference) { .ecra-pan { animation: ecraPan 16s ease-in-out infinite; transform-origin: 50% 0 } }
      `}</style>
    </div>
  )
}

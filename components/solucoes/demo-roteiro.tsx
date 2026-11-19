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
  const [escreve, setEscreve] = useState(false)
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
    // «a escrever…» antes de cada mensagem, como num chat a sério
    const a = window.setTimeout(() => setEscreve(true), n === 0 ? 100 : PASSO_MS - 700)
    const b = window.setTimeout(() => {
      setEscreve(false)
      setN((x) => x + 1)
    }, n === 0 ? 700 : PASSO_MS)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [a_correr, n, roteiro.length])

  const atual = n > 0 ? roteiro[Math.min(n, roteiro.length) - 1].quem : null
  const anterior = n > 1 ? roteiro[n - 2].quem : null
  const seguinte = n < roteiro.length ? roteiro[n].quem : null

  const repetir = () => {
    setN(0)
    setACorrer(true)
  }

  return (
    <div ref={raiz} className="mx-auto w-full max-w-sm">
      <Fluxo atual={atual} anterior={anterior} passo={n} t={t} />
      <div className="mt-4 [perspective:1400px]">
      <div className="demo-tel rounded-[2rem] border border-white/10 bg-[#0E1015] p-3 shadow-2xl shadow-black/40 ring-1 ring-[#D2A63C]/15">
        <div className="mb-2 flex items-center justify-between px-2 pt-1 text-[11px] text-zinc-500">
          <span>{t("Demonstração")}</span>
          <span>{Math.min(n, roteiro.length)}/{roteiro.length}</span>
        </div>
        <div className="mx-2 mb-2 h-0.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full bg-gradient-to-r from-[#D2A63C] to-[#E9C46A] transition-[width] duration-700 ease-out" style={{ width: `${(Math.min(n, roteiro.length) / roteiro.length) * 100}%` }} />
        </div>
        <ol className="flex min-h-[420px] flex-col gap-2.5 rounded-[1.5rem] bg-[#08090C] p-3" aria-live="polite">
          {roteiro.slice(0, n).map((p, i) => {
            const Icone = ICONE[p.quem]
            const direita = p.quem === "cliente"
            const sistema = p.quem === "sistema"
            return (
              <li
                key={i}
                className={`demo-msg flex max-w-[88%] flex-col gap-1 ${direita ? "self-end items-end" : "self-start"}`}
              >
                <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <Icone className="h-3 w-3" aria-hidden="true" /> {t(ROTULO[p.quem])}
                </span>
                <p
                  className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    direita
                      ? "rounded-br-sm bg-[#D2A63C] text-[#08090C]"
                      : sistema
                        ? "border border-dashed border-[#D2A63C]/40 bg-transparent text-[#E9C46A] shadow-[0_0_24px_-6px_rgba(210,166,60,0.5)]"
                        : "rounded-bl-sm bg-white/[0.06] text-zinc-100"
                  }`}
                >
                  {t(p.texto)}
                </p>
              </li>
            )
          })}
          {escreve && seguinte && (
            <li className={`flex items-center gap-1 rounded-2xl bg-white/[0.06] px-3 py-2.5 ${seguinte === "cliente" ? "self-end" : "self-start"}`} aria-hidden="true">
              <span className="demo-ponto h-1.5 w-1.5 rounded-full bg-zinc-400" />
              <span className="demo-ponto h-1.5 w-1.5 rounded-full bg-zinc-400 [animation-delay:.15s]" />
              <span className="demo-ponto h-1.5 w-1.5 rounded-full bg-zinc-400 [animation-delay:.3s]" />
            </li>
          )}
        </ol>
      </div>
      </div>
      <button
        type="button"
        onClick={repetir}
        className="mx-auto mt-4 flex min-h-[44px] items-center gap-2 rounded-full border border-white/10 px-5 text-sm text-zinc-300 transition hover:border-[#D2A63C]/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D2A63C]"
      >
        {n === 0 ? <Play className="h-4 w-4" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
        {n === 0 ? t("Ver a demo") : t("Repetir")}
      </button>
      <style>{`
        @keyframes demoMsg { from { opacity: 0; transform: translateY(14px) scale(.96); filter: blur(4px) } to { opacity: 1; transform: none; filter: none } }
        @keyframes demoPonto { 0%,80%,100% { transform: translateY(0); opacity: .4 } 40% { transform: translateY(-4px); opacity: 1 } }
        @keyframes demoTel { 0%,100% { transform: rotateX(4deg) rotateY(-6deg) translateY(0) } 50% { transform: rotateX(-2deg) rotateY(4deg) translateY(-8px) } }
        @keyframes demoPulso { from { offset-distance: 0% ; opacity: 1 } to { offset-distance: 100%; opacity: 1 } }
        @media (prefers-reduced-motion: no-preference) {
          .demo-msg { animation: demoMsg .45s cubic-bezier(.2,.8,.2,1) both }
          .demo-ponto { animation: demoPonto 1s ease-in-out infinite }
          .demo-tel { animation: demoTel 9s ease-in-out infinite; transform-style: preserve-3d }
        }
      `}</style>
    </div>
  )
}

/** Posição de cada papel no diagrama (viewBox 320×92). */
const NO: Record<Quem, [number, number]> = { cliente: [32, 46], agente: [128, 46], sistema: [224, 46], dono: [296, 46] }
const ORDEM: Quem[] = ["cliente", "agente", "sistema", "dono"]

/**
 * O fluxo por trás do chat: quem fala acende e um impulso dourado viaja de quem falou antes para
 * quem fala agora. Mostra que não é só uma conversa: há um agente e um sistema a trabalhar.
 */
function Fluxo({ atual, anterior, passo, t }: { atual: Quem | null; anterior: Quem | null; passo: number; t: (s: string) => string }) {
  const de = anterior ? NO[anterior] : null
  const para = atual ? NO[atual] : null
  const caminho = de && para && anterior !== atual ? `M${de[0]},${de[1]} C${(de[0] + para[0]) / 2},${de[1] - 38} ${(de[0] + para[0]) / 2},${para[1] - 38} ${para[0]},${para[1]}` : null
  return (
    <svg viewBox="0 0 320 92" className="w-full overflow-visible" role="img" aria-label={t("Demonstração")}>
      <defs>
        <radialGradient id="demoBrilho">
          <stop offset="0%" stopColor="#E9C46A" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#D2A63C" stopOpacity="0" />
        </radialGradient>
      </defs>
      <line x1="32" y1="46" x2="296" y2="46" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3 5" />
      {caminho && (
        <g key={passo}>
          <path d={caminho} fill="none" stroke="rgba(210,166,60,0.35)" strokeWidth="1.2" />
          <circle r="4" fill="#E9C46A" className="motion-safe:[animation:demoPulso_.9s_ease-in-out_both]" style={{ offsetPath: `path("${caminho}")` } as React.CSSProperties}>
          </circle>
        </g>
      )}
      {ORDEM.map((q) => {
        const [x, y] = NO[q]
        const ligado = q === atual
        const Icone = ICONE[q]
        return (
          <g key={q}>
            {ligado && <circle cx={x} cy={y} r="26" fill="url(#demoBrilho)" className="motion-safe:animate-pulse" />}
            <circle cx={x} cy={y} r="15" fill={ligado ? "#D2A63C" : "#14161C"} stroke={ligado ? "#E9C46A" : "rgba(255,255,255,0.15)"} strokeWidth="1" className="transition-colors duration-300" />
            <foreignObject x={x - 7} y={y - 7} width="14" height="14">
              <Icone className={`h-3.5 w-3.5 ${ligado ? "text-[#08090C]" : "text-zinc-400"}`} aria-hidden="true" />
            </foreignObject>
            <text x={x} y={y + 30} textAnchor="middle" className={`text-[9px] ${ligado ? "fill-[#E9C46A]" : "fill-zinc-500"}`}>{t(ROTULO[q])}</text>
          </g>
        )
      })}
    </svg>
  )
}

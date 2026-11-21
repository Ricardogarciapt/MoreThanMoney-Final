"use client"

import { useEffect, useState } from "react"
import { Bot, Check, Moon, Sun } from "lucide-react"
import { useT } from "@/components/solucoes/idioma"
import { DIA } from "@/lib/site-solucoes/dia"

/**
 * «O mesmo dia, sem e com IA»: um interruptor que troca o dia de quem faz tudo à mão pelo mesmo
 * dia com as automações a correr (alterna sozinho até a pessoa tocar). Exemplo ilustrativo (sem números de clientes).
 */


export function DiaAntesDepois() {
  const { t } = useT()
  const [comIA, setComIA] = useState(false)
  const [tocou, setTocou] = useState(false)

  // Alterna sozinho até a pessoa mexer: percebe-se a diferença sem ler instruções.
  useEffect(() => {
    if (tocou || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => setComIA((x) => !x), 3800)
    return () => window.clearInterval(id)
  }, [tocou])

  const escolher = (v: boolean) => {
    setTocou(true)
    setComIA(v)
  }

  return (
    <div>
      <div role="radiogroup" aria-label={t("Compara o dia sem IA e com IA")} className="relative mx-auto mb-5 grid w-full max-w-sm grid-cols-2 rounded-full border border-white/10 bg-white/[0.04] p-1">
        <span
          className="absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-[#D2A63C] shadow-lg shadow-[#D2A63C]/30 transition-transform duration-500"
          style={{ transform: comIA ? "translateX(calc(100% + 0px))" : "translateX(0)", left: 4 }}
          aria-hidden="true"
        />
        {[false, true].map((v) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={comIA === v}
            onClick={() => escolher(v)}
            className={`relative z-10 min-h-[44px] rounded-full text-sm font-semibold transition-colors ${comIA === v ? "text-black" : "text-zinc-300"}`}
          >
            {v ? t("Com IA") : t("Sem IA")}
          </button>
        ))}
      </div>
      <div className="relative grid overflow-hidden rounded-3xl border border-white/10 bg-[#0B0D12]">
        <div className={`[grid-area:1/1] transition-all duration-700 ${comIA ? "pointer-events-none scale-[0.98] opacity-0 blur-sm" : "opacity-100"}`} aria-hidden={comIA}>
          <Camada lado="sem" t={t} />
        </div>
        <div className={`[grid-area:1/1] transition-all duration-700 ${comIA ? "opacity-100" : "pointer-events-none scale-[1.02] opacity-0 blur-sm"}`} aria-hidden={!comIA}>
          <Camada lado="com" t={t} />
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-zinc-500">{t("Exemplo ilustrativo")}</p>
    </div>
  )
}

function Camada({ lado, t }: { lado: "sem" | "com"; t: (s: string) => string }) {
  const com = lado === "com"
  return (
    <div
      className="h-full p-5 md:p-8"
      style={{ background: com ? "radial-gradient(90% 80% at 85% 0%, rgba(210,166,60,0.22), transparent 60%), #0E0F12" : "radial-gradient(90% 80% at 10% 0%, rgba(59,73,110,0.35), transparent 60%), #0A0C12" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${com ? "text-[#E9C46A]" : "text-sky-300/80"}`}>{com ? t("O mesmo dia, com IA") : t("Um dia normal, sem IA")}</p>
          <p className="mt-1 text-2xl font-black md:text-3xl">{com ? t("Fechas às 18:00.") : t("Fechas às 21:40.")}</p>
        </div>
        {com ? <Sun className="h-8 w-8 shrink-0 text-[#E9C46A]" aria-hidden="true" /> : <Moon className="h-8 w-8 shrink-0 text-sky-300/70" aria-hidden="true" />}
      </div>
      <ol className="mt-6 grid gap-2.5 md:grid-cols-2">
        {DIA.map((x) => (
          <li
            key={x.h}
            className={`flex gap-3 rounded-2xl border px-4 py-3 text-sm ${
              com ? "border-[#D2A63C]/25 bg-[#D2A63C]/[0.07] text-zinc-100" : "border-white/[0.07] bg-white/[0.03] text-zinc-400"
            }`}
          >
            <span className={`w-12 shrink-0 font-mono text-xs leading-5 ${com ? "text-[#E9C46A]" : "text-zinc-500"}`}>{x.h}</span>
            <span className="flex gap-2">
              {com ? <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" aria-hidden="true" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" aria-hidden="true" />}
              {t(com ? x.com : x.sem)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, MessageCircle } from "lucide-react"
import { MODELOS } from "@/lib/site-solucoes/showroom"
import { useT } from "@/components/solucoes/idioma"

/**
 * Montra dos modelos por sector: escolhes o sector e o telemóvel mostra a página + app com a marca
 * de um negócio fictício (kit pagina-app + agenda-lembretes do Monorepo). Nada aqui é cliente.
 */
export function MontraModelos({ publicadas }: { publicadas: string[] }) {
  const { t, ligar } = useT()
  const [id, setId] = useState(MODELOS[0].id)
  const [pedido, setPedido] = useState<string | null>(null)
  const m = MODELOS.find((x) => x.id === id) ?? MODELOS[0]
  const temDemo = publicadas.includes(m.demo)

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px] md:items-start">
      <div>
        <div role="tablist" aria-label={t("Escolhe o sector")} className="flex flex-wrap gap-2">
          {MODELOS.map((x) => (
            <button
              key={x.id}
              role="tab"
              type="button"
              aria-selected={x.id === id}
              onClick={() => {
                setId(x.id)
                setPedido(null)
              }}
              className={`min-h-[44px] rounded-full border px-4 text-sm transition ${
                x.id === id ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#E9C46A]" : "border-white/10 text-zinc-300 hover:border-white/30"
              }`}
            >
              {t(x.sector)}
            </button>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border border-white/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">{t("O que vem no kit")}</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            {[
              "Página com a tua marca, serviços e preços",
              "Instala-se no telemóvel como uma app",
              "Marcações pelo WhatsApp com as horas livres do teu horário",
              "Lembrete no calendário do cliente um dia e duas horas antes",
            ].map((x) => (
              <li key={x} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" aria-hidden="true" /> {t(x)}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-zinc-500">{t("Negócio fictício, só para mostrar o modelo. Na tua demo entram o teu nome, as tuas cores e os teus serviços.")}</p>
          {temDemo && (
            <Link href={ligar(`/solucoes/demos/${m.demo}`)} className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#E9C46A]">
              {t("Ver a demo animada deste caso")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      {/* Telemóvel com a marca do sector */}
      <div className="mx-auto w-full max-w-[320px] rounded-[2.5rem] border border-white/15 bg-black p-3 shadow-2xl shadow-[#D2A63C]/10">
        <div className="overflow-hidden rounded-[2rem]" style={{ background: m.corFundo, color: m.corTexto }}>
          <div className="px-5 pb-6 pt-8" style={{ background: m.corPrincipal, color: "#fff" }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-lg font-bold" aria-hidden="true">
              {m.marca.slice(0, 1)}
            </div>
            <p className="mt-3 text-xl font-bold leading-tight">{m.marca}</p>
            <p className="mt-1 text-sm opacity-90">{t(m.slogan)}</p>
          </div>
          <div className="space-y-2 p-4">
            {m.servicos.map((s) => (
              <button
                key={s.s}
                type="button"
                onClick={() => setPedido(s.s)}
                className="flex w-full min-h-[48px] items-center justify-between rounded-xl border px-3 text-left text-sm"
                style={{ borderColor: `${m.corPrincipal}55` }}
              >
                <span className="font-medium">{t(s.s)}</span>
                <span className="opacity-70">{t(s.p)}</span>
              </button>
            ))}
            <div aria-live="polite" className="min-h-[72px] pt-2">
              {pedido ? (
                <div className="rounded-xl p-3 text-sm" style={{ background: `${m.corPrincipal}1A` }}>
                  <p className="font-semibold">{t("Pedido pronto a enviar")}</p>
                  <p className="mt-1 opacity-80">{t(pedido)} · {t("amanhã às 10:00")}</p>
                </div>
              ) : (
                <p className="text-xs opacity-60">{t("Toca num serviço para experimentar a marcação.")}</p>
              )}
            </div>
            <div className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white" style={{ background: m.corPrincipal }}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> {t("Marcar pelo WhatsApp")}
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-500">{t("Demonstração · negócio fictício")}</p>
      </div>
    </div>
  )
}

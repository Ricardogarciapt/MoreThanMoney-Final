"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Bot, CalendarCheck, Check, Clock, Move3d, Share2, Sparkles, Wand2 } from "lucide-react"
import { useT } from "@/components/solucoes/idioma"
import { Telemovel } from "@/components/solucoes/montra-modelos"
import { modeloDoPrototipo, type PrototipoSpec } from "@/lib/site-solucoes/prototipo"

const RaTelemovel = dynamic(() => import("@/components/solucoes/ra-telemovel").then((x) => x.RaTelemovel), { ssr: false })

/**
 * A página do protótipo de UM negócio: a app dele a funcionar no telemóvel (e em 3D / no espaço
 * dele), o assistente com as perguntas dos clientes dele, como cada solução corre no dia dele, e a
 * linha do tempo: protótipo pronto agora → reunião → demo com a marca dele até 24 h depois.
 */

export interface EstadoPrototipo {
  estado: "gerado" | "reuniao_marcada" | "demo_entregue" | "arquivado"
  reuniaoEm: string | null
  prazoDemo: string | null
  demoUrl: string | null
}

export function VerPrototipo({ spec, estado, agendar }: { spec: PrototipoSpec; estado: EstadoPrototipo; agendar: string }) {
  const { t, tf, idioma } = useT()
  const m = modeloDoPrototipo(spec)
  const [ra, setRa] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [faqAberta, setFaqAberta] = useState(0)
  const [fuso, setFuso] = useState("Europe/Lisbon")
  useEffect(() => {
    try {
      setFuso(Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Lisbon")
    } catch {}
  }, [])

  // O 3D mostra a solução escolhida, ecrã a ecrã, com os passos de cada uma.
  const opcaoRA = useMemo(
    () => ({
      solucoes: spec.solucoes.map((s) => ({ kit: s.kit, nome: t(s.nome), passos: s.fluxo.map((p) => t(p.titulo)) })),
      boasVindas: spec.assistente.boasVindas,
      faq: spec.assistente.faq,
    }),
    [spec, t],
  )

  const local = idioma === "pt" ? "pt-PT" : idioma
  const quando = (iso: string) => new Date(iso).toLocaleString(local, { timeZone: fuso, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
  const marcada = estado.estado !== "gerado" && estado.reuniaoEm

  async function partilhar() {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: spec.empresa, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopiado(true)
        window.setTimeout(() => setCopiado(false), 2200)
      }
    } catch {}
  }

  const passos = [
    { Icone: Sparkles, titulo: t("Protótipo pronto"), texto: t("Feito pela nossa IA com os dados que nos deste."), feito: true },
    {
      Icone: CalendarCheck,
      titulo: t("Reunião de 30 minutos"),
      texto: marcada ? quando(estado.reuniaoEm!) : t("Afinamos juntos o que queres que a demo faça."),
      feito: Boolean(marcada),
    },
    {
      Icone: Wand2,
      titulo: t("Demo com a tua marca"),
      texto: estado.demoUrl ? t("Já está pronta.") : estado.prazoDemo ? tf("Até {quando}", { quando: quando(estado.prazoDemo) }) : t("Segue até 24 h depois da reunião."),
      feito: Boolean(estado.demoUrl),
    },
  ]

  return (
    <div>
      {/* Cabeçalho */}
      <div className="mx-auto max-w-3xl text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-3 py-1 text-xs font-semibold text-[#E9C46A]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {t("Protótipo feito pela nossa IA")}
        </p>
        <h1 className="mt-4 text-3xl font-black leading-tight md:text-5xl">
          {tf("A solução de {empresa} já existe.", { empresa: spec.empresa })}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-zinc-400">{t("Mexe na app como se fosses um cliente teu. Na reunião afinamos o resto e a versão real com a tua marca segue a seguir.")}</p>
      </div>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[380px_1fr]">
        {/* A app */}
        <div className="lg:sticky lg:top-6">
          <div className="relative">
            <div className="pointer-events-none absolute -inset-8 rounded-full opacity-40 blur-3xl" style={{ background: `radial-gradient(circle, ${spec.cor}66, transparent 70%)` }} aria-hidden="true" />
            <div className="relative">
              <Telemovel m={m} marca={spec.empresa} principal={spec.cor} />
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <button type="button" onClick={() => setRa(true)} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-[#D2A63C]/50 bg-[#D2A63C]/10 text-sm font-semibold text-[#E9C46A]">
              <Move3d className="h-4 w-4" aria-hidden="true" /> {t("Ver a minha solução em 3D")}
            </button>
            <button type="button" onClick={partilhar} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-white/15 text-sm font-semibold text-zinc-200">
              {copiado ? <Check className="h-4 w-4" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />} {copiado ? t("Link copiado") : t("Partilhar com o sócio")}
            </button>
          </div>
          {ra && <RaTelemovel m={m} marca={spec.empresa} principal={spec.cor} opcao={opcaoRA} real onFechar={() => setRa(false)} />}
        </div>

        <div className="space-y-8">
          {/* Linha do tempo */}
          <section className="rounded-3xl border border-white/10 bg-[#0E0F12] p-5 md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E9C46A]">{t("O caminho até à tua demo")}</p>
            <ol className="mt-5 grid gap-4 md:grid-cols-3">
              {passos.map(({ Icone, titulo, texto, feito }, i) => (
                <li key={titulo} className="relative">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${feito ? "bg-[#D2A63C] text-black" : "border border-white/15 text-zinc-400"}`}>
                    <Icone className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-white">
                    {i + 1}. {titulo}
                  </p>
                  <p className="mt-1 text-sm leading-snug text-zinc-400">{texto}</p>
                </li>
              ))}
            </ol>
            {!marcada ? (
              <a href={agendar} className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#D2A63C] px-6 font-bold text-black shadow-lg shadow-[#D2A63C]/25 md:w-auto">
                <CalendarCheck className="h-5 w-5" aria-hidden="true" /> {t("Marcar a reunião e receber a demo")} <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </a>
            ) : (
              <p className="mt-6 flex items-center gap-2 rounded-2xl border border-[#D2A63C]/30 bg-[#D2A63C]/10 px-4 py-3 text-sm text-[#E9C46A]">
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("Reunião marcada. A tua demo já está na nossa fila.")}
              </p>
            )}
            {estado.demoUrl && (
              <a href={estado.demoUrl} className="mt-3 inline-flex min-h-[48px] items-center gap-2 rounded-full border border-[#D2A63C]/60 px-5 text-sm font-semibold text-[#E9C46A]" target="_blank" rel="noreferrer">
                {t("Abrir a demo")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
          </section>

          {/* Soluções */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E9C46A]">{t("O que entra na tua solução")}</p>
            <div className="mt-4 grid gap-4">
              {spec.solucoes.map((s) => (
                <article key={s.kit} className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0D12]">
                  <div className="flex items-start gap-3 border-b border-white/[0.06] p-5" style={{ background: `linear-gradient(120deg, ${spec.cor}22, transparent 60%)` }}>
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: spec.cor }} aria-hidden="true" />
                    <div>
                      <h2 className="text-lg font-bold text-white">{t(s.nome)}</h2>
                      <p className="mt-1 text-sm text-zinc-300">{s.paraTi || t(s.promessa)}</p>
                    </div>
                  </div>
                  <ol className="grid gap-px bg-white/[0.04] sm:grid-cols-3">
                    {s.fluxo.map((p, i) => (
                      <li key={p.titulo} className="bg-[#0B0D12] p-4">
                        <span className="font-mono text-xs text-[#E9C46A]">0{i + 1}</span>
                        <p className="mt-1 text-sm font-semibold text-white">{t(p.titulo)}</p>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-400">{t(p.texto)}</p>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </section>

          {/* Assistente */}
          <section className="rounded-3xl border border-white/10 bg-[#0E0F12] p-5 md:p-6">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#E9C46A]">
              <Bot className="h-4 w-4" aria-hidden="true" /> {tf("O assistente de {empresa}", { empresa: spec.empresa })}
            </p>
            <div className="mt-4 space-y-3">
              <Bolha lado="ia" cor={spec.cor}>{spec.assistente.boasVindas}</Bolha>
              {spec.assistente.faq.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {spec.assistente.faq.map((q, i) => (
                      <button key={q.p} type="button" onClick={() => setFaqAberta(i)} className={`rounded-full border px-3 py-1.5 text-xs ${faqAberta === i ? "border-[#D2A63C] text-[#E9C46A]" : "border-white/15 text-zinc-400"}`}>
                        {q.p}
                      </button>
                    ))}
                  </div>
                  <Bolha lado="cliente" cor={spec.cor}>{spec.assistente.faq[faqAberta]?.p}</Bolha>
                  <Bolha lado="ia" cor={spec.cor} key={faqAberta}>{spec.assistente.faq[faqAberta]?.r}</Bolha>
                </>
              )}
            </div>
            <p className="mt-4 text-xs text-zinc-500">{t("Exemplo escrito pela IA. Na demo real, o assistente usa os teus preços, horários e regras.")}</p>
          </section>
        </div>
      </div>
    </div>
  )
}

function Bolha({ lado, cor, children }: { lado: "ia" | "cliente"; cor: string; children: React.ReactNode }) {
  const ia = lado === "ia"
  return (
    <div className={`flex ${ia ? "justify-start" : "justify-end"}`}>
      <p
        className="max-w-[85%] animate-[fadeIn_.4s_ease] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
        style={ia ? { background: "rgba(255,255,255,0.06)", color: "#f4f4f5", borderTopLeftRadius: 6 } : { background: cor, color: claro(cor) ? "#111" : "#fff", borderTopRightRadius: 6 }}
      >
        {children}
      </p>
    </div>
  )
}

function claro(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
}

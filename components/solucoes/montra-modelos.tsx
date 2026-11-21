"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  ArrowRight, Bath, BedDouble, CalendarCheck, Camera, Check, ChevronRight, Clock, Home, MapPin, MessageCircle,
  Move3d, Phone, Snowflake, Sparkles, UtensilsCrossed,
} from "lucide-react"
import { MODELOS, type ModeloSector } from "@/lib/site-solucoes/showroom"
import { useT } from "@/components/solucoes/idioma"

const RaTelemovel = dynamic(() => import("@/components/solucoes/ra-telemovel").then((x) => x.RaTelemovel), { ssr: false })

/**
 * Montra dos modelos por sector. Cada sector tem a sua app (ecrã de entrada diferente, letra e
 * cores do tema), com três ecrãs navegáveis: Início, Marcar e Contacto. O visitante pode pôr o
 * nome e a cor do negócio dele e vê a app dele; o botão leva à agenda já com o modelo e o nome.
 * Os negócios daqui são fictícios (kits/exemplos do Monorepo): nunca clientes.
 */

const LETRAS: Record<ModeloSector["letra"], React.CSSProperties> = {
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' },
  condensada: { fontFamily: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif', textTransform: "uppercase", letterSpacing: "0.04em" },
  sans: { fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
}

const CORES_ALTERNATIVAS = ["#D2A63C", "#2563EB", "#16A34A", "#DB2777", "#111827"]

type Ecra = "inicio" | "marcar" | "contacto"

function claro(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
}

export function MontraModelos({ publicadas, agendar, inicial, abrirRA = false }: { publicadas: string[]; agendar: string; inicial?: string; abrirRA?: boolean }) {
  const { t, ligar } = useT()
  const [id, setId] = useState(inicial ?? MODELOS[0].id)
  const [nome, setNome] = useState("")
  const [cor, setCor] = useState<string | null>(null)
  const [ra, setRa] = useState(abrirRA)
  const m = MODELOS.find((x) => x.id === id) ?? MODELOS[0]
  const marca = nome.trim().slice(0, 32) || m.marca
  const principal = cor ?? m.corPrincipal
  const temDemo = publicadas.includes(m.demo)

  const pedir = useMemo(() => {
    const u = new URL(agendar, "https://www.morethanmoney.pt")
    u.searchParams.set("modelo", m.id)
    if (nome.trim()) u.searchParams.set("negocio", nome.trim().slice(0, 60))
    return `${u.pathname}${u.search}`
  }, [agendar, m.id, nome])

  return (
    <div>
      <div role="tablist" aria-label={t("Escolhe o sector")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {MODELOS.map((x) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            aria-selected={x.id === id}
            onClick={() => {
              setId(x.id)
              setCor(null)
            }}
            className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition ${
              x.id === id ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#E9C46A]" : "border-white/10 text-zinc-300 hover:border-white/30"
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.corPrincipal }} aria-hidden="true" />
            {t(x.sector)}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-[1fr_340px] md:items-start">
        {/* Painel de venda: porquê, personalizar e pedir */}
        <div className="order-2 md:order-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">{t(m.sector)}</p>
          <h3 className="mt-2 text-2xl font-bold md:text-3xl">{t("Porque é que este modelo vende")}</h3>
          <ul className="mt-4 space-y-3">
            {m.vende.map((x) => (
              <li key={x} className="flex gap-3 text-zinc-200">
                <Check className="mt-1 h-4 w-4 shrink-0 text-[#D2A63C]" aria-hidden="true" /> {t(x)}
              </li>
            ))}
          </ul>

          <div className="mt-8 rounded-2xl border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-5">
            <p className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-[#D2A63C]" aria-hidden="true" /> {t("Vê com o teu nome")}
            </p>
            <label className="mt-4 block text-sm text-zinc-400" htmlFor="montra-nome">{t("Nome do teu negócio")}</label>
            <input
              id="montra-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={32}
              placeholder={m.marca}
              className="mt-1 w-full min-h-[48px] rounded-xl border border-white/15 bg-black/40 px-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-[#D2A63C]"
            />
            <p className="mt-4 text-sm text-zinc-400">{t("A tua cor")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[m.corPrincipal, ...CORES_ALTERNATIVAS.filter((c) => c !== m.corPrincipal)].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c === m.corPrincipal ? null : c)}
                  aria-label={c}
                  aria-pressed={principal === c}
                  className={`h-11 w-11 rounded-full border-2 transition ${principal === c ? "border-white" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <a
              href={pedir}
              className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#D2A63C] px-6 text-center font-semibold text-black hover:bg-[#E9C46A]"
            >
              <CalendarCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              {nome.trim() ? `${t("Quero a app de")} ${marca}` : t("Quero este modelo para o meu negócio")}
            </a>
            <p className="mt-3 text-center text-xs text-zinc-500">{t("Conversa de 30 minutos. Montamos a demo com a tua marca, a preço fechado.")}</p>
          </div>

          <p className="mt-4 text-xs text-zinc-500">{t("Negócio fictício, só para mostrar o modelo. Na tua demo entram o teu nome, as tuas cores e os teus serviços.")}</p>
          {temDemo && (
            <Link href={ligar(`/solucoes/demos/${m.demo}`)} className="mt-2 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#E9C46A]">
              {t("Ver a demo animada deste caso")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>

        {/* O telemóvel */}
        <div className="order-1 md:order-2">
          <Telemovel key={m.id} m={m} marca={marca} principal={principal} />
          <p className="mt-3 text-center text-[11px] text-zinc-500">{t("Demonstração · negócio fictício · toca para experimentar")}</p>
          <button
            type="button"
            onClick={() => setRa(true)}
            className="group relative mx-auto mt-4 flex min-h-[52px] w-full max-w-[300px] items-center justify-center gap-2 overflow-hidden rounded-full border border-[#D2A63C]/60 bg-gradient-to-r from-[#D2A63C]/20 via-[#D2A63C]/5 to-[#D2A63C]/20 px-5 font-semibold text-[#E9C46A] hover:border-[#E9C46A]"
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent motion-safe:animate-[ra-brilho_2.8s_ease-in-out_infinite]" aria-hidden="true" />
            <Move3d className="h-5 w-5" aria-hidden="true" /> {t("Ver em 3D e no meu espaço")}
          </button>
          <style>{`@keyframes ra-brilho{0%{transform:translateX(-100%)}60%,100%{transform:translateX(100%)}}`}</style>
          {ra && <RaTelemovel m={m} marca={marca} principal={principal} onFechar={() => setRa(false)} />}
        </div>
      </div>
    </div>
  )
}

function Telemovel({ m, marca, principal }: { m: ModeloSector; marca: string; principal: string }) {
  const { t } = useT()
  const [ecra, setEcra] = useState<Ecra>("inicio")
  const [servico, setServico] = useState(m.servicos[0].s)
  const [dia, setDia] = useState(1)
  const [hora, setHora] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [escolha, setEscolha] = useState<number | null>(null)

  const sobrePrincipal = claro(principal) ? "#111" : "#fff"
  const escuro = !claro(m.corFundo)
  const linha = escuro ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"
  const cartao = escuro ? "rgba(255,255,255,0.05)" : "#fff"
  const titulo = LETRAS[m.letra]
  const base = ["09:30", "11:00", "14:30", "16:00", "17:30", "19:00"]
  const horas = hora && !base.includes(hora) ? [...base.slice(0, 5), hora].sort() : base
  const dias = [t("Hoje"), t("Amanhã"), t("Sexta")]

  function marcar(s?: string, h?: string) {
    if (s) setServico(s)
    setHora(h ?? null)
    setEnviado(false)
    setEcra("marcar")
  }

  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.75rem] border border-white/15 bg-black p-2.5 shadow-2xl shadow-[#D2A63C]/10">
      <div className="relative flex h-[620px] flex-col overflow-hidden rounded-[2.25rem]" style={{ background: m.corFundo, color: m.corTexto }}>
        {/* Barra de estado */}
        <div className="flex items-center justify-between px-6 pt-3 text-[11px] font-semibold" style={{ color: ecra === "inicio" ? sobrePrincipal : m.corTexto, background: ecra === "inicio" ? principal : "transparent" }}>
          <span>9:41</span>
          <span className="h-4 w-20 rounded-full bg-black" aria-hidden="true" />
          <span>5G</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {ecra === "inicio" && (
            <>
              <div className="relative overflow-hidden px-5 pb-6 pt-5" style={{ background: principal, color: sobrePrincipal }}>
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20" style={{ background: sobrePrincipal }} aria-hidden="true" />
                <div className="absolute -bottom-16 right-10 h-32 w-32 rounded-full opacity-10" style={{ background: sobrePrincipal }} aria-hidden="true" />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-bold" style={{ background: `${sobrePrincipal}26`, ...titulo }} aria-hidden="true">
                  {marca.slice(0, 1).toUpperCase()}
                </div>
                <p className="relative mt-3 text-2xl font-bold leading-tight" style={titulo}>{marca}</p>
                <p className="relative mt-1 text-sm opacity-90">{t(m.slogan)}</p>
                <button
                  type="button"
                  onClick={() => marcar()}
                  className="relative mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-semibold"
                  style={{ background: sobrePrincipal, color: principal }}
                >
                  {m.layout === "ementa" ? t("Reservar mesa") : m.layout === "imoveis" ? t("Agendar visita") : m.layout === "orcamento" ? t("Pedir orçamento") : m.layout === "documentos" ? t("Marcar reunião") : t("Marcar agora")}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider opacity-60">{t(m.destaque.titulo)}</p>
                <Destaque m={m} principal={principal} sobrePrincipal={sobrePrincipal} cartao={cartao} linha={linha} escolha={escolha} setEscolha={setEscolha} marcar={marcar} titulo={titulo} />

                <p className="mt-5 text-xs font-bold uppercase tracking-wider opacity-60">{t("Serviços")}</p>
                <div className="mt-2 space-y-2">
                  {m.servicos.map((s) => (
                    <button key={s.s} type="button" onClick={() => marcar(s.s)} className="flex w-full min-h-[48px] items-center justify-between rounded-xl border px-3 text-left text-sm" style={{ borderColor: linha, background: cartao }}>
                      <span className="font-medium">{t(s.s)}</span>
                      <span className="flex items-center gap-1 opacity-70">{t(s.p)} <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {ecra === "marcar" && (
            <div className="p-5">
              <p className="text-xl font-bold" style={titulo}>{m.layout === "ementa" ? t("Reservar mesa") : t("Marcar")}</p>
              <p className="mt-1 text-xs opacity-60">{marca}</p>
              <p className="mt-5 text-xs font-bold uppercase tracking-wider opacity-60">{t("Serviço")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {m.servicos.map((s) => (
                  <button key={s.s} type="button" onClick={() => { setServico(s.s); setEnviado(false) }} className="min-h-[40px] rounded-full border px-3 text-xs font-medium" style={servico === s.s ? { background: principal, color: sobrePrincipal, borderColor: principal } : { borderColor: linha }}>
                    {t(s.s)}
                  </button>
                ))}
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-wider opacity-60">{t("Dia")}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {dias.map((d, i) => (
                  <button key={d} type="button" onClick={() => { setDia(i); setEnviado(false) }} className="min-h-[44px] rounded-xl border text-sm font-medium" style={dia === i ? { background: principal, color: sobrePrincipal, borderColor: principal } : { borderColor: linha, background: cartao }}>
                    {d}
                  </button>
                ))}
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-wider opacity-60">{t("Hora")}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {horas.map((h, i) => {
                  const ocupada = h !== hora && (i + dia) % 4 === 1
                  return (
                    <button key={h} type="button" disabled={ocupada} onClick={() => { setHora(h); setEnviado(false) }} className="min-h-[40px] rounded-xl border text-sm disabled:line-through disabled:opacity-30" style={hora === h ? { background: principal, color: sobrePrincipal, borderColor: principal } : { borderColor: linha, background: cartao }}>
                      {h}
                    </button>
                  )
                })}
              </div>
              <div aria-live="polite" className="mt-5">
                {enviado ? (
                  <div className="rounded-2xl p-3 text-sm" style={{ background: "#DCF8C6", color: "#0B141A" }}>
                    <p className="text-[11px] font-semibold opacity-60">WhatsApp · {marca}</p>
                    <p className="mt-1">{t("Olá! Queria marcar")} {t(servico)}, {dias[dia].toLowerCase()} {t("às")} {hora}.</p>
                    <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><Check className="h-3 w-3" aria-hidden="true" /> {t("Lembrete no calendário adicionado")}</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!hora}
                    onClick={() => setEnviado(true)}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-40"
                    style={{ background: principal, color: sobrePrincipal }}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" /> {hora ? t("Confirmar pelo WhatsApp") : t("Escolhe uma hora")}
                  </button>
                )}
              </div>
            </div>
          )}

          {ecra === "contacto" && (
            <div className="space-y-3 p-5 text-sm">
              <p className="text-xl font-bold" style={titulo}>{marca}</p>
              {[
                { i: Clock, a: t("Horário"), b: t("Ter a sáb · 09:00–19:00") },
                { i: MapPin, a: t("Morada"), b: t("Rua de Exemplo, 1 · Leiria") },
                { i: Phone, a: t("Telefone"), b: "+351 900 000 000" },
              ].map(({ i: I, a, b }) => (
                <div key={a} className="flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: linha, background: cartao }}>
                  <I className="mt-0.5 h-4 w-4 shrink-0" style={{ color: principal }} aria-hidden="true" />
                  <div>
                    <p className="text-xs opacity-60">{a}</p>
                    <p className="font-medium">{b}</p>
                  </div>
                </div>
              ))}
              <div className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl font-semibold" style={{ background: "#25D366", color: "#fff" }}>
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> {t("Falar no WhatsApp")}
              </div>
              <p className="pt-2 text-center text-[11px] opacity-50">{t("Instala no ecrã principal: fica como uma app")}</p>
            </div>
          )}
        </div>

        {/* Barra de separadores */}
        <nav className="grid grid-cols-3 border-t text-[11px]" style={{ borderColor: linha, background: escuro ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.9)" }} aria-label={t("Ecrãs da app")}>
          {([
            { e: "inicio", i: Home, r: t("Início") },
            { e: "marcar", i: CalendarCheck, r: m.layout === "ementa" ? t("Reservar") : t("Marcar") },
            { e: "contacto", i: Phone, r: t("Contacto") },
          ] as const).map(({ e, i: I, r }) => (
            <button key={e} type="button" onClick={() => setEcra(e)} aria-current={ecra === e ? "page" : undefined} className="flex min-h-[56px] flex-col items-center justify-center gap-1" style={{ color: ecra === e ? principal : undefined, opacity: ecra === e ? 1 : 0.6 }}>
              <I className="h-5 w-5" aria-hidden="true" /> {r}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

function Destaque({
  m, principal, sobrePrincipal, cartao, linha, escolha, setEscolha, marcar, titulo,
}: {
  m: ModeloSector; principal: string; sobrePrincipal: string; cartao: string; linha: string
  escolha: number | null; setEscolha: (n: number) => void; marcar: (s?: string, h?: string) => void; titulo: React.CSSProperties
}) {
  const { t } = useT()
  const it = m.destaque.itens

  if (m.layout === "agenda") {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {it.map((x) => (
          <button key={x.a} type="button" onClick={() => marcar(undefined, x.a)} className="min-h-[40px] rounded-full border px-4 text-sm font-semibold" style={{ borderColor: principal, color: principal }}>
            {x.a}
          </button>
        ))}
      </div>
    )
  }

  if (m.layout === "ementa") {
    const [prato, ...resto] = it
    return (
      <div className="mt-2 space-y-2">
        <div className="relative overflow-hidden rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${principal}, ${principal}CC)`, color: sobrePrincipal }}>
          <UtensilsCrossed className="absolute -right-2 -top-2 h-20 w-20 opacity-15" aria-hidden="true" />
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{t(prato.b ?? "")}</p>
          <p className="mt-1 text-lg font-bold" style={titulo}>{t(prato.a)}</p>
          <p className="mt-1 text-sm font-semibold">{prato.c}</p>
        </div>
        {resto.map((x) => (
          <div key={x.a} className="flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: linha, background: cartao }}>
            <div>
              <p className="font-medium">{t(x.a)}</p>
              <p className="text-xs opacity-60">{t(x.b ?? "")}</p>
            </div>
            <span className="font-semibold" style={{ color: principal }}>{x.c}</span>
          </div>
        ))}
      </div>
    )
  }

  if (m.layout === "aulas") {
    return (
      <div className="mt-2 space-y-2">
        {it.map((x, i) => (
          <div key={x.a} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: linha, background: cartao }}>
            <span className="w-12 text-sm font-bold" style={{ color: principal }}>{x.b}</span>
            <div className="flex-1">
              <p className="font-semibold" style={titulo}>{t(x.a)}</p>
              <p className="text-[11px] opacity-60">{t(x.c ?? "")}</p>
            </div>
            <button type="button" onClick={() => marcar(m.servicos[0].s, x.b)} className="min-h-[36px] rounded-full px-3 text-xs font-bold" style={{ background: i === 2 ? "transparent" : principal, color: i === 2 ? principal : sobrePrincipal, border: `1px solid ${principal}` }}>
              {i === 2 ? t("Avisa-me") : t("Entrar")}
            </button>
          </div>
        ))}
      </div>
    )
  }

  if (m.layout === "imoveis") {
    return (
      <div className="mt-2 space-y-3">
        {it.map((x, i) => (
          <div key={x.a} className="overflow-hidden rounded-2xl border" style={{ borderColor: linha, background: cartao }}>
            <div className="relative h-24" style={{ background: `linear-gradient(${i ? 200 : 140}deg, ${principal}, ${principal}55)` }}>
              <Home className="absolute bottom-2 right-3 h-14 w-14 opacity-25" style={{ color: sobrePrincipal }} aria-hidden="true" />
              <span className="absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: sobrePrincipal, color: principal }}>{t(x.b ?? "")}</span>
            </div>
            <div className="flex items-center justify-between p-3">
              <div>
                <p className="font-semibold">{t(x.a)}</p>
                <p className="mt-0.5 flex items-center gap-2 text-[11px] opacity-60">
                  <BedDouble className="h-3 w-3" aria-hidden="true" /> {i ? 3 : 2} <Bath className="h-3 w-3" aria-hidden="true" /> {i ? 2 : 1}
                </p>
              </div>
              <p className="font-bold" style={{ color: principal }}>{x.c}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (m.layout === "documentos") {
    return (
      <div className="mt-2 space-y-2">
        {it.map((x, i) => (
          <button key={x.a} type="button" onClick={() => setEscolha(i)} className="flex w-full min-h-[48px] items-center justify-between rounded-xl border px-3 text-left text-sm" style={{ borderColor: linha, background: cartao }}>
            <span className="flex items-center gap-2 font-medium">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border" style={escolha !== null && i <= escolha ? { background: principal, borderColor: principal, color: sobrePrincipal } : { borderColor: linha }}>
                {escolha !== null && i <= escolha ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
              </span>
              {t(x.a)}
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: principal }}>
              <Camera className="h-3.5 w-3.5" aria-hidden="true" /> {escolha !== null && i <= escolha ? t("Enviado") : t(x.c ?? "")}
            </span>
          </button>
        ))}
      </div>
    )
  }

  // orcamento
  return (
    <div className="mt-2">
      <div className="grid grid-cols-3 gap-2">
        {it.map((x, i) => (
          <button key={x.a} type="button" onClick={() => setEscolha(i)} className="flex min-h-[72px] flex-col items-center justify-center rounded-xl border p-2 text-center" style={escolha === i ? { background: principal, color: sobrePrincipal, borderColor: principal } : { borderColor: linha, background: cartao }}>
            <Snowflake className="h-4 w-4" aria-hidden="true" />
            <span className="mt-1 text-xs font-bold" style={titulo}>{t(x.a)}</span>
            <span className="text-[10px] opacity-70">{t(x.b ?? "")}</span>
          </button>
        ))}
      </div>
      <div aria-live="polite" className="mt-3 rounded-xl border p-3 text-sm" style={{ borderColor: linha, background: cartao }}>
        {escolha === null ? (
          <p className="opacity-60">{t("Escolhe a divisão para ver a sugestão.")}</p>
        ) : (
          <>
            <p className="font-semibold">{t("Sugestão")}: {t(escolha === 0 ? "aparelho de parede pequeno" : escolha === 1 ? "aparelho de parede médio" : "duas unidades ou conduta")}</p>
            <button type="button" onClick={() => marcar(m.servicos[0].s)} className="mt-2 text-xs font-bold" style={{ color: principal }}>
              {t("Marcar visita técnica sem custo")} →
            </button>
          </>
        )}
      </div>
    </div>
  )
}

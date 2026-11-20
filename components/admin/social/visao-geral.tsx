"use client"

import Link from "next/link"
import { ArrowUpRight, CalendarClock, Megaphone, Radar, Workflow, Plug, Bot } from "lucide-react"
import { AutoPublicarAgentes } from "@/components/admin/auto-publicar-agentes"
import { RegistoOperador } from "@/components/admin/registo-operador"
import { GRUPOS_SOCIAL, LIGACOES_BACKOFFICE, hrefBackoffice, type Secao } from "./navegacao"

export type ResumoSocial = {
  porEstado: Record<string, number>
  novos24h: number | null
  acessosHoje: number | null
  conversoes24h: number | null
  rascunhosPorRever: number | null
  proximos: { quando: string; conta: string | null; pilar: string | null; temImagem: boolean }[]
  degraus: { degrau: string; total: number }[]
  autopilot: { morethanmoney: boolean; ricardo: boolean } | null
  semImagem: number
}

const ICONE = { publicar: Megaphone, captar: Radar, converter: Workflow, ligacoes: Plug } as const

function Numero({ valor, rotulo, tom = "neutro", onClick }: { valor: number | null; rotulo: string; tom?: "ouro" | "alerta" | "neutro"; onClick?: () => void }) {
  const cor = tom === "ouro" ? "text-[#E9C46A]" : tom === "alerta" && (valor ?? 0) > 0 ? "text-red-300" : "text-zinc-100"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="group rounded-xl border border-white/[0.07] bg-zinc-900/50 px-4 py-3 text-left transition enabled:hover:border-[#D2A63C]/40 enabled:active:scale-[0.99]"
    >
      <span className={`block text-2xl font-semibold tabular-nums tracking-tight ${cor}`}>{valor ?? "—"}</span>
      <span className="mt-0.5 block text-xs text-zinc-500 group-enabled:group-hover:text-zinc-300">{rotulo}</span>
    </button>
  )
}

/** A primeira coisa que se vê: os números que pedem acção, as quatro áreas e as pontes ao back-office. */
export function VisaoGeral({ r, dono, irPara }: { r: ResumoSocial; dono: boolean; irPara: (s: Secao) => void }) {
  const teto = Math.max(1, ...r.degraus.map((d) => d.total))
  const vivo = (n: number | undefined) => n ?? 0

  const destaque: Record<string, string[]> = {
    publicar: [
      `${vivo(r.porEstado.draft)} rascunho(s) por rever`,
      `${vivo(r.porEstado.approved)} aprovado(s) à espera da hora`,
      r.autopilot ? `Autopiloto: @morethanmoney.pt ${r.autopilot.morethanmoney ? "ligado" : "desligado"} · @ricardogarciapt ${r.autopilot.ricardo ? "ligado" : "desligado"}` : "",
    ],
    captar: [`${r.novos24h ?? "—"} lead(s) novos em 24 h`, `${r.acessosHoje ?? "—"} acesso(s) hoje`],
    converter: [`${r.conversoes24h ?? "—"} conversão(ões) em 24 h`, `${r.degraus.length} degraus no funil`],
    ligacoes: ["Tokens de Página e segredo da app", "Webhook de leads da Meta (leadgen)"],
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Numero valor={r.rascunhosPorRever ?? vivo(r.porEstado.draft)} rotulo="Rascunhos por rever" tom="ouro" onClick={() => irPara("fila")} />
        <Numero valor={vivo(r.porEstado.approved)} rotulo="Aprovados na fila" onClick={() => irPara("fila")} />
        <Numero valor={vivo(r.porEstado.failed) + r.semImagem} rotulo="Falhados ou sem imagem" tom="alerta" onClick={() => irPara("fila")} />
        <Numero valor={r.novos24h} rotulo="Leads novos · 24 h" onClick={() => irPara("leads")} />
        <Numero valor={r.conversoes24h} rotulo="Conversões · 24 h" onClick={() => irPara("funil")} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {GRUPOS_SOCIAL.filter((g) => g.id !== "inicio" && (!g.soDono || dono)).map((g) => {
          const Icone = ICONE[g.id as keyof typeof ICONE]
          return (
            <section key={g.id} className="flex flex-col rounded-2xl border border-white/[0.07] bg-zinc-900/50 p-4">
              <header className="mb-3 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D2A63C]/10 text-[#E9C46A]">
                  <Icone className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">{g.nome}</h3>
                  <p className="text-xs text-zinc-500">{g.resumo}</p>
                </div>
              </header>
              <ul className="mb-4 space-y-1 text-[13px] text-zinc-300">
                {destaque[g.id].filter(Boolean).map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-[#D2A63C]/70" />
                    {t}
                  </li>
                ))}
              </ul>
              {g.id === "converter" && r.degraus.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  {r.degraus.slice(0, 5).map((d) => (
                    <div key={d.degrau} className="flex items-center gap-2 text-[11.5px]">
                      <span className="w-28 flex-none truncate text-zinc-400">{d.degrau}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <span className="block h-full rounded-full bg-[#D2A63C]/70" style={{ width: `${Math.max(2, (d.total / teto) * 100)}%` }} />
                      </span>
                      <span className="w-10 text-right tabular-nums text-zinc-300">{d.total}</span>
                    </div>
                  ))}
                </div>
              )}
              {g.id === "publicar" && r.proximos.length > 0 && (
                <ul className="mb-4 space-y-1">
                  {r.proximos.slice(0, 3).map((p, i) => (
                    <li key={i} className="flex items-center gap-2 text-[11.5px] text-zinc-400">
                      <CalendarClock className="h-3 w-3 text-zinc-500" />
                      {new Date(p.quando).toLocaleString("pt-PT", { weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      <span className="text-zinc-300">@{p.conta ?? "—"}</span>
                      <span>· {p.pilar ?? "—"}</span>
                      {!p.temImagem && <span className="text-red-300">sem imagem</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto flex flex-wrap gap-1.5">
                {g.secoes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => irPara(s.id)}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-[#D2A63C]/40 hover:text-[#E9C46A] active:scale-[0.98]"
                  >
                    {s.nome}
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/50 p-4">
        <header className="mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#E9C46A]" />
          <h3 className="text-sm font-semibold text-zinc-100">Agentes que trabalham aqui</h3>
        </header>
        <AutoPublicarAgentes />
        <RegistoOperador />
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Ligado ao back-office</h3>
          <p className="text-xs text-zinc-500">Quem vê cada módulo decide-se em Gestão → Acessos.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LIGACOES_BACKOFFICE.filter((l) => !("soDono" in l && l.soDono) || dono).map((l) => (
            <Link
              key={l.slug}
              href={hrefBackoffice(l.slug)}
              className="group flex items-start justify-between gap-3 rounded-xl border border-white/[0.07] bg-zinc-900/30 p-3 transition hover:border-[#D2A63C]/40"
            >
              <span>
                <span className="block text-sm font-medium text-zinc-100">{l.nome}</span>
                <span className="block text-xs text-zinc-500">{l.nota}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 flex-none text-zinc-500 transition group-hover:text-[#E9C46A]" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

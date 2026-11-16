"use client"

import { useState } from "react"
import { ArrowRight, Check, Loader2, Printer, Sparkles } from "lucide-react"
import { EQUIPAS, type RelatorioAnalise } from "@/lib/site-solucoes/analise"

/**
 * «Pedir análise ao meu negócio»: a pessoa conta o negócio, junta as horas do simulador e recebe
 * logo uma análise preliminar (calculada + leitura da IA). A análise completa segue por nós.
 */

const fmt = (n: number, casas = 0) => n.toLocaleString("pt-PT", { maximumFractionDigits: casas, minimumFractionDigits: casas })

const campo =
  "mt-1.5 w-full rounded-xl border border-white/15 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D2A63C] focus:outline-none"

export function PedirAnalise({
  sector,
  horas,
  custoHora,
  agendar,
  onFechar,
}: {
  sector: string
  horas: Record<string, number>
  custoHora: number
  agendar: string
  onFechar: () => void
}) {
  const [f, setF] = useState({ nome: "", email: "", telefone: "", empresa: "", site: "", equipa: "", dores: "", website: "" })
  const [consentimento, setConsentimento] = useState(false)
  const [estado, setEstado] = useState<"form" | "a_enviar" | "feito">("form")
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState("")
  const [rel, setRel] = useState<RelatorioAnalise | null>(null)

  const muda = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }))

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEstado("a_enviar")
    setErros({})
    setErroGeral("")
    try {
      const res = await fetch("/api/solucoes/analise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, sector, horas, custoHora, consentimento }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.ok) {
        setRel(j.relatorio ?? null)
        setEstado("feito")
        return
      }
      if (j.erros) setErros(j.erros)
      setErroGeral(j.erro ?? (j.erros ? "Falta preencher alguns campos." : "Não foi possível enviar. Tenta outra vez."))
    } catch {
      setErroGeral("Sem ligação. Tenta outra vez.")
    }
    setEstado("form")
  }

  if (estado === "feito") {
    if (!rel) {
      return (
        <div className="rounded-3xl border border-[#D2A63C]/40 p-6 text-sm text-zinc-300">
          Pedido recebido. Respondemos por email.
        </div>
      )
    }
    return <Relatorio rel={rel} agendar={agendar} />
  }

  const Erro = ({ k }: { k: string }) => (erros[k] ? <p className="mt-1 text-xs text-red-300">{erros[k]}</p> : null)

  return (
    <form onSubmit={enviar} noValidate className="rounded-3xl border border-[#D2A63C]/40 bg-gradient-to-b from-[#D2A63C]/10 to-transparent p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#E9C46A]">Análise ao teu negócio</p>
          <h3 className="mt-1 text-2xl font-bold">Conta-nos o teu negócio e vê já onde a IA te devolve horas.</h3>
          <p className="mt-2 max-w-[60ch] text-sm text-zinc-400">
            Juntamos as horas que puseste no simulador. Recebes agora uma análise preliminar e, depois de olharmos para o teu caso, a análise completa por email.
          </p>
        </div>
        <button type="button" onClick={onFechar} className="text-sm text-zinc-500 hover:text-zinc-300">
          Fechar
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          O teu nome
          <input className={campo} value={f.nome} onChange={muda("nome")} autoComplete="name" />
          <Erro k="nome" />
        </label>
        <label className="text-sm">
          Email
          <input className={campo} type="email" value={f.email} onChange={muda("email")} autoComplete="email" />
          <Erro k="email" />
        </label>
        <label className="text-sm">
          Nome do negócio
          <input className={campo} value={f.empresa} onChange={muda("empresa")} autoComplete="organization" />
          <Erro k="empresa" />
        </label>
        <label className="text-sm">
          Tamanho da equipa
          <select className={campo} value={f.equipa} onChange={muda("equipa")}>
            <option value="">Escolhe</option>
            {EQUIPAS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <Erro k="equipa" />
        </label>
        <label className="text-sm">
          Site ou Instagram <span className="text-zinc-500">(opcional)</span>
          <input className={campo} value={f.site} onChange={muda("site")} placeholder="ex.: @onegocio ou onegocio.pt" />
        </label>
        <label className="text-sm">
          Telemóvel <span className="text-zinc-500">(opcional)</span>
          <input className={campo} type="tel" value={f.telefone} onChange={muda("telefone")} autoComplete="tel" />
        </label>
        <label className="text-sm md:col-span-2">
          O que mais te rouba tempo no dia a dia?
          <textarea
            className={`${campo} min-h-[110px] resize-y`}
            value={f.dores}
            onChange={muda("dores")}
            placeholder="ex.: passo as tardes a responder a mensagens, a confirmar marcações e a fazer orçamentos à mão"
          />
          <Erro k="dores" />
        </label>
        {/* Honeypot: invisível para pessoas */}
        <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={muda("website")} />
      </div>

      <label className="mt-5 flex gap-3 text-sm text-zinc-300">
        <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} className="mt-1 h-4 w-4 accent-[#D2A63C]" />
        <span>
          Autorizo a MoreThanMoney a usar estes dados para preparar a análise e a contactar-me sobre ela. Podes pedir para apagarmos tudo quando quiseres.
        </span>
      </label>
      <Erro k="consentimento" />

      {erroGeral && <p className="mt-4 text-sm text-red-300">{erroGeral}</p>}

      <button
        type="submit"
        disabled={estado === "a_enviar"}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#D2A63C] px-6 py-3 font-semibold text-[#08090C] transition hover:bg-[#E9C46A] active:scale-[0.98] disabled:opacity-70"
      >
        {estado === "a_enviar" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> A analisar o teu negócio
          </>
        ) : (
          <>
            Pedir análise <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  )
}

function Relatorio({ rel, agendar }: { rel: RelatorioAnalise; agendar: string }) {
  const temHoras = rel.oportunidades.length > 0
  return (
    <article className="analise-relatorio overflow-hidden rounded-3xl border border-[#D2A63C]/40 bg-[#0E1015] animate-in fade-in slide-in-from-bottom-2 duration-500">
      <style>{`@media print{body *{visibility:hidden}.analise-relatorio,.analise-relatorio *{visibility:visible}.analise-relatorio{position:absolute;left:0;top:0;width:100%}}`}</style>
      <header className="border-b border-white/10 bg-gradient-to-r from-[#D2A63C]/15 to-transparent p-6 md:p-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#E9C46A]">Análise preliminar</p>
        <h3 className="mt-1 text-2xl font-bold md:text-3xl">{rel.empresa}</h3>
        <p className="mt-1 text-sm text-zinc-400">{rel.sector}</p>
        <p className="mt-4 max-w-[70ch] text-zinc-300">{rel.resumo}</p>
      </header>

      <div className="grid gap-8 p-6 md:p-8">
        {temHoras && (
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { k: "Horas por semana em tarefas repetidas", v: fmt(rel.totais.horasSemana, 1) },
              { k: "Horas que a IA te devolve por semana", v: fmt(rel.totais.recuperaveisSemana, 1) },
              { k: "Horas por ano", v: fmt(rel.totais.recuperaveisAno) },
              { k: "Valor do tempo por ano", v: `${fmt(rel.totais.eurosAno)} €` },
            ].map((x) => (
              <div key={x.k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{x.k}</dt>
                <dd className="mt-1 text-2xl font-black tabular-nums text-[#E9C46A]">{x.v}</dd>
              </div>
            ))}
          </dl>
        )}

        {(rel.leitura || rel.ideias.length > 0) && (
          <section>
            <h4 className="flex items-center gap-2 text-lg font-bold">
              <Sparkles className="h-4 w-4 text-[#E9C46A]" /> O que vemos no teu negócio
            </h4>
            {rel.leitura && <p className="mt-2 max-w-[70ch] text-zinc-300">{rel.leitura}</p>}
            {rel.ideias.length > 0 && (
              <ul className="mt-4 grid gap-2 md:grid-cols-2">
                {rel.ideias.map((i) => (
                  <li key={i} className="flex gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" /> {i}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-zinc-600">Leitura escrita com IA a partir do que nos contaste. Revemos tudo antes da análise completa.</p>
          </section>
        )}

        {temHoras && (
          <section>
            <h4 className="text-lg font-bold">Por onde começávamos</h4>
            <ol className="mt-4 grid gap-4 md:grid-cols-3">
              {rel.oportunidades.map((o, i) => (
                <li key={o.area} className="rounded-2xl border border-white/10 p-5">
                  <p className="text-xs font-semibold text-[#E9C46A]">
                    {i + 1}. {o.area} · {fmt(o.horasAno)} h/ano
                  </p>
                  <p className="mt-2 font-semibold">{o.implementamos}</p>
                  <ul className="mt-3 space-y-1.5 text-sm text-zinc-400">
                    {o.exemplos.map((x) => (
                      <li key={x} className="flex gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D2A63C]" /> {x}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-zinc-500">
                    Resolve-se com: <span className="text-zinc-300">{o.oferta}</span>
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h4 className="text-lg font-bold">Os primeiros 30 dias</h4>
            <ul className="mt-3 space-y-2 text-sm text-zinc-300">
              {rel.primeiros30Dias.map((x) => (
                <li key={x} className="flex gap-2">
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" /> {x}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4 className="text-lg font-bold">O que te vamos perguntar</h4>
            <ul className="mt-3 space-y-2 text-sm text-zinc-300">
              {rel.perguntas.map((x) => (
                <li key={x} className="flex gap-2">
                  <span className="text-[#D2A63C]">?</span> {x}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="text-xs leading-relaxed text-zinc-500">{rel.pressupostos}</p>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-6 print:hidden">
          <a
            href={agendar}
            className="inline-flex items-center gap-2 rounded-full bg-[#D2A63C] px-6 py-3 font-semibold text-[#08090C] transition hover:bg-[#E9C46A] active:scale-[0.98]"
          >
            Marcar a conversa da análise completa <ArrowRight className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200 hover:border-[#D2A63C]/50"
          >
            <Printer className="h-4 w-4" /> Guardar em PDF
          </button>
          <p className="text-sm text-zinc-500">Recebemos o teu pedido. A análise completa segue por email depois de olharmos para o teu caso.</p>
        </div>
      </div>
    </article>
  )
}

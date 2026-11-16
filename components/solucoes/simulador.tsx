"use client"

import { useEffect, useMemo, useState } from "react"
import { Bell, CalendarCheck, Check, FileText, MessageCircle, Package, Sparkles, Users } from "lucide-react"
import {
  PRESSUPOSTOS,
  SECTORES,
  TAREFAS,
  simular,
  type AreaId,
  type Sector,
} from "@/lib/site-solucoes/automacao"

/**
 * O simulador do /solucoes: escolhes o teu negócio, ajustas as horas e vês, num ecrã desenhado,
 * as automações que implementávamos, com as horas que te devolvem. Tudo no browser, nada é guardado.
 */

const fmt = (n: number, casas = 0) => n.toLocaleString("pt-PT", { maximumFractionDigits: casas, minimumFractionDigits: casas })

function horasIniciais(s: Sector): Record<string, number> {
  const h: Record<string, number> = {}
  for (const id of Object.keys(TAREFAS)) h[id] = s.horas[id as keyof typeof TAREFAS] ?? 0
  return h
}

export function SimuladorSolucoes({ agendar }: { agendar: string }) {
  const [sectorId, setSectorId] = useState(SECTORES[0].id)
  const sector = SECTORES.find((s) => s.id === sectorId) ?? SECTORES[0]
  const [horas, setHoras] = useState<Record<string, number>>(() => horasIniciais(SECTORES[0]))
  const [custo, setCusto] = useState(PRESSUPOSTOS.custoHoraOmissao)
  const [verTodas, setVerTodas] = useState(false)
  const [ecra, setEcra] = useState(0)
  const [tocou, setTocou] = useState(false)

  const r = useMemo(() => simular(horas, custo), [horas, custo])
  const areas = r.prioridades.slice(0, 4)
  const ativa = areas[Math.min(ecra, Math.max(areas.length - 1, 0))]

  function escolher(s: Sector) {
    setSectorId(s.id)
    setHoras(horasIniciais(s))
    setEcra(0)
  }

  // O ecrã vai mostrando as implementações sozinho até a pessoa tocar num separador.
  useEffect(() => {
    if (tocou || areas.length < 2) return
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const t = setInterval(() => setEcra((e) => (e + 1) % areas.length), 4500)
    return () => clearInterval(t)
  }, [tocou, areas.length])

  const tarefasVisiveis = Object.values(TAREFAS).filter((t) => verTodas || (sector.horas[t.id as keyof typeof TAREFAS] ?? 0) > 0)

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr]">
      {/* Lado esquerdo: o negócio e as horas */}
      <div className="min-w-0">
        <p className="text-sm font-semibold uppercase tracking-wider text-zinc-500">1 · O teu negócio</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SECTORES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => escolher(s)}
              className={[
                "rounded-full border px-3.5 py-1.5 text-sm transition active:scale-[0.97]",
                s.id === sectorId ? "border-[#D2A63C] bg-[#D2A63C] font-semibold text-[#08090C]" : "border-white/12 text-zinc-300 hover:border-[#D2A63C]/50",
              ].join(" ")}
            >
              {s.nome}
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">{sector.retrato}</p>

        <p className="mt-8 text-sm font-semibold uppercase tracking-wider text-zinc-500">2 · Horas por semana em cada tarefa</p>
        <div className="mt-3 space-y-3">
          {tarefasVisiveis.map((t) => {
            const v = horas[t.id] ?? 0
            return (
              <label key={t.id} className="block">
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-zinc-300">{t.nome}</span>
                  <span className="shrink-0 tabular-nums text-[#E9C46A]">{fmt(v)} h</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={v}
                  onChange={(e) => setHoras((h) => ({ ...h, [t.id]: Number(e.target.value) }))}
                  className="mt-1 w-full accent-[#D2A63C]"
                  aria-label={`${t.nome}, horas por semana`}
                />
              </label>
            )
          })}
        </div>
        <button type="button" onClick={() => setVerTodas((x) => !x)} className="mt-3 text-sm text-[#E9C46A] underline-offset-4 hover:underline">
          {verTodas ? "Mostrar só as do meu sector" : "Juntar outras tarefas"}
        </button>

        <label className="mt-6 flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-300">Quanto custa uma hora da tua equipa</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              value={custo}
              onChange={(e) => setCusto(Number(e.target.value))}
              className="w-20 rounded-lg border border-white/12 bg-black/40 px-2 py-1 text-right tabular-nums"
            />
            <span className="text-zinc-500">€</span>
          </span>
        </label>
      </div>

      {/* Lado direito: o ecrã com as implementações e o resultado */}
      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0E1015] shadow-[0_30px_80px_-30px_rgba(210,166,60,0.35)]">
          <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="ml-3 truncate text-xs text-zinc-500">{sector.nome} · com a MoreThanMoney</span>
          </div>
          {areas.length > 0 ? (
            <>
              <div className="flex gap-1 overflow-x-auto border-b border-white/5 px-3 py-2" role="tablist">
                {areas.map((p, i) => (
                  <button
                    key={p.area.id}
                    type="button"
                    role="tab"
                    aria-selected={p.area.id === ativa?.area.id}
                    onClick={() => {
                      setEcra(i)
                      setTocou(true)
                    }}
                    className={[
                      "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                      p.area.id === ativa?.area.id ? "bg-[#D2A63C]/15 text-[#E9C46A]" : "text-zinc-500 hover:text-zinc-300",
                    ].join(" ")}
                  >
                    {p.area.titulo}
                  </button>
                ))}
              </div>
              <div key={`${sector.id}-${ativa?.area.id}`} className="min-h-[300px] p-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {ativa && <EcraArea area={ativa.area.id} sector={sector} />}
              </div>
              {ativa && (
                <div className="border-t border-white/5 px-5 py-4 text-sm">
                  <p className="text-zinc-300">{ativa.area.implementamos}</p>
                  <p className="mt-1 text-zinc-500">
                    Devolve-te cerca de <span className="font-semibold text-[#E9C46A]">{fmt(ativa.horasAno)} h por ano</span> · {ativa.area.oferta}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="p-8 text-sm text-zinc-500">Mexe nas horas à esquerda para ver as automações.</p>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Horas por semana", v: fmt(r.recuperaveisSemana, 1) },
            { k: "Horas por ano", v: fmt(r.recuperaveisAno) },
            { k: "Valor por ano", v: `${fmt(r.eurosAno)} €` },
            { k: "Pessoas a tempo inteiro", v: fmt(r.pessoas, 1) },
          ].map((x) => (
            <div key={x.k} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{x.k}</dt>
              <dd className="mt-1 text-xl font-black tabular-nums text-[#E9C46A]">{x.v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          Estimativa de tempo que deixa de ser teu, não é lucro nem poupança garantida. Usa {PRESSUPOSTOS.semanasPorAno} semanas de trabalho por ano,{" "}
          {fmt(PRESSUPOSTOS.horasPorPessoaAno)} h por pessoa e uma parte automatizável conservadora por tarefa (entre 40 e 80%). O diagnóstico usa as tuas tarefas reais.
        </p>

        <div className="mt-5 rounded-2xl border border-[#D2A63C]/30 p-5">
          <p className="text-sm font-semibold">O que fazíamos primeiro</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            {sector.plano.map((p) => (
              <li key={p} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" /> {p}
              </li>
            ))}
          </ul>
          <a
            href={agendar}
            className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[#D2A63C] px-5 py-3 font-semibold text-[#08090C] transition hover:bg-[#E9C46A] active:scale-[0.98]"
          >
            Quero este plano para o meu negócio
          </a>
        </div>
      </div>
    </div>
  )
}

/* ---------- Os ecrãs desenhados de cada implementação ---------- */

function Linha({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm ${className}`}>{children}</div>
}

function Etiqueta({ cor, children }: { cor: "ouro" | "verde" | "cinza" | "vermelho"; children: React.ReactNode }) {
  const c = {
    ouro: "bg-[#D2A63C]/15 text-[#E9C46A]",
    verde: "bg-emerald-500/15 text-emerald-300",
    cinza: "bg-white/10 text-zinc-400",
    vermelho: "bg-rose-500/15 text-rose-300",
  }[cor]
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>
}

function Agente({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[85%] gap-2">
      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D2A63C] text-[#08090C]">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <p className="rounded-2xl rounded-tl-sm bg-[#D2A63C]/12 px-3.5 py-2.5 text-sm text-zinc-100">{children}</p>
    </div>
  )
}

function Cliente({ nome, children }: { nome: string; children: React.ReactNode }) {
  return (
    <div className="ml-auto max-w-[80%] text-right">
      <p className="text-[11px] text-zinc-500">{nome}</p>
      <p className="mt-0.5 inline-block rounded-2xl rounded-tr-sm bg-white/[0.07] px-3.5 py-2.5 text-left text-sm">{children}</p>
    </div>
  )
}

function EcraArea({ area, sector }: { area: AreaId; sector: Sector }) {
  const e = sector.ecra
  switch (area) {
    case "atendimento":
      return (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp · 23:14
          </p>
          <Cliente nome={e.cliente}>{e.pergunta}</Cliente>
          <Agente>{e.resposta}</Agente>
          <Linha className="mt-4">
            <span className="text-zinc-400">Só chega a ti o que precisa de ti</span>
            <Etiqueta cor="verde">Resolvido pelo agente</Etiqueta>
          </Linha>
        </div>
      )
    case "agenda": {
      const dias = ["Seg", "Ter", "Qua", "Qui", "Sex"]
      const cheios = new Set(["0-1", "1-0", "1-2", "2-1", "3-0", "3-2", "4-1"])
      return (
        <div>
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <CalendarCheck className="h-3.5 w-3.5" /> Agenda da semana
          </p>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {dias.map((d, i) => (
              <div key={d} className="space-y-1.5">
                <p className="text-center text-[11px] text-zinc-500">{d}</p>
                {[0, 1, 2].map((h) => (
                  <div
                    key={h}
                    className={`h-9 rounded-md ${cheios.has(`${i}-${h}`) ? "bg-[#D2A63C]/70" : i === 2 && h === 2 ? "border border-dashed border-[#D2A63C]/60" : "bg-white/[0.05]"}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-3 text-sm shadow-lg">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[#E9C46A]" />
            <p>
              <span className="font-semibold">Lembrete enviado a {e.cliente}</span>
              <span className="block text-zinc-400">{e.servico} amanhã. Responde 1 para confirmar ou 2 para remarcar.</span>
            </p>
          </div>
          <p className="mt-2 text-xs text-zinc-500">A vaga tracejada foi libertada e oferecida à lista de espera.</p>
        </div>
      )
    }
    case "vendas": {
      const col = [
        { t: "Novo", c: [e.cliente, "Contacto do site"] },
        { t: "Qualificado", c: ["Pedido de orçamento"] },
        { t: "Proposta", c: [`${e.servico}`] },
      ]
      return (
        <div>
          <div className="grid grid-cols-3 gap-2">
            {col.map((k) => (
              <div key={k.t} className="rounded-xl bg-white/[0.03] p-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{k.t}</p>
                <div className="mt-2 space-y-1.5">
                  {k.c.map((x) => (
                    <div key={x} className="rounded-lg bg-white/[0.06] px-2 py-2 text-xs">{x}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <Linha>
              <span className="text-zinc-300">Seguimento automático 2 dias depois</span>
              <Etiqueta cor="ouro">Enviado</Etiqueta>
            </Linha>
            <Linha>
              <span className="flex items-center gap-2 text-zinc-300">
                <FileText className="h-4 w-4 text-[#E9C46A]" /> Proposta em PDF a partir do formulário
              </span>
              <Etiqueta cor="verde">Pronta</Etiqueta>
            </Linha>
          </div>
        </div>
      )
    }
    case "financas":
      return (
        <div className="space-y-2">
          <Linha>
            <span>Fatura FT 2026/118</span>
            <Etiqueta cor="verde">Paga</Etiqueta>
          </Linha>
          <Linha>
            <span>Fatura FT 2026/121</span>
            <Etiqueta cor="ouro">Lembrete enviado</Etiqueta>
          </Linha>
          <Linha>
            <span>Fatura FT 2026/109</span>
            <Etiqueta cor="vermelho">2.º aviso amanhã</Etiqueta>
          </Linha>
          <div className="mt-4 rounded-xl border border-[#D2A63C]/30 p-3 text-sm">
            <p className="font-semibold">Pasta de novembro pronta</p>
            <p className="text-zinc-400">Faturas do email e fotos de recibos arrumadas para a contabilidade.</p>
          </div>
        </div>
      )
    case "dados":
      return (
        <div>
          <p className="text-xs text-zinc-500">Relatório da semana · chega à segunda às 8:00</p>
          <div className="mt-4 flex h-32 items-end gap-2">
            {[38, 52, 45, 70, 62, 84, 76].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-[#D2A63C]/30 to-[#E9C46A]" style={{ height: `${h}%` }} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-zinc-600">Gráfico ilustrativo</p>
          <div className="mt-3 space-y-2">
            <Linha>
              <span className="text-zinc-300">Formulários a entrar direto na base de dados</span>
              <Etiqueta cor="verde">Ligado</Etiqueta>
            </Linha>
            <Linha>
              <span className="text-zinc-300">Documentos lidos com IA</span>
              <Etiqueta cor="verde">Ligado</Etiqueta>
            </Linha>
          </div>
        </div>
      )
    case "marketing":
      return (
        <div className="space-y-2">
          {["Terça · dica da semana", "Quinta · bastidores", "Sábado · caso de cliente"].map((p, i) => (
            <Linha key={p}>
              <span className="text-zinc-300">{p}</span>
              <Etiqueta cor={i === 0 ? "verde" : "cinza"}>{i === 0 ? "Publicado" : "Agendado"}</Etiqueta>
            </Linha>
          ))}
          <div className="mt-4">
            <Agente>
              Olá {e.cliente}, obrigado pela visita! Se gostaste, deixas-nos uma avaliação? Leva 20 segundos.
            </Agente>
          </div>
        </div>
      )
    case "operacoes":
      return (
        <div className="space-y-2">
          <div className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-500/5 p-3 text-sm">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
            <p>
              <span className="font-semibold">Stock baixo em 2 artigos</span>
              <span className="block text-zinc-400">Encomenda ao fornecedor preparada. Falta só o teu OK.</span>
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-3 text-sm">
            <p className="font-semibold">Relatório de serviço · {e.servico}</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-square rounded-md bg-gradient-to-br from-white/10 to-white/[0.02]" />
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">Fotos, notas e assinatura do cliente, feito no telemóvel.</p>
          </div>
        </div>
      )
    case "equipa":
      return (
        <div>
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <Users className="h-3.5 w-3.5" /> Escala da semana
          </p>
          <div className="mt-3 space-y-1.5 text-sm">
            {[
              ["Ana", "Manhã", "Manhã", "Folga"],
              ["Bruno", "Tarde", "Folga", "Manhã"],
              ["Carla", "Folga", "Tarde", "Tarde"],
            ].map(([n, ...t]) => (
              <div key={n} className="grid grid-cols-4 gap-1.5">
                <span className="py-1.5 text-zinc-400">{n}</span>
                {t.map((x, i) => (
                  <span key={i} className={`rounded-md py-1.5 text-center text-xs ${x === "Folga" ? "bg-white/[0.04] text-zinc-500" : "bg-[#D2A63C]/20 text-[#E9C46A]"}`}>
                    {x}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <Linha className="mt-4">
            <span className="text-zinc-300">Bruno pediu troca de quarta</span>
            <Etiqueta cor="ouro">Aprovar</Etiqueta>
          </Linha>
        </div>
      )
    case "conhecimento":
      return (
        <div className="space-y-3">
          <Cliente nome={e.cliente}>{e.pergunta}</Cliente>
          <Agente>{e.resposta}</Agente>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            {["Módulo 1", "Módulo 2", "Módulo 3"].map((m, i) => (
              <div key={m} className="rounded-lg bg-white/[0.05] p-2">
                <p className="font-semibold">{m}</p>
                <p className="text-zinc-500">{i < 2 ? "Narrado" : "A gravar"}</p>
              </div>
            ))}
          </div>
        </div>
      )
  }
}


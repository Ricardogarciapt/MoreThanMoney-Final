"use client"

/**
 * A EQUIPA DE AGENTES.
 *
 * Um CEO e os sub-agentes dele, por pilar, com o que cada um gastou, o que trouxe, e o MOTIVO
 * ESCRITO do juízo que a regra das 48 horas lhe fez.
 *
 * ═══ O MOTIVO ESCRITO NÃO É DECORAÇÃO ══════════════════════════════════════════════════════
 *
 * É a peça central deste ecrã. Um agente que aparece «parado» com um número ao lado não se
 * consegue defender nem recuperar — e a casa já decidiu que a medição de receita vai errar alguma
 * vez. Quando errar, o que permite dar a volta é ler a frase e perceber que o cupão nunca foi
 * usado. Por isso a frase vem do servidor, calculada pela MESMA função que o cron usa, e nunca se
 * reconstrói aqui.
 *
 * ═══ A RECEITA POR ATRIBUIR APARECE SEMPRE ═════════════════════════════════════════════════
 *
 * Mesmo quando é zero. É a diferença entre «estes agentes não venderam» e «não se conseguiu ligar
 * esta receita a ninguém» — duas coisas que, somadas num único número, levariam o dono a parar
 * exactamente o agente que estava a vender sem código.
 */

import { useCallback, useEffect, useState } from "react"
import { linkDoAgente } from "@/lib/agentes/atribuicao"
import {
  AlertTriangle, Ban, Bot, Loader2, Pause, Play, RefreshCw, TrendingDown, TrendingUp,
} from "lucide-react"

type Juizo = { decisao: "continua" | "avisa" | "para" | "espera"; porque: string }

type Agente = {
  id: string
  nome: string
  papel: string | null
  pilar: "ceo" | "trading" | "educacao" | "desenvolvimento" | "vendas"
  pai_id: string | null
  estado: "vivo" | "em_risco" | "parado" | "pausado" | "reformado"
  pausado: boolean
  instrucoes: string | null
  chave_receita: string | null
  orcamento: number
  gasto: number
  receita: number
  saldo: number
  receita_janela: number
  gasto_janela: number
  resultado: number
  criado_em: string | null
  avaliado_em: string | null
  parado_em: string | null
  parado_porque: string | null
  juizo: Juizo
  ilegivel: string[]
}

type PorAtribuir = { motivo: string; cents: number; vendas: number; porque: string }

type Dados = {
  ok: boolean
  janelaHoras: number
  agentes: Agente[]
  eventos: Array<{ agente_id: string; tipo: string; valor: number | null; detalhe: string | null; criado_em: string }>
  receita: {
    moeda: string
    liquidoCents: number
    atribuidoCents: number
    naoAtribuidoCents: number
    porAtribuir: PorAtribuir[]
  }
}

/**
 * PARA ONDE APONTAM OS LINKS DOS AGENTES.
 *
 * Curta de propósito: um menu com trinta destinos não se usa, e o que interessa é que cada agente
 * tenha à mão o caminho que a VENDA dele percorre. São as superfícies que já cobram hoje.
 */
const DESTINOS = [
  { caminho: "/marketplace", rotulo: "Marketplace" },
  { caminho: "/marketplace/bootcamp-morethanmoney", rotulo: "Bootcamp" },
  { caminho: "/upgrade", rotulo: "Planos" },
  { caminho: "/scanner-access", rotulo: "Scanners" },
  { caminho: "/mtmfunded", rotulo: "Funded" },
  { caminho: "/", rotulo: "Início" },
] as const

const PILARES: Array<{ id: Agente["pilar"]; rotulo: string }> = [
  { id: "ceo", rotulo: "CEO" },
  { id: "trading", rotulo: "Trading" },
  { id: "educacao", rotulo: "Educação" },
  { id: "desenvolvimento", rotulo: "Desenvolvimento" },
  { id: "vendas", rotulo: "Vendas" },
]

const eur = (cents: number) =>
  `${(Number(cents || 0) / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} €`
const num = (v: number) => Number(v || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2 })

/** As cores do estado. `reformado` é ouro porque é sucesso — não é a mesma coisa que `parado`. */
const TOM: Record<Agente["estado"], { borda: string; fundo: string; texto: string; rotulo: string }> = {
  vivo: { borda: "border-emerald-500/30", fundo: "bg-emerald-500/[0.03]", texto: "text-emerald-300", rotulo: "vivo" },
  em_risco: { borda: "border-amber-500/30", fundo: "bg-amber-500/[0.03]", texto: "text-amber-300", rotulo: "em risco" },
  parado: { borda: "border-zinc-800", fundo: "bg-zinc-950/30", texto: "text-zinc-400", rotulo: "parado" },
  pausado: { borda: "border-sky-500/30", fundo: "bg-sky-500/[0.03]", texto: "text-sky-300", rotulo: "pausado pelo dono" },
  reformado: { borda: "border-[#D2A63C]/40", fundo: "bg-[#D2A63C]/[0.05]", texto: "text-[#E9C46A]", rotulo: "reformado" },
}

export default function AgentesEquipa() {
  const [d, setD] = useState<Dados | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  // A origem real do browser: assim o link copiado no admin é o mesmo que o cliente vai abrir,
  // mesmo em pré-visualizações da Vercel.
  const origem = typeof window === "undefined" ? "https://www.morethanmoney.pt" : window.location.origin
  const [erro, setErro] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)

  const ler = useCallback(async () => {
    setErro(null)
    const r = await fetch("/api/admin/agentes", { cache: "no-store" })
      .then((x) => x.json())
      .catch(() => null)
    if (!r?.ok) {
      setErro(r?.erro ?? "Não foi possível ler a equipa.")
      return
    }
    setD(r)
  }, [])
  useEffect(() => { void ler() }, [ler])

  const agir = async (a: Agente, acao: "pausar" | "retomar" | "parar") => {
    /**
     * Parar pede confirmação escrita. Não é por ser irreversível — não é, e isso diz-se na própria
     * pergunta — é porque o motivo fica gravado na linha e é o que alguém vai ler daqui a um mês.
     */
    let porque = ""
    if (acao === "parar") {
      const resposta = window.prompt(
        `Parar «${a.nome}»?\n\nNão apaga nada: o agente deixa de trabalhar e volta com um clique em Retomar.\nEscreve o motivo (fica gravado na linha):`,
        "",
      )
      if (resposta == null) return
      porque = resposta
    }

    setOcupado(a.id)
    setErro(null)
    setNota(null)
    const r = await fetch("/api/admin/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, id: a.id, porque }),
    })
      .then((x) => x.json())
      .catch(() => null)
    setOcupado(null)
    if (!r?.ok) {
      setErro(r?.erro ?? "Não foi possível.")
      return
    }
    if (r.porque) setNota(r.porque)
    await ler()
  }

  if (!d && !erro) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
            <Bot className="h-4 w-4 text-[#D2A63C]" /> Equipa de agentes
          </h2>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            Cada agente mantém-se vivo enquanto se pagar a si próprio. Sem lucro em{" "}
            {d?.janelaHoras ?? 48} horas e sem orçamento, pára — e parar não apaga.
          </p>
        </div>
        <button
          onClick={() => void ler()}
          className="flex items-center gap-1.5 rounded-md border border-white/12 px-2.5 py-1.5 text-[12px] text-zinc-300 hover:border-[#D2A63C]/50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      {erro && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-200">
          {erro}
        </div>
      )}
      {nota && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-200">
          {nota}
        </div>
      )}

      {/* ── A RECEITA, E O QUE NÃO SE CONSEGUIU ATRIBUIR ───────────────────────────────────── */}
      {d && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[12.5px]">
            <span className="text-zinc-400">
              Vendas líquidas <span className="text-white">{eur(d.receita.liquidoCents)}</span>
            </span>
            <span className="text-zinc-400">
              Atribuído a agentes <span className="text-emerald-300">{eur(d.receita.atribuidoCents)}</span>
            </span>
            <span className="text-zinc-400">
              Por atribuir <span className="text-amber-300">{eur(d.receita.naoAtribuidoCents)}</span>
            </span>
          </div>
          {/*
            Os motivos aparecem sempre que há dinheiro por atribuir. É a regra do dono: o que não
            for medido aparece como «por atribuir», e não se reparte nem se adivinha.
          */}
          {d.receita.porAtribuir.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">
              {d.receita.porAtribuir.map((p) => (
                <li key={p.motivo} className="text-[11.5px] text-zinc-400">
                  <span className="font-mono text-amber-300/90">{eur(p.cents)}</span>{" "}
                  <span className="text-zinc-500">({p.vendas} venda{p.vendas === 1 ? "" : "s"})</span> — {p.porque}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-zinc-500">
            A receita atribui-se pela <code className="text-zinc-400">chave_receita</code> de cada agente, e ela só
            chega às compras por um link <code className="text-zinc-400">?ag=</code> — copia-os abaixo. Uma venda sem
            código fica «por atribuir» com o motivo escrito, e não se reparte por ninguém: um agente medido a
            adivinhar é pior do que um agente não medido.
          </p>
        </div>
      )}

      {/* ── A EQUIPA, POR PILAR ───────────────────────────────────────────────────────────── */}
      {PILARES.map((pilar) => {
        const lista = (d?.agentes ?? []).filter((a) => a.pilar === pilar.id)
        if (!lista.length) return null
        return (
          <div key={pilar.id} className="space-y-2">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{pilar.rotulo}</h3>
            {lista.map((a) => {
              const tom = TOM[a.estado]
              const bom = a.resultado > 0
              return (
                <div key={a.id} className={`rounded-xl border p-3.5 ${tom.borda} ${tom.fundo}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {a.nome}
                        <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10.5px] ${tom.borda} ${tom.texto}`}>
                          {tom.rotulo}
                        </span>
                        {a.ilegivel.length > 0 && (
                          <span className="ml-1.5 rounded border border-red-500/40 px-1.5 py-0.5 text-[10.5px] text-red-300">
                            linha com campos ilegíveis
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {a.papel ?? "—"}
                        {a.chave_receita ? (
                          <span className="font-mono text-zinc-600"> · código {a.chave_receita}</span>
                        ) : (
                          <span className="text-amber-400/80"> · sem chave de receita — não é medível</span>
                        )}
                      </p>

                      {/*
                        OS LINKS DELE. É por aqui que o código chega a uma compra: sem um link
                        destes em circulação, a receita medida é SEMPRE zero — e a regra de vida
                        pára o agente por falta de medição, não por falta de trabalho.
                      */}
                      {a.chave_receita && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {DESTINOS.map((dest) => {
                            const link = linkDoAgente(origem, dest.caminho, a.chave_receita!)
                            return (
                              <button
                                key={dest.caminho}
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(link)
                                  setCopiado(link)
                                  window.setTimeout(() => setCopiado((c) => (c === link ? null : c)), 1800)
                                }}
                                title={link}
                                className="rounded border border-zinc-700 px-2 py-1 text-[10.5px] text-zinc-400 transition-colors hover:border-[#D2A63C]/50 hover:text-[#E9C46A]"
                              >
                                {copiado === link ? "copiado ✓" : dest.rotulo}
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Os números por que ele vive: a JANELA, não o acumulado. */}
                      <p className="mt-1.5 font-mono text-xs text-zinc-400">
                        saldo <span className="text-zinc-200">{num(a.saldo)}</span>
                        <span className="text-zinc-600"> de {num(a.orcamento)}</span>
                        {"  ·  "}
                        {d?.janelaHoras ?? 48} h: receita <span className="text-zinc-200">{num(a.receita_janela)}</span>
                        {" / gasto "}
                        <span className="text-zinc-200">{num(a.gasto_janela)}</span>
                        {"  ·  "}
                        <span className={bom ? "text-emerald-400" : a.resultado < 0 ? "text-red-400" : "text-zinc-500"}>
                          {bom ? <TrendingUp className="mb-0.5 inline h-3 w-3" /> : <TrendingDown className="mb-0.5 inline h-3 w-3" />}{" "}
                          resultado {num(a.resultado)}
                        </span>
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-600">
                        acumulado: receita {num(a.receita)} / gasto {num(a.gasto)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {a.pausado ? (
                        <button
                          disabled={ocupado === a.id}
                          onClick={() => void agir(a, "retomar")}
                          className="flex items-center gap-1 rounded-md border border-emerald-700 px-2 py-1 text-[11px] text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
                        >
                          <Play className="h-3 w-3" /> {ocupado === a.id ? "…" : "Retomar"}
                        </button>
                      ) : (
                        <button
                          disabled={ocupado === a.id || a.estado === "parado"}
                          onClick={() => void agir(a, "pausar")}
                          className="flex items-center gap-1 rounded-md border border-white/12 px-2 py-1 text-[11px] text-zinc-300 hover:border-sky-500/50 disabled:opacity-40"
                        >
                          <Pause className="h-3 w-3" /> {ocupado === a.id ? "…" : "Pausar"}
                        </button>
                      )}
                      {a.estado === "parado" ? (
                        <button
                          disabled={ocupado === a.id}
                          onClick={() => void agir(a, "retomar")}
                          className="flex items-center gap-1 rounded-md border border-emerald-700 px-2 py-1 text-[11px] text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
                        >
                          <Play className="h-3 w-3" /> {ocupado === a.id ? "…" : "Voltar a pôr vivo"}
                        </button>
                      ) : (
                        <button
                          disabled={ocupado === a.id}
                          onClick={() => void agir(a, "parar")}
                          className="flex items-center gap-1 rounded-md border border-white/12 px-2 py-1 text-[11px] text-zinc-400 hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-40"
                        >
                          <Ban className="h-3 w-3" /> {ocupado === a.id ? "…" : "Parar"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/*
                    O MOTIVO ESCRITO DO JUÍZO. Vem do servidor, calculado pela mesma função que o
                    cron usa — nunca reconstruído aqui, para não haver duas versões da regra a
                    discordar no caso difícil.
                  */}
                  <p className={`mt-2.5 text-[12px] ${tom.texto}`}>
                    <AlertTriangle className="mb-0.5 mr-1 inline h-3.5 w-3.5" />
                    {a.juizo.porque}
                  </p>

                  {a.parado_porque && a.estado === "parado" && (
                    <p className="mt-1 text-[11.5px] text-zinc-500">
                      Parado em {new Date(a.parado_em ?? "").toLocaleString("pt-PT")} — {a.parado_porque}
                    </p>
                  )}

                  <button
                    onClick={() => setAberto(aberto === a.id ? null : a.id)}
                    className="mt-2 text-[11px] text-zinc-500 underline-offset-2 hover:text-[#D2A63C] hover:underline"
                  >
                    {aberto === a.id ? "Esconder instruções e historial" : "Instruções e historial"}
                  </button>

                  {aberto === a.id && (
                    <div className="mt-2 space-y-2 border-t border-white/[0.06] pt-2">
                      {a.instrucoes && (
                        <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-zinc-400">{a.instrucoes}</p>
                      )}
                      <ul className="space-y-0.5">
                        {(d?.eventos ?? [])
                          .filter((e) => e.agente_id === a.id)
                          .slice(0, 12)
                          .map((e, i) => (
                            <li key={i} className="font-mono text-[11px] text-zinc-500">
                              <span className="text-zinc-600">
                                {new Date(e.criado_em).toLocaleString("pt-PT")}
                              </span>{" "}
                              <span className="text-zinc-400">{e.tipo}</span>
                              {e.valor != null && <span className="text-zinc-400"> {num(Number(e.valor))}</span>}
                              {e.detalhe && <span className="text-zinc-600"> — {e.detalhe}</span>}
                            </li>
                          ))}
                        {!(d?.eventos ?? []).some((e) => e.agente_id === a.id) && (
                          <li className="text-[11px] text-zinc-600">Sem eventos recentes no livro.</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {d && d.agentes.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-black/30 px-3 py-6 text-center text-[12.5px] text-zinc-400">
          Ainda não há agentes. A migração 166 semeia o CEO e os seis sub-agentes.
        </div>
      )}
    </div>
  )
}

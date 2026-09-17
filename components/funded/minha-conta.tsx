"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { Award, Banknote, BarChart3, BookOpen, History, KeyRound, LayoutGrid, Loader2 } from "lucide-react"
import { barrasDaConta } from "@/lib/mtmfunded/numeros-conta"
import { authHeaders } from "@/lib/auth-token"
import FundedDesempenho from "./funded-desempenho"
import FundedDiario from "./funded-diario"
import ListaPosicoes from "./lista-posicoes"
import CredenciaisConta from "./credenciais-conta"
import { InterruptorUmClique } from "./um-clique"
import { EtiquetaConta, type Trader } from "./trader-contexto"
import { usd } from "./api"
const FundedEstatisticas = dynamic(() => import("./funded-estatisticas"), { ssr: false })

/**
 * A MINHA ÁREA · A MINHA CONTA MTM FUNDED — tudo o que é da conta seleccionada, num só painel.
 *
 * Telemóvel primeiro: no modo SIMPLE abre na folha «Conta» (tocar na equity) e em Mais → Conta; no
 * PRO é o separador «A minha conta» do painel de baixo. Secções em fichas que deslizam:
 *   Resumo · Métricas · Diário · Histórico · Credenciais · Levantamentos (só Funded, só o dono)
 *
 * Os números não se recalculam aqui: saldo/equity/margem são os do trader (preços ao vivo, a mesma
 * matemática do servidor), as barras das regras são `barrasDaConta` — as MESMAS do admin — e as
 * métricas vêm da rota de estatísticas partilhada com o admin (lib/mtmfunded/numeros-conta.ts).
 * Conta de análise ou sem programa: as regras dão lugar a «sem regras».
 * Valores em USD da própria conta simulada (só o dono ou quem tem a password a vê). Sem promessas.
 */

type Seccao = "resumo" | "metricas" | "diario" | "historico" | "credenciais" | "levantamentos"

export default function MinhaConta({ t }: { t: Trader }) {
  const [seccao, setSeccao] = useState<Seccao>("resumo")
  const [foco, setFoco] = useState<string | null>(null)
  const d = t.dados
  const c = d.conta
  const dono = d.modo === "master"
  const funded = c.etiqueta === "Funded"

  const seccoes: Array<[Seccao, string, typeof LayoutGrid]> = [
    ["resumo", "Resumo", LayoutGrid], ["metricas", "Métricas", BarChart3], ["diario", "Diário", BookOpen],
    ["historico", "Histórico", History], ["credenciais", "Credenciais", KeyRound],
    ...(funded && dono ? [["levantamentos", "Levantamentos", Banknote] as [Seccao, string, typeof LayoutGrid]] : []),
  ]

  return (
    <div className="space-y-2 p-2.5 text-[12px]">
      {/* Cabeçalho: tipo · estado · login · servidor · estratégia seguida */}
      <div className="rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5">
        <p className="text-[10.5px] uppercase tracking-wide text-zinc-500">A minha conta MTM Funded</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <EtiquetaConta t={t} />
          <span className="font-mono text-[13px] text-white">{String(c.login ?? "—")}</span>
          <span className="text-zinc-500">{String(c.servidor ?? "MTM Funded")} · 1:{c.alavancagem}</span>
          {c.segueEstrategia && <span className="rounded-full border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-2 py-0.5 text-[11px] text-[#D2A63C]">segue {c.segueEstrategia.nome}{c.segueEstrategia.ativa ? "" : " (em pausa)"}</span>}
          {/* Conta real da casa (109) = conta de AUDITORIA: sem regras como a de análise, mas negoceia a sério. */}
          {c.contaReal
            ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">auditoria · negociação real · sem regras</span>
            : c.analise && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300">conta de análise</span>}
          {c.aceitaT2T && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300">aceita Tap to Trade</span>}
          {!dono && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300">investor · só leitura</span>}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Numero rotulo="Saldo" valor={`${usd(d.estado.saldo)} $`} />
          <Numero rotulo="Equity" valor={`${usd(t.vivo.equity)} $`} cor={t.vivo.flutuante >= 0 ? "text-emerald-300" : "text-rose-300"} />
          <Numero rotulo="Flutuante" valor={`${usd(t.vivo.flutuante)} $`} cor={t.vivo.flutuante >= 0 ? "text-emerald-300" : "text-rose-300"} />
        </div>
      </div>

      <div role="tablist" aria-label="A minha conta" className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {seccoes.map(([s, nome, Icone]) => (
          <button key={s} role="tab" aria-selected={seccao === s} onClick={() => setSeccao(s)}
            className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] ${seccao === s ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-white/10 text-zinc-400"}`}>
            <Icone className="h-3.5 w-3.5" /> {nome}
          </button>
        ))}
      </div>

      {seccao === "resumo" && <Resumo t={t} />}
      {seccao === "metricas" && (
        <div className="space-y-2">
          <FundedEstatisticas accountId={t.accountId} equity={t.vivo.equity} semRegras
            regras={{ limites: t.vivo.limites, regras: d.regras, saldoInicial: c.saldoInicial, equity: t.vivo.equity, diasNegociados: c.diasNegociados }} />
          <div className="rounded-lg border border-white/10 bg-[#0d0d0d] p-3"><FundedDesempenho d={d.desempenho} estrategia={c.segueEstrategia?.nome} /></div>
        </div>
      )}
      {seccao === "diario" && <FundedDiario accountId={t.accountId} historico={d.historico} podeEscrever={dono} diario={t.diario} focoTrade={foco} onFoco={setFoco} />}
      {seccao === "historico" && (
        <div className="rounded-lg border border-white/10">
          <ListaPosicoes
            vista="historico" posicoes={d.posicoes} ordens={d.ordens} historico={d.historico} simbolos={t.fichas} precos={t.mapa}
            podeNegociar={false} denso={false} accountId={t.accountId} simboloAtual={t.simbolo?.symbol}
            executar={t.executar} onSelecionarSimbolo={(x) => void t.selecionarPorNome(x)}
            onNota={(id) => { setFoco(id); setSeccao("diario") }} notas={t.diario.comTrade}
          />
          <p className="px-2.5 py-1.5 text-[10.5px] text-zinc-500">As últimas 100 partes fechadas. As métricas contam a conta inteira.</p>
        </div>
      )}
      {seccao === "credenciais" && (
        <div className="rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5">
          <CredenciaisConta contaId={t.accountId} login={c.login == null ? null : String(c.login)} servidor={c.servidor == null ? null : String(c.servidor)} podeGerir={dono} />
        </div>
      )}
      {seccao === "levantamentos" && funded && dono && <Levantamentos t={t} />}
    </div>
  )
}

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-md bg-white/[0.03] px-2 py-1.5">
      <p className="text-[9.5px] uppercase tracking-wide text-zinc-500">{rotulo}</p>
      <p className={`truncate font-mono text-[12.5px] ${cor ?? "text-white"}`}>{valor}</p>
    </div>
  )
}

function Resumo({ t }: { t: Trader }) {
  const d = t.dados
  const c = d.conta
  const barras = c.analise || !d.regras ? [] : barrasDaConta({
    saldoInicial: c.saldoInicial, equity: t.vivo.equity, ancoraDia: c.ancoraDia, diasNegociados: c.diasNegociados,
    fase: c.fase, lucroPorDia: (c as { lucroPorDia?: Record<string, number> | null }).lucroPorDia ?? null, analise: c.analise,
  }, d.regras as Record<string, unknown>)
  const fases = Number((d.regras as Record<string, unknown> | null)?.fases ?? 0)
  const cartao = "rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5"

  return (
    <div className="grid gap-2 lg:grid-cols-2">
      <div className={`${cartao} space-y-2`}>
        <p className="text-[12.5px] font-semibold text-white">Regras</p>
        {barras.length ? barras.map((b) => {
          const v = Math.max(0, Math.min(100, b.pct ?? 0))
          const cor = b.perigo ? "#EF5350" : b.chave === "objetivo" ? "#D2A63C" : b.chave === "dias" ? "#8FA8FF" : "#26A69A"
          return (
            <div key={b.chave}>
              <div className="flex items-baseline justify-between gap-2 text-[11px]"><span className="text-zinc-400">{b.nome}</span><span className="font-mono text-white">{b.texto}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={b.nome} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full" style={{ width: `${b.pct == null ? 0 : v}%`, background: cor }} />
              </div>
            </div>
          )
        }) : (
          <p className="text-[11.5px] leading-snug text-zinc-400">
            {c.contaReal
              ? "Conta de auditoria: negociação real, sem regras de programa — acompanha o desempenho em Métricas."
              : c.analise ? "Conta de análise: as regras de programa não se aplicam — acompanha o desempenho em Métricas." : "Esta conta não tem regras de programa."}
          </p>
        )}
        <p className="text-[10.5px] text-zinc-500">Medido sobre a equity (as posições abertas contam). Os mesmos números que o suporte vê.</p>
      </div>

      <div className={`${cartao} space-y-1`}>
        <p className="text-[12.5px] font-semibold text-white">Conta ao vivo</p>
        {[...t.metricas, ["Dias negociados", String(c.diasNegociados)] as [string, string], ["Saldo inicial", `${c.saldoInicial.toLocaleString("pt-PT")} $`] as [string, string]].map(([k, v, cor]) => (
          <div key={k} className="flex justify-between gap-2 text-[11.5px]"><span className="text-zinc-500">{k}</span><span className={`font-mono ${cor ?? "text-white"}`}>{v}</span></div>
        ))}
      </div>

      {(c.etiqueta === "F1" || c.etiqueta === "F2" || c.etiqueta === "Torneio") && (
        <div className={`${cartao} flex items-start gap-2`}>
          <Award className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" />
          <div className="text-[11.5px] leading-snug text-zinc-300">
            {c.etiqueta === "Torneio" ? "Conta de torneio." : `Fase ${c.fase}${fases ? ` de ${fases}` : ""} do desafio.`}{" "}
            Ao concluir, o certificado aparece na tua área e chega por email.{" "}
            <a href="/mtmfunded/tradingtournament/dashboard" className="text-[#D2A63C]">Ver certificados →</a>
          </div>
        </div>
      )}

      {t.podeNegociar && <div className={cartao}><InterruptorUmClique variante="cartao" /></div>}
    </div>
  )
}

interface ContaLevantavel { id: string; levantavel: number; almofada: number; jaPago: number; equity: number; saldoInicial: number }
interface Pedido { id: string; account_id: string; valor_usd: number; estado: string; criado_em: string; motivo?: string | null }

/** Levantamentos (só Funded, só o dono): o que se pode pedir agora e porquê não, com os pedidos desta conta. */
function Levantamentos({ t }: { t: Trader }) {
  const [d, setD] = useState<{ contrato: unknown; contas: ContaLevantavel[]; pedidos: Pedido[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const r = await fetch("/api/mtmfunded/levantamentos", { cache: "no-store", credentials: "include", headers: await authHeaders() })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || `erro ${r.status}`)
        if (vivo) setD(j)
      } catch (e) { if (vivo) setErro((e as Error).message) }
    })()
    return () => { vivo = false }
  }, [t.accountId])

  if (erro) return <p className="p-3 text-[12px] text-rose-300">{erro}</p>
  if (!d) return <div className="grid place-items-center p-6"><Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /></div>
  const conta = d.contas.find((x) => x.id === t.accountId)
  const abertas = t.dados.posicoes.length
  const pendentes = t.dados.ordens.length
  const bloqueios = [
    !d.contrato ? "assina o contrato de trader financiado" : null,
    t.dados.conta.estado !== "ativa" ? `a conta está ${t.dados.conta.estadoCurto}` : null,
    abertas ? `fecha as ${abertas} posições abertas` : null,
    pendentes ? `cancela as ${pendentes} ordens pendentes` : null,
    conta && conta.levantavel <= 0 ? "o lucro ainda não passou a almofada de 3%" : null,
  ].filter(Boolean) as string[]
  const pedidos = d.pedidos.filter((p) => p.account_id === t.accountId)

  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5">
      <div className="grid grid-cols-3 gap-1.5">
        <Numero rotulo="Levantável agora" valor={conta ? `${usd(conta.levantavel)} $` : "—"} cor="text-emerald-300" />
        <Numero rotulo="Almofada (3%)" valor={conta ? `${usd(conta.almofada)} $` : "—"} />
        <Numero rotulo="Já pago" valor={conta ? `${usd(conta.jaPago)} $` : "—"} />
      </div>
      {bloqueios.length ? (
        <p className="rounded-md bg-amber-400/5 px-2 py-1.5 text-[11.5px] text-amber-200">Para pedir: {bloqueios.join(" · ")}.</p>
      ) : (
        <p className="text-[11.5px] text-emerald-300">Podes pedir um levantamento.</p>
      )}
      <a href="/mtmfunded/tradingtournament/dashboard#levantamentos" className="inline-block rounded-md bg-[#D2A63C] px-3 py-1.5 text-[12px] font-semibold text-black">Pedir levantamento</a>
      <p className="text-[10.5px] leading-snug text-zinc-500">Pago como depósito na tua conta PU Prime (USDC), acima da almofada de 3%, na tua quota de 75%. Sem posições abertas nem ordens pendentes.</p>
      {pedidos.length > 0 && (
        <div className="divide-y divide-white/5 rounded-md border border-white/10">
          {pedidos.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11.5px]">
              <span className="text-zinc-400">{new Date(p.criado_em).toLocaleDateString("pt-PT")}</span>
              <span className="font-mono text-white">{usd(Number(p.valor_usd))} $</span>
              <span className="text-zinc-300">{p.estado}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

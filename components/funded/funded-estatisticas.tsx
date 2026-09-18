"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { Estatisticas, Grupo } from "@/lib/mtmfunded/simulado/estatisticas"
import type { LimitesConta } from "@/lib/mtmfunded/simulado/ordens"
import { pedir, usd } from "./api"
import { TV } from "./grafico-tipos"

/**
 * ESTATÍSTICAS DA CONTA — curva de saldo/equity, drawdown, KPIs, progresso das regras e os
 * agrupamentos (símbolo, estratégia/estudo, origem, hora e dia da semana).
 *
 * As contas vêm do servidor (lib/mtmfunded/simulado/estatisticas.ts, pura e testada): uma trade
 * com parciais conta uma vez. Moeda: USD da conta simulada — nunca euros, nunca promessa.
 * Relê-se ao abrir o separador e a cada 60 s (não a cada preço: nada aqui muda ao tick).
 */

export interface RegrasResumo {
  limites: LimitesConta
  regras: Record<string, unknown> | null
  saldoInicial: number
  equity: number
  diasNegociados: number
}

const VERDE = "#26A69A"
const VERMELHO = "#EF5350"
const OURO = "#D2A63C"

/** `semRegras`: o painel «A minha conta» já mostra as barras das regras (as mesmas do admin) por cima. */
export default function FundedEstatisticas({ accountId, equity, regras, semRegras = false }: { accountId: string; equity: number | null; regras: RegrasResumo; semRegras?: boolean }) {
  const [e, setE] = useState<Estatisticas | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const [grupo, setGrupo] = useState<"porSimbolo" | "porEstrategia" | "porOrigem" | "porDirecao">("porSimbolo")

  // A equity mais recente (o intervalo de 60 s guardava a da primeira volta e pedia sempre essa).
  const equityRef = useRef(equity)
  equityRef.current = equity
  const carregar = async () => {
    const equity = equityRef.current
    setACarregar(true)
    try {
      const d = await pedir<Estatisticas>(`/api/mtmfunded/simulado/estatisticas?accountId=${accountId}${equity ? `&equity=${equity}` : ""}`, {}, accountId)
      setE(d); setErro(null)
    } catch (x) { setErro((x as Error).message) } finally { setACarregar(false) }
  }
  useEffect(() => {
    void carregar()
    const iv = setInterval(() => { if (document.visibilityState !== "hidden") void carregar() }, 60_000)
    return () => clearInterval(iv)
  }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps

  const curva = useMemo(() => (e?.curva ?? []).map((p) => ({ ...p, rotulo: new Date(p.t).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }) })), [e?.curva])

  if (!e) return (
    <div className="grid place-items-center p-8 text-[12px] text-zinc-500">
      {erro ? <p className="text-rose-300">{erro}</p> : <Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" />}
    </div>
  )

  const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`)
  const din = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${usd(v)} $`)
  const kpis: Array<[string, string, string?]> = [
    ["Trades", String(e.trades), undefined],
    ["Taxa de acerto", e.taxaAcertoPct == null ? "—" : `${pct(e.taxaAcertoPct)} (${e.ganhas}/${e.trades})`],
    ["Fator de lucro", e.fatorLucro == null ? (e.lucroBruto > 0 ? "∞" : "—") : e.fatorLucro.toFixed(2), e.fatorLucro != null && e.fatorLucro < 1 ? "text-rose-300" : undefined],
    ["Resultado líquido", din(e.resultadoLiquido), e.resultadoLiquido >= 0 ? "text-emerald-300" : "text-rose-300"],
    ["Ganho médio", din(e.mediaGanho), "text-emerald-300"],
    ["Perda média", din(e.mediaPerda), "text-rose-300"],
    ["Expectativa", din(e.expectativaUsd), (e.expectativaUsd ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"],
    ["Expectativa em R", e.expectativaR == null ? "—" : `${e.expectativaR > 0 ? "+" : ""}${e.expectativaR}R (${e.tradesComR} c/ SL)`],
    ["Melhor trade", e.melhorTrade ? `${din(e.melhorTrade.resultado)} ${e.melhorTrade.symbol}` : "—", "text-emerald-300"],
    ["Pior trade", e.piorTrade ? `${din(e.piorTrade.resultado)} ${e.piorTrade.symbol}` : "—", "text-rose-300"],
    ["Seguidas ganhas / perdidas", `${e.maxGanhasSeguidas} / ${e.maxPerdidasSeguidas}`],
    ["Trades por dia", e.tradesPorDia == null ? "—" : String(e.tradesPorDia)],
    ["Duração média", e.duracaoMediaMin == null ? "—" : e.duracaoMediaMin < 120 ? `${e.duracaoMediaMin} min` : `${Math.round(e.duracaoMediaMin / 6) / 10} h`],
    ["Drawdown máximo", `${pct(e.drawdownMaxPct)} · ${usd(e.drawdownMaxUsd)} $`, "text-rose-300"],
    ["Retorno", `${e.retornoPct > 0 ? "+" : ""}${pct(e.retornoPct)}`, e.retornoPct >= 0 ? "text-emerald-300" : "text-rose-300"],
  ]

  return (
    <div className="space-y-3 p-2.5 text-[12px]">
      <div className="flex items-center gap-2">
        <p className="text-[13px] font-semibold text-white">Estatísticas da conta</p>
        <button onClick={() => void carregar()} aria-label="atualizar" className="ml-auto text-zinc-500 hover:text-white">
          <RefreshCw className={`h-3.5 w-3.5 ${aCarregar ? "animate-spin" : ""}`} />
        </button>
      </div>

      {!semRegras && <ProgressoRegras r={regras} />}

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Cartao titulo="Saldo e equity (USD)">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curva} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gEquity" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={OURO} stopOpacity={0.35} /><stop offset="100%" stopColor={OURO} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke={TV.grelha} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fill: TV.textoFraco, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={32} />
                <YAxis tick={{ fill: TV.textoFraco, fontSize: 10 }} axisLine={false} tickLine={false} width={56} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} />
                <Tooltip contentStyle={{ background: TV.painel, border: `1px solid ${TV.borda}`, fontSize: 11 }} labelStyle={{ color: TV.texto }}
                  formatter={(v, nome) => [`${usd(Number(v))} $`, nome === "equity" ? "Equity" : "Saldo"]} />
                <Area type="stepAfter" dataKey="saldo" stroke="#8FA8FF" strokeWidth={1.25} fill="none" dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="equity" stroke={OURO} strokeWidth={1.5} fill="url(#gEquity)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Cartao>
        <Cartao titulo="Drawdown (%)">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curva} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={TV.grelha} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fill: TV.textoFraco, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={32} />
                <YAxis tick={{ fill: TV.textoFraco, fontSize: 10 }} axisLine={false} tickLine={false} width={36} domain={["dataMin", 0]} />
                <Tooltip contentStyle={{ background: TV.painel, border: `1px solid ${TV.borda}`, fontSize: 11 }} formatter={(v) => [`${Number(v).toFixed(2)}%`, "Drawdown"]} />
                <Area type="monotone" dataKey="ddPct" stroke={VERMELHO} fill={VERMELHO} fillOpacity={0.2} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Cartao>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map(([k, v, cor]) => (
          <div key={k} className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</p>
            <p className={`truncate font-mono text-[12.5px] ${cor ?? "text-white"}`}>{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Cartao titulo="Por hora de abertura (UTC)"><Barras dados={e.porHora} /></Cartao>
        <Cartao titulo="Por dia da semana (UTC)"><Barras dados={e.porDiaSemana} /></Cartao>
        <Cartao titulo={
          <div className="flex gap-0.5">
            {([["porSimbolo", "Símbolo"], ["porEstrategia", "Estratégia/estudo"], ["porOrigem", "Origem"], ["porDirecao", "Lado"]] as const).map(([g, n]) => (
              <button key={g} onClick={() => setGrupo(g)} className={`rounded px-1.5 py-0.5 text-[10.5px] ${grupo === g ? "bg-white/10 text-white" : "text-zinc-500"}`}>{n}</button>
            ))}
          </div>
        }>
          <TabelaGrupos grupos={e[grupo]} />
        </Cartao>
      </div>

      <p className="text-[10.5px] leading-snug text-zinc-500">
        Uma trade com saídas parciais conta uma vez (o resultado soma as partes). R = resultado ÷ risco até ao SL à abertura. Resultados passados não garantem resultados futuros.
      </p>
    </div>
  )
}

function ProgressoRegras({ r }: { r: RegrasResumo }) {
  const l = r.limites
  const regras = r.regras ?? {}
  const diaria = Number(regras.perda_diaria_pct ?? 0)
  const maxima = Number(regras.perda_maxima_pct ?? 0)
  const diasMin = Number(regras.dias_minimos ?? 0)
  const barras: Array<{ nome: string; valor: string; pct: number; cor: string }> = []
  if (diaria > 0 && l.perdaDiariaRestante != null) {
    const limite = (r.saldoInicial * diaria) / 100
    barras.push({ nome: `Perda diária (${diaria}%)`, valor: `restam ${usd(l.perdaDiariaRestante)} $`, pct: limite > 0 ? (l.perdaDiariaRestante / limite) * 100 : 0, cor: VERDE })
  }
  if (maxima > 0 && l.perdaMaximaRestante != null) {
    const limite = (r.saldoInicial * maxima) / 100
    barras.push({ nome: `Perda máxima (${maxima}%)`, valor: `restam ${usd(l.perdaMaximaRestante)} $`, pct: limite > 0 ? (l.perdaMaximaRestante / limite) * 100 : 0, cor: VERDE })
  }
  if (l.objetivoPct) barras.push({ nome: `Objetivo (${l.objetivoPct}%)`, valor: `${l.progressoObjetivoPct ?? 0}% · alvo ${usd(l.objetivoValor)} $`, pct: l.progressoObjetivoPct ?? 0, cor: OURO })
  if (diasMin > 0) barras.push({ nome: `Dias de negociação (mín. ${diasMin})`, valor: `${r.diasNegociados} de ${diasMin}`, pct: (r.diasNegociados / diasMin) * 100, cor: "#8FA8FF" })
  if (!barras.length) return <p className="rounded-lg border border-white/5 px-2.5 py-2 text-[11px] text-zinc-500">Esta conta não tem regras de programa (conta de análise ou sem programa).</p>
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {barras.map((b) => {
        const v = Math.max(0, Math.min(100, b.pct))
        const alerta = b.cor === VERDE && v < 30
        return (
          <div key={b.nome} className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-2 text-[11px]"><span className="text-zinc-400">{b.nome}</span><span className="font-mono text-white">{b.valor}</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={b.nome} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, background: alerta ? VERMELHO : b.cor }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Cartao({ titulo, children }: { titulo: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
      <div className="mb-1.5 text-[11px] font-medium text-zinc-400">{titulo}</div>
      {children}
    </div>
  )
}

function Barras({ dados }: { dados: Grupo[] }) {
  return (
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
          <XAxis dataKey="chave" tick={{ fill: TV.textoFraco, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis hide />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: TV.painel, border: `1px solid ${TV.borda}`, fontSize: 11 }}
            formatter={(v, _n, item) => [`${usd(Number(v))} $ · ${(item?.payload as Grupo)?.trades ?? 0} trades`, "Resultado"]} />
          <Bar dataKey="resultado" isAnimationActive={false} radius={[2, 2, 0, 0]}>
            {dados.map((g) => <Cell key={g.chave} fill={g.resultado >= 0 ? VERDE : VERMELHO} fillOpacity={g.trades ? 0.85 : 0.15} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function TabelaGrupos({ grupos }: { grupos: Grupo[] }) {
  if (!grupos.length) return <p className="py-4 text-center text-[11px] text-zinc-500">Sem trades.</p>
  return (
    <div className="max-h-32 overflow-y-auto">
      {grupos.slice(0, 30).map((g) => (
        <div key={g.chave} className="flex items-center justify-between gap-2 border-t border-white/5 py-1 text-[11px] first:border-0">
          <span className="truncate text-zinc-300">{g.chave}</span>
          <span className="shrink-0 font-mono text-zinc-400">{g.trades} · {g.taxaAcertoPct ?? "—"}% · <span className={g.resultado >= 0 ? "text-emerald-300" : "text-rose-300"}>{usd(g.resultado)} $</span></span>
        </div>
      ))}
    </div>
  )
}

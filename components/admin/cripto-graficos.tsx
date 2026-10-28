"use client"

/**
 * OS GRÁFICOS DO AGENTE CRIPTO (/admin/cripto) — o que está a acontecer agora e para onde vai.
 *
 * Quatro peças, todas feitas SÓ com o que está medido na base:
 *  · Ao vivo: PnL por realizar das abertas (preço público de agora) e o fluxo de acontecimentos.
 *  · Funil de 24 h: gatilhos → sem veto dos sub-agentes → a IA quer entrar → a guarda aprovou.
 *  · Curva de equity: real = saldos lidos no exchange/carteira; papel = base + PnL acumulado.
 *  · Evolução diária: PnL por dia e o acerto acumulado.
 *  · Crescimento esperado: reamostragem (bootstrap) dos trades JÁ fechados ao ritmo medido. Só
 *    aparece com 20 ou mais trades, mostra a faixa 10–90 % e nunca é apresentada como promessa:
 *    é o que acontece se o futuro se parecer com a amostra, e a amostra é pequena.
 */

import { useMemo } from "react"
import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Activity, ArrowDownRight, ArrowUpRight, Radio, ShieldAlert, ShieldCheck, TrendingUp } from "lucide-react"

type Linha = Record<string, any>

const OURO = "#D2A63C"
const OURO_CLARO = "#E9C46A"
const VERDE = "#34d399"
const VERMELHO = "#f87171"
const GRELHA = "#1f2937"
const CAIXA = "rounded-lg border border-gray-800 bg-gray-900/60 p-4"
const MIN_TRADES = 20
const HORIZONTE_DIAS = 30

const usd = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
const curto = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}`
const diaMes = (t: number) => new Date(t).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })
const horaMin = (t: number) => new Date(t).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
const dicaEstilo = { background: "#0b0b0d", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }

/** Gerador com semente: a projecção não pode tremer a cada refrescamento de 15 s. */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pnlPorRealizar(p: Linha, preco: number | undefined): number | null {
  const entrada = Number(p.entrada)
  if (!preco || !(entrada > 0)) return null
  return Number(p.nocional_usd) * (preco / entrada - 1) * (p.lado === "short" ? -1 : 1)
}

export default function CriptoGraficos({
  d, vista, capitalInicial,
}: {
  d: Linha
  vista: "papel" | "real"
  capitalInicial: number
}) {
  const trades = useMemo(
    () => ((d.historico ?? []) as Linha[]).filter((x) => x.modo === vista).map((x) => ({ ...x, t: new Date(x.fechada_em).getTime(), pnl: Number(x.pnl_usd) || 0 })),
    [d.historico, vista],
  )

  // ── Ao vivo ────────────────────────────────────────────────────────────────────────────────
  const abertas = ((d.abertas ?? []) as Linha[]).filter((x) => x.modo === vista)
  const vivas = abertas.map((p) => ({ p, upnl: pnlPorRealizar(p, d.precos?.[p.id_ativo]), preco: d.precos?.[p.id_ativo] as number | undefined }))
  const upnlTotal = vivas.reduce((s, x) => s + (x.upnl ?? 0), 0)
  const semPreco = vivas.filter((x) => x.upnl == null && x.p.estado === "aberta").length

  const fluxo = useMemo(() => {
    const ev: { t: number; tipo: string; texto: string; valor?: number; tom: "ok" | "aviso" | "mau" | "neutro" }[] = []
    for (const x of (d.decisoes ?? []) as Linha[]) {
      if (x.modo !== vista) continue
      const veto = (x.pareceres ?? []).find((p: Linha) => p.veto)
      const acao = x.decisao_ia?.action
      ev.push({
        t: new Date(x.em).getTime(),
        tipo: x.aprovada ? "aprovada" : "recusada",
        texto: `${x.ativo} · ${x.gatilho?.tipo ?? "gatilho"} ${x.gatilho?.lado ?? ""} → ${veto ? `veto ${veto.agente}` : acao ? `IA ${acao}` : "sem IA"}${!x.aprovada && x.recusas?.length ? ` · guarda: ${x.recusas[0]}` : ""}`,
        tom: x.aprovada ? "ok" : veto ? "mau" : "aviso",
      })
    }
    for (const p of abertas) ev.push({ t: new Date(p.aberta_em).getTime(), tipo: p.estado === "pendente" ? "pendente" : "aberta", texto: `${p.ativo} ${p.lado} ${usd(Number(p.nocional_usd))} @ ${Number(p.entrada).toPrecision(6)}`, tom: "neutro" })
    for (const p of (d.fechadas ?? []) as Linha[]) {
      if (p.modo !== vista || !p.fechada_em) continue
      const v = Number(p.pnl_usd) || 0
      ev.push({ t: new Date(p.fechada_em).getTime(), tipo: p.estado === "falhada" ? "falhada" : "fechada", texto: `${p.ativo} ${p.lado} · ${p.motivo_fecho ?? p.estado}`, valor: p.estado === "falhada" ? undefined : v, tom: p.estado === "falhada" ? "mau" : v >= 0 ? "ok" : "mau" })
    }
    return ev.sort((a, b) => b.t - a.t).slice(0, 30)
  }, [d.decisoes, d.fechadas, abertas, vista])

  const funil = useMemo(() => {
    const l = ((d.funil ?? []) as Linha[]).filter((x) => x.modo === vista)
    const semVeto = l.filter((x) => !x.veto)
    const querEntrar = semVeto.filter((x) => x.acao && x.acao !== "HOLD" && x.acao !== "ERROR")
    const aprovadas = l.filter((x) => x.aprovada)
    return [
      { nome: "Gatilhos", n: l.length },
      { nome: "Sem veto", n: semVeto.length },
      { nome: "IA quer entrar", n: querEntrar.length },
      { nome: "Guarda aprovou", n: aprovadas.length },
    ]
  }, [d.funil, vista])

  // ── Curva de equity ────────────────────────────────────────────────────────────────────────
  const curva = useMemo(() => {
    const saldos = ((d.saldos ?? []) as Linha[]).map((s) => ({ t: new Date(s.em).getTime(), equity: Number(s.equity_usd) })).filter((s) => Number.isFinite(s.equity))
    if (vista === "real" && saldos.length >= 2) return { pontos: saldos, fonte: "saldos lidos na carteira e na AURUM (7 dias)" }
    let eq = capitalInicial
    const pontos = trades.length ? [{ t: trades[0].t - 60_000, equity: eq }] : []
    for (const x of trades) { eq += x.pnl; pontos.push({ t: x.t, equity: Number(eq.toFixed(2)) }) }
    return { pontos, fonte: "base + PnL realizado (90 dias)" }
  }, [d.saldos, trades, vista, capitalInicial])

  const drawdown = useMemo(() => {
    let topo = -Infinity, pior = 0
    for (const p of curva.pontos) { topo = Math.max(topo, p.equity); if (topo > 0) pior = Math.min(pior, (p.equity / topo - 1) * 100) }
    return pior
  }, [curva])

  // ── Evolução diária ────────────────────────────────────────────────────────────────────────
  const dias = useMemo(() => {
    const m = new Map<string, { pnl: number; n: number; ganhos: number }>()
    for (const x of trades) {
      const k = new Date(x.t).toISOString().slice(0, 10)
      const v = m.get(k) ?? { pnl: 0, n: 0, ganhos: 0 }
      v.pnl += x.pnl; v.n += 1; if (x.pnl > 0) v.ganhos += 1
      m.set(k, v)
    }
    let n = 0, g = 0
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => {
      n += v.n; g += v.ganhos
      return { t: new Date(k).getTime(), pnl: Number(v.pnl.toFixed(2)), trades: v.n, acerto: Number(((g / n) * 100).toFixed(1)) }
    })
  }, [trades])

  // ── Crescimento esperado (bootstrap do medido) ─────────────────────────────────────────────
  const projecao = useMemo(() => {
    if (trades.length < MIN_TRADES) return null
    const pnls = trades.map((x) => x.pnl)
    const span = Math.max(1, (trades[trades.length - 1].t - trades[0].t) / 86_400_000)
    const porDia = trades.length / span
    const base = curva.pontos.length ? curva.pontos[curva.pontos.length - 1].equity : capitalInicial
    const rnd = mulberry32(trades.length * 7919 + Math.round(pnls.reduce((s, v) => s + v, 0) * 100))
    const SIMS = 400
    const caminhos: number[][] = []
    for (let s = 0; s < SIMS; s++) {
      let eq = base, acum = 0
      const c: number[] = []
      for (let dia = 1; dia <= HORIZONTE_DIAS; dia++) {
        acum += porDia
        while (acum >= 1) { eq += pnls[Math.floor(rnd() * pnls.length)]; acum -= 1 }
        // Fracção de trade num dia: entra com essa probabilidade (ritmos abaixo de 1/dia).
        if (acum > 0 && rnd() < acum) { eq += pnls[Math.floor(rnd() * pnls.length)]; acum = 0 }
        c.push(eq)
      }
      caminhos.push(c)
    }
    const pct = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))]
    const hoje = Date.now()
    const pontos = [{ t: hoje, faixa: [base, base] as [number, number], mediana: base }]
    for (let i = 0; i < HORIZONTE_DIAS; i++) {
      const col = caminhos.map((c) => c[i]).sort((a, b) => a - b)
      pontos.push({ t: hoje + (i + 1) * 86_400_000, faixa: [Number(pct(col, 0.1).toFixed(2)), Number(pct(col, 0.9).toFixed(2))], mediana: Number(pct(col, 0.5).toFixed(2)) })
    }
    const fim = pontos[pontos.length - 1]
    const pPerda = caminhos.filter((c) => c[c.length - 1] < base).length / SIMS
    return { pontos, base, porDia, fim, pPerda, media: pnls.reduce((s, v) => s + v, 0) / pnls.length }
  }, [trades, curva, capitalInicial])

  const eixoX = { dataKey: "t", type: "number" as const, domain: ["dataMin", "dataMax"] as [string, string], scale: "time" as const, tickFormatter: diaMes, stroke: "#6b7280", fontSize: 11 }

  return (
    <div className="mb-6 space-y-4">
      {/* AO VIVO */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className={`${CAIXA} lg:col-span-1`}>
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
            Ao vivo
          </p>
          <p className="text-[11px] uppercase tracking-wider text-gray-500">PnL por realizar</p>
          <p className={`text-2xl font-semibold tabular-nums ${upnlTotal > 0 ? "text-emerald-400" : upnlTotal < 0 ? "text-red-400" : "text-gray-300"}`}>{abertas.length ? usd(upnlTotal) : "—"}</p>
          <p className="mb-3 text-[11px] text-gray-500">{abertas.length} {abertas.length === 1 ? "posição" : "posições"}{semPreco ? ` · ${semPreco} sem preço agora` : ""} · preço público Bybit / Jupiter</p>
          <div className="space-y-1.5">
            {vivas.map(({ p, upnl, preco }) => (
              <div key={p.id} className="flex items-center justify-between rounded border border-gray-800 bg-black/40 px-2 py-1.5 text-xs">
                <span className="flex items-center gap-1.5">
                  {p.lado === "long" ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" /> : <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />}
                  <span className="font-medium">{p.ativo}</span>
                  <span className="text-gray-500">{p.estado === "pendente" ? "pendente" : preco ? Number(preco).toPrecision(6) : "…"}</span>
                </span>
                <span className={`tabular-nums ${upnl == null ? "text-gray-500" : upnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{upnl == null ? "—" : usd(upnl)}</span>
              </div>
            ))}
          </div>

          <p className="mb-2 mt-4 text-[11px] uppercase tracking-wider text-gray-500">Funil das últimas 24 h</p>
          <div className="space-y-1.5">
            {funil.map((f) => (
              <div key={f.nome}>
                <div className="flex justify-between text-[11px] text-gray-400"><span>{f.nome}</span><span className="tabular-nums">{f.n}</span></div>
                <div className="h-1.5 rounded bg-gray-800"><div className="h-1.5 rounded" style={{ width: `${funil[0].n ? Math.max(2, (f.n / funil[0].n) * 100) : 0}%`, background: `linear-gradient(90deg, ${OURO}, ${OURO_CLARO})` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${CAIXA} lg:col-span-2`}>
          <p className="mb-3 flex items-center gap-2 text-sm font-medium"><Radio className="h-4 w-4 text-[#D2A63C]" /> Fluxo de negociação <span className="text-[11px] font-normal text-gray-500">actualiza a cada 15 s</span></p>
          {fluxo.length === 0 ? (
            <p className="text-sm text-gray-500">Ainda sem acontecimentos em {vista}. O primeiro gatilho aparece aqui.</p>
          ) : (
            <ol className="relative max-h-[340px] space-y-2 overflow-y-auto border-l border-gray-800 pl-4">
              {fluxo.map((e, i) => (
                <li key={`${e.t}-${i}`} className="relative">
                  <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${e.tom === "ok" ? "bg-emerald-400" : e.tom === "mau" ? "bg-red-400" : e.tom === "aviso" ? "bg-amber-400" : "bg-[#D2A63C]"} ${i === 0 ? "ring-4 ring-white/5" : ""}`} />
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-gray-300">
                      {e.tipo === "aprovada" ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> : e.tipo === "recusada" ? <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> : <Activity className="h-3.5 w-3.5 text-[#D2A63C]" />}
                      <span className="rounded bg-gray-800 px-1.5 text-[10px] uppercase tracking-wider text-gray-400">{e.tipo}</span>
                      {e.texto}
                    </span>
                    <span className="flex items-center gap-2">
                      {e.valor != null && <span className={`tabular-nums ${e.valor >= 0 ? "text-emerald-400" : "text-red-400"}`}>{usd(e.valor)}</span>}
                      <span className="text-[11px] text-gray-600">{horaMin(e.t)}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* CURVA + EVOLUÇÃO */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={CAIXA}>
          <div className="mb-2 flex items-end justify-between">
            <div>
              <p className="text-sm font-medium">Curva de equity</p>
              <p className="text-[11px] text-gray-500">{curva.fonte}</p>
            </div>
            <p className="text-[11px] text-gray-500">pior queda <span className="text-red-400 tabular-nums">{drawdown.toFixed(1)}%</span></p>
          </div>
          {curva.pontos.length < 2 ? <Vazio texto="A curva começa no primeiro trade fechado." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={curva.pontos} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs><linearGradient id="gEq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={OURO} stopOpacity={0.35} /><stop offset="100%" stopColor={OURO} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke={GRELHA} strokeDasharray="3 3" />
                <XAxis {...eixoX} />
                <YAxis stroke="#6b7280" fontSize={11} width={48} tickFormatter={curto} domain={["auto", "auto"]} />
                <Tooltip contentStyle={dicaEstilo} labelFormatter={(t) => horaMin(Number(t))} formatter={(v) => [usd(Number(v)), "Equity"]} />
                <Area type="monotone" dataKey="equity" stroke={OURO} strokeWidth={2} fill="url(#gEq)" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={CAIXA}>
          <div className="mb-2">
            <p className="text-sm font-medium">Evolução diária</p>
            <p className="text-[11px] text-gray-500">barras = PnL do dia · linha = acerto acumulado</p>
          </div>
          {dias.length === 0 ? <Vazio texto="Sem dias com trades fechados ainda." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={dias} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRELHA} strokeDasharray="3 3" />
                <XAxis {...eixoX} padding={{ left: 12, right: 12 }} />
                <YAxis yAxisId="pnl" stroke="#6b7280" fontSize={11} width={48} tickFormatter={curto} />
                <YAxis yAxisId="ac" orientation="right" stroke="#6b7280" fontSize={11} width={34} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={dicaEstilo} labelFormatter={(t) => diaMes(Number(t))} formatter={(v, n) => (n === "acerto" ? [`${v}%`, "Acerto acumulado"] : [usd(Number(v)), "PnL do dia"])} />
                <Bar yAxisId="pnl" dataKey="pnl" maxBarSize={18} isAnimationActive={false}>
                  {dias.map((x) => <Cell key={x.t} fill={x.pnl >= 0 ? VERDE : VERMELHO} />)}
                </Bar>
                <Line yAxisId="ac" type="monotone" dataKey="acerto" stroke={OURO_CLARO} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* CRESCIMENTO ESPERADO */}
      <div className={CAIXA}>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium"><TrendingUp className="h-4 w-4 text-[#D2A63C]" /> Crescimento esperado · {HORIZONTE_DIAS} dias</p>
            <p className="text-[11px] text-gray-500">Projecção estatística dos trades já fechados, ao ritmo medido. Não é promessa: se o mercado mudar, a amostra deixa de valer.</p>
          </div>
          {projecao && (
            <div className="flex gap-4 text-right text-[11px] text-gray-500">
              <div>mediana<p className={`text-sm font-semibold tabular-nums ${projecao.fim.mediana >= projecao.base ? "text-emerald-400" : "text-red-400"}`}>{usd(projecao.fim.mediana - projecao.base)}</p></div>
              <div>faixa 10–90 %<p className="text-sm font-semibold tabular-nums text-gray-300">{usd(projecao.fim.faixa[0] - projecao.base)} a {usd(projecao.fim.faixa[1] - projecao.base)}</p></div>
              <div>prob. de acabar abaixo<p className="text-sm font-semibold tabular-nums text-amber-300">{(projecao.pPerda * 100).toFixed(0)}%</p></div>
            </div>
          )}
        </div>
        {!projecao ? (
          <div className="py-6">
            <p className="mb-2 text-sm text-gray-400">Precisa de {MIN_TRADES} trades fechados em {vista} para projectar sem inventar. Vai em {trades.length}.</p>
            <div className="h-2 max-w-md rounded bg-gray-800"><div className="h-2 rounded" style={{ width: `${(trades.length / MIN_TRADES) * 100}%`, background: OURO }} /></div>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={projecao.pontos} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRELHA} strokeDasharray="3 3" />
                <XAxis {...eixoX} />
                <YAxis stroke="#6b7280" fontSize={11} width={48} tickFormatter={curto} domain={["auto", "auto"]} />
                <Tooltip contentStyle={dicaEstilo} labelFormatter={(t) => diaMes(Number(t))} formatter={(v, n) => (Array.isArray(v) ? [`${usd(Number(v[0]))} a ${usd(Number(v[1]))}`, "Faixa 10–90 %"] : [usd(Number(v)), n === "mediana" ? "Mediana" : String(n)])} />
                <Area type="monotone" dataKey="faixa" stroke="none" fill={OURO} fillOpacity={0.18} isAnimationActive={false} />
                <Line type="monotone" dataKey="mediana" stroke={OURO_CLARO} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-1 text-[11px] text-gray-600">Base {usd(projecao.base)} · {trades.length} trades medidos · {projecao.porDia.toFixed(1)} trades/dia · média {usd(projecao.media)} por trade · 400 simulações por reamostragem.</p>
          </>
        )}
      </div>
    </div>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <div className="flex h-[220px] items-center justify-center text-sm text-gray-500">{texto}</div>
}

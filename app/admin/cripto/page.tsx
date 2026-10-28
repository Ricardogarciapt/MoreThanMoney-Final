"use client"

/**
 * O DASHBOARD DO AGENTE CRIPTO (/admin/cripto).
 *
 * Um ecrã de ESTADO para deixar aberto: o que o AG-SCANNER viu, o que cada sub-agente achou, o que
 * o AG-TRADER pediu, o que a guarda recusou e porquê, as posições, as sessões e o envio dos lucros.
 *
 * Os interruptores aqui são só os do dono (ligar, papel/real, memecoins, capital base, fechar).
 * Execução real: perps na AURUM (Bybit, mestre do Copy Trading) pela Vercel; memecoins na carteira
 * Solana (Jupiter, incl. Pump.fun) pela VPS. Tectos, chaves e destino dos lucros vivem no env de cada
 * um e não aparecem nem se mudam aqui.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { ArrowLeft, Copy, Loader2, Power, RefreshCw, ShieldAlert, ShieldCheck, Wallet, X } from "lucide-react"

type Linha = Record<string, any>

const CAIXA = "rounded-lg border border-gray-800 bg-gray-900/60 p-4"
const TH = "px-3 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500 font-medium"
const TD = "px-3 py-2 text-sm text-gray-300 whitespace-nowrap"
const usd = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v) >= 0 ? "" : "−"}${Math.abs(Number(v)).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`)
const hora = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—")
const cor = (v: unknown) => (Number(v) > 0 ? "text-emerald-400" : Number(v) < 0 ? "text-red-400" : "text-gray-300")

export default function AdminCriptoPage() {
  const router = useRouter()
  const { user, isAdmin, isLoading: authLoading } = useAuth()
  const { toast } = useToast()
  const [montado, setMontado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [d, setD] = useState<Linha | null>(null)
  const [vista, setVista] = useState<"papel" | "real">("papel")
  const [confirmo, setConfirmo] = useState("")
  const [base, setBase] = useState("")

  useEffect(() => setMontado(true), [])
  useEffect(() => {
    if (!montado || authLoading) return
    if (!user) router.push("/login?redirect=/admin/cripto")
    else if (!isAdmin) router.push("/new-landing")
  }, [montado, authLoading, user, isAdmin, router])

  const carregar = useCallback(async () => {
    setOcupado(true)
    try {
      const r = await fetch("/api/admin/cripto").then((x) => x.json())
      if (!r.ok) throw new Error(r.error + (r.dica ? ` (${r.dica})` : ""))
      setD(r)
      setVista((v) => (r.config?.modo === "real" ? "real" : v))
    } catch (e) {
      toast({ title: "Não foi possível carregar", description: String((e as Error).message), variant: "destructive" })
    } finally {
      setOcupado(false)
    }
  }, [toast])

  useEffect(() => {
    if (!montado || !isAdmin) return
    void carregar()
    const t = setInterval(() => void carregar(), 30_000)
    return () => clearInterval(t)
  }, [montado, isAdmin, carregar])

  async function mudar(corpo: Linha, ok: string) {
    const r = await fetch("/api/admin/cripto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }).then((x) => x.json())
    if (!r.ok) return toast({ title: "Recusado", description: r.error, variant: "destructive" })
    toast({ title: ok })
    void carregar()
  }

  const doModo = useCallback((l: Linha[] | undefined) => (l ?? []).filter((x) => x.modo === vista), [vista])
  const resumo = useMemo(() => {
    const fechadas = doModo(d?.fechadas).filter((x) => x.estado === "fechada")
    const pnl = fechadas.reduce((s, x) => s + (Number(x.pnl_usd) || 0), 0)
    const ganhos = fechadas.filter((x) => Number(x.pnl_usd) > 0).length
    const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0)
    const pnlHoje = fechadas.filter((x) => new Date(x.fechada_em) >= hoje).reduce((s, x) => s + (Number(x.pnl_usd) || 0), 0)
    const enviado = doModo(d?.sessoes).filter((s) => s.varredura_estado === "enviada" || s.varredura_estado === "simulada").reduce((s, x) => s + (Number(x.varredura_usd) || 0), 0)
    return { pnl, pnlHoje, n: fechadas.length, acerto: fechadas.length ? (ganhos / fechadas.length) * 100 : null, enviado }
  }, [d, doModo])

  if (!montado || authLoading || !d) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" />
      </div>
    )
  }
  if (!user || !isAdmin) return null

  const cfg = d.config
  const carteira = (d.carteiras ?? []).find((c: Linha) => c.rede === "solana")
  const tarefa = d.vigia?.tarefa as Linha | null
  const vigiaVivo = d.vigia?.pulsoEm && Date.now() - new Date(d.vigia.pulsoEm).getTime() < 120_000 && tarefa
  const capitalPapel = (cfg.capitalPapelUsd ?? 0) + doModo(d.fechadas).reduce((s: number, x: Linha) => s + (Number(x.pnl_usd) || 0), 0) - (vista === "papel" ? resumo.enviado : 0)

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white"><ArrowLeft className="mr-1 h-4 w-4" /> Admin</Button>
            </Link>
            <h1 className="text-xl font-semibold">Agente <span className="text-[#D2A63C]">Cripto</span></h1>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${cfg.ligado ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>{cfg.ligado ? "ligado" : "desligado"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${cfg.modo === "real" ? "bg-red-500/15 text-red-300" : "bg-[#D2A63C]/15 text-[#E9C46A]"}`}>{cfg.modo === "real" ? "DINHEIRO REAL" : "papel"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${vigiaVivo ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`} title={tarefa?.erro ?? ""}>
              VPS {vigiaVivo ? `ativa · ${hora(tarefa?.ultima)}` : "sem pulso do agente-cripto"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-gray-800 p-0.5">
              {(["papel", "real"] as const).map((m) => (
                <button key={m} onClick={() => setVista(m)} className={`rounded px-3 py-1 text-xs ${vista === m ? "bg-[#D2A63C] text-black" : "text-gray-400"}`}>{m}</button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={ocupado} className="border-gray-700 text-gray-300">
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-gray-800 px-2 py-0.5 text-gray-400">Perps → Bybit AURUM (mestre do Copy Trading) · Vercel</span>
          <span className="rounded-full border border-gray-800 px-2 py-0.5 text-gray-400">Memecoins → carteira Solana · Jupiter / Pump.fun · VPS</span>
          <span className="rounded-full border border-gray-800 px-2 py-0.5 text-gray-400">Lucro da AURUM fica lá · lucro da carteira vai para o teu endereço às 00:00 UTC</span>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className={CAIXA}>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Capital {vista}</p>
            <p className="mt-1 text-lg font-semibold text-[#D2A63C]">{vista === "real" ? usd(d.saldoReal?.equity_usd) : usd(capitalPapel)}</p>
            <p className="text-[11px] text-gray-500">{vista === "real" ? `lido ${hora(d.saldoReal?.em)}` : `base ${usd(cfg.capitalPapelUsd)}`}</p>
          </div>
          <div className={CAIXA}><p className="text-[11px] uppercase tracking-wider text-gray-500">PnL hoje</p><p className={`mt-1 text-lg font-semibold ${cor(resumo.pnlHoje)}`}>{usd(resumo.pnlHoje)}</p></div>
          <div className={CAIXA}><p className="text-[11px] uppercase tracking-wider text-gray-500">PnL total</p><p className={`mt-1 text-lg font-semibold ${cor(resumo.pnl)}`}>{usd(resumo.pnl)}</p><p className="text-[11px] text-gray-500">{resumo.n} trades fechados</p></div>
          <div className={CAIXA}><p className="text-[11px] uppercase tracking-wider text-gray-500">Acerto</p><p className="mt-1 text-lg font-semibold">{resumo.acerto == null ? "—" : `${resumo.acerto.toFixed(0)}%`}</p><p className="text-[11px] text-gray-500">medido, não prometido</p></div>
          <div className={CAIXA}><p className="text-[11px] uppercase tracking-wider text-gray-500">Lucros enviados</p><p className="mt-1 text-lg font-semibold">{usd(resumo.enviado)}</p><p className="text-[11px] text-gray-500">{vista === "papel" ? "simulados" : "para o teu endereço"}</p></div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2">
          <div className={CAIXA}>
            <p className="mb-3 flex items-center gap-2 text-sm font-medium"><Power className="h-4 w-4 text-[#D2A63C]" /> Interruptores</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="border-gray-700" onClick={() => void mudar({ acao: "ligado", valor: !cfg.ligado }, cfg.ligado ? "Agente desligado" : "Agente ligado")}>{cfg.ligado ? "Desligar" : "Ligar"}</Button>
              <Button size="sm" variant="outline" className="border-gray-700" onClick={() => void mudar({ acao: "memecoins", valor: !cfg.memecoins }, "Memecoins actualizadas")}>Memecoins: {cfg.memecoins ? "sim" : "não"}</Button>
              <Button size="sm" variant="outline" className="border-gray-700" onClick={() => void mudar({ acao: "fechar" }, "Fecho pedido para todas as abertas")}>Fechar tudo</Button>
              {cfg.modo === "real" && <Button size="sm" variant="outline" className="border-gray-700" onClick={() => void mudar({ acao: "modo", valor: "papel" }, "De volta ao papel")}>Voltar a papel</Button>}
            </div>
            {cfg.modo !== "real" && (
              <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/5 p-3">
                <p className="mb-2 text-xs text-red-200/90">Passar a dinheiro real é a 1.ª de duas chaves. A 2.ª é <code>CRIPTO_REAL=1</code> na Vercel (perps na AURUM) e na VPS (memecoins na carteira). Escreve REAL para confirmar.</p>
                <div className="flex gap-2">
                  <Input value={confirmo} onChange={(e) => setConfirmo(e.target.value)} placeholder="REAL" className="h-8 max-w-[120px] border-gray-700 bg-black" />
                  <Button size="sm" disabled={confirmo !== "REAL"} className="bg-red-600 hover:bg-red-500" onClick={() => void mudar({ acao: "modo", valor: "real", confirmo }, "Modo real pedido")}>Passar a real</Button>
                </div>
              </div>
            )}
          </div>
          <div className={CAIXA}>
            <p className="mb-3 flex items-center gap-2 text-sm font-medium"><Wallet className="h-4 w-4 text-[#D2A63C]" /> Carteira do agente (Solana)</p>
            {carteira ? (
              <div className="flex items-center gap-2">
                <code className="truncate rounded bg-black px-2 py-1 text-xs text-[#E9C46A]">{carteira.endereco}</code>
                <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(carteira.endereco); toast({ title: "Endereço copiado" }) }}><Copy className="h-4 w-4" /></Button>
              </div>
            ) : (
              <p className="text-xs text-gray-500">Ainda não criada: nasce no 1.º arranque do executor na VPS. A chave privada nunca sai de lá.</p>
            )}
            {d.saldoReal?.detalhe && (
              <p className="mt-2 text-xs text-gray-400">Carteira Solana {usd(d.saldoReal.detalhe.partes?.solana?.equity)} · AURUM (parte do agente) {usd(d.saldoReal.detalhe.partes?.bybit?.equity ?? d.saldoReal.detalhe.bybit?.equity)}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-500">Capital base real</span>
              <Input value={base} onChange={(e) => setBase(e.target.value)} placeholder={String(cfg.capitalBaseRealUsd ?? 0)} className="h-8 max-w-[110px] border-gray-700 bg-black" />
              <Button size="sm" variant="outline" className="border-gray-700" onClick={() => void mudar({ acao: "capitalBaseReal", valor: Number(base.replace(",", ".")) }, "Capital base gravado")}>Gravar</Button>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">Só o que estiver acima da base é lucro e é enviado no fim da sessão (00:00 UTC). O executor confirma com o seu próprio valor.</p>
          </div>
        </div>

        <Seccao titulo="Posições abertas">
          <Tabela cab={["Ativo", "Lado", "Nocional", "Entrada", "SL", "TP", "Estado", "Desde", ""]} vazio="Sem posições abertas." linhas={doModo(d.abertas).map((p) => [
            <span key="a">{p.ativo} <span className="text-[11px] text-gray-500">{p.mercado}{p.exploracao ? " · exploração" : ""}</span></span>,
            p.lado, usd(p.nocional_usd), Number(p.entrada).toPrecision(6), Number(p.sl).toPrecision(6), Number(p.tp).toPrecision(6),
            p.fechar_pedido ? `a fechar (${p.fechar_pedido})` : p.estado, hora(p.aberta_em),
            <Button key="f" size="sm" variant="ghost" disabled={!!p.fechar_pedido} onClick={() => void mudar({ acao: "fechar", id: p.id }, "Fecho pedido")}><X className="h-4 w-4" /></Button>,
          ])} />
        </Seccao>

        <Seccao titulo="Decisões dos agentes (últimas 40)">
          <div className="space-y-2">
            {doModo(d.decisoes).length === 0 && <p className="text-sm text-gray-500">Ainda sem gatilhos. O AG-SCANNER só chama a IA quando o código encontra um.</p>}
            {doModo(d.decisoes).map((x) => (
              <div key={x.id} className="rounded-md border border-gray-800 bg-black/40 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {x.aprovada ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : <ShieldAlert className="h-4 w-4 text-amber-400" />}
                  <span className="font-medium">{x.ativo}</span>
                  <span className="text-xs text-gray-500">{x.gatilho?.tipo} · {x.gatilho?.lado} · {hora(x.em)}</span>
                  {x.decisao_ia && <span className="rounded bg-gray-800 px-1.5 text-[11px]">{x.decisao_ia.action} · {Number(x.decisao_ia.rationale?.confidence_score ?? 0).toFixed(2)}</span>}
                  {x.fornecedor_ia && <span className="text-[11px] text-gray-600">{x.fornecedor_ia}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(x.pareceres ?? []).map((p: Linha) => (
                    <span key={p.agente} title={p.nota} className={`rounded px-1.5 py-0.5 text-[11px] ${p.veto ? "bg-red-500/15 text-red-300" : Number(p.favor) > 0 ? "bg-emerald-500/10 text-emerald-300" : Number(p.favor) < 0 ? "bg-amber-500/10 text-amber-300" : "bg-gray-800 text-gray-400"}`}>
                      {p.agente}{p.veto ? " · VETO" : ""}
                    </span>
                  ))}
                </div>
                {x.decisao_ia?.rationale?.technical_trigger && <p className="mt-1 text-xs text-gray-400">{x.decisao_ia.rationale.technical_trigger}</p>}
                {(x.recusas ?? []).length > 0 && <p className="mt-1 text-xs text-amber-300/90">Guarda: {x.recusas.join(" · ")}</p>}
              </div>
            ))}
          </div>
        </Seccao>

        <div className="grid gap-6 md:grid-cols-2">
          <Seccao titulo="Vantagem medida por gatilho">
            <Tabela cab={["Gatilho", "Trades", "Acerto", "PnL", "R médio"]} vazio="Precisa de 20 trades fechados por gatilho." linhas={(d.vantagem ?? []).filter((v: Linha) => v.modo === vista).map((v: Linha) => [
              v.gatilho_tipo, v.n, v.n ? `${((v.ganhos / v.n) * 100).toFixed(0)}%` : "—", <span key="p" className={cor(v.pnl)}>{usd(v.pnl)}</span>, v.n ? (v.soma_r / v.n).toFixed(3) : "—",
            ])} />
          </Seccao>
          <Seccao titulo="Sessões e envio dos lucros">
            <Tabela cab={["Sessão", "Trades", "PnL", "Envio", ""]} vazio="Ainda nenhuma sessão fechada." linhas={doModo(d.sessoes).map((s) => [
              hora(s.inicio), s.trades, <span key="p" className={cor(s.pnl_usd)}>{usd(s.pnl_usd)}</span>,
              s.varredura_estado === "nada" ? "—" : `${s.varredura_estado} ${usd(s.varredura_usd)}`,
              s.varredura_tx ? <a key="t" className="text-[#D2A63C] underline" target="_blank" rel="noreferrer" href={`https://solscan.io/tx/${String(s.varredura_tx).split(" ")[0]}`}>tx</a> : <span key="t" className="text-[11px] text-gray-500" title={s.porque}>{String(s.porque ?? "").slice(0, 40)}</span>,
            ])} />
          </Seccao>
        </div>

        <Seccao titulo="Fechadas (últimas 60)">
          <Tabela cab={["Ativo", "Lado", "Nocional", "Motivo", "PnL", "Fechada"]} vazio="Nada fechado ainda." linhas={doModo(d.fechadas).map((p) => [
            `${p.ativo} (${p.mercado})`, p.lado, usd(p.nocional_usd), p.motivo_fecho ?? p.estado, <span key="p" className={cor(p.pnl_usd)}>{usd(p.pnl_usd)}</span>, hora(p.fechada_em),
          ])} />
        </Seccao>

        <p className="mt-8 text-center text-[11px] text-gray-600">Ferramenta interna experimental. Conteúdo educativo, não constitui consultoria financeira. Resultados passados não garantem resultados futuros.</p>
      </div>
    </div>
  )
}

function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-sm font-medium text-gray-200">{titulo}</p>
      {children}
    </div>
  )
}

function Tabela({ cab, linhas, vazio }: { cab: string[]; linhas: React.ReactNode[][]; vazio: string }) {
  if (!linhas.length) return <p className="text-sm text-gray-500">{vazio}</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full">
        <thead className="bg-gray-900/80"><tr>{cab.map((c) => <th key={c} className={TH}>{c}</th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={i} className="border-t border-gray-800">{l.map((c, j) => <td key={j} className={TD}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

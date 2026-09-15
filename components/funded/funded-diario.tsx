"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BookOpen, ExternalLink, Loader2, Trash2 } from "lucide-react"
import { pedir, px, usd } from "./api"

/**
 * DIÁRIO DE TRADING — uma nota por trade (e notas soltas), com emoção, setup, etiquetas e o link
 * de um print. Escrever o porquê de cada trade é a parte da formação que a plataforma pode fazer
 * por quem aprende; é por isso que vive ao lado do histórico, e não numa página à parte.
 *
 * Guarda em funded_diario (migração 072) pela rota /api/mtmfunded/simulado/diario. Investor só lê.
 */

type Linha = Record<string, any>
export interface NotaDiario { id: string; position_id: string | null; nota: string | null; tags: string[]; emocao: string | null; setup: string | null; screenshot_url: string | null; criado_em: string; atualizado_em: string }

export const EMOCOES = ["Calmo", "Confiante", "Ansioso", "FOMO", "Vingança", "Impaciente", "Com medo", "Eufórico"]
export const SETUPS = ["Rompimento", "Pullback", "Reversão", "Tendência", "Range", "Notícia", "Sinal Sensei", "Sinal GoldKiller", "Sinal MTM Scanner", "Ideia MTM"]
const TAGS = ["Segui o plano", "Saí cedo", "Saí tarde", "Sem SL", "Lote grande", "Contra a tendência", "Boa gestão", "Erro"]

export function useDiario(accountId: string) {
  const [notas, setNotas] = useState<NotaDiario[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(async () => {
    try { const d = await pedir<{ notas: NotaDiario[] }>(`/api/mtmfunded/simulado/diario?accountId=${accountId}`, {}, accountId); setNotas(d.notas); setErro(null) }
    catch (e) { setErro((e as Error).message); setNotas((n) => n ?? []) }
  }, [accountId])
  useEffect(() => { void carregar() }, [carregar])
  const comTrade = useMemo(() => new Set((notas ?? []).map((n) => n.position_id).filter(Boolean) as string[]), [notas])
  return { notas, erro, carregar, comTrade }
}

export default function FundedDiario({ accountId, historico, podeEscrever, diario, focoTrade, onFoco }: {
  accountId: string
  historico: Linha[]
  podeEscrever: boolean
  diario: ReturnType<typeof useDiario>
  /** Trade aberta no editor (vinda do botão 📖 do histórico). */
  focoTrade: string | null
  onFoco: (id: string | null) => void
}) {
  // Trades (raízes) do histórico, uma por linha, com o resultado somado das partes.
  const trades = useMemo(() => {
    const m = new Map<string, { raiz: string; symbol: string; direcao: string; volume: number; entrada: number; fecho: number; resultado: number; em: string }>()
    for (const h of historico) {
      const raiz = String(h.mae_id ?? h.id)
      const t = m.get(raiz) ?? { raiz, symbol: h.symbol, direcao: h.direcao, volume: 0, entrada: Number(h.preco_entrada), fecho: Number(h.preco_fecho), resultado: 0, em: h.fechada_em }
      t.volume = Math.round((t.volume + Number(h.volume)) * 100) / 100
      t.resultado += Number(h.pnl ?? 0) + Number(h.swap ?? 0) - Number(h.comissao ?? 0)
      if (h.fechada_em > t.em) { t.em = h.fechada_em; t.fecho = Number(h.preco_fecho) }
      m.set(raiz, t)
    }
    return [...m.values()].sort((a, b) => b.em.localeCompare(a.em))
  }, [historico])
  const porTrade = useMemo(() => new Map((diario.notas ?? []).filter((n) => n.position_id).map((n) => [n.position_id as string, n])), [diario.notas])
  const soltas = (diario.notas ?? []).filter((n) => !n.position_id)

  if (diario.notas == null) return <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /></div>

  return (
    <div className="grid gap-2 p-2.5 text-[12px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-white"><BookOpen className="h-4 w-4 text-[#D2A63C]" /> Diário</p>
          {podeEscrever && <button onClick={() => onFoco("nova")} className="ml-auto rounded-md border border-white/10 px-2 py-1 text-[11px] text-[#D2A63C]">+ Nota do dia</button>}
        </div>
        {diario.erro && <p className="text-[11px] text-amber-300">{diario.erro}</p>}
        <div className="max-h-[48vh] divide-y divide-white/5 overflow-y-auto rounded-lg border border-white/5">
          {soltas.map((n) => (
            <button key={n.id} onClick={() => onFoco(`nota:${n.id}`)} className={`block w-full px-2.5 py-2 text-left hover:bg-white/5 ${focoTrade === `nota:${n.id}` ? "bg-[#D2A63C]/10" : ""}`}>
              <p className="text-zinc-300">📝 {new Date(n.criado_em).toLocaleDateString("pt-PT")} {n.emocao ? `· ${n.emocao}` : ""}</p>
              <p className="truncate text-[10.5px] text-zinc-500">{n.nota}</p>
            </button>
          ))}
          {trades.length === 0 && soltas.length === 0 && <p className="p-4 text-center text-zinc-500">Ainda sem trades fechadas para comentar.</p>}
          {trades.map((t) => {
            const n = porTrade.get(t.raiz)
            return (
              <button key={t.raiz} onClick={() => onFoco(t.raiz)} className={`flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-white/5 ${focoTrade === t.raiz ? "bg-[#D2A63C]/10" : ""}`}>
                <span className={`w-9 shrink-0 font-semibold ${t.direcao === "buy" ? "text-emerald-400" : "text-rose-400"}`}>{t.direcao === "buy" ? "BUY" : "SELL"}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-white">{t.symbol}</span> <span className="text-zinc-500">{t.volume} · {new Date(t.em).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</span>
                  {n && <span className="block truncate text-[10.5px] text-[#D2A63C]">{[n.setup, n.emocao, ...(n.tags ?? [])].filter(Boolean).join(" · ") || n.nota}</span>}
                </span>
                <span className={`font-mono ${t.resultado >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{usd(t.resultado)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="min-w-0">
        {focoTrade ? (
          <Editor
            key={focoTrade} accountId={accountId} podeEscrever={podeEscrever}
            trade={trades.find((t) => t.raiz === focoTrade) ?? null}
            nota={focoTrade.startsWith("nota:") ? soltas.find((n) => `nota:${n.id}` === focoTrade) ?? null : porTrade.get(focoTrade) ?? null}
            onGuardado={() => void diario.carregar()} onFechar={() => onFoco(null)}
          />
        ) : (
          <p className="grid h-full min-h-32 place-items-center rounded-lg border border-dashed border-white/10 p-4 text-center text-zinc-500">Escolhe uma trade para escrever o que viste, o que sentiste e o que farias diferente.</p>
        )}
      </div>
    </div>
  )
}

function Editor({ accountId, trade, nota, podeEscrever, onGuardado, onFechar }: {
  accountId: string
  trade: { raiz: string; symbol: string; direcao: string; volume: number; entrada: number; fecho: number; resultado: number } | null
  nota: NotaDiario | null
  podeEscrever: boolean
  onGuardado: () => void
  onFechar: () => void
}) {
  const [texto, setTexto] = useState(nota?.nota ?? "")
  const [emocao, setEmocao] = useState(nota?.emocao ?? "")
  const [setup, setSetup] = useState(nota?.setup ?? "")
  const [tags, setTags] = useState<string[]>(nota?.tags ?? [])
  const [print, setPrint] = useState(nota?.screenshot_url ?? "")
  const [estado, setEstado] = useState<"" | "a_guardar" | "guardado">("")
  const [erro, setErro] = useState<string | null>(null)

  const guardar = async () => {
    setEstado("a_guardar"); setErro(null)
    try {
      await pedir("/api/mtmfunded/simulado/diario", { method: "POST", body: JSON.stringify({ accountId, id: nota?.id, positionId: trade?.raiz ?? null, nota: texto, emocao, setup, tags, screenshotUrl: print || null }) }, accountId)
      setEstado("guardado"); onGuardado()
    } catch (e) { setErro((e as Error).message); setEstado("") }
  }
  const apagar = async () => {
    if (!nota) return
    try { await pedir(`/api/mtmfunded/simulado/diario?accountId=${accountId}&id=${nota.id}`, { method: "DELETE" }, accountId); onGuardado(); onFechar() }
    catch (e) { setErro((e as Error).message) }
  }
  const chip = (on: boolean) => `rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-white/10 text-zinc-400 hover:text-white"}`

  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-2.5">
      <div className="flex items-center gap-2">
        <p className="font-semibold text-white">{trade ? `${trade.direcao === "buy" ? "BUY" : "SELL"} ${trade.symbol} ${trade.volume}` : "Nota do dia"}</p>
        {trade && <span className={`font-mono ${trade.resultado >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{usd(trade.resultado)} $</span>}
        {trade && <span className="font-mono text-[10.5px] text-zinc-500">{px(trade.entrada, 5).replace(/0+$/, "")} → {px(trade.fecho, 5).replace(/0+$/, "")}</span>}
        <button onClick={onFechar} className="ml-auto text-[11px] text-zinc-500">fechar</button>
      </div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!podeEscrever} rows={4} maxLength={4000}
        placeholder="Porque entrei? O que vi no gráfico? Segui o plano? O que faria diferente?"
        className="w-full resize-y rounded-md border border-white/10 bg-black p-2 text-[12.5px] text-white placeholder:text-zinc-600" />
      <div><p className="mb-1 text-[10.5px] uppercase text-zinc-500">Emoção</p><div className="flex flex-wrap gap-1">{EMOCOES.map((x) => <button key={x} disabled={!podeEscrever} onClick={() => setEmocao(emocao === x ? "" : x)} className={chip(emocao === x)}>{x}</button>)}</div></div>
      <div><p className="mb-1 text-[10.5px] uppercase text-zinc-500">Setup</p><div className="flex flex-wrap gap-1">{SETUPS.map((x) => <button key={x} disabled={!podeEscrever} onClick={() => setSetup(setup === x ? "" : x)} className={chip(setup === x)}>{x}</button>)}</div></div>
      <div><p className="mb-1 text-[10.5px] uppercase text-zinc-500">Etiquetas</p><div className="flex flex-wrap gap-1">{TAGS.map((x) => <button key={x} disabled={!podeEscrever} onClick={() => setTags(tags.includes(x) ? tags.filter((t) => t !== x) : [...tags, x])} className={chip(tags.includes(x))}>{x}</button>)}</div></div>
      <div className="flex items-center gap-1.5">
        <input value={print} onChange={(e) => setPrint(e.target.value)} disabled={!podeEscrever} placeholder="Link do print (https://…)" inputMode="url"
          className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-black px-2 text-[12px] text-white placeholder:text-zinc-600" />
        {/^https?:\/\//i.test(print) && <a href={print} target="_blank" rel="noreferrer noopener" className="text-zinc-400 hover:text-white" aria-label="abrir print"><ExternalLink className="h-4 w-4" /></a>}
      </div>
      {erro && <p className="text-[11px] text-rose-300">{erro}</p>}
      {podeEscrever && (
        <div className="flex items-center gap-2">
          {nota && <button onClick={() => void apagar()} className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /> apagar</button>}
          <span className="ml-auto text-[11px] text-emerald-300">{estado === "guardado" ? "guardado" : ""}</span>
          <button disabled={estado === "a_guardar"} onClick={() => void guardar()} className="rounded-md bg-[#D2A63C] px-3 py-1.5 font-bold text-black disabled:opacity-40">
            {estado === "a_guardar" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </button>
        </div>
      )}
    </div>
  )
}

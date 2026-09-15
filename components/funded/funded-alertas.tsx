"use client"

import { useCallback, useEffect, useState } from "react"
import { Bell, BellOff, Loader2, Trash2 } from "lucide-react"
import type { PrecoVivo, SimboloFicha } from "./api"
import { pedir, px } from "./api"
import { numeroDe } from "./avancado"

/**
 * ALERTAS DE PREÇO — «avisa-me quando o ouro chegar a 2 450». O motor do VPS vigia o bid e, quando
 * lá chega, desactiva o alerta e manda um push para o telemóvel (a mesma via das outras notificações
 * da app). Os activos aparecem como linhas amarelas no gráfico do símbolo.
 */

export interface AlertaLinha { id: string; symbol: string; condicao: "acima" | "abaixo"; preco: number; nota: string | null; ativo: boolean; disparado_em: string | null; preco_disparo: number | null; criado_em: string }

export function useAlertas(accountId: string) {
  const [alertas, setAlertas] = useState<AlertaLinha[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(async () => {
    try { const d = await pedir<{ alertas: AlertaLinha[] }>(`/api/mtmfunded/simulado/alertas?accountId=${accountId}`, {}, accountId); setAlertas(d.alertas.map((a) => ({ ...a, preco: Number(a.preco) }))); setErro(null) }
    catch (e) { setErro((e as Error).message); setAlertas((a) => a ?? []) }
  }, [accountId])
  useEffect(() => {
    void carregar()
    // Um alerta que dispara deixa de ser linha no gráfico: relê-se de 30 em 30 s.
    const iv = setInterval(() => { if (document.visibilityState !== "hidden") void carregar() }, 30_000)
    return () => clearInterval(iv)
  }, [carregar])
  return { alertas, erro, carregar }
}

export default function FundedAlertas({ accountId, simbolo, preco, podeCriar, estado, onSelecionarSimbolo }: {
  accountId: string
  simbolo: SimboloFicha | null
  preco?: PrecoVivo
  podeCriar: boolean
  estado: ReturnType<typeof useAlertas>
  onSelecionarSimbolo: (symbol: string) => void
}) {
  const [nivel, setNivel] = useState("")
  const [nota, setNota] = useState("")
  const [aCriar, setACriar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const d = simbolo?.digits ?? 5

  const criar = async () => {
    const n = numeroDe(nivel)
    if (!simbolo || n == null || !(n > 0)) return setErro("indica o preço")
    setACriar(true); setErro(null)
    try {
      await pedir("/api/mtmfunded/simulado/alertas", { method: "POST", body: JSON.stringify({ accountId, symbol: simbolo.symbol, preco: n, nota: nota || null }) }, accountId)
      setNivel(""); setNota("")
      await estado.carregar()
    } catch (e) { setErro((e as Error).message) } finally { setACriar(false) }
  }
  const apagar = async (id: string) => {
    try { await pedir(`/api/mtmfunded/simulado/alertas?accountId=${accountId}&id=${id}`, { method: "DELETE" }, accountId); await estado.carregar() }
    catch (e) { setErro((e as Error).message) }
  }

  const n = numeroDe(nivel)
  const lado = n != null && preco ? (n >= preco.bid ? "acima" : "abaixo") : null

  return (
    <div className="space-y-2 p-2.5 text-[12px]">
      {podeCriar && simbolo && (
        <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/30 p-2.5">
          <p className="flex items-center gap-1.5 font-semibold text-white"><Bell className="h-4 w-4 text-amber-300" /> Novo alerta · {simbolo.symbol} <span className="font-mono text-[11px] font-normal text-zinc-500">bid {px(preco?.bid, d)}</span></p>
          <div className="flex flex-wrap items-center gap-1.5">
            <input inputMode="decimal" aria-label="preço do alerta" value={nivel} onChange={(e) => setNivel(e.target.value)} placeholder="preço"
              className="h-9 w-32 rounded-md border border-white/10 bg-black px-2 font-mono text-white" />
            {preco && [-1, -0.5, 0.5, 1].map((pct) => (
              <button key={pct} onClick={() => setNivel((preco.bid * (1 + pct / 100)).toFixed(d))} className="rounded-md border border-white/10 px-1.5 py-1 text-[10.5px] text-zinc-400 hover:text-white">{pct > 0 ? "+" : ""}{pct}%</button>
            ))}
            <input aria-label="nota do alerta" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="nota (opcional)"
              className="h-9 min-w-0 flex-1 rounded-md border border-white/10 bg-black px-2 text-white placeholder:text-zinc-600" />
            <button disabled={aCriar} onClick={() => void criar()} className="h-9 rounded-md bg-[#D2A63C] px-3 font-bold text-black disabled:opacity-40">{aCriar ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}</button>
          </div>
          {lado && <p className="text-[10.5px] text-zinc-500">Dispara quando o bid {lado === "acima" ? "subir" : "descer"} até {n}.</p>}
          {erro && <p className="text-[11px] text-rose-300">{erro}</p>}
        </div>
      )}
      {!podeCriar && <p className="text-[11px] text-zinc-500">Os alertas são do dono da conta (o push vai para o telemóvel dele).</p>}
      {estado.erro && <p className="text-[11px] text-amber-300">{estado.erro}</p>}
      {estado.alertas == null ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#D2A63C]" /> : estado.alertas.length === 0 ? (
        <p className="p-3 text-center text-zinc-500">Sem alertas.</p>
      ) : (
        <div className="divide-y divide-white/5 rounded-lg border border-white/5">
          {estado.alertas.map((a) => (
            <div key={a.id} className={`flex items-center gap-2 px-2.5 py-2 ${a.ativo ? "" : "opacity-60"}`}>
              {a.ativo ? <Bell className="h-3.5 w-3.5 text-amber-300" /> : <BellOff className="h-3.5 w-3.5 text-zinc-500" />}
              <button onClick={() => onSelecionarSimbolo(a.symbol)} className="min-w-0 flex-1 text-left">
                <span className="font-semibold text-white">{a.symbol}</span> <span className="text-zinc-400">{a.condicao === "acima" ? "≥" : "≤"}</span> <span className="font-mono">{a.preco}</span>
                <span className="block truncate text-[10.5px] text-zinc-500">
                  {a.ativo ? "activo" : `disparou ${a.disparado_em ? new Date(a.disparado_em).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : ""}${a.preco_disparo ? ` @ ${a.preco_disparo}` : ""}`}{a.nota ? ` · ${a.nota}` : ""}
                </span>
              </button>
              {podeCriar && <button onClick={() => void apagar(a.id)} aria-label="apagar alerta" className="text-zinc-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

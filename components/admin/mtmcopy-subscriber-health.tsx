"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { adminApiCall } from "@/lib/admin-helpers"
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react"

/**
 * Saúde das ligações. Cada regra que aqui aparece nasceu de um defeito real que custou ou podia
 * ter custado dinheiro — este painel existe para que o próximo apareça antes de acontecer.
 */

interface Problema { gravidade: "grave" | "aviso"; texto: string }
interface Linha {
  id: string; label: string; email: string | null; nome: string | null
  purpose: string | null; metodo: string | null; estrategia: string | null
  grupos: string[]; lote: string; risco: number; propFirm: string | null
  mt5: string | null; ativa: boolean; problemas: Problema[]
  /** Lidos ao vivo na MetaApi. Só nesta rota, que é de admin. */
  saldo: number | null; equity: number | null; moeda: string | null; mt5Login: string | null
}
interface Resposta { total: number; graves: number; avisos: number; saudaveis: number; linhas: Linha[] }

export default function MtmcopySubscriberHealth() {
  const [d, setD] = useState<Resposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await adminApiCall<Resposta>("/api/admin/mtmcopy/subscriber-health")
    if (r.success && r.data) { setD(r.data); setErro(null) } else setErro(r.error ?? "falhou")
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  /** Pausar/retomar a cópia deste subscriber (is_active + subscrição CopyFactory). */
  const toggle = async (l: Linha) => {
    setBusy(l.id)
    const r = await adminApiCall<{ ok: boolean }>("/api/admin/mtmcopy/subscriber-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: l.id, action: l.ativa ? "pause" : "resume" }),
    })
    if (!r.success) setErro(r.error ?? "falhou")
    await load()
    setBusy(null)
  }

  if (loading && !d) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" /></div>
  if (erro) return <p className="text-sm text-red-400">{erro}</p>
  if (!d) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-zinc-700 text-zinc-400">{d.total} ligações</Badge>
        {d.graves > 0 && <Badge className="bg-red-500/15 text-red-300">⛔ {d.graves} com problema grave</Badge>}
        {d.avisos > 0 && <Badge className="bg-amber-500/15 text-amber-300">⚠️ {d.avisos} com aviso</Badge>}
        {d.saudaveis > 0 && <Badge className="bg-emerald-500/15 text-emerald-300">✓ {d.saudaveis} sem problemas</Badge>}
        <Button size="sm" variant="outline" onClick={load} className="border-zinc-700 ml-auto h-8">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="space-y-2">
        {d.linhas.map((l) => {
          const grave = l.problemas.some((p) => p.gravidade === "grave")
          const aviso = !grave && l.problemas.length > 0
          return (
            <div key={l.id}
              className={`rounded-xl border p-3.5 ${
                !l.ativa ? "border-zinc-800 bg-zinc-950/30 opacity-70"
                : grave ? "border-red-500/40 bg-red-500/[0.04]"
                : aviso ? "border-amber-500/30 bg-amber-500/[0.03]"
                : "border-zinc-800 bg-zinc-950/50"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    {grave ? <ShieldAlert className="w-3.5 h-3.5 inline mr-1.5 text-red-400" />
                      : aviso ? <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 text-amber-400" />
                      : <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 text-emerald-400" />}
                    {l.label}
                  </p>
                  <p className="text-xs text-zinc-500 font-mono">
                    {l.email ?? l.nome ?? "—"}
                    {l.mt5Login && <span className="text-zinc-600"> · {l.mt5Login}</span>}
                  </p>
                  {/*
                    O SALDO e a EQUITY ao lado do nome, e não numa coluna ao fundo: a pergunta
                    «esta conta tem com que negociar?» faz-se a olhar para a linha, não a
                    procurar. Equity abaixo do saldo é posição aberta em perda — mostra-se a
                    vermelho porque é o que distingue uma conta a trabalhar de uma a afundar.
                  */}
                  {l.saldo != null && (
                    <p className="mt-1 font-mono text-xs">
                      <span className={l.saldo > 0 ? "text-zinc-300" : "text-red-400"}>
                        {l.saldo.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} {l.moeda ?? ""}
                      </span>
                      {l.equity != null && Math.abs(l.equity - l.saldo) >= 0.01 && (
                        <span className={l.equity < l.saldo ? "text-red-400" : "text-emerald-400"}>
                          {" "}· equity {l.equity.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">{l.purpose === "tap_to_trade" ? "T2T" : "MTM Copy"}</Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                    {l.estrategia ? `estratégia ${l.estrategia}` : l.grupos.length ? l.grupos.join("+") : "sem fonte"}
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">lote {l.lote}</Badge>
                  {l.risco > 0 && <Badge variant="outline" className="border-zinc-700 text-zinc-400">risco {l.risco}%</Badge>}
                  {l.propFirm && <Badge className="bg-violet-500/15 text-violet-300">{l.propFirm}</Badge>}
                  <Badge variant="outline" className={l.mt5 === "connected" ? "border-emerald-700 text-emerald-400" : "border-red-700 text-red-400"}>
                    {l.mt5 ?? "—"}
                  </Badge>
                  {!l.ativa && <Badge className="bg-zinc-500/15 text-zinc-300">⏸ pausada</Badge>}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === l.id}
                    onClick={() => toggle(l)}
                    className={`h-6 px-2 text-[10px] ${l.ativa ? "border-red-700 text-red-400 hover:bg-red-500/10" : "border-emerald-700 text-emerald-400 hover:bg-emerald-500/10"}`}
                  >
                    {busy === l.id ? "…" : l.ativa ? "Pausar cópia" : "Retomar"}
                  </Button>
                </div>
              </div>
              {l.problemas.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {l.problemas.map((p, i) => (
                    <li key={i} className={`text-xs ${p.gravidade === "grave" ? "text-red-300" : "text-amber-300"}`}>
                      {p.gravidade === "grave" ? "⛔" : "⚠️"} {p.texto}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

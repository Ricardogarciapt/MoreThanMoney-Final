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
  mt5: string | null; problemas: Problema[]
}
interface Resposta { total: number; graves: number; avisos: number; saudaveis: number; linhas: Linha[] }

export default function MtmcopySubscriberHealth() {
  const [d, setD] = useState<Resposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await adminApiCall<Resposta>("/api/admin/mtmcopy/subscriber-health")
    if (r.success && r.data) { setD(r.data); setErro(null) } else setErro(r.error ?? "falhou")
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

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
                grave ? "border-red-500/40 bg-red-500/[0.04]"
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
                  <p className="text-xs text-zinc-500 font-mono">{l.email ?? l.nome ?? "—"}</p>
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

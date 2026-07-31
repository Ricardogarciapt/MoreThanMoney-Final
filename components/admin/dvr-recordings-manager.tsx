"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, Film, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react"

// Explorador das gravações DVR (admin): listar todos os educadores, download do original (PT)
// e do multi-áudio (PT + dobragens), preparar montagem, e apagar do servidor.

type Rec = {
  id: string
  educatorName: string
  status: string
  langs: string[]
  baseUrl: string | null
  multiUrl: string | null
  sizeBytes: number | null
  durationS: number | null
  error: string | null
  updatedAt: string
}

function human(bytes?: number | null) {
  if (!bytes) return ""
  const mb = bytes / 1e6
  return mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
}
function dur(s?: number | null) {
  if (!s) return ""
  return `${Math.floor(s / 60)}m${Math.round(s % 60).toString().padStart(2, "0")}`
}
const STATUS_LABEL: Record<string, string> = {
  recorded: "Gravada",
  pending: "Na fila…",
  assembling: "A montar áudio…",
  ready: "Multi-áudio pronto",
  delete_requested: "A apagar…",
  deleting: "A apagar…",
  error: "Erro",
}

export default function DvrRecordingsManager() {
  const [recs, setRecs] = useState<Rec[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/live-sessions/dvr", { credentials: "same-origin" })
      const j = await r.json()
      setRecs(j.recordings ?? [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // poll enquanto houver alguma a montar/apagar
  useEffect(() => {
    const active = recs.some((r) => ["pending", "assembling", "delete_requested", "deleting"].includes(r.status))
    if (active && !timer.current) timer.current = setInterval(load, 4000)
    else if (!active && timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
    return () => {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
    }
  }, [recs, load])

  const act = async (jobId: string, action: string) => {
    setBusyId(jobId)
    try {
      await fetch("/api/admin/live-sessions/dvr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, jobId }),
      })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-xl border border-sky-900/40 bg-gradient-to-br from-gray-950 to-black p-4">
      <div className="mb-3 flex items-center gap-2">
        <Film className="h-5 w-5 text-sky-300" />
        <h3 className="text-base font-semibold text-sky-200">Gravações DVR</h3>
        <span className="text-xs text-gray-500">({recs.length})</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto border-gray-700 text-gray-300"
          onClick={() => load()}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-500">A carregar…</p>
      ) : recs.length === 0 ? (
        <p className="text-xs text-gray-500">Sem gravações. As sessões ficam aqui após serem transmitidas.</p>
      ) : (
        <div className="space-y-2">
          {recs.map((r) => {
            const assembling = r.status === "pending" || r.status === "assembling"
            const deleting = r.status === "delete_requested" || r.status === "deleting"
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-800/70 bg-black/30 px-3 py-2"
              >
                <div className="min-w-[140px]">
                  <p className="text-sm text-gray-200">{r.educatorName}</p>
                  <p className="text-[11px] text-gray-500">
                    {STATUS_LABEL[r.status] || r.status}
                    {r.sizeBytes ? ` · ${human(r.sizeBytes)}` : ""}
                    {r.durationS ? ` · ${dur(r.durationS)}` : ""}
                  </p>
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {assembling && <Loader2 className="h-4 w-4 animate-spin text-sky-300" />}
                  {r.baseUrl && (
                    <a
                      href={r.baseUrl}
                      download
                      className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-white/5"
                    >
                      <Download className="h-3.5 w-3.5" /> Original (PT)
                    </a>
                  )}
                  {r.status === "ready" && r.multiUrl ? (
                    <a
                      href={r.multiUrl}
                      download
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
                    >
                      <Download className="h-3.5 w-3.5" /> Multi-áudio ({r.langs.length + 1} faixas)
                    </a>
                  ) : (
                    !deleting && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === r.id || assembling}
                        className="bg-sky-700 text-white hover:bg-sky-600"
                        onClick={() => act(r.id, "prepare")}
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        {assembling ? "A preparar…" : "Preparar multi-áudio"}
                      </Button>
                    )
                  )}
                  {!deleting && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.id}
                      className="border-red-800/60 text-red-300 hover:bg-red-950/30"
                      onClick={() => {
                        if (confirm(`Apagar a gravação de ${r.educatorName} do servidor?`)) act(r.id, "delete")
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {r.status === "error" && r.error && (
                  <p className="w-full text-[11px] text-red-300">Erro: {r.error}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

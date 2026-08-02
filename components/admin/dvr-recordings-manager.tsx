"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  ChevronDown,
  ChevronRight,
  Download,
  Film,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Sparkles,
  Subtitles,
  Trash2,
  Youtube,
} from "lucide-react"

// Explorador das gravações DVR (admin) em árvore de pastas: Academia → Educador → Sala.
// Uma gravação por sala; download do original (PT), multi-áudio, legendas (VTT/SRT) e
// upload não-listado para o YouTube (quando o connector está configurado).

type Sub = { lang: string; vtt: string; srt: string }
type Rec = {
  id: string
  educatorName: string
  streamTitle: string
  academyName: string
  academySlug: string
  status: string
  langs: string[]
  baseUrl: string | null
  multiUrl: string | null
  subtitleLangs: string[]
  subtitles: Sub[]
  youtubeStatus: string | null
  youtubeVideoUrl: string | null
  youtubePlaylistUrl: string | null
  youtubeError: string | null
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
const YT_LABEL: Record<string, string> = {
  pending: "YouTube na fila…",
  uploading: "A enviar p/ YouTube…",
  done: "No YouTube",
  error: "Erro YouTube",
}

export default function DvrRecordingsManager() {
  const [recs, setRecs] = useState<Rec[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [youtubeEnabled, setYoutubeEnabled] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/live-sessions/dvr", { credentials: "same-origin" })
      const j = await r.json()
      setRecs(j.recordings ?? [])
      setYoutubeEnabled(Boolean(j.youtubeEnabled))
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // poll enquanto houver alguma a montar/apagar/enviar
  useEffect(() => {
    const active = recs.some(
      (r) =>
        ["pending", "assembling", "delete_requested", "deleting"].includes(r.status) ||
        ["pending", "uploading"].includes(r.youtubeStatus || ""),
    )
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

  // Árvore: Academia → Educador → gravações (salas)
  const tree = useMemo(() => {
    const byAcademy: Record<string, Record<string, Rec[]>> = {}
    for (const r of recs) {
      const a = r.academyName || "Sem academia"
      const e = r.educatorName || "—"
      ;(byAcademy[a] ||= {})[e] ||= []
      byAcademy[a][e].push(r)
    }
    return byAcademy
  }, [recs])

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  return (
    <div className="rounded-xl border border-sky-900/40 bg-gradient-to-br from-gray-950 to-black p-4">
      <div className="mb-3 flex items-center gap-2">
        <Film className="h-5 w-5 text-sky-300" />
        <h3 className="text-base font-semibold text-sky-200">Gravações DVR</h3>
        <span className="text-xs text-gray-500">({recs.length} · 1 por sala)</span>
        {youtubeEnabled && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-950/40 px-2 py-0.5 text-[10px] font-medium text-red-300">
            <Youtube className="h-3 w-3" /> YouTube ligado
          </span>
        )}
        <Button type="button" variant="outline" size="sm" className="ml-auto border-gray-700 text-gray-300" onClick={() => load()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-500">A carregar…</p>
      ) : recs.length === 0 ? (
        <p className="text-xs text-gray-500">Sem gravações. As sessões ficam aqui após serem transmitidas.</p>
      ) : (
        <div className="space-y-1">
          {Object.entries(tree).map(([academy, educators]) => {
            const aKey = `a:${academy}`
            const aOpen = open[aKey] ?? true
            const aCount = Object.values(educators).reduce((n, arr) => n + arr.length, 0)
            return (
              <div key={aKey} className="rounded-lg border border-gray-800/60 bg-black/20">
                <button
                  type="button"
                  onClick={() => toggle(aKey)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-sky-100 hover:bg-white/5"
                >
                  {aOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {aOpen ? <FolderOpen className="h-4 w-4 text-[#D2A63C]" /> : <Folder className="h-4 w-4 text-[#D2A63C]" />}
                  {academy}
                  <span className="text-[11px] font-normal text-gray-500">({aCount})</span>
                </button>

                {aOpen &&
                  Object.entries(educators).map(([educator, list]) => {
                    const eKey = `${aKey}/e:${educator}`
                    const eOpen = open[eKey] ?? true
                    return (
                      <div key={eKey} className="ml-4 border-l border-gray-800/50">
                        <button
                          type="button"
                          onClick={() => toggle(eKey)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-gray-300 hover:bg-white/5"
                        >
                          {eOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {eOpen ? <FolderOpen className="h-3.5 w-3.5 text-sky-400" /> : <Folder className="h-3.5 w-3.5 text-sky-400" />}
                          {educator}
                          <span className="text-[10px] font-normal text-gray-500">({list.length})</span>
                        </button>

                        {eOpen && (
                          <div className="ml-4 space-y-2 pb-2 pr-2">
                            {list.map((r) => (
                              <RecordingRow key={r.id} r={r} busyId={busyId} youtubeEnabled={youtubeEnabled} act={act} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RecordingRow({
  r,
  busyId,
  youtubeEnabled,
  act,
}: {
  r: Rec
  busyId: string | null
  youtubeEnabled: boolean
  act: (jobId: string, action: string) => void
}) {
  const assembling = r.status === "pending" || r.status === "assembling"
  const deleting = r.status === "delete_requested" || r.status === "deleting"
  const ytBusy = r.youtubeStatus === "pending" || r.youtubeStatus === "uploading"

  return (
    <div className="rounded-lg border border-gray-800/70 bg-black/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[150px]">
          <p className="flex items-center gap-1.5 text-sm text-gray-200">
            <Film className="h-3.5 w-3.5 text-gray-500" /> {r.streamTitle}
          </p>
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
              <Download className="h-3.5 w-3.5" /> Multi-áudio ({r.langs.length + 1})
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
                {assembling ? "A preparar…" : "Preparar áudio+legendas"}
              </Button>
            )
          )}

          {/* YouTube */}
          {r.youtubeStatus === "done" && r.youtubeVideoUrl ? (
            <a
              href={r.youtubeVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-red-800/60 px-2 py-1 text-xs text-red-300 hover:bg-red-950/30"
            >
              <Youtube className="h-3.5 w-3.5" /> Ver no YouTube
            </a>
          ) : ytBusy ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-red-900/40 px-2 py-1 text-[11px] text-red-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {YT_LABEL[r.youtubeStatus || ""]}
            </span>
          ) : (
            youtubeEnabled &&
            r.status === "ready" &&
            !deleting && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === r.id}
                className="border-red-800/60 text-red-300 hover:bg-red-950/30"
                onClick={() => act(r.id, "youtube")}
              >
                <Youtube className="mr-1.5 h-3.5 w-3.5" /> Enviar p/ YouTube
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
                if (confirm(`Apagar a gravação "${r.streamTitle}" do servidor?`)) act(r.id, "delete")
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Legendas (sidecar) */}
      {r.subtitles?.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-800/50 pt-2">
          <Subtitles className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-[11px] text-gray-500">Legendas:</span>
          {r.subtitles.map((s) => (
            <span key={s.lang} className="inline-flex items-center gap-1">
              <a
                href={s.vtt}
                download
                className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] uppercase text-gray-300 hover:bg-white/5"
              >
                {s.lang} vtt
              </a>
              <a
                href={s.srt}
                download
                className="rounded border border-gray-800 px-1.5 py-0.5 text-[10px] uppercase text-gray-400 hover:bg-white/5"
              >
                srt
              </a>
            </span>
          ))}
        </div>
      )}

      {r.status === "error" && r.error && <p className="mt-1 text-[11px] text-red-300">Erro: {r.error}</p>}
      {r.youtubeStatus === "error" && r.youtubeError && (
        <p className="mt-1 text-[11px] text-red-300">Erro YouTube: {r.youtubeError}</p>
      )}
    </div>
  )
}

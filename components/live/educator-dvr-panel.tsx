"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, Film, Loader2, Trash2, Sparkles, Subtitles, Youtube } from "lucide-react"

// Painel DVR do studio: uma gravação por SALA (o educador pode ter várias salas).
// Fluxo: gravada → preparar multi-áudio+legendas → download → confirmar → apaga no VPS.

const DVR_BASE = "https://stream.morethanmoney.pt/dvr"
const DUB_OPTIONS: [string, string][] = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
]
const SUB_OPTIONS: [string, string][] = [
  ["pt", "PT"],
  ["en", "EN"],
  ["es", "ES"],
  ["fr", "FR"],
  ["de", "DE"],
]

type Job = {
  id: string
  stream_id: string
  status: string
  langs: string[]
  base_file: string | null
  multi_file: string | null
  download_url: string | null
  size_bytes: number | null
  duration_s: number | null
  error: string | null
  subtitle_langs: string[]
  youtube_status: string | null
  youtube_video_url: string | null
  youtube_playlist_url: string | null
  youtube_error: string | null
  stream?: { id: string; title: string } | null
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
const subUrl = (streamId: string, lang: string, fmt: "vtt" | "srt") =>
  `/api/live-sessions/dvr/${streamId}/subtitles/${lang}.${fmt}`

export default function EducatorDvrPanel() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [youtubeEnabled, setYoutubeEnabled] = useState(false)
  const [dubPick, setDubPick] = useState<Record<string, string[]>>({})
  const [subPick, setSubPick] = useState<Record<string, string[]>>({})
  const [ytPick, setYtPick] = useState<Record<string, boolean>>({})
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/live-sessions/dvr", { credentials: "same-origin" })
      const j = await r.json()
      setJobs(j.jobs ?? [])
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

  useEffect(() => {
    const active = jobs.some(
      (j) =>
        ["pending", "assembling", "delete_requested", "deleting"].includes(j.status) ||
        ["pending", "uploading"].includes(j.youtube_status || ""),
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
  }, [jobs, load])

  const act = async (streamId: string, action: string, extra?: Record<string, unknown>) => {
    setBusy(streamId)
    try {
      await fetch("/api/live-sessions/dvr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, streamId, ...(extra || {}) }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const dubOf = (s: string) => dubPick[s] ?? ["en", "es", "fr", "de"]
  const subOf = (s: string) => subPick[s] ?? ["pt", "en", "es", "fr", "de"]
  const ytOf = (s: string) => ytPick[s] ?? false
  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
    getter: (s: string) => string[],
    streamId: string,
    code: string,
  ) => {
    const cur = getter(streamId)
    setter((p) => ({ ...p, [streamId]: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] }))
  }

  return (
    <Card className="border border-sky-900/40 bg-gradient-to-br from-gray-950 to-black">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-sky-300">
          <Film className="h-4 w-4" />
          Gravações das sessões (DVR)
        </CardTitle>
        <p className="text-xs font-normal text-gray-500">
          Cada sala guarda <strong className="text-gray-400">uma gravação</strong>. Prepara um único ficheiro{" "}
          <strong className="text-gray-400">multi-áudio + legendas</strong> (PT + traduções dobradas na tua voz).
          Após o download confirmas e o servidor apaga.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-xs text-gray-500">A carregar…</p>
        ) : jobs.filter((j) => j.base_file).length === 0 ? (
          <p className="text-xs text-gray-500">
            Sem gravação disponível. Transmite uma sessão — fica aqui automaticamente quando terminares.
          </p>
        ) : (
          jobs
            .filter((j) => j.base_file)
            .map((job) => {
              const streamId = job.stream_id
              const status = job.status
              const assembling = status === "pending" || status === "assembling"
              const deleting = status === "delete_requested" || status === "deleting"
              const ytBusy = job.youtube_status === "pending" || job.youtube_status === "uploading"
              return (
                <div key={job.id} className="space-y-2 rounded-lg border border-gray-800/70 bg-black/20 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-gray-200">
                    <Film className="h-3.5 w-3.5 text-gray-500" /> {job.stream?.title || "Sala"}
                  </p>

                  {/* Original sempre disponível */}
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-800/70 bg-black/30 px-3 py-2">
                    <span className="text-xs text-gray-300">Original (PT)</span>
                    <a
                      href={`${DVR_BASE}/${job.base_file}`}
                      className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:text-sky-200"
                      download
                    >
                      <Download className="h-3.5 w-3.5" /> Descarregar
                    </a>
                    {!deleting && (
                      <button
                        type="button"
                        disabled={busy === streamId}
                        onClick={() => {
                          if (confirm("Apagar esta gravação do servidor? Não é reversível.")) act(streamId, "confirm_delete")
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-300 hover:text-red-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Apagar
                      </button>
                    )}
                  </div>

                  {status === "recorded" && (
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">Idiomas dobrados a incluir</p>
                      <div className="flex flex-wrap gap-3">
                        {DUB_OPTIONS.map(([code, name]) => (
                          <label key={code} className="flex items-center gap-1.5 text-xs text-gray-300">
                            <input
                              type="checkbox"
                              checked={dubOf(streamId).includes(code)}
                              onChange={() => toggle(setDubPick, dubOf, streamId, code)}
                            />
                            {name}
                          </label>
                        ))}
                      </div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">Legendas a incluir</p>
                      <div className="flex flex-wrap gap-3">
                        {SUB_OPTIONS.map(([code, name]) => (
                          <label key={code} className="flex items-center gap-1.5 text-xs text-gray-300">
                            <input
                              type="checkbox"
                              checked={subOf(streamId).includes(code)}
                              onChange={() => toggle(setSubPick, subOf, streamId, code)}
                            />
                            {name}
                          </label>
                        ))}
                      </div>
                      {youtubeEnabled && (
                        <label className="flex items-center gap-1.5 text-xs text-red-300">
                          <input type="checkbox" checked={ytOf(streamId)} onChange={() => setYtPick((p) => ({ ...p, [streamId]: !ytOf(streamId) }))} />
                          <Youtube className="h-3.5 w-3.5" /> Enviar para o YouTube (não-listado) → playlist
                        </label>
                      )}
                      <Button
                        type="button"
                        disabled={busy === streamId}
                        className="bg-sky-700 text-white hover:bg-sky-600"
                        onClick={() => act(streamId, "prepare", { langs: dubOf(streamId), subtitleLangs: subOf(streamId), youtube: ytOf(streamId) })}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        Preparar multi-áudio + legendas
                      </Button>
                    </div>
                  )}

                  {assembling && (
                    <div className="flex items-center gap-2 rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-2 text-xs text-sky-200">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      A traduzir, montar as faixas de áudio na tua voz e embutir legendas… podes sair, continua no servidor.
                    </div>
                  )}

                  {status === "ready" && job.download_url && (
                    <div className="space-y-2 rounded-lg border border-emerald-900/40 bg-emerald-950/15 px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-emerald-200">
                          Pronto — {job.langs.length + 1} faixas {job.size_bytes ? `· ${human(job.size_bytes)}` : ""}{" "}
                          {job.duration_s ? `· ${dur(job.duration_s)}` : ""}
                        </span>
                        <a
                          href={job.download_url}
                          className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
                          download
                        >
                          <Download className="h-3.5 w-3.5" /> Descarregar multi-áudio
                        </a>
                      </div>

                      {/* Legendas sidecar */}
                      {(job.subtitle_langs?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Subtitles className="h-3.5 w-3.5 text-gray-500" />
                          {job.subtitle_langs.map((l) => (
                            <a
                              key={l}
                              href={subUrl(streamId, l, "vtt")}
                              download
                              className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] uppercase text-gray-300 hover:bg-white/5"
                            >
                              {l} vtt
                            </a>
                          ))}
                        </div>
                      )}

                      {/* YouTube */}
                      {job.youtube_status === "done" && job.youtube_video_url ? (
                        <a href={job.youtube_video_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-red-300 hover:text-red-200">
                          <Youtube className="h-3.5 w-3.5" /> Ver no YouTube
                        </a>
                      ) : ytBusy ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-red-300">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> A enviar para o YouTube…
                        </span>
                      ) : youtubeEnabled ? (
                        <Button type="button" size="sm" variant="outline" disabled={busy === streamId} className="border-red-800/60 text-red-300 hover:bg-red-950/30" onClick={() => act(streamId, "prepare", { langs: job.langs, subtitleLangs: job.subtitle_langs, youtube: true })}>
                          <Youtube className="mr-1.5 h-3.5 w-3.5" /> Enviar para o YouTube
                        </Button>
                      ) : null}

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy === streamId}
                          className="border-red-800/60 text-red-300 hover:bg-red-950/30"
                          onClick={() => {
                            if (confirm("Confirmas que já descarregaste? A gravação será apagada do servidor.")) act(streamId, "confirm_delete")
                          }}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Já descarreguei — apagar
                        </Button>
                      </div>
                    </div>
                  )}

                  {deleting && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> A apagar a gravação do servidor…
                    </div>
                  )}

                  {status === "error" && (
                    <div className="space-y-2 rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2">
                      <p className="text-xs text-red-300">Falhou a montagem: {job.error || "erro"}</p>
                      <Button type="button" size="sm" disabled={busy === streamId} className="bg-sky-700 text-white hover:bg-sky-600" onClick={() => act(streamId, "prepare", { langs: job.langs.length ? job.langs : dubOf(streamId), subtitleLangs: subOf(streamId) })}>
                        Tentar de novo
                      </Button>
                    </div>
                  )}
                </div>
              )
            })
        )}
      </CardContent>
    </Card>
  )
}

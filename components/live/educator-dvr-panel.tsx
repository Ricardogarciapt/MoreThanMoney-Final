"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, Film, Loader2, Trash2, Sparkles } from "lucide-react"

// Painel DVR do studio: uma gravação por educador.
// Fluxo: gravada → preparar multi-áudio (PT+EN/ES/DE) → download → confirmar → apaga no VPS.

const DVR_BASE = "https://stream.morethanmoney.pt/dvr"
const DUB_OPTIONS: [string, string][] = [
  ["en", "English"],
  ["es", "Español"],
  ["de", "Deutsch"],
]

type Job = {
  stream_id: string
  status: string
  langs: string[]
  base_file: string | null
  multi_file: string | null
  download_url: string | null
  size_bytes: number | null
  duration_s: number | null
  error: string | null
}

function human(bytes?: number | null) {
  if (!bytes) return ""
  const mb = bytes / 1e6
  return mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
}
function dur(s?: number | null) {
  if (!s) return ""
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}m${sec.toString().padStart(2, "0")}`
}

export default function EducatorDvrPanel() {
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<string[]>(["en", "es", "de"])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/live-sessions/dvr", { credentials: "same-origin" })
      const j = await r.json()
      setJob(j.job ?? null)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // poll enquanto está a montar/apagar
  useEffect(() => {
    const active = job && ["pending", "assembling", "delete_requested", "deleting"].includes(job.status)
    if (active && !timer.current) {
      timer.current = setInterval(load, 4000)
    } else if (!active && timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
    return () => {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
    }
  }, [job, load])

  const act = async (action: string, langs?: string[]) => {
    setBusy(true)
    try {
      await fetch("/api/live-sessions/dvr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, langs }),
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const togglePick = (code: string) =>
    setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]))

  const status = job?.status
  const assembling = status === "pending" || status === "assembling"
  const deleting = status === "delete_requested" || status === "deleting"

  return (
    <Card className="border border-sky-900/40 bg-gradient-to-br from-gray-950 to-black">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-sky-300">
          <Film className="h-4 w-4" />
          Gravação da sessão (DVR)
        </CardTitle>
        <p className="text-xs font-normal text-gray-500">
          Cada sessão é gravada no servidor. Prepara o download num único ficheiro{" "}
          <strong className="text-gray-400">multi-áudio</strong> (PT + traduções dobradas) para o
          YouTube. Após o download confirmas e o servidor apaga — guardamos só{" "}
          <strong className="text-gray-400">uma gravação</strong>.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-xs text-gray-500">A carregar…</p>
        ) : !job || !job.base_file ? (
          <p className="text-xs text-gray-500">
            Sem gravação disponível. Transmite uma sessão — fica aqui automaticamente quando terminares.
          </p>
        ) : (
          <>
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
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Apagar a tua gravação do servidor? Não é reversível.")) act("confirm_delete")
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-300 hover:text-red-200"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Apagar do servidor
                </button>
              )}
            </div>

            {status === "recorded" && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Idiomas dobrados a incluir</p>
                <div className="flex flex-wrap gap-3">
                  {DUB_OPTIONS.map(([code, name]) => (
                    <label key={code} className="flex items-center gap-1.5 text-xs text-gray-300">
                      <input type="checkbox" checked={picked.includes(code)} onChange={() => togglePick(code)} />
                      {name}
                    </label>
                  ))}
                </div>
                <Button
                  type="button"
                  disabled={busy}
                  className="bg-sky-700 text-white hover:bg-sky-600"
                  onClick={() => act("prepare", picked)}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Preparar download multi-áudio
                </Button>
              </div>
            )}

            {assembling && (
              <div className="flex items-center gap-2 rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-2 text-xs text-sky-200">
                <Loader2 className="h-4 w-4 animate-spin" />
                A traduzir e a montar as faixas de áudio na tua voz… podes sair, continua no servidor.
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
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    className="border-red-800/60 text-red-300 hover:bg-red-950/30"
                    onClick={() => {
                      if (confirm("Confirmas que já descarregaste? A gravação será apagada do servidor.")) {
                        act("confirm_delete")
                      }
                    }}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Já descarreguei — apagar do servidor
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
                <Button type="button" size="sm" disabled={busy} className="bg-sky-700 text-white hover:bg-sky-600" onClick={() => act("prepare", job.langs.length ? job.langs : picked)}>
                  Tentar de novo
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

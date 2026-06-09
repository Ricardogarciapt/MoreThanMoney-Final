"use client"

import { useEffect, useRef, useState } from "react"
import { Radio, Wifi, Activity, Users, Clock, RefreshCw, ExternalLink, Server, Video } from "lucide-react"

const SRS_API = "https://stream.morethanmoney.pt/srs-api/v1"
const DASHBOARD_URL = "https://stream.morethanmoney.pt/dashboard/"

type SrsStream = {
  id: string
  name: string
  vhost: string
  app: string
  stream: string
  live_ms: number
  clients: number
  frames: number
  send_bytes: number
  recv_bytes: number
  kbps: { recv_30s: number; send_30s: number }
  publish: { active: boolean; cid: string }
}

type SrsApiResponse = {
  code: number
  server: string
  streams: SrsStream[]
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function StreamVpsPanel() {
  const [streams, setStreams] = useState<SrsStream[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [view, setView] = useState<"stats" | "dashboard">("stats")
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchStreams = async () => {
    try {
      const res = await fetch(`${SRS_API}/streams/`, { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: SrsApiResponse = await res.json()
      setStreams(data.streams || [])
      setError(null)
      setLastUpdate(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao ligar ao VPS")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStreams()
    intervalRef.current = setInterval(fetchStreams, 10000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const activeStreams = streams.filter((s) => s.publish?.active)
  const totalClients = streams.reduce((acc, s) => acc + (s.clients || 0), 0)
  const totalKbps = streams.reduce((acc, s) => acc + (s.kbps?.recv_30s || 0), 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/15 ring-1 ring-green-500/30">
            <Radio className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Stream VPS</h2>
            <p className="text-xs text-gray-500">stream.morethanmoney.pt · SRS v5</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-gray-600">
              Atualizado às {lastUpdate.toLocaleTimeString("pt-PT")}
            </span>
          )}
          <button
            onClick={fetchStreams}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Atualizar
          </button>
          <a
            href={DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 hover:text-green-300 text-xs transition-colors border border-green-500/20"
          >
            <ExternalLink className="h-3 w-3" />
            Dashboard VPS
          </a>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 p-1 rounded-lg bg-white/5 w-fit">
        <button
          onClick={() => setView("stats")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === "stats" ? "bg-[#D2A63C]/20 text-[#D2A63C]" : "text-gray-400 hover:text-white"
          }`}
        >
          Estatísticas
        </button>
        <button
          onClick={() => setView("dashboard")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === "dashboard" ? "bg-[#D2A63C]/20 text-[#D2A63C]" : "text-gray-400 hover:text-white"
          }`}
        >
          Dashboard HTML
        </button>
      </div>

      {view === "dashboard" ? (
        <div className="rounded-xl overflow-hidden border border-[#D2A63C]/15" style={{ height: "calc(100vh - 280px)" }}>
          <iframe
            src={DASHBOARD_URL}
            className="w-full h-full bg-black"
            title="VPS Dashboard"
          />
        </div>
      ) : (
        <>
          {/* Status indicator */}
          {error ? (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-red-400">VPS inacessível: {error}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3">
              <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm text-green-400">VPS online · {activeStreams.length} stream{activeStreams.length !== 1 ? "s" : ""} activo{activeStreams.length !== 1 ? "s" : ""}</span>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/5 bg-white/3 p-4 space-y-1">
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Video className="h-3.5 w-3.5" />
                Streams activos
              </div>
              <p className="text-2xl font-bold text-white">{activeStreams.length}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/3 p-4 space-y-1">
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Users className="h-3.5 w-3.5" />
                Viewers (HLS)
              </div>
              <p className="text-2xl font-bold text-white">{totalClients}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/3 p-4 space-y-1">
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Activity className="h-3.5 w-3.5" />
                Bitrate entrada
              </div>
              <p className="text-2xl font-bold text-white">{totalKbps} <span className="text-sm font-normal text-gray-500">kbps</span></p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/3 p-4 space-y-1">
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Server className="h-3.5 w-3.5" />
                Total streams
              </div>
              <p className="text-2xl font-bold text-white">{streams.length}</p>
            </div>
          </div>

          {/* Stream list */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
            </div>
          ) : streams.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
              <Wifi className="h-8 w-8 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhum stream activo no momento</p>
              <p className="text-gray-700 text-xs mt-1">Os streams aparecem aqui quando o OBS estiver a transmitir</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Streams</h3>
              {streams.map((stream) => (
                <div
                  key={stream.id}
                  className="rounded-xl border border-white/5 bg-white/3 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${stream.publish?.active ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate font-mono">{stream.stream}</p>
                        <p className="text-xs text-gray-500">{stream.app}</p>
                      </div>
                    </div>
                    <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                      stream.publish?.active
                        ? "bg-green-500/15 text-green-400 border border-green-500/25"
                        : "bg-gray-800 text-gray-500 border border-gray-700"
                    }`}>
                      {stream.publish?.active ? "AO VIVO" : "Parado"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                    <div className="rounded-lg bg-black/30 px-3 py-2">
                      <p className="text-gray-600">Viewers</p>
                      <p className="text-white font-medium mt-0.5">{stream.clients}</p>
                    </div>
                    <div className="rounded-lg bg-black/30 px-3 py-2">
                      <p className="text-gray-600">Bitrate</p>
                      <p className="text-white font-medium mt-0.5">{stream.kbps?.recv_30s || 0} kbps</p>
                    </div>
                    <div className="rounded-lg bg-black/30 px-3 py-2">
                      <p className="text-gray-600">Duração</p>
                      <p className="text-white font-medium mt-0.5">{formatDuration(stream.live_ms)}</p>
                    </div>
                    <div className="rounded-lg bg-black/30 px-3 py-2">
                      <p className="text-gray-600">Recebido</p>
                      <p className="text-white font-medium mt-0.5">{formatBytes(stream.recv_bytes)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <p className="text-xs text-gray-600">HLS:</p>
                    <a
                      href={`https://stream.morethanmoney.pt/hls/${stream.stream}.m3u8`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#D2A63C]/80 hover:text-[#D2A63C] font-mono truncate"
                    >
                      /hls/{stream.stream}.m3u8
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info box */}
          <div className="rounded-xl border border-white/5 bg-white/3 p-4 space-y-2">
            <h4 className="text-xs font-medium text-gray-400 flex items-center gap-2">
              <Server className="h-3.5 w-3.5" />
              Configuração RTMP
            </h4>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex gap-2">
                <span className="text-gray-600 w-24 flex-shrink-0">Servidor:</span>
                <span className="text-green-400">rtmp://16.171.132.245/live</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-600 w-24 flex-shrink-0">Domínio:</span>
                <span className="text-green-400">rtmp://stream.morethanmoney.pt/live</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-600 w-24 flex-shrink-0">HLS base:</span>
                <span className="text-[#D2A63C]/80">https://stream.morethanmoney.pt/hls/</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-600 w-24 flex-shrink-0">Latência:</span>
                <span className="text-gray-300">~5s (fragment=1s, window=4)</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

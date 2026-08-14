"use client"

/**
 * Studio de streaming INTERNO (browser) — F1: compositor Canvas + layers arrastáveis/graváveis.
 * Cenas: Começamos em Breve (+timer), Disclaimer, Câmara+fundo, Ecrã+overlay.
 * Cada layer (câmara, timer, ecrã, imagem) arrasta+redimensiona e GRAVA a posição por educador.
 * F1 NÃO publica ainda (WHIP = F2); é o preview/compositor + captura + persistência (localStorage).
 * Ver memória `internal-streaming-studio`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Camera, Monitor, MonitorX, Save, RotateCcw, Play, Settings2 } from "lucide-react"

const CW = 1280
const CH = 720
const HANDLE = 14 // px (em coords do canvas) das pegas de resize

type LayerType = "camera" | "timer" | "screen" | "title" | "disclaimer"
type Layer = {
  id: string
  type: LayerType
  x: number // 0..1 (fração da largura)
  y: number
  w: number
  h: number
  z: number
  visible: boolean
}
type SceneKey = "soon" | "disclaimer" | "camera" | "screen"
type Scene = { key: SceneKey; label: string; bg: string; layers: Layer[] }

const DEFAULT_SCENES: Scene[] = [
  {
    key: "soon",
    label: "Começamos em Breve",
    bg: "#0a0e1a",
    layers: [
      { id: "soon-title", type: "title", x: 0.08, y: 0.28, w: 0.84, h: 0.24, z: 1, visible: true },
      { id: "soon-timer", type: "timer", x: 0.38, y: 0.58, w: 0.24, h: 0.22, z: 2, visible: true },
    ],
  },
  {
    key: "disclaimer",
    label: "Disclaimer",
    bg: "#0a0e1a",
    layers: [{ id: "disc-text", type: "disclaimer", x: 0.08, y: 0.14, w: 0.84, h: 0.72, z: 1, visible: true }],
  },
  {
    key: "camera",
    label: "Câmara",
    bg: "#0a0e1a",
    layers: [{ id: "cam-full", type: "camera", x: 0.1, y: 0.12, w: 0.8, h: 0.76, z: 1, visible: true }],
  },
  {
    key: "screen",
    label: "Ecrã + Câmara",
    bg: "#0a0e1a",
    layers: [
      { id: "scr-full", type: "screen", x: 0.04, y: 0.06, w: 0.92, h: 0.86, z: 1, visible: true },
      { id: "scr-cam", type: "camera", x: 0.72, y: 0.66, w: 0.24, h: 0.26, z: 2, visible: true },
    ],
  },
]

const STORAGE_KEY = "mtm-internal-studio-layout-v1"

function loadLayout(): Record<string, Layer[]> | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null
    return raw ? (JSON.parse(raw) as Record<string, Layer[]>) : null
  } catch {
    return null
  }
}

export default function InternalStudio() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const camVideoRef = useRef<HTMLVideoElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const timerVideoRef = useRef<HTMLVideoElement | null>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const dragRef = useRef<{ layerId: string; mode: "move" | "resize"; ox: number; oy: number } | null>(null)

  const [scenes, setScenes] = useState<Scene[]>(() => {
    const saved = typeof window !== "undefined" ? loadLayout() : null
    if (!saved) return DEFAULT_SCENES
    return DEFAULT_SCENES.map((s) => ({ ...s, layers: saved[s.key] ?? s.layers }))
  })
  const [activeScene, setActiveScene] = useState<SceneKey>("soon")
  const [selected, setSelected] = useState<string | null>(null)
  const [camOn, setCamOn] = useState(false)
  const [screenOn, setScreenOn] = useState(false)
  const [devices, setDevices] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cams: [], mics: [] })
  const [camId, setCamId] = useState<string>("")
  const [micId, setMicId] = useState<string>("")
  const [showConfig, setShowConfig] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const scene = useMemo(() => scenes.find((s) => s.key === activeScene)!, [scenes, activeScene])

  // ── enumerar dispositivos ──────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setDevices({
        cams: list.filter((d) => d.kind === "videoinput"),
        mics: list.filter((d) => d.kind === "audioinput"),
      })
    } catch {
      /* sem permissão ainda */
    }
  }, [])

  useEffect(() => {
    refreshDevices()
  }, [refreshDevices])

  // ── câmara ─────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      camStreamRef.current?.getTracks().forEach((t) => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camId ? { deviceId: { exact: camId } } : true,
        audio: micId ? { deviceId: { exact: micId } } : true,
      })
      camStreamRef.current = stream
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream
        await camVideoRef.current.play().catch(() => {})
      }
      setCamOn(true)
      setMsg("Câmara ligada")
      refreshDevices()
    } catch (e) {
      setMsg("Erro na câmara: " + (e instanceof Error ? e.message : "acesso negado"))
    }
  }, [camId, micId, refreshDevices])

  const stopCamera = useCallback(() => {
    camStreamRef.current?.getTracks().forEach((t) => t.stop())
    camStreamRef.current = null
    if (camVideoRef.current) camVideoRef.current.srcObject = null
    setCamOn(false)
  }, [])

  // ── partilha de ecrã ───────────────────────────────────────────────────
  const startScreen = useCallback(async () => {
    try {
      const stream = await (navigator.mediaDevices as MediaDevices & {
        getDisplayMedia: (c: DisplayMediaStreamOptions) => Promise<MediaStream>
      }).getDisplayMedia({ video: true, audio: true })
      screenStreamRef.current = stream
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream
        await screenVideoRef.current.play().catch(() => {})
      }
      setScreenOn(true)
      setActiveScene("screen")
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setScreenOn(false)
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null
      })
    } catch (e) {
      setMsg("Partilha cancelada/negada" + (e instanceof Error ? "" : ""))
    }
  }, [])

  const stopScreen = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null
    setScreenOn(false)
  }, [])

  // ── timer video (asset em /studio/timer-5min.webm) ─────────────────────
  useEffect(() => {
    const v = timerVideoRef.current
    if (v) {
      v.loop = true
      v.muted = true
      v.play().catch(() => {})
    }
  }, [])

  // ── persistência ───────────────────────────────────────────────────────
  const persist = useCallback((next: Scene[]) => {
    try {
      const map: Record<string, Layer[]> = {}
      next.forEach((s) => (map[s.key] = s.layers))
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    } catch {
      /* ignora */
    }
  }, [])

  const updateLayer = useCallback(
    (id: string, patch: Partial<Layer>, save = false) => {
      setScenes((prev) => {
        const next = prev.map((s) =>
          s.key === activeScene ? { ...s, layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : s,
        )
        if (save) persist(next)
        return next
      })
    },
    [activeScene, persist],
  )

  const saveLayout = useCallback(() => {
    persist(scenes)
    setMsg("Posições gravadas ✓")
  }, [scenes, persist])

  const resetScene = useCallback(() => {
    const def = DEFAULT_SCENES.find((s) => s.key === activeScene)!
    setScenes((prev) => {
      const next = prev.map((s) => (s.key === activeScene ? { ...s, layers: def.layers.map((l) => ({ ...l })) } : s))
      persist(next)
      return next
    })
  }, [activeScene, persist])

  // ── loop de desenho ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const drawFrameOverlay = () => {
      // Moldura dourada MTM (recriada; trocar por public/studio/frame.png depois)
      ctx.strokeStyle = "#D2A63C"
      ctx.lineWidth = 6
      ctx.strokeRect(24, 24, CW - 48, CH - 48)
      const c = 46
      ctx.lineWidth = 3
      ;[
        [40, 40, 40 + c, 40],
        [40, 40, 40, 40 + c],
        [CW - 40, 40, CW - 40 - c, 40],
        [CW - 40, 40, CW - 40, 40 + c],
        [40, CH - 40, 40 + c, CH - 40],
        [40, CH - 40, 40, CH - 40 - c],
        [CW - 40, CH - 40, CW - 40 - c, CH - 40],
        [CW - 40, CH - 40, CW - 40, CH - 40 - c],
      ].forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      })
      ctx.fillStyle = "#D2A63C"
      ctx.font = "600 22px sans-serif"
      ctx.textBaseline = "top"
      ctx.fillText("MoreThanMoney", 60, 42)
      ctx.textAlign = "right"
      ctx.fillText("morethanmoney.pt", CW - 60, 46)
      ctx.textAlign = "left"
    }

    const drawLayer = (l: Layer) => {
      if (!l.visible) return
      const x = l.x * CW
      const y = l.y * CH
      const w = l.w * CW
      const h = l.h * CH
      if (l.type === "camera" && camVideoRef.current && camStreamRef.current) {
        try { ctx.drawImage(camVideoRef.current, x, y, w, h) } catch { /* not ready */ }
      } else if (l.type === "screen" && screenVideoRef.current && screenStreamRef.current) {
        try { ctx.drawImage(screenVideoRef.current, x, y, w, h) } catch { /* not ready */ }
      } else if (l.type === "timer" && timerVideoRef.current) {
        try { ctx.drawImage(timerVideoRef.current, x, y, w, h) } catch { /* not ready */ }
      } else if (l.type === "title") {
        ctx.fillStyle = "#fff"
        ctx.font = "800 84px sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText("COMEÇAMOS EM BREVE", x + w / 2, y + h / 2)
        ctx.textAlign = "left"
      } else if (l.type === "disclaimer") {
        ctx.fillStyle = "#fff"
        ctx.textAlign = "left"
        ctx.textBaseline = "top"
        ctx.font = "700 40px sans-serif"
        ctx.fillText("Aviso Legal", x, y)
        ctx.font = "400 22px sans-serif"
        const lines = [
          "A MTM é uma plataforma educativa dedicada a fornecer conhecimento sobre os",
          "mercados financeiros. Todo o conteúdo é para fins educativos e de entretenimento",
          "e não constitui aconselhamento financeiro.",
          "",
          "A negociação envolve risco elevado e pode resultar na perda parcial ou total do",
          "capital investido. A MTM não assume responsabilidade pelas decisões de investimento.",
        ]
        lines.forEach((ln, i) => ctx.fillText(ln, x, y + 64 + i * 34))
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.06)"
        ctx.fillRect(x, y, w, h)
      }
      // contorno + pegas se selecionado
      if (selected === l.id) {
        ctx.strokeStyle = "#7C3AED"
        ctx.lineWidth = 3
        ctx.strokeRect(x, y, w, h)
        ctx.fillStyle = "#7C3AED"
        ctx.fillRect(x + w - HANDLE, y + h - HANDLE, HANDLE, HANDLE)
      }
    }

    const render = () => {
      ctx.fillStyle = scene.bg
      ctx.fillRect(0, 0, CW, CH)
      ;[...scene.layers].sort((a, b) => a.z - b.z).forEach(drawLayer)
      drawFrameOverlay()
      rafRef.current = requestAnimationFrame(render)
    }
    render()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [scene, selected])

  // ── interação (arrastar / redimensionar) ───────────────────────────────
  const toCanvas = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!
    const r = canvas.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * CW, y: ((e.clientY - r.top) / r.height) * CH }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toCanvas(e)
    const ordered = [...scene.layers].sort((a, b) => b.z - a.z) // topo primeiro
    for (const l of ordered) {
      const x = l.x * CW, y = l.y * CH, w = l.w * CW, h = l.h * CH
      const onResize = p.x >= x + w - HANDLE && p.x <= x + w && p.y >= y + h - HANDLE && p.y <= y + h
      const inside = p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h
      if (onResize || inside) {
        setSelected(l.id)
        dragRef.current = { layerId: l.id, mode: onResize ? "resize" : "move", ox: p.x - x, oy: p.y - y }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        return
      }
    }
    setSelected(null)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const p = toCanvas(e)
    const l = scene.layers.find((x) => x.id === d.layerId)
    if (!l) return
    if (d.mode === "move") {
      updateLayer(l.id, { x: Math.max(0, Math.min(1 - l.w, (p.x - d.ox) / CW)), y: Math.max(0, Math.min(1 - l.h, (p.y - d.oy) / CH)) })
    } else {
      updateLayer(l.id, { w: Math.max(0.06, Math.min(1 - l.x, (p.x - l.x * CW) / CW)), h: Math.max(0.06, Math.min(1 - l.y, (p.y - l.y * CH) / CH)) })
    }
  }

  const onPointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null
      persist(scenes) // grava ao largar
    }
  }

  useEffect(() => () => {
    camStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  return (
    <div className="space-y-4">
      {/* vídeos escondidos (fontes do compositor) */}
      <video ref={camVideoRef} className="hidden" playsInline muted />
      <video ref={screenVideoRef} className="hidden" playsInline muted />
      <video ref={timerVideoRef} className="hidden" src="/studio/timer-5min.webm" playsInline />

      {msg && <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">{msg}</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        {/* Compositor */}
        <div className="rounded-2xl border border-zinc-800 bg-black p-2">
          <canvas
            ref={canvasRef}
            width={CW}
            height={CH}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="w-full cursor-move rounded-lg"
            style={{ aspectRatio: "16 / 9", touchAction: "none" }}
          />
          <p className="mt-2 px-1 text-xs text-zinc-500">
            Clica num elemento para o selecionar · arrasta para mover · pega no canto para redimensionar · as posições gravam ao largar.
          </p>
        </div>

        {/* Painel de controlo */}
        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="mb-2 text-xs font-medium text-zinc-400">Cenas</p>
            <div className="grid grid-cols-2 gap-1.5">
              {scenes.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setActiveScene(s.key)}
                  className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                    activeScene === s.key ? "bg-[#D2A63C] text-black" : "bg-zinc-800 text-zinc-300 hover:text-white"
                  }`}
                >
                  {s.label}
                </button>
              ))}
              <button onClick={() => setShowConfig((v) => !v)} className="col-span-2 rounded-lg bg-zinc-800 px-2 py-2 text-xs text-zinc-300 hover:text-white">
                <Settings2 className="mr-1 inline h-3.5 w-3.5" /> Configurar fontes …
              </button>
            </div>
          </div>

          {showConfig && (
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <label className="block text-xs text-zinc-400">
                Câmara
                <select value={camId} onChange={(e) => setCamId(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white">
                  <option value="">Predefinida</option>
                  {devices.cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Câmara"}</option>)}
                </select>
              </label>
              <label className="block text-xs text-zinc-400">
                Microfone
                <select value={micId} onChange={(e) => setMicId(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white">
                  <option value="">Predefinido</option>
                  {devices.mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microfone"}</option>)}
                </select>
              </label>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            {camOn ? (
              <Button size="sm" variant="outline" onClick={stopCamera} className="w-full border-zinc-700">
                <Camera className="mr-1.5 h-4 w-4" /> Desligar câmara
              </Button>
            ) : (
              <Button size="sm" onClick={startCamera} className="w-full bg-[#D2A63C] text-black hover:bg-[#c0972f]">
                <Camera className="mr-1.5 h-4 w-4" /> Ligar câmara
              </Button>
            )}
            {screenOn ? (
              <Button size="sm" variant="outline" onClick={stopScreen} className="w-full border-zinc-700 text-amber-400">
                <MonitorX className="mr-1.5 h-4 w-4" /> Parar partilha
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={startScreen} className="w-full border-zinc-700">
                <Monitor className="mr-1.5 h-4 w-4" /> Partilhar ecrã
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={saveLayout} className="flex-1 border-zinc-700">
              <Save className="mr-1.5 h-4 w-4" /> Gravar posições
            </Button>
            <Button size="sm" variant="outline" onClick={resetScene} className="border-zinc-700">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-3 text-xs text-zinc-500">
            <Play className="mr-1 inline h-3.5 w-3.5" /> <strong className="text-zinc-400">Transmitir (WHIP)</strong> chega na F2 — este é o compositor/preview. As posições da câmara e do timer já gravam.
          </div>
        </div>
      </div>
    </div>
  )
}

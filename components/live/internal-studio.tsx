"use client"

/**
 * Studio de streaming INTERNO (browser) — compositor Canvas + layers arrastáveis/graváveis + WHIP.
 *
 * F1: compositor de cenas (Começamos em Breve+timer / Aviso Legal / Câmara+fundo / Ecrã+câmara),
 *     moldura MTM real por cima (janela transparente), captura câmara/mic/ecrã, posições gravadas
 *     por educador. Cada layer (câmara, timer, ecrã) arrasta+redimensiona.
 * F2: TRANSMITIR — canvas.captureStream(30) + áudio (mic+ecrã via WebAudio) → RTCPeerConnection →
 *     WHIP (proxy same-origin /api/live-sessions/whip → SRS). O HLS público serve a mesma chave.
 *
 * Assets reais em /public/studio (moldura, começamos, aviso legal, fundo). Ver `internal-streaming-studio`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Camera, Monitor, MonitorX, Save, RotateCcw, Radio, Square, Settings2, Mic } from "lucide-react"

const CW = 1280
const CH = 720
const HANDLE = 16 // px (coords do canvas) das pegas de resize

// Janela transparente medida na moldura (overlay-frame.png) — onde a câmara/ecrã encaixam por defeito.
const FRAME_WINDOW = { x: 0.032, y: 0.113, w: 0.935, h: 0.829 }

const ASSET = {
  frame: "/studio/overlay-frame.png",
  soon: "/studio/coming-soon.png",
  disclaimer: "/studio/disclaimer.jpg",
  background: "/studio/background.png",
  timer: "/studio/timer-5min.webm",
}

type LayerType = "camera" | "timer" | "screen"
type Layer = { id: string; type: LayerType; x: number; y: number; w: number; h: number; z: number; visible: boolean }
type SceneKey = "soon" | "disclaimer" | "camera" | "screen"
type Scene = {
  key: SceneKey
  label: string
  bgImage: keyof typeof ASSET | null
  frame: boolean // desenha a moldura MTM por cima
  layers: Layer[]
}

const DEFAULT_SCENES: Scene[] = [
  {
    key: "soon",
    label: "Começamos em Breve",
    bgImage: "soon",
    frame: false,
    layers: [{ id: "soon-timer", type: "timer", x: 0.4, y: 0.62, w: 0.2, h: 0.22, z: 2, visible: true }],
  },
  { key: "disclaimer", label: "Aviso Legal", bgImage: "disclaimer", frame: false, layers: [] },
  {
    key: "camera",
    label: "Câmara",
    bgImage: "background",
    frame: true,
    layers: [{ id: "cam-full", type: "camera", ...FRAME_WINDOW, z: 1, visible: true }],
  },
  {
    key: "screen",
    label: "Ecrã + Câmara",
    bgImage: null,
    frame: true,
    layers: [
      { id: "scr-full", type: "screen", ...FRAME_WINDOW, z: 1, visible: true },
      { id: "scr-cam", type: "camera", x: 0.72, y: 0.64, w: 0.21, h: 0.28, z: 2, visible: true },
    ],
  },
]

const STORAGE_PREFIX = "mtm-internal-studio-layout-v2"

function loadLayout(ns: string): Record<string, Layer[]> | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(`${STORAGE_PREFIX}:${ns}`) : null
    return raw ? (JSON.parse(raw) as Record<string, Layer[]>) : null
  } catch {
    return null
  }
}

type StreamTarget = { id: string; title: string; is_live?: boolean; scheduled_start_at?: string | null; category?: string | null }
type Phase = "idle" | "connecting" | "live" | "error"

/**
 * `presetStreamId` — quando embutido numa linha de sessão do EducatorStudio, fixa o alvo a essa
 * sessão (não mostra o seletor). Sem preset, o educador escolhe a sessão de destino.
 */
export default function InternalStudio({
  presetStreamId,
  presetStreamTitle,
}: {
  presetStreamId?: string
  presetStreamTitle?: string
} = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const camVideoRef = useRef<HTMLVideoElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const timerVideoRef = useRef<HTMLVideoElement | null>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const dragRef = useRef<{ layerId: string; mode: "move" | "resize"; ox: number; oy: number } | null>(null)
  const imagesRef = useRef<Record<string, HTMLImageElement>>({})
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const canvasStreamRef = useRef<MediaStream | null>(null)

  const [educator, setEducator] = useState<{ id: string; name: string } | null>(null)
  const [targets, setTargets] = useState<StreamTarget[]>([])
  const [targetId, setTargetId] = useState<string>(presetStreamId ?? "")

  const [scenes, setScenes] = useState<Scene[]>(DEFAULT_SCENES)
  const [activeScene, setActiveScene] = useState<SceneKey>("soon")
  const [selected, setSelected] = useState<string | null>(null)
  const [camOn, setCamOn] = useState(false)
  const [screenOn, setScreenOn] = useState(false)
  const [devices, setDevices] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cams: [], mics: [] })
  const [camId, setCamId] = useState<string>("")
  const [micId, setMicId] = useState<string>("")
  const [showConfig, setShowConfig] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [msg, setMsg] = useState<string | null>(null)

  const scene = useMemo(() => scenes.find((s) => s.key === activeScene)!, [scenes, activeScene])

  // ── auth do educador + streams alvo ────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch("/api/live-sessions/whip", { credentials: "same-origin" }).then((x) => x.json())
        if (r?.authenticated) {
          setEducator({ id: r.educatorId, name: r.displayName })
          const list: StreamTarget[] = r.streams ?? []
          setTargets(list)
          if (presetStreamId) {
            setTargetId(presetStreamId)
          } else {
            const live = list.find((s) => s.is_live)
            setTargetId(live?.id ?? list[0]?.id ?? "")
          }
          // carrega layout gravado deste educador
          const saved = loadLayout(r.educatorId)
          if (saved) setScenes(DEFAULT_SCENES.map((s) => ({ ...s, layers: saved[s.key] ?? s.layers })))
        }
      } catch {
        /* sem sessão de educador */
      }
    })()
  }, [])

  // ── pré-carregar imagens dos assets ────────────────────────────────────
  useEffect(() => {
    ;(["frame", "soon", "disclaimer", "background"] as (keyof typeof ASSET)[]).forEach((k) => {
      const img = new Image()
      img.src = ASSET[k]
      imagesRef.current[k] = img
    })
  }, [])

  // ── enumerar dispositivos ──────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setDevices({ cams: list.filter((d) => d.kind === "videoinput"), mics: list.filter((d) => d.kind === "audioinput") })
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
        video: camId ? { deviceId: { exact: camId } } : { width: 1280, height: 720 },
        audio: micId ? { deviceId: { exact: micId } } : true,
      })
      camStreamRef.current = stream
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream
        await camVideoRef.current.play().catch(() => {})
      }
      // se já estamos a transmitir, injeta o áudio do mic no mix
      if (audioCtxRef.current && audioDestRef.current) {
        try {
          audioCtxRef.current.createMediaStreamSource(stream).connect(audioDestRef.current)
        } catch {
          /* ignora */
        }
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
      const stream = await (
        navigator.mediaDevices as MediaDevices & { getDisplayMedia: (c: DisplayMediaStreamOptions) => Promise<MediaStream> }
      ).getDisplayMedia({ video: { frameRate: 30 }, audio: true })
      screenStreamRef.current = stream
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream
        await screenVideoRef.current.play().catch(() => {})
      }
      if (audioCtxRef.current && audioDestRef.current && stream.getAudioTracks().length) {
        try {
          audioCtxRef.current.createMediaStreamSource(stream).connect(audioDestRef.current)
        } catch {
          /* ignora */
        }
      }
      setScreenOn(true)
      setActiveScene("screen")
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setScreenOn(false)
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null
      })
    } catch {
      setMsg("Partilha cancelada/negada")
    }
  }, [])

  const stopScreen = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null
    setScreenOn(false)
  }, [])

  // ── timer video ────────────────────────────────────────────────────────
  useEffect(() => {
    const v = timerVideoRef.current
    if (v) {
      v.loop = true
      v.muted = true
      v.play().catch(() => {})
    }
  }, [])

  // ── persistência (por educador) ────────────────────────────────────────
  const persist = useCallback(
    (next: Scene[]) => {
      try {
        const map: Record<string, Layer[]> = {}
        next.forEach((s) => (map[s.key] = s.layers))
        window.localStorage.setItem(`${STORAGE_PREFIX}:${educator?.id ?? "anon"}`, JSON.stringify(map))
      } catch {
        /* ignora */
      }
    },
    [educator],
  )

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

    const drawVideoCover = (v: HTMLVideoElement, x: number, y: number, w: number, h: number) => {
      const vw = v.videoWidth || 16
      const vh = v.videoHeight || 9
      const scale = Math.max(w / vw, h / vh)
      const sw = w / scale
      const sh = h / scale
      const sx = (vw - sw) / 2
      const sy = (vh - sh) / 2
      try {
        ctx.drawImage(v, sx, sy, sw, sh, x, y, w, h)
      } catch {
        /* not ready */
      }
    }

    const drawLayer = (l: Layer) => {
      if (!l.visible) return
      const x = l.x * CW
      const y = l.y * CH
      const w = l.w * CW
      const h = l.h * CH
      if (l.type === "camera" && camVideoRef.current && camStreamRef.current) {
        drawVideoCover(camVideoRef.current, x, y, w, h)
      } else if (l.type === "screen" && screenVideoRef.current && screenStreamRef.current) {
        drawVideoCover(screenVideoRef.current, x, y, w, h)
      } else if (l.type === "timer" && timerVideoRef.current) {
        try {
          ctx.drawImage(timerVideoRef.current, x, y, w, h)
        } catch {
          /* not ready */
        }
      } else {
        // fonte ainda não ligada — placeholder discreto
        ctx.fillStyle = "rgba(210,166,60,0.10)"
        ctx.fillRect(x, y, w, h)
        ctx.fillStyle = "rgba(255,255,255,0.45)"
        ctx.font = "500 20px sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(l.type === "camera" ? "Câmara desligada" : "Sem partilha de ecrã", x + w / 2, y + h / 2)
        ctx.textAlign = "left"
      }
      if (selected === l.id) {
        ctx.strokeStyle = "#D2A63C"
        ctx.lineWidth = 3
        ctx.strokeRect(x, y, w, h)
        ctx.fillStyle = "#D2A63C"
        ctx.fillRect(x + w - HANDLE, y + h - HANDLE, HANDLE, HANDLE)
      }
    }

    const render = () => {
      ctx.fillStyle = "#0a0e1a"
      ctx.fillRect(0, 0, CW, CH)
      // fundo (imagem do asset)
      if (scene.bgImage) {
        const img = imagesRef.current[scene.bgImage]
        if (img?.complete && img.naturalWidth) {
          try {
            ctx.drawImage(img, 0, 0, CW, CH)
          } catch {
            /* ignora */
          }
        }
      }
      // layers por z-order
      ;[...scene.layers].sort((a, b) => a.z - b.z).forEach(drawLayer)
      // moldura MTM por cima (janela transparente deixa ver os layers)
      if (scene.frame) {
        const f = imagesRef.current.frame
        if (f?.complete && f.naturalWidth) {
          try {
            ctx.drawImage(f, 0, 0, CW, CH)
          } catch {
            /* ignora */
          }
        }
      }
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
    const ordered = [...scene.layers].sort((a, b) => b.z - a.z)
    for (const l of ordered) {
      if (!l.visible) continue
      const x = l.x * CW,
        y = l.y * CH,
        w = l.w * CW,
        h = l.h * CH
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
      updateLayer(l.id, {
        x: Math.max(0, Math.min(1 - l.w, (p.x - d.ox) / CW)),
        y: Math.max(0, Math.min(1 - l.h, (p.y - d.oy) / CH)),
      })
    } else {
      updateLayer(l.id, {
        w: Math.max(0.06, Math.min(1 - l.x, (p.x - l.x * CW) / CW)),
        h: Math.max(0.06, Math.min(1 - l.y, (p.y - l.y * CH) / CH)),
      })
    }
  }

  const onPointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null
      persist(scenes)
    }
  }

  // ── TRANSMITIR (WHIP) ──────────────────────────────────────────────────
  const startBroadcast = useCallback(async () => {
    if (phase === "connecting" || phase === "live") return
    if (!educator) {
      setMsg("Inicia sessão como educador (aba Streaming Externo) antes de transmitir.")
      return
    }
    if (!targetId) {
      setMsg("Cria/escolhe uma sessão de destino primeiro.")
      return
    }
    setPhase("connecting")
    setMsg("A ligar ao servidor…")
    try {
      const canvas = canvasRef.current!
      // vídeo do compositor
      const canvasStream = canvas.captureStream(30)
      canvasStreamRef.current = canvasStream

      // mix de áudio (mic da câmara + áudio do ecrã)
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ac = new AC()
      const dest = ac.createMediaStreamDestination()
      audioCtxRef.current = ac
      audioDestRef.current = dest
      if (camStreamRef.current?.getAudioTracks().length) {
        ac.createMediaStreamSource(camStreamRef.current).connect(dest)
      }
      if (screenStreamRef.current?.getAudioTracks().length) {
        ac.createMediaStreamSource(screenStreamRef.current).connect(dest)
      }

      const pc = new RTCPeerConnection({ iceServers: [] })
      pcRef.current = pc
      canvasStream.getVideoTracks().forEach((t) => pc.addTrack(t, canvasStream))
      const audioTrack = dest.stream.getAudioTracks()[0]
      if (audioTrack) pc.addTrack(audioTrack, dest.stream)

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setPhase("live")
          setMsg("A transmitir ao vivo ✓")
        } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setPhase("error")
          setMsg("Ligação perdida ao servidor de streaming.")
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      // espera reunir candidatos ICE (host) — timeout curto para não bloquear
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve()
        const to = setTimeout(resolve, 1500)
        pc.addEventListener("icegatheringstatechange", () => {
          if (pc.iceGatheringState === "complete") {
            clearTimeout(to)
            resolve()
          }
        })
      })

      const res = await fetch(`/api/live-sessions/whip?streamId=${encodeURIComponent(targetId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription?.sdp ?? offer.sdp ?? "",
        credentials: "same-origin",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error === "srs_unreachable" ? "Servidor de streaming inacessível" : err?.error || `HTTP ${res.status}`)
      }
      const answer = await res.text()
      await pc.setRemoteDescription({ type: "answer", sdp: answer })
    } catch (e) {
      setPhase("error")
      setMsg("Falha a transmitir: " + (e instanceof Error ? e.message : "erro"))
      pcRef.current?.close()
      pcRef.current = null
    }
  }, [phase, educator, targetId])

  const stopBroadcast = useCallback(async () => {
    pcRef.current?.close()
    pcRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    audioDestRef.current = null
    canvasStreamRef.current?.getTracks().forEach((t) => t.stop())
    canvasStreamRef.current = null
    setPhase("idle")
    setMsg("Transmissão terminada.")
    if (targetId) {
      fetch(`/api/live-sessions/whip?streamId=${encodeURIComponent(targetId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      }).catch(() => {})
    }
  }, [targetId])

  useEffect(
    () => () => {
      camStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
      pcRef.current?.close()
      audioCtxRef.current?.close().catch(() => {})
    },
    [],
  )

  const live = phase === "live"
  const connecting = phase === "connecting"

  return (
    <div className="space-y-4">
      {/* vídeos escondidos (fontes do compositor) */}
      <video ref={camVideoRef} className="hidden" playsInline muted />
      <video ref={screenVideoRef} className="hidden" playsInline muted />
      <video ref={timerVideoRef} className="hidden" src={ASSET.timer} playsInline />

      {msg && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
          {live && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />}
          {msg}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Compositor */}
        <div className="rounded-2xl border border-zinc-800 bg-black p-2">
          <div className="relative">
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
            {live && (
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-xs font-bold text-white">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> AO VIVO
              </span>
            )}
          </div>
          <p className="mt-2 px-1 text-xs text-zinc-500">
            Clica num elemento para o selecionar · arrasta para mover · pega dourada no canto para redimensionar · as
            posições gravam ao largar (por educador).
          </p>
        </div>

        {/* Painel de controlo */}
        <div className="space-y-3">
          {/* Transmissão */}
          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-xs font-medium text-zinc-400">Transmissão</p>
            {!educator ? (
              <p className="rounded-lg bg-amber-500/10 px-2 py-2 text-xs text-amber-300">
                Inicia sessão como educador na aba <strong>Streaming Externo</strong> para poderes transmitir.
              </p>
            ) : (
              <>
                {presetStreamId ? (
                  <p className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200">
                    Sessão: <strong className="text-white">{presetStreamTitle || "esta sala"}</strong>
                  </p>
                ) : (
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    disabled={live || connecting}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white disabled:opacity-60"
                  >
                    {targets.length === 0 && <option value="">— cria uma sessão na aba Externo —</option>}
                    {targets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                        {s.is_live ? " (ao vivo)" : ""}
                      </option>
                    ))}
                  </select>
                )}
                {live ? (
                  <Button size="sm" onClick={stopBroadcast} className="w-full bg-red-600 text-white hover:bg-red-700">
                    <Square className="mr-1.5 h-4 w-4" /> Parar transmissão
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={startBroadcast}
                    disabled={connecting || !targetId}
                    className="w-full bg-[#D2A63C] text-black hover:bg-[#c0972f]"
                  >
                    <Radio className="mr-1.5 h-4 w-4" /> {connecting ? "A ligar…" : "Transmitir ao vivo"}
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Cenas */}
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
              <button
                onClick={() => setShowConfig((v) => !v)}
                className="col-span-2 rounded-lg bg-zinc-800 px-2 py-2 text-xs text-zinc-300 hover:text-white"
              >
                <Settings2 className="mr-1 inline h-3.5 w-3.5" /> Configurar fontes …
              </button>
            </div>
          </div>

          {showConfig && (
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <label className="block text-xs text-zinc-400">
                <Camera className="mr-1 inline h-3.5 w-3.5" /> Câmara
                <select
                  value={camId}
                  onChange={(e) => setCamId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                >
                  <option value="">Predefinida</option>
                  {devices.cams.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || "Câmara"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-zinc-400">
                <Mic className="mr-1 inline h-3.5 w-3.5" /> Microfone
                <select
                  value={micId}
                  onChange={(e) => setMicId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                >
                  <option value="">Predefinido</option>
                  {devices.mics.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || "Microfone"}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-[11px] text-zinc-500">Muda a câmara/mic e volta a ligar a câmara para aplicar.</p>
            </div>
          )}

          {/* Fontes */}
          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            {camOn ? (
              <Button size="sm" variant="outline" onClick={stopCamera} className="w-full border-zinc-700">
                <Camera className="mr-1.5 h-4 w-4" /> Desligar câmara
              </Button>
            ) : (
              <Button size="sm" onClick={startCamera} className="w-full bg-zinc-800 text-white hover:bg-zinc-700">
                <Camera className="mr-1.5 h-4 w-4" /> Ligar câmara + mic
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

          {/* Layout */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={saveLayout} className="flex-1 border-zinc-700">
              <Save className="mr-1.5 h-4 w-4" /> Gravar posições
            </Button>
            <Button size="sm" variant="outline" onClick={resetScene} className="border-zinc-700" title="Repor cena">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

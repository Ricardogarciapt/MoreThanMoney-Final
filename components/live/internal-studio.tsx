"use client"

/**
 * Studio de streaming INTERNO (browser) — compositor Canvas + layers + fontes (OBS-like) + mixer + WHIP.
 *
 * - Cenas: Começamos em Breve (+timer) / Aviso Legal / Câmara+fundo / Ecrã+câmara. Moldura MTM real
 *   por cima (janela transparente). Layers {tipo,x,y,w,h,z} arrastáveis+redimensionáveis, gravados por educador.
 * - FONTES (novo): biblioteca de médias — imagem / vídeo / áudio (mp3) via ficheiro local ou URL.
 *   As visuais adicionam-se a qualquer cena como layer (mexe/redimensiona/guarda). Vídeo/áudio entram no mixer.
 * - MIXER (novo): canais Microfone / Áudio do PC / Áudio da Fonte, cada um com on-mute + slider de volume.
 * - TRANSMITIR (WHIP): canvas.captureStream(30) + mix de áudio → RTCPeerConnection → proxy /api/live-sessions/whip → SRS.
 *   Com rtc_to_rtmp on no SRS, o DVR do VPS grava automaticamente (guardar/traduzir/YouTube no painel DVR).
 *
 * Ver memória `internal-streaming-studio` + `lms-dvr-multiaudio`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Camera,
  Monitor,
  MonitorX,
  Save,
  RotateCcw,
  Radio,
  Square,
  Settings2,
  Mic,
  Plus,
  Image as ImageIcon,
  Film,
  Music,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react"

const CW = 1280
const CH = 720
const HANDLE = 16

const FRAME_WINDOW = { x: 0.032, y: 0.113, w: 0.935, h: 0.829 }

const ASSET = {
  frame: "/studio/overlay-frame.png",
  soon: "/studio/coming-soon.png",
  disclaimer: "/studio/disclaimer.jpg",
  background: "/studio/background.png",
  timer: "/studio/timer-5min.webm",
}

type LayerType = "camera" | "timer" | "screen" | "media"
type Layer = {
  id: string
  type: LayerType
  x: number
  y: number
  w: number
  h: number
  z: number
  visible: boolean
  mediaId?: string // p/ type==="media"
}
type SceneKey = "soon" | "disclaimer" | "camera" | "screen"
type Scene = { key: SceneKey; label: string; bgImage: keyof typeof ASSET | null; frame: boolean; layers: Layer[] }

type SourceKind = "image" | "video" | "audio"
type MediaSource = { id: string; kind: SourceKind; name: string; src: string; remote: boolean }

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

function loadLayout(ns: string): { layers?: Record<string, Layer[]>; sources?: MediaSource[] } | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(`${STORAGE_PREFIX}:${ns}`) : null
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

type StreamTarget = { id: string; title: string; is_live?: boolean }
type Phase = "idle" | "connecting" | "live" | "error"
type ChannelState = { on: boolean; vol: number }

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
  const canvasStreamRef = useRef<MediaStream | null>(null)

  // ── áudio (mixer) ──
  const acRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const micGainRef = useRef<GainNode | null>(null)
  const pcGainRef = useRef<GainNode | null>(null)
  const srcGainRef = useRef<GainNode | null>(null)
  const micConnectedRef = useRef(false)
  const screenAudioConnectedRef = useRef(false)
  const mediaElsRef = useRef<Record<string, HTMLVideoElement | HTMLImageElement | HTMLAudioElement>>({})
  const mediaSrcNodesRef = useRef<WeakSet<HTMLMediaElement>>(new WeakSet())
  const serverSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const [sources, setSources] = useState<MediaSource[]>([])
  const [urlInput, setUrlInput] = useState("")
  const [mixer, setMixer] = useState<{ mic: ChannelState; pc: ChannelState; src: ChannelState }>({
    mic: { on: true, vol: 1 },
    pc: { on: true, vol: 0.8 },
    src: { on: true, vol: 0.8 },
  })

  const scene = useMemo(() => scenes.find((s) => s.key === activeScene)!, [scenes, activeScene])

  // ── auth + streams ──
  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch("/api/live-sessions/whip", { credentials: "same-origin" }).then((x) => x.json())
        if (r?.authenticated) {
          setEducator({ id: r.educatorId, name: r.displayName })
          const list: StreamTarget[] = r.streams ?? []
          setTargets(list)
          if (presetStreamId) setTargetId(presetStreamId)
          else setTargetId(list.find((s) => s.is_live)?.id ?? list[0]?.id ?? "")
          // 1º servidor (durável, cross-device); fallback p/ localStorage (cache offline).
          let saved: { layers?: Record<string, Layer[]>; sources?: MediaSource[] } | null = null
          try {
            const srv = await fetch("/api/live-sessions/studio-layout", { credentials: "same-origin" }).then((x) => x.json())
            if (srv?.layout && (srv.layout.layers || srv.layout.sources)) saved = srv.layout
          } catch {
            /* servidor indisponível */
          }
          if (!saved) saved = loadLayout(r.educatorId)
          if (saved?.layers) setScenes(DEFAULT_SCENES.map((s) => ({ ...s, layers: saved!.layers![s.key] ?? s.layers })))
          if (saved?.sources) {
            const remote = saved.sources.filter((x) => x.remote)
            setSources(remote)
            remote.forEach(registerMediaElement)
          }
        }
      } catch {
        /* sem sessão */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── pré-carregar assets ──
  useEffect(() => {
    ;(["frame", "soon", "disclaimer", "background"] as (keyof typeof ASSET)[]).forEach((k) => {
      const img = new Image()
      img.src = ASSET[k]
      imagesRef.current[k] = img
    })
  }, [])

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setDevices({ cams: list.filter((d) => d.kind === "videoinput"), mics: list.filter((d) => d.kind === "audioinput") })
    } catch {
      /* sem permissão */
    }
  }, [])
  useEffect(() => {
    refreshDevices()
  }, [refreshDevices])

  // ── grafo de áudio (mixer) ──
  const ensureAudio = useCallback(() => {
    if (!acRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ac = new AC()
      acRef.current = ac
      masterRef.current = ac.createMediaStreamDestination()
      const mk = (vol: number) => {
        const g = ac.createGain()
        g.gain.value = vol
        g.connect(masterRef.current!)
        return g
      }
      micGainRef.current = mk(mixer.mic.on ? mixer.mic.vol : 0)
      pcGainRef.current = mk(mixer.pc.on ? mixer.pc.vol : 0)
      srcGainRef.current = mk(mixer.src.on ? mixer.src.vol : 0)
      // monitorização só das fontes de média (evita feedback do mic)
      srcGainRef.current.connect(ac.destination)
    }
    if (acRef.current.state === "suspended") acRef.current.resume().catch(() => {})
    return acRef.current
  }, [mixer])

  // aplica mudanças do mixer aos gains
  useEffect(() => {
    if (micGainRef.current) micGainRef.current.gain.value = mixer.mic.on ? mixer.mic.vol : 0
    if (pcGainRef.current) pcGainRef.current.gain.value = mixer.pc.on ? mixer.pc.vol : 0
    if (srcGainRef.current) srcGainRef.current.gain.value = mixer.src.on ? mixer.src.vol : 0
  }, [mixer])

  const connectMicAudio = useCallback(
    (stream: MediaStream) => {
      if (micConnectedRef.current || !stream.getAudioTracks().length) return
      const ac = ensureAudio()
      try {
        ac.createMediaStreamSource(stream).connect(micGainRef.current!)
        micConnectedRef.current = true
      } catch {
        /* ignora */
      }
    },
    [ensureAudio],
  )
  const connectScreenAudio = useCallback(
    (stream: MediaStream) => {
      if (screenAudioConnectedRef.current || !stream.getAudioTracks().length) return
      const ac = ensureAudio()
      try {
        ac.createMediaStreamSource(stream).connect(pcGainRef.current!)
        screenAudioConnectedRef.current = true
      } catch {
        /* ignora */
      }
    },
    [ensureAudio],
  )
  const connectMediaAudio = useCallback(
    (el: HTMLMediaElement) => {
      if (mediaSrcNodesRef.current.has(el)) return
      const ac = ensureAudio()
      try {
        const node = ac.createMediaElementSource(el)
        node.connect(srcGainRef.current!)
        mediaSrcNodesRef.current.add(el)
      } catch {
        /* ignora */
      }
    },
    [ensureAudio],
  )

  // ── câmara ──
  const startCamera = useCallback(async () => {
    try {
      camStreamRef.current?.getTracks().forEach((t) => t.stop())
      micConnectedRef.current = false
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camId ? { deviceId: { exact: camId } } : { width: 1280, height: 720 },
        audio: micId ? { deviceId: { exact: micId } } : true,
      })
      camStreamRef.current = stream
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream
        await camVideoRef.current.play().catch(() => {})
      }
      connectMicAudio(stream)
      setCamOn(true)
      setMsg("Câmara + mic ligados")
      refreshDevices()
    } catch (e) {
      setMsg("Erro na câmara: " + (e instanceof Error ? e.message : "acesso negado"))
    }
  }, [camId, micId, refreshDevices, connectMicAudio])

  const stopCamera = useCallback(() => {
    camStreamRef.current?.getTracks().forEach((t) => t.stop())
    camStreamRef.current = null
    micConnectedRef.current = false
    if (camVideoRef.current) camVideoRef.current.srcObject = null
    setCamOn(false)
  }, [])

  // ── ecrã ──
  const startScreen = useCallback(async () => {
    try {
      const stream = await (
        navigator.mediaDevices as MediaDevices & { getDisplayMedia: (c: DisplayMediaStreamOptions) => Promise<MediaStream> }
      ).getDisplayMedia({ video: { frameRate: 30 }, audio: true })
      screenStreamRef.current = stream
      screenAudioConnectedRef.current = false
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream
        await screenVideoRef.current.play().catch(() => {})
      }
      connectScreenAudio(stream)
      setScreenOn(true)
      setActiveScene("screen")
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setScreenOn(false)
        screenAudioConnectedRef.current = false
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null
      })
    } catch {
      setMsg("Partilha cancelada/negada")
    }
  }, [connectScreenAudio])

  const stopScreen = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null
    screenAudioConnectedRef.current = false
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null
    setScreenOn(false)
  }, [])

  // ── timer ──
  useEffect(() => {
    const v = timerVideoRef.current
    if (v) {
      v.loop = true
      v.muted = true
      v.play().catch(() => {})
    }
  }, [])

  // ── fontes de média (OBS-like) ──
  function registerMediaElement(s: MediaSource) {
    if (mediaElsRef.current[s.id]) return
    if (s.kind === "image") {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = s.src
      mediaElsRef.current[s.id] = img
    } else if (s.kind === "video") {
      const v = document.createElement("video")
      v.src = s.src
      v.crossOrigin = "anonymous"
      v.loop = true
      v.playsInline = true
      mediaElsRef.current[s.id] = v
    } else {
      const a = document.createElement("audio")
      a.src = s.src
      a.crossOrigin = "anonymous"
      a.loop = true
      mediaElsRef.current[s.id] = a
    }
  }

  const addSourceFromFile = useCallback((file: File) => {
    const kind: SourceKind = file.type.startsWith("image")
      ? "image"
      : file.type.startsWith("video")
        ? "video"
        : "audio"
    const src = URL.createObjectURL(file)
    const s: MediaSource = { id: `m${Math.round(performance.now())}${Math.floor(1000 * Math.random())}`, kind, name: file.name, src, remote: false }
    registerMediaElement(s)
    setSources((prev) => [...prev, s])
    setMsg(`Fonte adicionada: ${file.name}`)
  }, [])

  const addSourceFromUrl = useCallback(() => {
    const u = urlInput.trim()
    if (!u) return
    const lower = u.split("?")[0].toLowerCase()
    const kind: SourceKind = /\.(png|jpe?g|gif|webp|svg)$/.test(lower)
      ? "image"
      : /\.(mp4|webm|mov|m4v)$/.test(lower)
        ? "video"
        : /\.(mp3|wav|ogg|m4a|aac)$/.test(lower)
          ? "audio"
          : "image"
    const s: MediaSource = { id: `u${Math.round(performance.now())}${Math.floor(1000 * Math.random())}`, kind, name: u.split("/").pop() || u, src: u, remote: true }
    registerMediaElement(s)
    setSources((prev) => [...prev, s])
    setUrlInput("")
  }, [urlInput])

  const removeSource = useCallback(
    (id: string) => {
      const el = mediaElsRef.current[id]
      if (el && "pause" in el) (el as HTMLMediaElement).pause()
      delete mediaElsRef.current[id]
      setSources((prev) => prev.filter((s) => s.id !== id))
      setScenes((prev) => prev.map((s) => ({ ...s, layers: s.layers.filter((l) => l.mediaId !== id) })))
    },
    [],
  )

  const toggleMediaPlay = useCallback(
    (id: string) => {
      const el = mediaElsRef.current[id] as HTMLMediaElement | undefined
      if (!el || !("play" in el)) return
      if (el.paused) {
        connectMediaAudio(el)
        el.play().catch(() => {})
      } else {
        el.pause()
      }
      setMsg("")
    },
    [connectMediaAudio],
  )

  const addMediaToScene = useCallback(
    (s: MediaSource) => {
      if (s.kind === "audio") {
        toggleMediaPlay(s.id)
        return
      }
      const el = mediaElsRef.current[s.id] as HTMLVideoElement | undefined
      if (s.kind === "video" && el) {
        connectMediaAudio(el)
        el.play().catch(() => {})
      }
      const layer: Layer = { id: `l${s.id}`, type: "media", mediaId: s.id, x: 0.3, y: 0.3, w: 0.4, h: 0.4, z: 5, visible: true }
      setScenes((prev) =>
        prev.map((sc) => (sc.key === activeScene ? { ...sc, layers: [...sc.layers.filter((l) => l.mediaId !== s.id), layer] } : sc)),
      )
      setSelected(layer.id)
    },
    [activeScene, connectMediaAudio, toggleMediaPlay],
  )

  // ── persistência ──
  const persist = useCallback(
    (nextScenes: Scene[], nextSources?: MediaSource[]) => {
      const layers: Record<string, Layer[]> = {}
      nextScenes.forEach((s) => (layers[s.key] = s.layers))
      const srcs = (nextSources ?? sources).filter((s) => s.remote) // blobs não sobrevivem a reload
      const payload = { layers, sources: srcs }
      // cache local imediato
      try {
        window.localStorage.setItem(`${STORAGE_PREFIX}:${educator?.id ?? "anon"}`, JSON.stringify(payload))
      } catch {
        /* ignora */
      }
      // gravação durável no servidor (debounce 800ms) — não faz reset ao sair
      if (educator) {
        if (serverSaveTimerRef.current) clearTimeout(serverSaveTimerRef.current)
        serverSaveTimerRef.current = setTimeout(() => {
          fetch("/api/live-sessions/studio-layout", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(payload),
          }).catch(() => {})
        }, 800)
      }
    },
    [educator, sources],
  )

  const updateLayer = useCallback(
    (id: string, patch: Partial<Layer>) => {
      setScenes((prev) =>
        prev.map((s) =>
          s.key === activeScene ? { ...s, layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : s,
        ),
      )
    },
    [activeScene],
  )

  const saveLayout = useCallback(() => {
    const layers: Record<string, Layer[]> = {}
    scenes.forEach((s) => (layers[s.key] = s.layers))
    const payload = { layers, sources: sources.filter((s) => s.remote) }
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}:${educator?.id ?? "anon"}`, JSON.stringify(payload))
    } catch {
      /* ignora */
    }
    if (educator) {
      if (serverSaveTimerRef.current) clearTimeout(serverSaveTimerRef.current)
      fetch("/api/live-sessions/studio-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      })
        .then(() => setMsg("Posições gravadas ✓ (guardadas na tua conta)"))
        .catch(() => setMsg("Gravado localmente (servidor indisponível)"))
    } else {
      setMsg("Posições gravadas localmente ✓")
    }
  }, [scenes, sources, educator])

  const resetScene = useCallback(() => {
    const def = DEFAULT_SCENES.find((s) => s.key === activeScene)!
    setScenes((prev) => {
      const next = prev.map((s) => (s.key === activeScene ? { ...s, layers: def.layers.map((l) => ({ ...l })) } : s))
      persist(next)
      return next
    })
  }, [activeScene, persist])

  // ── loop de desenho ──
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
      try {
        ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h)
      } catch {
        /* not ready */
      }
    }

    const drawLayer = (l: Layer) => {
      if (!l.visible) return
      const x = l.x * CW,
        y = l.y * CH,
        w = l.w * CW,
        h = l.h * CH
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
      } else if (l.type === "media" && l.mediaId) {
        const el = mediaElsRef.current[l.mediaId]
        if (el instanceof HTMLVideoElement) drawVideoCover(el, x, y, w, h)
        else if (el instanceof HTMLImageElement && el.complete && el.naturalWidth) {
          try {
            ctx.drawImage(el, x, y, w, h)
          } catch {
            /* ignora */
          }
        }
      } else if (l.type !== "media") {
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
      ;[...scene.layers].sort((a, b) => a.z - b.z).forEach(drawLayer)
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

  // ── interação ──
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
      updateLayer(l.id, { x: Math.max(0, Math.min(1 - l.w, (p.x - d.ox) / CW)), y: Math.max(0, Math.min(1 - l.h, (p.y - d.oy) / CH)) })
    } else {
      updateLayer(l.id, { w: Math.max(0.05, Math.min(1 - l.x, (p.x - l.x * CW) / CW)), h: Math.max(0.05, Math.min(1 - l.y, (p.y - l.y * CH) / CH)) })
    }
  }
  const onPointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null
      persist(scenes)
    }
  }

  // ── TRANSMITIR (WHIP) ──
  const startBroadcast = useCallback(async () => {
    if (phase === "connecting" || phase === "live") return
    if (!educator) return setMsg("Inicia sessão como educador antes de transmitir.")
    if (!targetId) return setMsg("Escolhe uma sessão de destino primeiro.")
    setPhase("connecting")
    setMsg("A ligar ao servidor…")
    try {
      const canvas = canvasRef.current!
      const canvasStream = canvas.captureStream(30)
      canvasStreamRef.current = canvasStream
      const ac = ensureAudio()
      // garante que as fontes já ligadas estão no mix
      if (camStreamRef.current) connectMicAudio(camStreamRef.current)
      if (screenStreamRef.current) connectScreenAudio(screenStreamRef.current)

      const pc = new RTCPeerConnection({ iceServers: [] })
      pcRef.current = pc
      canvasStream.getVideoTracks().forEach((t) => pc.addTrack(t, canvasStream))
      const audioTrack = masterRef.current!.stream.getAudioTracks()[0]
      if (audioTrack) pc.addTrack(audioTrack, masterRef.current!.stream)

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setPhase("live")
          setMsg("A transmitir ao vivo ✓ (o VPS está a gravar para o DVR)")
        } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setPhase("error")
          setMsg("Ligação de media perdida. Verifica UDP 8000 do servidor de streaming.")
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
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
      void ac
      const res = await fetch(`/api/live-sessions/whip?streamId=${encodeURIComponent(targetId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription?.sdp ?? offer.sdp ?? "",
        credentials: "same-origin",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || err?.error || `HTTP ${res.status}`)
      }
      const answer = await res.text()
      await pc.setRemoteDescription({ type: "answer", sdp: answer })
    } catch (e) {
      setPhase("error")
      setMsg("Falha a transmitir: " + (e instanceof Error ? e.message : "erro"))
      pcRef.current?.close()
      pcRef.current = null
    }
  }, [phase, educator, targetId, ensureAudio, connectMicAudio, connectScreenAudio])

  const stopBroadcast = useCallback(async () => {
    pcRef.current?.close()
    pcRef.current = null
    canvasStreamRef.current?.getTracks().forEach((t) => t.stop())
    canvasStreamRef.current = null
    setPhase("idle")
    setMsg("Transmissão terminada. Grava/traduz/publica no painel DVR abaixo.")
    if (targetId) {
      fetch(`/api/live-sessions/whip?streamId=${encodeURIComponent(targetId)}`, { method: "DELETE", credentials: "same-origin" }).catch(() => {})
    }
  }, [targetId])

  useEffect(
    () => () => {
      camStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
      pcRef.current?.close()
      acRef.current?.close().catch(() => {})
    },
    [],
  )

  const live = phase === "live"
  const connecting = phase === "connecting"

  const chan = (key: "mic" | "pc" | "src", label: string, icon: React.ReactNode) => {
    const c = mixer[key]
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMixer((m) => ({ ...m, [key]: { ...m[key], on: !m[key].on } }))}
          className={`flex h-7 w-7 items-center justify-center rounded-md ${c.on ? "bg-[#D2A63C] text-black" : "bg-zinc-700 text-zinc-300"}`}
          title={c.on ? "Silenciar" : "Ativar"}
        >
          {c.on ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>
        <span className="flex w-28 items-center gap-1 text-xs text-zinc-300">
          {icon}
          {label}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={c.vol}
          onChange={(e) => setMixer((m) => ({ ...m, [key]: { ...m[key], vol: parseFloat(e.target.value) } }))}
          className="flex-1 accent-[#D2A63C]"
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <video ref={camVideoRef} className="hidden" playsInline muted />
      <video ref={screenVideoRef} className="hidden" playsInline muted />
      <video ref={timerVideoRef} className="hidden" src={ASSET.timer} playsInline />

      {msg && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
          {live && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />}
          {msg}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
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
            Clica para selecionar · arrasta para mover · pega dourada no canto para redimensionar · qualquer fonte (câmara,
            timer, ecrã, imagem, vídeo) é posicionável e a posição grava por educador.
          </p>
        </div>

        <div className="space-y-3">
          {/* Transmissão */}
          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-xs font-medium text-zinc-400">Transmissão</p>
            {!educator ? (
              <p className="rounded-lg bg-amber-500/10 px-2 py-2 text-xs text-amber-300">
                Inicia sessão como educador para transmitir.
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
                    {targets.length === 0 && <option value="">— cria uma sessão —</option>}
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
                <Settings2 className="mr-1 inline h-3.5 w-3.5" /> {showConfig ? "Fechar configuração" : "Fontes, dispositivos e mixer …"}
              </button>
            </div>
          </div>

          {showConfig && (
            <>
              {/* Dispositivos */}
              <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-xs font-medium text-zinc-400">Dispositivos</p>
                <label className="block text-xs text-zinc-400">
                  <Camera className="mr-1 inline h-3.5 w-3.5" /> Câmara
                  <select value={camId} onChange={(e) => setCamId(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white">
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
                  <select value={micId} onChange={(e) => setMicId(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white">
                    <option value="">Predefinido</option>
                    {devices.mics.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || "Microfone"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Fontes de média (OBS-like) */}
              <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-xs font-medium text-zinc-400">Fontes (imagem · vídeo · áudio)</p>
                <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:border-[#D2A63C] hover:text-white">
                  <Plus className="h-3.5 w-3.5" /> Carregar ficheiro (imagem/vídeo/mp3)
                  <input
                    type="file"
                    accept="image/*,video/*,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) addSourceFromFile(f)
                      e.currentTarget.value = ""
                    }}
                  />
                </label>
                <div className="flex gap-1.5">
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="… ou colar URL"
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                  />
                  <Button size="sm" variant="outline" className="border-zinc-700" onClick={addSourceFromUrl}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {sources.length === 0 && <p className="text-[11px] text-zinc-600">Sem fontes. Adiciona imagens, vídeos ou mp3.</p>}
                  {sources.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg bg-zinc-800/60 px-2 py-1.5">
                      {s.kind === "image" ? <ImageIcon className="h-3.5 w-3.5 text-zinc-400" /> : s.kind === "video" ? <Film className="h-3.5 w-3.5 text-zinc-400" /> : <Music className="h-3.5 w-3.5 text-zinc-400" />}
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{s.name}</span>
                      <button onClick={() => addMediaToScene(s)} className="rounded bg-[#D2A63C]/20 px-1.5 py-0.5 text-[11px] text-[#D2A63C] hover:bg-[#D2A63C]/30">
                        {s.kind === "audio" ? "Tocar" : "→ Cena"}
                      </button>
                      <button onClick={() => removeSource(s.id)} className="text-zinc-500 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-600">Ficheiros locais valem para esta sessão; URLs ficam guardados.</p>
              </div>

              {/* Mixer */}
              <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-xs font-medium text-zinc-400">Mixer de áudio</p>
                {chan("mic", "Microfone", <Mic className="h-3 w-3" />)}
                {chan("pc", "Áudio do PC", <Monitor className="h-3 w-3" />)}
                {chan("src", "Áudio da fonte", <Music className="h-3 w-3" />)}
                <p className="text-[11px] text-zinc-600">Controla o que entra na transmissão. Ouves só as fontes de média (o mic não é monitorizado para evitar retorno).</p>
              </div>
            </>
          )}

          {/* Fontes rápidas */}
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

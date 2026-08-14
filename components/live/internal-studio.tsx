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
// Cap de bitrate do vídeo enviado por WebRTC (bps). HD ~2000 kbps para o site/player; o DVR grava
// -c copy, logo herda este bitrate (gravações razoáveis no disco 120GB sem re-encode no VPS).
const VIDEO_MAX_BITRATE = 2_000_000

const FRAME_WINDOW = { x: 0.032, y: 0.113, w: 0.935, h: 0.829 }

const ASSET = {
  frame: "/studio/overlay-frame.png",
  soon: "/studio/coming-soon.png",
  disclaimer: "/studio/disclaimer.jpg",
  background: "/studio/background.png",
  intro: "/studio/intro-educador.png",
  timer: "/studio/timer-5min.webm",
}

type LayerType = "camera" | "timer" | "screen" | "media" | "ticker"
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
  text?: string // p/ type==="ticker"
  opts?: { transparent?: boolean; opacity?: number; durationSec?: number; color?: string; loop?: boolean } // p/ type==="timer"
}
type SceneKey = "intro" | "soon" | "disclaimer" | "camera" | "screen"
type Scene = { key: SceneKey; label: string; bgImage: keyof typeof ASSET | null; frame: boolean; layers: Layer[] }

type SourceKind = "image" | "video" | "audio"
type MediaSource = { id: string; kind: SourceKind; name: string; src: string; remote: boolean; uploading?: boolean; error?: boolean }

const DEFAULT_SCENES: Scene[] = [
  {
    key: "intro",
    label: "Intro",
    bgImage: null, // default = canvas preto; imagem de intro definida pelo educador (introBgMediaId)
    frame: false,
    // timer sempre à frente na Intro (z alto)
    layers: [{ id: "intro-timer", type: "timer", x: 0.4, y: 0.68, w: 0.2, h: 0.2, z: 999, visible: true }],
  },
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

type ChannelState = { on: boolean; vol: number }
type MixerState = { mic: ChannelState; pc: ChannelState; src: ChannelState; intro: ChannelState }
type LayoutPayload = {
  layers?: Record<string, Layer[]>
  sources?: MediaSource[]
  introMusicId?: string | null
  introBgMediaId?: string | null
  mixer?: MixerState
}

/** Na cena Intro o timer fica SEMPRE à frente (z máximo), independentemente do que foi gravado. */
function enforceIntroTimerOnTop(list: Scene[]): Scene[] {
  return list.map((s) =>
    s.key === "intro"
      ? { ...s, layers: s.layers.map((l) => (l.type === "timer" ? { ...l, z: 999, visible: true } : l)) }
      : s,
  )
}

function loadLayout(ns: string): LayoutPayload | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(`${STORAGE_PREFIX}:${ns}`) : null
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

type StreamTarget = { id: string; title: string; is_live?: boolean }
type Phase = "idle" | "connecting" | "live" | "error"

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
  const introGainRef = useRef<GainNode | null>(null)
  const micConnectedRef = useRef(false)
  const screenAudioConnectedRef = useRef(false)
  const analysersRef = useRef<Record<"mic" | "pc" | "src" | "intro", AnalyserNode | null>>({ mic: null, pc: null, src: null, intro: null })
  const mediaElsRef = useRef<Record<string, HTMLVideoElement | HTMLImageElement | HTMLAudioElement>>({})
  const mediaSrcNodesRef = useRef<WeakSet<HTMLMediaElement>>(new WeakSet())
  const serverSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickerOffsetsRef = useRef<Record<string, number>>({})
  const persistRef = useRef<() => void>(() => {})
  // estado runtime dos contadores (por layer): ms restantes + a contar
  const timerStateRef = useRef<Record<string, { remainingMs: number; running: boolean }>>({})
  const lastTsRef = useRef(0)

  const [educator, setEducator] = useState<{ id: string; name: string } | null>(null)
  const [targets, setTargets] = useState<StreamTarget[]>([])
  const [targetId, setTargetId] = useState<string>(presetStreamId ?? "")

  const [scenes, setScenes] = useState<Scene[]>(DEFAULT_SCENES)
  const [activeScene, setActiveScene] = useState<SceneKey>("intro")
  const [introMusicId, setIntroMusicId] = useState<string | null>(null)
  const [introBgMediaId, setIntroBgMediaId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [camOn, setCamOn] = useState(false)
  const [screenOn, setScreenOn] = useState(false)
  const [devices, setDevices] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cams: [], mics: [] })
  const [camId, setCamId] = useState<string>("")
  const [micId, setMicId] = useState<string>("")
  const [showConfig, setShowConfig] = useState(false)
  const [timerConfigId, setTimerConfigId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [msg, setMsg] = useState<string | null>(null)

  const [sources, setSources] = useState<MediaSource[]>([])
  const [urlInput, setUrlInput] = useState("")
  const [mixer, setMixer] = useState<{ mic: ChannelState; pc: ChannelState; src: ChannelState; intro: ChannelState }>({
    mic: { on: true, vol: 1 },
    pc: { on: true, vol: 0.8 },
    src: { on: true, vol: 0.8 },
    intro: { on: true, vol: 0.7 },
  })
  const [levels, setLevels] = useState<{ mic: number; pc: number; src: number; intro: number }>({ mic: 0, pc: 0, src: 0, intro: 0 })

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
          let saved: LayoutPayload | null = null
          try {
            const srv = await fetch("/api/live-sessions/studio-layout", { credentials: "same-origin" }).then((x) => x.json())
            if (srv?.layout && (srv.layout.layers || srv.layout.sources)) saved = srv.layout
          } catch {
            /* servidor indisponível */
          }
          if (!saved) saved = loadLayout(r.educatorId)
          if (saved?.layers)
            setScenes(enforceIntroTimerOnTop(DEFAULT_SCENES.map((s) => ({ ...s, layers: saved!.layers![s.key] ?? s.layers }))))
          if (saved?.sources) {
            const remote = saved.sources.filter((x) => x.remote)
            setSources(remote)
            remote.forEach(registerMediaElement)
          }
          // só restaura as refs da intro se a fonte respetiva existir (evita refs penduradas
          // de uploads que falharam antes)
          const remoteIds = new Set((saved?.sources || []).filter((x) => x.remote).map((x) => x.id))
          if (saved?.introMusicId && remoteIds.has(saved.introMusicId)) setIntroMusicId(saved.introMusicId)
          if (saved?.introBgMediaId && remoteIds.has(saved.introBgMediaId)) setIntroBgMediaId(saved.introBgMediaId)
          if (saved?.mixer) setMixer(saved.mixer)
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
      introGainRef.current = mk(mixer.intro.on ? mixer.intro.vol : 0)
      // analisadores por canal (medidores de nível) — tocam na saída de cada gain
      const mkAnalyser = (g: GainNode) => {
        const an = ac.createAnalyser()
        an.fftSize = 256
        an.smoothingTimeConstant = 0.7
        g.connect(an)
        return an
      }
      analysersRef.current = {
        mic: mkAnalyser(micGainRef.current),
        pc: mkAnalyser(pcGainRef.current),
        src: mkAnalyser(srcGainRef.current),
        intro: mkAnalyser(introGainRef.current),
      }
      // monitorização só das fontes de média/intro (evita feedback do mic)
      srcGainRef.current.connect(ac.destination)
      introGainRef.current.connect(ac.destination)
    }
    if (acRef.current.state === "suspended") acRef.current.resume().catch(() => {})
    return acRef.current
  }, [mixer])

  // medidores de nível (VU) — lê os analisadores e atualiza ~20fps
  useEffect(() => {
    let raf = 0
    let last = 0
    const buf = new Uint8Array(128)
    const rms = (an: AnalyserNode | null) => {
      if (!an) return 0
      an.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      const r = Math.sqrt(sum / buf.length) // 0..1
      return Math.min(1, r * 2.2) // ganho visual
    }
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (t - last < 50) return
      last = t
      const a = analysersRef.current
      if (!a.mic && !a.pc && !a.src && !a.intro) return
      setLevels({ mic: rms(a.mic), pc: rms(a.pc), src: rms(a.src), intro: rms(a.intro) })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // aplica mudanças do mixer aos gains
  useEffect(() => {
    if (micGainRef.current) micGainRef.current.gain.value = mixer.mic.on ? mixer.mic.vol : 0
    if (pcGainRef.current) pcGainRef.current.gain.value = mixer.pc.on ? mixer.pc.vol : 0
    if (srcGainRef.current) srcGainRef.current.gain.value = mixer.src.on ? mixer.src.vol : 0
    if (introGainRef.current) introGainRef.current.gain.value = mixer.intro.on ? mixer.intro.vol : 0
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
  // música de intro → canal "Áudio da Intro" (slider próprio no mixer)
  const connectIntroAudio = useCallback(
    (el: HTMLMediaElement) => {
      if (mediaSrcNodesRef.current.has(el)) return
      const ac = ensureAudio()
      try {
        const node = ac.createMediaElementSource(el)
        node.connect(introGainRef.current!)
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

  // (timer agora é um contador desenhado no canvas — ver drawLayer/render)

  // ── música de intro (loop) — toca nas cenas Intro e Começamos em Breve ──
  useEffect(() => {
    const el = introMusicId ? (mediaElsRef.current[introMusicId] as HTMLAudioElement | undefined) : undefined
    const shouldPlay = (activeScene === "intro" || activeScene === "soon") && !!el
    if (el) {
      if (shouldPlay) {
        el.loop = true
        connectIntroAudio(el)
        if (el.paused) el.play().catch(() => {})
      } else if (!el.paused) {
        el.pause()
      }
    }
  }, [activeScene, introMusicId, connectIntroAudio])

  // persiste a escolha da música de intro quando muda
  const introMusicInitRef = useRef(true)
  useEffect(() => {
    if (introMusicInitRef.current) {
      introMusicInitRef.current = false
      return
    }
    persistRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introMusicId, introBgMediaId])

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
      if (s.remote) v.crossOrigin = "anonymous"
      v.src = s.src
      v.loop = true
      v.playsInline = true
      // fallback: se o loop nativo falhar (comum ao passar pelo WebAudio), reinicia no fim
      v.addEventListener("ended", () => {
        try {
          v.currentTime = 0
          void v.play()
        } catch {
          /* ignora */
        }
      })
      mediaElsRef.current[s.id] = v
    } else {
      const a = document.createElement("audio")
      if (s.remote) a.crossOrigin = "anonymous"
      a.src = s.src
      a.loop = true
      a.preload = "auto"
      a.addEventListener("ended", () => {
        try {
          a.currentTime = 0
          void a.play()
        } catch {
          /* ignora */
        }
      })
      mediaElsRef.current[s.id] = a
    }
  }

  /**
   * Sobe um blob local DIRETO ao Supabase Storage (URL assinado → contorna o limite da Vercel).
   * Com retries: uploads têm de ficar online (o utilizador exige que NADA fique só local).
   */
  const uploadBlobOnline = async (name: string, blobUrl: string, attempts = 3): Promise<string | null> => {
    const blob = await fetch(blobUrl).then((r) => r.blob())
    const type = blob.type || "application/octet-stream"
    let lastErr: unknown = null
    for (let i = 0; i < attempts; i++) {
      try {
        const meta = await fetch("/api/live-sessions/studio-asset", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, type }),
        }).then((r) => r.json())
        if (!meta?.uploadUrl) throw new Error(meta?.error || "sem URL de upload")
        const put = await fetch(meta.uploadUrl, { method: "PUT", headers: { "content-type": type, "x-upsert": "true" }, body: blob })
        if (!put.ok) throw new Error(`storage ${put.status}`)
        if (typeof meta.publicUrl === "string" && meta.publicUrl) return meta.publicUrl
        throw new Error("sem publicUrl")
      } catch (e) {
        lastErr = e
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)))
      }
    }
    throw (lastErr instanceof Error ? lastErr : new Error("upload falhou"))
  }

  /** Sobe já um ficheiro local e promove a fonte a remota (URL durável). Marca estado na fonte. */
  const promoteToOnline = async (id: string, name: string, blobUrl: string) => {
    setSources((prev) => prev.map((x) => (x.id === id ? { ...x, uploading: true, error: false } : x)))
    try {
      const url = await uploadBlobOnline(name, blobUrl)
      if (url) {
        setSources((prev) => {
          const next = prev.map((x) => (x.id === id ? { ...x, src: url, remote: true, uploading: false, error: false } : x))
          // grava já com a fonte remota (garante que a imagem/mp3 de intro persistem)
          try {
            persist(scenes, next)
          } catch {
            /* ignora */
          }
          return next
        })
        setMsg(`✓ ${name} guardado online`)
      }
    } catch (e) {
      setSources((prev) => prev.map((x) => (x.id === id ? { ...x, uploading: false, error: true } : x)))
      setMsg("⚠️ Falha a guardar online “" + name + "”: " + (e instanceof Error ? e.message : "erro") + ". Carrega em 🔁 para tentar de novo.")
    }
  }

  const addSourceFromFile = (file: File) => {
    const kind: SourceKind = file.type.startsWith("image")
      ? "image"
      : file.type.startsWith("video")
        ? "video"
        : "audio"
    const src = URL.createObjectURL(file)
    const s: MediaSource = { id: `m${Math.round(performance.now())}${Math.floor(1000 * Math.random())}`, kind, name: file.name, src, remote: false }
    registerMediaElement(s)
    setSources((prev) => [...prev, s])
    setMsg(`Fonte adicionada: ${file.name}${educator ? " — a guardar online…" : ""}`)
    void promoteToOnline(s.id, s.name, src) // guarda online já
  }

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

  const addTicker = useCallback(() => {
    const layer: Layer = {
      id: `tick${Math.round(performance.now())}`,
      type: "ticker",
      x: 0.04,
      y: 0.86,
      w: 0.92,
      h: 0.09,
      z: 20,
      visible: true,
      text: "MoreThanMoney · A Gameplan — escreve aqui o teu texto",
    }
    setScenes((prev) => prev.map((sc) => (sc.key === activeScene ? { ...sc, layers: [...sc.layers, layer] } : sc)))
    setSelected(layer.id)
    setMsg("Rodapé adicionado — arrasta, redimensiona e escreve o texto.")
  }, [activeScene])

  const tickers = useMemo(() => scene.layers.filter((l) => l.type === "ticker"), [scene])

  // ── persistência ──
  const persist = useCallback(
    (nextScenes: Scene[], nextSources?: MediaSource[]) => {
      const layers: Record<string, Layer[]> = {}
      nextScenes.forEach((s) => (layers[s.key] = s.layers))
      const srcs = (nextSources ?? sources).filter((s) => s.remote) // blobs não sobrevivem a reload
      const payload = { layers, sources: srcs, introMusicId, introBgMediaId, mixer }
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
    [educator, sources, introMusicId, introBgMediaId, mixer],
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

  // mantém persistRef com a versão mais recente (atribuído no render → pronto antes dos efeitos)
  persistRef.current = () => persist(scenes)

  const updateTickerText = useCallback(
    (id: string, text: string) => {
      setScenes((prev) => {
        const next = prev.map((s) =>
          s.key === activeScene ? { ...s, layers: s.layers.map((l) => (l.id === id ? { ...l, text } : l)) } : s,
        )
        persist(next)
        return next
      })
    },
    [activeScene, persist],
  )

  const removeLayer = useCallback(
    (id: string) => {
      setScenes((prev) => {
        const next = prev.map((s) => (s.key === activeScene ? { ...s, layers: s.layers.filter((l) => l.id !== id) } : s))
        persist(next)
        return next
      })
      if (selected === id) setSelected(null)
    },
    [activeScene, persist, selected],
  )

  /** Faz upload de um blob local para o storage e devolve o URL público (durável). */
  const uploadLocalSource = useCallback(async (s: MediaSource): Promise<string | null> => {
    try {
      return await uploadBlobOnline(s.name, s.src)
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveLayout = useCallback(async () => {
    setMsg("A guardar tudo…")
    // 1) sobe TODOS os ficheiros locais → URLs duráveis (nada pode ficar só local)
    let workingSources = sources
    const failed: string[] = []
    if (educator) {
      const pending = sources.filter((s) => !s.remote)
      if (pending.length) {
        setMsg(`A guardar ${pending.length} ficheiro(s) online…`)
        const uploaded = await Promise.all(
          pending.map(async (s) => {
            const url = await uploadLocalSource(s)
            if (!url) failed.push(s.name)
            return url ? { id: s.id, url } : null
          }),
        )
        const map = new Map(uploaded.filter(Boolean).map((u) => [u!.id, u!.url] as const))
        workingSources = sources.map((s) =>
          map.has(s.id) ? { ...s, src: map.get(s.id)!, remote: true, uploading: false, error: false } : failed.includes(s.name) && !s.remote ? { ...s, error: true } : s,
        )
        setSources(workingSources)
      }
    }
    // 2) só entram fontes ONLINE (remote) no save durável — um blob local não sobrevive à sessão
    const remoteSources = workingSources.filter((s) => s.remote)
    const remoteIds = new Set(remoteSources.map((s) => s.id))
    // 3) nunca gravar referências de intro penduradas (a causa do "intro em branco")
    const safeIntroBg = introBgMediaId && remoteIds.has(introBgMediaId) ? introBgMediaId : null
    const safeIntroMusic = introMusicId && remoteIds.has(introMusicId) ? introMusicId : null
    if (introBgMediaId && !safeIntroBg) failed.push("imagem de intro")
    if (introMusicId && !safeIntroMusic) failed.push("música de intro")
    // 4) grava layers (TODAS as cenas) + fontes online + intro validada
    const layers: Record<string, Layer[]> = {}
    scenes.forEach((s) => (layers[s.key] = s.layers))
    const payload = { layers, sources: remoteSources, introMusicId: safeIntroMusic, introBgMediaId: safeIntroBg, mixer }
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}:${educator?.id ?? "anon"}`, JSON.stringify(payload))
    } catch {
      /* ignora */
    }
    if (failed.length) {
      setMsg(`⚠️ Não consegui guardar online: ${[...new Set(failed)].join(", ")}. O resto ficou guardado. Verifica a ligação e carrega em Gravar outra vez.`)
    }
    if (educator) {
      if (serverSaveTimerRef.current) clearTimeout(serverSaveTimerRef.current)
      try {
        const r = await fetch("/api/live-sessions/studio-layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        })
        setMsg(r.ok ? "Tudo guardado na tua conta ✓ (cenas, fontes, imagem/música de intro e posições)" : "Gravado localmente (servidor indisponível)")
      } catch {
        setMsg("Gravado localmente (servidor indisponível)")
      }
    } else {
      setMsg("Guardado localmente ✓")
    }
  }, [scenes, sources, educator, introMusicId, introBgMediaId, mixer, uploadLocalSource])

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

    let frameDelta = 0 // ms desde o último frame (para os contadores)

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
      } else if (l.type === "timer") {
        // contador decrescente configurável (fundo transparente por natureza)
        const durationSec = l.opts?.durationSec ?? 300
        let st = timerStateRef.current[l.id]
        if (!st) {
          st = { remainingMs: durationSec * 1000, running: true } // arranca automaticamente
          timerStateRef.current[l.id] = st
        }
        if (st.running && st.remainingMs > 0) {
          st.remainingMs = Math.max(0, st.remainingMs - frameDelta)
          if (st.remainingMs === 0) {
            if (l.opts?.loop) st.remainingMs = durationSec * 1000 // reinicia (loop)
            else st.running = false
          }
        }
        const totalSec = Math.ceil(st.remainingMs / 1000)
        const mm = String(Math.floor(totalSec / 60)).padStart(2, "0")
        const ss = String(totalSec % 60).padStart(2, "0")
        const label = `${mm}:${ss}`
        const opacity = l.opts?.opacity ?? 1
        const color = l.opts?.color || "#D2A63C" // dourado por defeito
        ctx.save()
        ctx.globalAlpha = opacity
        // dígitos ajustados à altura da caixa
        const fs = Math.min(h * 0.62, w / (label.length * 0.62))
        ctx.font = `800 ${fs}px "Arial Narrow", Arial, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.shadowColor = "rgba(0,0,0,0.6)"
        ctx.shadowBlur = Math.max(4, fs * 0.06)
        ctx.fillStyle = st.remainingMs === 0 ? "#ef4444" : color
        ctx.fillText(label, x + w / 2, y + h / 2)
        ctx.restore()
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
      } else if (l.type === "ticker") {
        const text = (l.text && l.text.trim()) || "Escreve aqui o texto do rodapé…"
        // barra
        ctx.fillStyle = "rgba(10,14,26,0.85)"
        ctx.fillRect(x, y, w, h)
        ctx.fillStyle = "#D2A63C"
        ctx.fillRect(x, y, w, 3)
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, w, h)
        ctx.clip()
        const fs = Math.max(14, Math.min(h * 0.5, 32))
        ctx.font = `600 ${fs}px sans-serif`
        ctx.textBaseline = "middle"
        ctx.fillStyle = "#ffffff"
        const gap = 120
        const tw = ctx.measureText(text).width + gap
        let off = tickerOffsetsRef.current[l.id] ?? 0
        off = (off + 1.6) % tw
        tickerOffsetsRef.current[l.id] = off
        let sx = x + w - off
        while (sx < x + w) {
          ctx.fillText(text, sx, y + h / 2)
          sx += tw
        }
        // desenha a cópia à esquerda p/ loop contínuo
        ctx.fillText(text, x + w - off - tw, y + h / 2)
        ctx.restore()
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
      const now = performance.now()
      frameDelta = lastTsRef.current ? Math.min(200, now - lastTsRef.current) : 0
      lastTsRef.current = now
      // Intro sem imagem custom = canvas PRETO; restantes cenas = fundo escuro base
      ctx.fillStyle = scene.key === "intro" ? "#000000" : "#0a0e1a"
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
      // imagem de intro personalizada: SEMPRE full-frame (por cima do fundo default)
      if (scene.key === "intro" && introBgMediaId) {
        const el = mediaElsRef.current[introBgMediaId]
        if (el instanceof HTMLImageElement && el.complete && el.naturalWidth) {
          try {
            ctx.drawImage(el, 0, 0, CW, CH)
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
  }, [scene, selected, introBgMediaId])

  // ── interação ──
  const toCanvas = (e: { clientX: number; clientY: number }) => {
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

  // duplo clique num timer → abre configuração
  const onDoubleClick = (e: React.MouseEvent) => {
    const p = toCanvas(e)
    const ordered = [...scene.layers].sort((a, b) => b.z - a.z)
    for (const l of ordered) {
      if (l.type !== "timer" || !l.visible) continue
      const x = l.x * CW,
        y = l.y * CH,
        w = l.w * CW,
        h = l.h * CH
      if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) {
        setSelected(l.id)
        setTimerConfigId(l.id)
        return
      }
    }
  }

  const setTimerOpts = useCallback(
    (id: string, patch: { transparent?: boolean; opacity?: number; durationSec?: number; color?: string; loop?: boolean }) => {
      setScenes((prev) => {
        const next = prev.map((s) =>
          s.key === activeScene
            ? { ...s, layers: s.layers.map((l) => (l.id === id ? { ...l, opts: { ...l.opts, ...patch } } : l)) }
            : s,
        )
        persist(next)
        return next
      })
    },
    [activeScene, persist],
  )

  const [, forceTick] = useState(0)
  const timerDuration = useCallback(
    (id: string) => scene.layers.find((l) => l.id === id)?.opts?.durationSec ?? 300,
    [scene],
  )
  const startTimer = useCallback(
    (id: string) => {
      const dur = timerDuration(id)
      const st = timerStateRef.current[id] ?? { remainingMs: dur * 1000, running: false }
      if (st.remainingMs <= 0) st.remainingMs = dur * 1000
      st.running = true
      timerStateRef.current[id] = st
      forceTick((n) => n + 1)
    },
    [timerDuration],
  )
  const pauseTimer = useCallback((id: string) => {
    const st = timerStateRef.current[id]
    if (st) st.running = false
    forceTick((n) => n + 1)
  }, [])
  const resetTimer = useCallback(
    (id: string) => {
      timerStateRef.current[id] = { remainingMs: timerDuration(id) * 1000, running: false }
      forceTick((n) => n + 1)
    },
    [timerDuration],
  )
  const setTimerMinutes = useCallback(
    (id: string, minutes: number) => {
      const sec = Math.max(1, Math.round(minutes * 60))
      setTimerOpts(id, { durationSec: sec })
      timerStateRef.current[id] = { remainingMs: sec * 1000, running: timerStateRef.current[id]?.running ?? false }
      forceTick((n) => n + 1)
    },
    [setTimerOpts],
  )

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
      const vTrack = canvasStream.getVideoTracks()[0]
      const vSender = vTrack ? pc.addTrack(vTrack, canvasStream) : null
      const audioTrack = masterRef.current!.stream.getAudioTracks()[0]
      if (audioTrack) pc.addTrack(audioTrack, masterRef.current!.stream)

      // Bitrate ESTÁVEL (como o OBS ~2000 kbps 720p30): fixa max/min e não deixa o WebRTC baixar
      // resolução — mantém a qualidade constante em vez de oscilar com a rede.
      if (vSender && vTrack) {
        try {
          vTrack.contentHint = "detail" // aulas/gráficos: prioriza nitidez do texto
          const p = vSender.getParameters()
          if (!p.encodings || !p.encodings.length) p.encodings = [{}]
          p.encodings[0].maxBitrate = VIDEO_MAX_BITRATE
          // Piso baixo: o browser AUTO-REGULA (sobe até 2M quando a rede/CPU dá, desce suave quando
          // não) → stream independente das condições, sem stutter nem picos de carga no VPS. Um piso
          // alto forçava sempre ~2M e causava frame-drops em máquinas/redes fracas.
          ;(p.encodings[0] as RTCRtpEncodingParameters & { minBitrate?: number }).minBitrate = 500_000
          p.encodings[0].maxFramerate = 30
          p.encodings[0].scaleResolutionDownBy = 1 // mantém 720p; sob pressão baixa fps, não resolução
          ;(p as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = "maintain-resolution"
          await vSender.setParameters(p)
        } catch {
          /* alguns browsers só aceitam setParameters após a negociação */
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setPhase("live")
          setMsg("A transmitir ao vivo ✓ (dobragem + legendas ativas)")
          // só AGORA marca a sala LIVE (media do browser ligou) — não espera OBS
          fetch(`/api/live-sessions/whip?streamId=${encodeURIComponent(targetId)}`, {
            method: "PATCH",
            credentials: "same-origin",
          }).catch(() => {})
        } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setPhase("error")
          setMsg("Ligação de media não estabelecida (a tua rede pode bloquear UDP e TCP 8000).")
          // garante que a sala não fica marcada LIVE sem stream
          fetch(`/api/live-sessions/whip?streamId=${encodeURIComponent(targetId)}`, {
            method: "DELETE",
            credentials: "same-origin",
          }).catch(() => {})
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

  const chan = (key: "mic" | "pc" | "src" | "intro", label: string, icon: React.ReactNode) => {
    const c = mixer[key]
    const lvl = c.on ? levels[key] : 0
    const lvlColor = lvl > 0.85 ? "#ef4444" : lvl > 0.6 ? "#eab308" : "#22c55e"
    return (
      <div className="space-y-1">
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
      {/* medidor de nível de áudio */}
      <div className="ml-9 mr-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full transition-[width] duration-75" style={{ width: `${Math.round(lvl * 100)}%`, backgroundColor: lvlColor }} />
      </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <video ref={camVideoRef} className="hidden" playsInline muted />
      <video ref={screenVideoRef} className="hidden" playsInline muted />

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
              onDoubleClick={onDoubleClick}
              className="w-full cursor-move rounded-lg"
              style={{ aspectRatio: "16 / 9", touchAction: "none" }}
            />
            {timerConfigId && (() => {
              const t = scene.layers.find((l) => l.id === timerConfigId)
              if (!t) return null
              const opacity = t.opts?.opacity ?? 1
              const minutes = Math.round((t.opts?.durationSec ?? 300) / 60)
              const running = timerStateRef.current[t.id]?.running ?? false
              return (
                <div className="absolute left-1/2 top-1/2 z-10 w-72 -translate-x-1/2 -translate-y-1/2 space-y-2.5 rounded-xl border border-[#D2A63C]/50 bg-zinc-950/95 p-3 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#D2A63C]">Configurar contador</p>
                    <button onClick={() => setTimerConfigId(null)} className="text-zinc-500 hover:text-white">✕</button>
                  </div>
                  <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                    Minutos
                    <input
                      type="number"
                      min={1}
                      max={180}
                      defaultValue={minutes}
                      onChange={(e) => setTimerMinutes(t.id, Math.max(1, parseInt(e.target.value || "1", 10)))}
                      className="w-20 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-right text-sm text-white"
                    />
                  </label>
                  <div className="flex gap-1.5">
                    {[1, 3, 5, 10, 15].map((m) => (
                      <button key={m} onClick={() => setTimerMinutes(t.id, m)} className={`flex-1 rounded-md px-1.5 py-1 text-[11px] ${minutes === m ? "bg-[#D2A63C] text-black" : "bg-zinc-800 text-zinc-300 hover:text-white"}`}>
                        {m}m
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {running ? (
                      <Button size="sm" variant="outline" className="flex-1 border-zinc-700" onClick={() => pauseTimer(t.id)}>
                        Pausar
                      </Button>
                    ) : (
                      <Button size="sm" className="flex-1 bg-[#D2A63C] text-black hover:bg-[#c0972f]" onClick={() => startTimer(t.id)}>
                        Iniciar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="border-zinc-700" onClick={() => resetTimer(t.id)} title="Repor">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                  <label className="flex items-center justify-between text-xs text-zinc-300">
                    Loop (reinicia no fim)
                    <input type="checkbox" checked={t.opts?.loop ?? false} onChange={(e) => setTimerOpts(t.id, { loop: e.target.checked })} className="h-4 w-4 accent-[#D2A63C]" />
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-400">Cor</span>
                    {["#D2A63C", "#FFFFFF", "#22c55e", "#ef4444"].map((c) => (
                      <button key={c} onClick={() => setTimerOpts(t.id, { color: c })} className={`h-5 w-5 rounded-full border ${(t.opts?.color || "#D2A63C") === c ? "border-white" : "border-zinc-700"}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <label className="block text-xs text-zinc-300">
                    Opacidade
                    <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => setTimerOpts(t.id, { opacity: parseFloat(e.target.value) })} className="mt-1 w-full accent-[#D2A63C]" />
                  </label>
                  <p className="text-[10px] text-zinc-600">Arrasta o timer para mover · pega no canto para redimensionar. Duplo-clique abre isto.</p>
                </div>
              )
            })()}
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
            </div>
          </div>

          {/* Mixer de áudio — sempre visível, abaixo das cenas e acima das configurações */}
          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-xs font-medium text-zinc-400">Mixer de áudio</p>
            {chan("mic", "Microfone", <Mic className="h-3 w-3" />)}
            {chan("pc", "Áudio do PC", <Monitor className="h-3 w-3" />)}
            {chan("src", "Áudio da fonte", <Music className="h-3 w-3" />)}
            {chan("intro", "Áudio da Intro", <Music className="h-3 w-3" />)}
            <p className="text-[11px] text-zinc-600">Controla o que entra na transmissão. Ouves as fontes de média e a intro (o mic não é monitorizado para evitar retorno).</p>
          </div>

          {/* Botão para abrir configurações */}
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="w-full rounded-lg bg-zinc-800 px-2 py-2 text-xs text-zinc-300 hover:text-white"
          >
            <Settings2 className="mr-1 inline h-3.5 w-3.5" /> {showConfig ? "Fechar configurações" : "Fontes, dispositivos e rodapé …"}
          </button>

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
                      <button
                        onClick={() => (s.remote ? setMsg(`${s.name} já está online ✓`) : s.uploading ? undefined : promoteToOnline(s.id, s.name, s.src))}
                        disabled={s.uploading}
                        className="text-sm leading-none disabled:opacity-70"
                        title={s.remote ? "Guardado online" : s.uploading ? "A guardar online…" : s.error ? "Falhou — tentar de novo" : "Guardar online (upload)"}
                      >
                        {s.remote ? "✅" : s.uploading ? "⏳" : s.error ? "🔁" : "🆙"}
                      </button>
                      <button onClick={() => removeSource(s.id)} className="text-zinc-500 hover:text-red-400" title="Remover">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-600">Ficheiros locais valem para esta sessão; URLs ficam guardados.</p>
              </div>

              {/* Imagem de intro (full-frame) */}
              <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-xs font-medium text-zinc-400">Imagem de intro (full-frame)</p>
                <p className="text-[11px] text-zinc-600">Ocupa sempre o ecrã todo na cena <strong className="text-zinc-400">Intro</strong>. Sem escolha, fundo <strong className="text-zinc-400">preto</strong>. Ao guardar, a imagem escolhida fica como default (podes trocar).</p>
                <select
                  value={introBgMediaId ?? ""}
                  onChange={(e) => setIntroBgMediaId(e.target.value || null)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                >
                  <option value="">— preto (predefinido) —</option>
                  {sources.filter((s) => s.kind === "image").map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-2 py-1.5 text-[11px] text-zinc-300 hover:border-[#D2A63C] hover:text-white">
                  <ImageIcon className="h-3.5 w-3.5" /> Carregar imagem de intro
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) {
                        const src = URL.createObjectURL(f)
                        const s: MediaSource = { id: `img${Math.round(performance.now())}`, kind: "image", name: f.name, src, remote: false }
                        registerMediaElement(s)
                        setSources((prev) => [...prev, s])
                        setIntroBgMediaId(s.id)
                        setActiveScene("intro")
                        void promoteToOnline(s.id, s.name, src)
                      }
                      e.currentTarget.value = ""
                    }}
                  />
                </label>
              </div>

              {/* Música de intro */}
              <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-xs font-medium text-zinc-400">Música de intro (loop)</p>
                <p className="text-[11px] text-zinc-600">Toca em loop nas cenas <strong className="text-zinc-400">Intro</strong> e <strong className="text-zinc-400">Começamos em Breve</strong>.</p>
                <select
                  value={introMusicId ?? ""}
                  onChange={(e) => setIntroMusicId(e.target.value || null)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                >
                  <option value="">— sem música —</option>
                  {sources.filter((s) => s.kind === "audio").map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-2 py-1.5 text-[11px] text-zinc-300 hover:border-[#D2A63C] hover:text-white">
                  <Music className="h-3.5 w-3.5" /> Carregar mp3 de intro
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) {
                        const src = URL.createObjectURL(f)
                        const s: MediaSource = { id: `mus${Math.round(performance.now())}`, kind: "audio", name: f.name, src, remote: false }
                        registerMediaElement(s)
                        setSources((prev) => [...prev, s])
                        setIntroMusicId(s.id)
                        void promoteToOnline(s.id, s.name, src)
                      }
                      e.currentTarget.value = ""
                    }}
                  />
                </label>
                {sources.filter((s) => s.kind === "audio").length === 0 && (
                  <p className="text-[11px] text-zinc-600">Carrega um mp3 aqui ou em Fontes.</p>
                )}
              </div>

              {/* Rodapé deslizante (ticker) */}
              <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-xs font-medium text-zinc-400">Rodapé deslizante (ticker)</p>
                <Button size="sm" variant="outline" className="w-full border-zinc-700" onClick={addTicker}>
                  <Plus className="mr-1.5 h-4 w-4" /> Adicionar rodapé nesta cena
                </Button>
                {tickers.map((t) => (
                  <div key={t.id} className="space-y-1 rounded-lg bg-zinc-800/60 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">Texto (desliza da direita p/ a esquerda)</span>
                      <button onClick={() => removeLayer(t.id)} className="text-zinc-500 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <textarea
                      defaultValue={t.text}
                      onChange={(e) => updateTickerText(t.id, e.target.value)}
                      rows={2}
                      className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white"
                      placeholder="Escreve o texto do rodapé…"
                    />
                  </div>
                ))}
                {tickers.length === 0 && <p className="text-[11px] text-zinc-600">Sem rodapé nesta cena. O rodapé é arrastável, redimensionável e a posição/texto ficam gravados.</p>}
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

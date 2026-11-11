'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Check, ChevronLeft, ChevronsLeft, ChevronsRight, Circle, Flashlight, FlipHorizontal, Grid3x3, Mic, Pause, Play, RefreshCw, RotateCcw, Settings2, SkipForward, Square, Upload } from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'
import { PLANOS } from '@/lib/conteudo-magnetico/guiao'

/**
 * Teleprompter com gravação. Dois modos:
 *  · contínuo — o texto rola e grava-se tudo de seguida;
 *  · por blocos — cada parágrafo do guião é um bloco; no fim de cada bloco a GRAVAÇÃO pausa
 *    (MediaRecorder.pause), mudas de plano/câmara e a contagem retoma sozinha. Sai um só ficheiro.
 * Contagem configurável (0/3/5/10 s), início automático, pausa da gravação e do texto em separado,
 * câmara frontal/traseira, grelha, e atalhos de teclado (comandos Bluetooth mandam espaço/setas).
 * Controlos de hardware da câmara (só os que o aparelho expõe em track.getCapabilities()): zoom,
 * lanterna, tocar para focar, exposição, resolução 720/1080/4K, 30/60 fps e escolha do microfone
 * com medidor de nível. Sem texto (guião vazio) fica uma câmara simples para testar ou gravar livre.
 */

export type MarcaCasa = 'ricardo-garcia' | 'morethanmoney'
export type Guiao = { pecaId: string | null; marca: MarcaCasa; titulo: string; texto: string; palavraChave: string; planos?: (string | null)[] }

const COR: Record<MarcaCasa, string> = { morethanmoney: '#D2A63C', 'ricardo-garcia': '#0097b2' }
const NOME: Record<MarcaCasa, string> = { morethanmoney: 'More Than Money', 'ricardo-garcia': 'Ricardo Garcia' }
const LIMITE_MB = 65 // cabe no limite do Storage
type Resolucao = '720' | '1080' | '2160'
const RESOLUCOES: Record<Resolucao, { w: number; h: number; bps: number; nome: string }> = {
  '720': { w: 720, h: 1280, bps: 2_000_000, nome: '720p' },
  '1080': { w: 1080, h: 1920, bps: 3_000_000, nome: '1080p' },
  '2160': { w: 2160, h: 3840, bps: 8_000_000, nome: '4K' },
}
/** Segundos máximos para o ficheiro caber no limite (3 min no máximo). */
const maxSegundos = (r: Resolucao) => Math.min(180, Math.floor((LIMITE_MB * 8_000_000) / RESOLUCOES[r].bps))

/** O que o aparelho deixa mexer na câmara (Media Capture: getCapabilities). */
type Faixa = { min: number; max: number; step: number }
type Capacidades = { zoom?: Faixa; torch?: boolean; focus?: string[]; exposicao?: Faixa; pontos?: boolean; manuais?: Partial<Record<Manual, Faixa>>; modos?: Partial<Record<ModoAuto, string[]>> }

/**
 * Controlos manuais (Media Capture «image capture» constraints). Cada um só aparece se a câmara o
 * expuser: o Chrome em Android e muitas webcams dão quase todos; o Safari dá poucos.
 */
type ModoAuto = 'exposureMode' | 'whiteBalanceMode' | 'focusMode'
type Manual = 'iso' | 'exposureTime' | 'colorTemperature' | 'focusDistance' | 'brightness' | 'contrast' | 'saturation' | 'sharpness'
const MANUAIS: { k: Manual; nome: string; modo?: ModoAuto; fmt?: (v: number) => string }[] = [
  { k: 'iso', nome: 'ISO', modo: 'exposureMode', fmt: (v) => String(Math.round(v)) },
  // exposureTime vem em unidades de 100 µs
  { k: 'exposureTime', nome: 'Obturador', modo: 'exposureMode', fmt: (v) => (v >= 10000 ? `${(v / 10000).toFixed(1)} s` : `1/${Math.round(10000 / Math.max(v, 0.0001))}`) },
  { k: 'colorTemperature', nome: 'Balanço de brancos', modo: 'whiteBalanceMode', fmt: (v) => `${Math.round(v)} K` },
  { k: 'focusDistance', nome: 'Foco manual', modo: 'focusMode', fmt: (v) => v.toFixed(2) },
  { k: 'brightness', nome: 'Brilho' },
  { k: 'contrast', nome: 'Contraste' },
  { k: 'saturation', nome: 'Saturação' },
  { k: 'sharpness', nome: 'Nitidez' },
]

type Modo = 'continuo' | 'blocos'
type Prefs = { velocidade: number; tamanho: number; espelho: boolean; contagem: number; modo: Modo; autoRetomar: boolean; grelha: boolean; camara: 'user' | 'environment'; resolucao: Resolucao; fps: 30 | 60; micId: string; camId: string; cortar916: boolean; enquadrar: 'auto' | 'preencher' | 'encaixar' }
const PREFS_OMISSAO: Prefs = { velocidade: 40, tamanho: 30, espelho: true, contagem: 3, modo: 'continuo', autoRetomar: false, grelha: false, camara: 'user', resolucao: '1080', fps: 30, micId: '', camId: '', cortar916: true, enquadrar: 'auto' }
const CHAVE = 'estudio.teleprompter.v2'

function lerPrefs(): Prefs {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE) || '{}')
    return { ...PREFS_OMISSAO, ...j }
  } catch {
    return PREFS_OMISSAO
  }
}

function escolherMime(): string {
  const opcoes = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
  return opcoes.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? ''
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(await authHeaders()) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`)
  return j
}

type Estado = 'pronto' | 'contagem' | 'a_gravar' | 'entre_blocos' | 'timelapse' | 'a_montar' | 'rever' | 'a_subir' | 'guardado'
type Captura = 'video' | 'foto' | 'timelapse'
const INTERVALOS_TL = [0.5, 1, 2, 5, 10]

export function Teleprompter({ guiao, onSair }: { guiao: Guiao; onSair: () => void }) {
  const cor = COR[guiao.marca]
  const semTexto = !guiao.texto.trim()
  const blocos = (guiao.texto.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).concat(guiao.palavraChave ? [`Comenta «${guiao.palavraChave}».`] : []))

  const videoRef = useRef<HTMLVideoElement>(null)
  const textoRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const pedacosRef = useRef<Blob[]>([])
  const rafRef = useRef(0)
  const contagemRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gravadoRef = useRef(0) // segundos gravados (sem pausas)

  const [prefs, setPrefsState] = useState<Prefs>(PREFS_OMISSAO)
  const [painel, setPainel] = useState(false)
  const [estado, setEstado] = useState<Estado>('pronto')
  const [contagem, setContagem] = useState(3)
  const [segundos, setSegundos] = useState(0)
  const [textoPausado, setTextoPausado] = useState(false)
  const [gravPausada, setGravPausada] = useState(false)
  const [bloco, setBloco] = useState(0)
  const [take, setTake] = useState<{ blob: Blob; url: string; mime: string; dur: number } | null>(null)
  const [progresso, setProgresso] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [prefsLidas, setPrefsLidas] = useState(false)
  const [caps, setCaps] = useState<Capacidades>({})
  const [zoom, setZoom] = useState(1)
  const [lanterna, setLanterna] = useState(false)
  const [exposicao, setExposicao] = useState(0)
  const [foco, setFoco] = useState<{ x: number; y: number } | null>(null)
  const [mics, setMics] = useState<{ id: string; nome: string }[]>([])
  const [cams, setCams] = useState<{ id: string; nome: string }[]>([])
  const [deitada, setDeitada] = useState(false) // câmara a dar imagem horizontal (webcam, Osmo, iPhone no Mac)
  const [nivel, setNivel] = useState(0)
  const [real, setReal] = useState<string>('')
  const [versao, setVersao] = useState(0) // muda a cada stream novo (para o medidor)

  useEffect(() => {
    setPrefsState(lerPrefs())
    setPrefsLidas(true)
  }, [])
  // espelhar só a câmara frontal do próprio aparelho (as externas gravam como vêem)
  const espelhar = prefs.espelho && !prefs.camId && prefs.camara === 'user'
  const trocarCamara = () => (prefs.camId ? setPrefs({ camId: '' }) : setPrefs({ camara: prefs.camara === 'user' ? 'environment' : 'user' }))
  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((v) => {
      const n = { ...v, ...p }
      try {
        localStorage.setItem(CHAVE, JSON.stringify(n))
      } catch {}
      return n
    })

  // refs para o ciclo de animação
  const estadoRef = useRef(estado)
  estadoRef.current = estado
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const textoPausadoRef = useRef(textoPausado)
  textoPausadoRef.current = textoPausado
  const gravPausadaRef = useRef(gravPausada)
  gravPausadaRef.current = gravPausada
  const blocoRef = useRef(bloco)
  blocoRef.current = bloco

  // câmara (frontal ou traseira), 9:16, na resolução/fps e com o microfone escolhidos
  useEffect(() => {
    if (!prefsLidas) return
    let vivo = true
    streamRef.current?.getTracks().forEach((t) => t.stop())
    const r = RESOLUCOES[prefs.resolucao] ?? RESOLUCOES['1080']
    const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, ...(prefs.micId ? { deviceId: { exact: prefs.micId } } : {}) }
    // câmara escolhida pelo nome (iPhone por Continuity, Osmo em modo webcam, USB, OBS) ou frontal/traseira
    const video: MediaTrackConstraints = prefs.camId
      ? { deviceId: { exact: prefs.camId }, width: { ideal: r.h }, height: { ideal: r.w }, frameRate: { ideal: prefs.fps } }
      : { facingMode: prefs.camara, width: { ideal: r.w }, height: { ideal: r.h }, aspectRatio: { ideal: 9 / 16 }, frameRate: { ideal: prefs.fps } }
    const videoOmissao: MediaTrackConstraints = { facingMode: prefs.camara, width: { ideal: r.w }, height: { ideal: r.h }, frameRate: { ideal: prefs.fps } }
    const md = navigator.mediaDevices
    if (!md?.getUserMedia) {
      setErro('Este browser não dá acesso à câmara. Abre em https no Safari ou no Chrome.')
      return
    }
    md.getUserMedia({ video, audio })
      // o microfone guardado pode ter desaparecido (auscultadores desligados): tenta com o de omissão
      .catch(() => md.getUserMedia({ video, audio: { echoCancellation: true, noiseSuppression: true } }))
      // a câmara guardada pode estar desligada (Osmo sem cabo, iPhone longe): volta à do aparelho
      .catch(() => md.getUserMedia({ video: videoOmissao, audio: { echoCancellation: true, noiseSuppression: true } }))
      .then(async (s) => {
        if (!vivo) return s.getTracks().forEach((t) => t.stop())
        streamRef.current = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
        setErro(null)
        setVersao((n) => n + 1)
        const v = s.getVideoTracks()[0]
        const c = (v?.getCapabilities?.() ?? {}) as Record<string, any>
        const st = (v?.getSettings?.() ?? {}) as Record<string, any>
        const faixa = (x: any): Faixa | undefined => (x && typeof x.max === 'number' && x.max > x.min ? { min: x.min, max: x.max, step: x.step || 0.1 } : undefined)
        setCaps({
          zoom: faixa(c.zoom),
          torch: c.torch === true || (Array.isArray(c.torch) && c.torch.includes(true)),
          focus: Array.isArray(c.focusMode) ? c.focusMode : undefined,
          exposicao: faixa(c.exposureCompensation),
          pontos: 'pointsOfInterest' in c,
          manuais: Object.fromEntries(MANUAIS.map((m) => [m.k, faixa(c[m.k])]).filter(([, f]) => f)),
          modos: Object.fromEntries((['exposureMode', 'whiteBalanceMode', 'focusMode'] as ModoAuto[]).map((k) => [k, Array.isArray(c[k]) ? c[k] : undefined]).filter(([, v]) => v)),
        })
        setManuais(Object.fromEntries(MANUAIS.filter((m) => typeof st[m.k] === 'number').map((m) => [m.k, st[m.k] as number])))
        setAutos({})
        setZoom(typeof st.zoom === 'number' ? st.zoom : 1)
        setExposicao(typeof st.exposureCompensation === 'number' ? st.exposureCompensation : 0)
        setLanterna(false)
        setReal(st.width && st.height ? `${Math.min(st.width, st.height)}p${st.frameRate ? ` · ${Math.round(st.frameRate)} fps` : ''}` : '')
        setDeitada(!!st.width && !!st.height && st.width > st.height)
        await listarDispositivos()
      })
      .catch(() => setErro('Sem acesso à câmara ou ao microfone. Dá permissão nas definições do browser.'))
    return () => {
      vivo = false
    }
  }, [prefsLidas, prefs.camara, prefs.resolucao, prefs.fps, prefs.micId])

  // lista de câmaras e microfones (os nomes só aparecem depois da permissão); actualiza quando ligas/desligas um
  const listarDispositivos = useCallback(async () => {
    try {
      const lista = await navigator.mediaDevices.enumerateDevices()
      setMics(lista.filter((d) => d.kind === 'audioinput' && d.deviceId).map((d, i) => ({ id: d.deviceId, nome: d.label || `Microfone ${i + 1}` })))
      setCams(lista.filter((d) => d.kind === 'videoinput' && d.deviceId).map((d, i) => ({ id: d.deviceId, nome: d.label || `Câmara ${i + 1}` })))
    } catch {}
  }, [])
  useEffect(() => {
    const md = navigator.mediaDevices
    if (!md?.addEventListener) return
    const f = () => void listarDispositivos()
    md.addEventListener('devicechange', f)
    return () => md.removeEventListener('devicechange', f)
  }, [listarDispositivos])

  // medidor de nível do microfone (o volume real que vai para o take)
  useEffect(() => {
    const s = streamRef.current
    if (!s || !s.getAudioTracks().length || typeof AudioContext === 'undefined') return
    let ctx: AudioContext | null = null
    let raf = 0
    try {
      ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks()))
      const an = ctx.createAnalyser()
      an.fftSize = 512
      src.connect(an)
      const buf = new Uint8Array(an.fftSize)
      let ultimo = 0
      const medir = (t: number) => {
        an.getByteTimeDomainData(buf)
        let pico = 0
        for (const b of buf) pico = Math.max(pico, Math.abs(b - 128))
        if (t - ultimo > 80) {
          ultimo = t
          setNivel(Math.min(1, pico / 100))
        }
        raf = requestAnimationFrame(medir)
      }
      raf = requestAnimationFrame(medir)
    } catch {}
    return () => {
      cancelAnimationFrame(raf)
      void ctx?.close().catch(() => {})
    }
  }, [versao])

  /** Aplica um ajuste à pista de vídeo; se o aparelho recusar, não parte nada. */
  const ajustar = async (c: Record<string, unknown>) => {
    const v = streamRef.current?.getVideoTracks()[0]
    if (!v?.applyConstraints) return false
    try {
      await v.applyConstraints({ advanced: [c as MediaTrackConstraintSet] })
      return true
    } catch {
      return false
    }
  }
  const mudarZoom = (z: number) => {
    setZoom(z)
    void ajustar({ zoom: z })
  }
  const alternarLanterna = async () => {
    const n = !lanterna
    if (await ajustar({ torch: n })) setLanterna(n)
    else setErro('Esta câmara não deixa ligar a lanterna (só a traseira costuma ter).')
  }
  const [manuais, setManuais] = useState<Partial<Record<Manual, number>>>({})
  const [autos, setAutos] = useState<Partial<Record<ModoAuto, boolean>>>({}) // false = em manual
  const mudarManual = (m: (typeof MANUAIS)[number], v: number) => {
    setManuais((x) => ({ ...x, [m.k]: v }))
    const manualOk = m.modo && caps.modos?.[m.modo]?.includes('manual')
    if (m.modo && manualOk) setAutos((a) => ({ ...a, [m.modo!]: false }))
    void ajustar({ ...(m.modo && manualOk ? { [m.modo]: 'manual' } : {}), [m.k]: v })
  }
  const voltarAuto = (modo: ModoAuto) => {
    setAutos((a) => ({ ...a, [modo]: true }))
    void ajustar({ [modo]: caps.modos?.[modo]?.includes('continuous') ? 'continuous' : 'single-shot' })
  }

  // TIMELAPSE: guarda um fotograma JPEG a cada intervalo e no fim monta-os a 30 fps num vídeo
  // (tudo no aparelho; 10 min a 1 fotograma / 2 s dão 10 s de vídeo). Sem som.
  const [captura, setCaptura] = useState<Captura>('video')
  const [intervaloTL, setIntervaloTL] = useState(2)
  const [nFrames, setNFrames] = useState(0)
  const framesRef = useRef<Blob[]>([])
  const tlRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const MAX_FRAMES = 1800 // 60 s de vídeo final
  const canvasFrame = () => {
    const el = videoRef.current
    const v = streamRef.current?.getVideoTracks()[0]
    if (!el || !v) return null
    const st = v.getSettings()
    const W = st.width || el.videoWidth
    const H = st.height || el.videoHeight
    if (!W || !H) return null
    const cortar = deitada && prefs.cortar916 && W > H
    const w = cortar ? Math.round((H * 9) / 16 / 2) * 2 : W
    const c = document.createElement('canvas')
    c.width = w
    c.height = H
    c.getContext('2d')!.drawImage(el, cortar ? Math.round((W - w) / 2) : 0, 0, w, H, 0, 0, w, H)
    return c
  }
  const comecarTimelapse = () => {
    if (!streamRef.current) return setErro('A câmara ainda não está pronta.')
    setErro(null)
    framesRef.current = []
    setNFrames(0)
    setEstado('timelapse')
    const apanhar = () => {
      const c = canvasFrame()
      c?.toBlob((b) => {
        if (!b) return
        framesRef.current.push(b)
        setNFrames(framesRef.current.length)
        if (framesRef.current.length >= MAX_FRAMES) void pararTimelapse()
      }, 'image/jpeg', 0.85)
    }
    apanhar()
    tlRef.current = setInterval(apanhar, intervaloTL * 1000)
  }
  const pararTimelapse = async () => {
    if (tlRef.current) clearInterval(tlRef.current)
    tlRef.current = null
    const frames = framesRef.current
    if (frames.length < 2) {
      setEstado('pronto')
      return setErro('O timelapse precisa de pelo menos 2 fotogramas.')
    }
    setEstado('a_montar')
    try {
      const primeiro = await createImageBitmap(frames[0])
      const c = document.createElement('canvas')
      c.width = primeiro.width
      c.height = primeiro.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(primeiro, 0, 0)
      primeiro.close()
      const mime = escolherMime()
      const saida = c.captureStream(30)
      const rec = new MediaRecorder(saida, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: (RESOLUCOES[prefs.resolucao] ?? RESOLUCOES['1080']).bps })
      const pedacos: Blob[] = []
      rec.ondataavailable = (e) => e.data.size && pedacos.push(e.data)
      const fim = new Promise<void>((ok) => (rec.onstop = () => ok()))
      rec.start(500)
      for (let i = 0; i < frames.length; i++) {
        const t0 = performance.now()
        const bm = await createImageBitmap(frames[i])
        ctx.drawImage(bm, 0, 0, c.width, c.height)
        bm.close()
        setProgresso(Math.round(((i + 1) / frames.length) * 100))
        await new Promise((ok) => setTimeout(ok, Math.max(0, 1000 / 30 - (performance.now() - t0))))
      }
      await new Promise((ok) => setTimeout(ok, 200))
      rec.stop()
      await fim
      saida.getTracks().forEach((t) => t.stop())
      const tipo = rec.mimeType || mime || 'video/webm'
      const blob = new Blob(pedacos, { type: tipo })
      framesRef.current = []
      setTake({ blob, url: URL.createObjectURL(blob), mime: tipo, dur: frames.length / 30 })
      setEstado('rever')
    } catch {
      setEstado('pronto')
      setErro('Não consegui montar o timelapse neste browser.')
    }
  }
  useEffect(() => () => { if (tlRef.current) clearInterval(tlRef.current) }, [])

  // FOTO: tira uma fotografia (resolução total quando o browser deixa) e guarda-a nos Ativos
  const [fotoEstado, setFotoEstado] = useState<'' | 'a_tirar' | 'guardada' | 'erro'>('')
  const [flash, setFlash] = useState(false)
  const tirarFoto = async () => {
    const v = streamRef.current?.getVideoTracks()[0]
    const el = videoRef.current
    if (!v || !el) return
    setFotoEstado('a_tirar')
    setFlash(true)
    setTimeout(() => setFlash(false), 180)
    try {
      let blob: Blob | null = null
      const IC = (window as any).ImageCapture
      if (IC && !(deitada && prefs.cortar916)) {
        try {
          blob = await new IC(v).takePhoto()
        } catch {}
      }
      if (!blob) {
        const c = canvasFrame()
        blob = c ? await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.92)) : null
      }
      if (!blob) throw new Error('sem imagem')
      const mime = blob.type || 'image/jpeg'
      const nome = `Foto ${new Date().toLocaleString('pt-PT').replace(/[/:]/g, '-')}.${mime.includes('png') ? 'png' : 'jpg'}`
      const r = await api('/api/estudio/ativo', { method: 'POST', body: JSON.stringify({ nome, mime, tamanho: blob.size, peca_id: guiao.pecaId }) })
      const up = await fetch(r.upload_url, { method: 'PUT', headers: { 'content-type': mime }, body: blob })
      if (!up.ok) throw new Error('upload')
      await api('/api/estudio/ativo', { method: 'PATCH', body: JSON.stringify({ id: r.id, estado: 'pronto' }) })
      setFotoEstado('guardada')
    } catch {
      setFotoEstado('erro')
    }
    setTimeout(() => setFotoEstado(''), 2500)
  }

  const mudarExposicao = (e: number) => {
    setExposicao(e)
    void ajustar({ exposureCompensation: e })
  }
  // tocar no vídeo para focar (onde o aparelho deixa); sem suporte, faz só a focagem automática
  const tocarParaFocar = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!caps.pontos && !caps.focus?.length) return
    const r = ev.currentTarget.getBoundingClientRect()
    let x = (ev.clientX - r.left) / r.width
    const y = (ev.clientY - r.top) / r.height
    if (espelhar) x = 1 - x
    setFoco({ x: (ev.clientX - r.left) / r.width, y })
    setTimeout(() => setFoco(null), 900)
    const modo = caps.focus?.includes('single-shot') ? 'single-shot' : caps.focus?.includes('continuous') ? 'continuous' : undefined
    void ajustar({ ...(caps.pontos ? { pointsOfInterest: [{ x, y }] } : {}), ...(modo ? { focusMode: modo } : {}) })
  }

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current)
      if (contagemRef.current) clearInterval(contagemRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  // o <video> da câmara volta a montar depois de rever um take: religar o stream
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [estado])

  const parar = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    if (contagemRef.current) clearInterval(contagemRef.current)
    const r = recRef.current
    if (r && r.state !== 'inactive') r.stop()
  }, [])

  // fim de um bloco: pausa a gravação; o último bloco termina o take
  const fimDeBloco = useCallback(() => {
    if (estadoRef.current !== 'a_gravar') return
    const r = recRef.current
    if (blocoRef.current >= blocos.length - 1) {
      estadoRef.current = 'rever'
      return parar()
    }
    if (r?.state === 'recording') r.pause()
    estadoRef.current = 'entre_blocos'
    setEstado('entre_blocos')
    if (prefsRef.current.autoRetomar) setTimeout(() => estadoRef.current === 'entre_blocos' && proximoBloco(), 1500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocos.length, parar])

  // ciclo: rola o texto e conta só o tempo realmente gravado
  const ciclo = useCallback(() => {
    let ultimo = performance.now()
    const passo = (agora: number) => {
      const dt = (agora - ultimo) / 1000
      ultimo = agora
      if (estadoRef.current === 'a_gravar') {
        const el = textoRef.current
        if (!gravPausadaRef.current) {
          gravadoRef.current += dt
          setSegundos(gravadoRef.current)
          if (el && !textoPausadoRef.current) el.scrollTop += prefsRef.current.velocidade * dt
        }
        if (gravadoRef.current >= maxSegundos(prefsRef.current.resolucao)) return parar()
        // modo por blocos: chegou ao fim do bloco → pausa
        if (prefsRef.current.modo === 'blocos' && el && !gravPausadaRef.current && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          fimDeBloco()
        }
      }
      rafRef.current = requestAnimationFrame(passo)
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(passo)
  }, [fimDeBloco, parar])

  const contar = (depois: () => void) => {
    const n0 = prefsRef.current.contagem
    if (n0 <= 0) return depois()
    setEstado('contagem')
    let n = n0
    setContagem(n)
    if (contagemRef.current) clearInterval(contagemRef.current)
    contagemRef.current = setInterval(() => {
      n -= 1
      if (n > 0) return setContagem(n)
      clearInterval(contagemRef.current!)
      contagemRef.current = null
      depois()
    }, 1000)
  }

  const comecar = () => {
    if (!streamRef.current) return setErro('A câmara ainda não está pronta.')
    setErro(null)
    setBloco(0)
    if (textoRef.current) textoRef.current.scrollTop = 0
    contar(gravar)
  }

  /**
   * Câmara horizontal (webcam, Osmo, iPhone no Mac) e «Recortar para 9:16» ligado: grava-se o centro
   * da imagem num canvas vertical, com o som original. Devolve o stream a gravar e como parar o recorte.
   */
  const recorteRef = useRef<(() => void) | null>(null)
  const streamParaGravar = (): MediaStream => {
    const s = streamRef.current!
    const v = s.getVideoTracks()[0]
    const st = (v?.getSettings?.() ?? {}) as MediaTrackSettings
    const el = videoRef.current
    if (!prefsRef.current.cortar916 || !el || !st.width || !st.height || st.width <= st.height) return s
    const canvas = document.createElement('canvas')
    if (typeof canvas.captureStream !== 'function') return s
    const h = st.height
    const w = Math.round((h * 9) / 16 / 2) * 2
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return s
    const sx = Math.round((st.width - w) / 2)
    const fps = Math.round(st.frameRate || prefsRef.current.fps || 30)
    const desenhar = () => ctx.drawImage(el, sx, 0, w, h, 0, 0, w, h)
    desenhar()
    const id = setInterval(desenhar, 1000 / fps)
    const saida = canvas.captureStream(fps)
    s.getAudioTracks().forEach((t) => saida.addTrack(t))
    recorteRef.current = () => {
      clearInterval(id)
      saida.getVideoTracks().forEach((t) => t.stop())
    }
    return saida
  }

  const gravar = () => {
    const mime = escolherMime()
    let rec: MediaRecorder
    try {
      recorteRef.current?.()
      rec = new MediaRecorder(streamParaGravar(), { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: (RESOLUCOES[prefsRef.current.resolucao] ?? RESOLUCOES['1080']).bps })
    } catch {
      setEstado('pronto')
      return setErro('Este browser não grava vídeo. Usa o Safari ou o Chrome actualizados.')
    }
    pedacosRef.current = []
    gravadoRef.current = 0
    rec.ondataavailable = (e) => e.data.size && pedacosRef.current.push(e.data)
    rec.onstop = () => {
      cancelAnimationFrame(rafRef.current)
      recorteRef.current?.()
      recorteRef.current = null
      const tipo = rec.mimeType || mime || 'video/webm'
      const blob = new Blob(pedacosRef.current, { type: tipo })
      setTake({ blob, url: URL.createObjectURL(blob), mime: tipo, dur: gravadoRef.current })
      setEstado('rever')
    }
    recRef.current = rec
    rec.start(1000)
    setTextoPausado(false)
    setGravPausada(false)
    setEstado('a_gravar')
    ciclo()
  }

  // retoma no bloco seguinte, com contagem (para mudares de plano)
  const proximoBloco = () => {
    setBloco((b) => b + 1)
    if (textoRef.current) textoRef.current.scrollTop = 0
    contar(() => {
      const r = recRef.current
      if (r?.state === 'paused') r.resume()
      setGravPausada(false)
      setTextoPausado(false)
      setEstado('a_gravar')
    })
  }

  // recuar/avançar o texto do teleprompter (≈3 linhas) ou voltar ao início; 0 = início
  const moverTexto = (dir: -1 | 0 | 1) => {
    const el = textoRef.current
    if (!el) return
    if (dir === 0) {
      el.scrollTop = 0
      return
    }
    const passo = Math.round(prefsRef.current.tamanho * 1.35 * 3)
    el.scrollTo({ top: Math.max(0, el.scrollTop + dir * passo), behavior: 'smooth' })
  }

  // pausa/retoma a GRAVAÇÃO (não só o texto), em qualquer modo
  const alternarGravacao = () => {
    const r = recRef.current
    if (!r) return
    if (r.state === 'recording') {
      r.pause()
      setGravPausada(true)
    } else if (r.state === 'paused') {
      contar(() => {
        r.resume()
        setGravPausada(false)
        setEstado('a_gravar')
      })
    }
  }

  const repetir = () => {
    if (take) URL.revokeObjectURL(take.url)
    setTake(null)
    setSegundos(0)
    setBloco(0)
    setEstado('pronto')
  }

  const guardar = async () => {
    if (!take) return
    setEstado('a_subir')
    setProgresso(0)
    setErro(null)
    try {
      const r = await api('/api/estudio/gravacao', {
        method: 'POST',
        body: JSON.stringify({ peca_id: guiao.pecaId, marca: guiao.marca, mime: take.mime, duracao_s: take.dur }),
      })
      await new Promise<void>((ok, falha) => {
        const x = new XMLHttpRequest()
        x.open('PUT', r.upload_url)
        x.setRequestHeader('content-type', take.mime.split(';')[0])
        x.upload.onprogress = (e) => e.lengthComputable && setProgresso(Math.round((e.loaded / e.total) * 100))
        x.onload = () => (x.status < 300 ? ok() : falha(new Error(`Upload falhou (${x.status})`)))
        x.onerror = () => falha(new Error('Sem rede durante o upload.'))
        x.send(take.blob)
      })
      await api('/api/estudio/gravacao', { method: 'PATCH', body: JSON.stringify({ id: r.id, estado: 'bruto' }) })
      setEstado('guardado')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui guardar o take.')
      setEstado('rever')
    }
  }

  // atalhos: espaço pausa o texto, Enter grava/pára, setas mudam a velocidade, P pausa a gravação,
  // → / PageDown passam ao bloco seguinte (os comandos Bluetooth mandam estas teclas)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const st = estadoRef.current
      if (e.key === ' ') {
        e.preventDefault()
        if (st === 'a_gravar') setTextoPausado((p) => !p)
        else if (st === 'entre_blocos') proximoBloco()
      } else if (e.key === 'Enter') {
        if (st === 'pronto') comecar()
        else if (st === 'a_gravar' || st === 'entre_blocos') parar()
      } else if (e.key === 'ArrowUp') setPrefs({ velocidade: Math.min(160, prefsRef.current.velocidade + 5) })
      else if (e.key === 'ArrowDown') setPrefs({ velocidade: Math.max(5, prefsRef.current.velocidade - 5) })
      else if (e.key.toLowerCase() === 'p' && (st === 'a_gravar')) alternarGravacao()
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (!semTexto) moverTexto(-1)
      } else if (e.key === 'Home') {
        if (!semTexto) moverTexto(0)
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (semTexto) return
        if (st === 'a_gravar' && prefsRef.current.modo === 'blocos') fimDeBloco()
        else if (st === 'entre_blocos') proximoBloco()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const aGravar = estado === 'a_gravar'
  const emCurso = aGravar || estado === 'entre_blocos' || estado === 'timelapse' || estado === 'a_montar' || (estado === 'contagem' && !!recRef.current && recRef.current.state !== 'inactive')
  const MAX_SEGUNDOS = maxSegundos(prefs.resolucao)
  const planoDe = (i: number) => {
    const id = guiao.planos?.[i]
    return id && id in PLANOS ? PLANOS[id as keyof typeof PLANOS] : null
  }
  const comCamara = !take && estado !== 'rever' && estado !== 'a_subir' && estado !== 'guardado'
  const textoVisivel = prefs.modo === 'blocos' ? blocos[bloco] ?? '' : blocos.join('\n\n')
  const wpm = Math.round((prefs.velocidade / (prefs.tamanho * 1.3)) * 60 * 2.2) // estimativa grosseira

  // O gravador vai directo para o <body> e fica por cima de tudo: o menu do site e a barra de
  // separadores do estúdio tapavam a barra de cima (câmara, definições, voltar).
  const [montado, setMontado] = useState(false)
  useEffect(() => {
    setMontado(true)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // esconde o menu do site enquanto o gravador está aberto (o menu tem z-index máximo)
    document.documentElement.dataset.gravador = '1'
    return () => {
      document.body.style.overflow = antes
      delete document.documentElement.dataset.gravador
    }
  }, [])

  // Num ecrã largo (Mac, iPad deitado) o «preencher» cortava a cara: por omissão encaixa a imagem
  // inteira quando o ecrã está deitado e preenche quando está ao alto.
  const [ecraDeitado, setEcraDeitado] = useState(false)
  useEffect(() => {
    const ver = () => setEcraDeitado(window.innerWidth > window.innerHeight)
    ver()
    window.addEventListener('resize', ver)
    return () => window.removeEventListener('resize', ver)
  }, [])
  const preencher = prefs.enquadrar === 'preencher' || (prefs.enquadrar !== 'encaixar' && !ecraDeitado)

  const ecra = (
    <main style={{ zIndex: 2147483647 }} className="fixed inset-0 overflow-hidden bg-black text-white" role="dialog" aria-modal="true" aria-label="Gravador">
      {estado === 'rever' || estado === 'a_subir' || estado === 'guardado' ? (
        <video src={take?.url} controls playsInline className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <div className="absolute inset-0" onPointerDown={tocarParaFocar}>
          <video ref={videoRef} autoPlay muted playsInline className={`absolute inset-0 h-full w-full ${preencher ? 'object-cover' : 'object-contain'}`} style={{ transform: espelhar ? 'scaleX(-1)' : undefined }} />
          {foco && (
            <span className="pointer-events-none absolute z-[6] h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-md border-2" style={{ left: `${foco.x * 100}%`, top: `${foco.y * 100}%`, borderColor: cor }} aria-hidden />
          )}
        </div>
      )}

      {flash && <div className="pointer-events-none absolute inset-0 z-[60] bg-white/80" aria-hidden />}

      {deitada && prefs.cortar916 && comCamara && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-[4] aspect-[9/16] h-full -translate-x-1/2 rounded-sm ring-1 ring-white/40 [box-shadow:0_0_0_9999px_rgba(0,0,0,.45)]" aria-hidden />
      )}

      {prefs.grelha && !take && (
        <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
        </div>
      )}

      {/* Barra de topo */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onSair} disabled={emCurso} aria-label="Voltar" className="grid h-11 w-11 place-items-center rounded-full bg-black/40 disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 text-center text-xs">
          <div className="font-medium" style={{ color: cor }}>{NOME[guiao.marca]}</div>
          <div className="truncate tabular-nums text-zinc-300" aria-live="polite">
            {emCurso ? `${gravPausada || estado === 'entre_blocos' ? '❚❚' : '●'} ${mmss(segundos)} / ${mmss(MAX_SEGUNDOS)}` : guiao.titulo}
            {!semTexto && prefs.modo === 'blocos' && (emCurso || estado === 'pronto') ? ` · bloco ${bloco + 1}/${blocos.length}` : ''}
            {!semTexto && prefs.modo === 'blocos' && (emCurso || estado === 'pronto') && planoDe(bloco) ? ` · ${planoDe(bloco)!.nome}` : ''}
          </div>
          {comCamara && (
            <div className="mt-1 flex items-center justify-center gap-1.5 text-[10px] text-zinc-400">
              <Mic className="h-3 w-3" aria-hidden />
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/15" role="meter" aria-label="Nível do microfone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(nivel * 100)}>
                <span className="block h-full transition-[width] duration-75" style={{ width: `${Math.round(nivel * 100)}%`, background: nivel > 0.9 ? '#ef4444' : cor }} />
              </span>
              {real && <span className="tabular-nums">{real}</span>}
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {caps.torch && comCamara && (
            <button type="button" onClick={alternarLanterna} aria-pressed={lanterna} aria-label={lanterna ? 'Desligar lanterna' : 'Ligar lanterna'} className="grid h-11 w-11 place-items-center rounded-full bg-black/40" style={lanterna ? { color: cor } : undefined}>
              <Flashlight className="h-5 w-5" aria-hidden />
            </button>
          )}
          <button type="button" disabled={emCurso} onClick={trocarCamara} aria-label="Trocar de câmara" className="grid h-11 w-11 place-items-center rounded-full bg-black/40 disabled:opacity-30">
            <Camera className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" onClick={() => setPainel((v) => !v)} aria-expanded={painel} aria-label="Definições de gravação" className="grid h-11 w-11 place-items-center rounded-full bg-black/40">
            <Settings2 className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Painel de definições */}
      {painel && (
        <div className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-4 text-sm shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-medium" style={{ color: cor }}>Gravação</span>
            <button type="button" onClick={() => setPainel(false)} className="min-h-11 px-3 text-zinc-400">Fechar</button>
          </div>
          <fieldset disabled={emCurso} className="space-y-4 disabled:opacity-50">
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-xs text-zinc-400"><Camera className="h-3.5 w-3.5" aria-hidden /> Câmara</span>
              <select value={prefs.camId} onChange={(e) => setPrefs({ camId: e.target.value })} className="min-h-11 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 text-sm">
                <option value="">{prefs.camara === 'user' ? 'Frontal deste aparelho' : 'Traseira deste aparelho'}</option>
                {cams.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-xs text-zinc-400"><Mic className="h-3.5 w-3.5" aria-hidden /> Microfone</span>
              <select value={prefs.micId} onChange={(e) => setPrefs({ micId: e.target.value })} className="min-h-11 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 text-sm">
                <option value="">O do aparelho (omissão)</option>
                {mics.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </label>
            <details className="rounded-xl border border-white/10 p-3 text-xs text-zinc-400">
              <summary className="cursor-pointer text-zinc-300">Como ligar outra câmara ou microfone</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li><b>iPhone perto do Mac</b>: Continuity Camera, sem cabo (mesmo Apple ID, Wi-Fi e Bluetooth ligados). Aparece como câmara do iPhone.</li>
                <li><b>DJI Osmo Pocket 3</b>: liga por USB-C e escolhe «Webcam» no Osmo.</li>
                <li><b>Webcam ou microfone USB</b> (lapela, recetor sem fios): aparecem logo nas listas.</li>
                <li><b>Câmaras por Wi-Fi</b>: recebe-as no OBS (app da câmara, NDI ou RTMP) e carrega em «Iniciar câmara virtual». Aparece como OBS Virtual Camera.</li>
                <li><b>Bluetooth</b> não passa vídeo. Serve para comandos (espaço, Enter, setas, P) e microfones, que soam pior do que um de lapela.</li>
              </ul>
              <p className="mt-2">Se ligaste agora, a lista actualiza sozinha. Se não aparecer, recarrega a página.</p>
            </details>
            <div>
              <div className="mb-1 text-xs text-zinc-400">Imagem no ecrã</div>
              <div className="grid grid-cols-3 gap-2">
                {([['auto', 'Automático'], ['encaixar', 'Inteira'], ['preencher', 'Preencher']] as const).map(([v, nome]) => (
                  <button key={v} type="button" onClick={() => setPrefs({ enquadrar: v })} aria-pressed={prefs.enquadrar === v} className="min-h-11 rounded-xl border text-xs" style={prefs.enquadrar === v ? { borderColor: cor, color: cor } : { borderColor: 'rgba(255,255,255,.15)' }}>
                    {nome}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">Só muda o que vês. A gravação fica igual.</p>
            </div>
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span>Recortar para vertical 9:16 quando a câmara é horizontal{deitada ? ' (esta é)' : ''}</span>
              <input type="checkbox" checked={prefs.cortar916} onChange={(e) => setPrefs({ cortar916: e.target.checked })} className="h-5 w-5" style={{ accentColor: cor }} />
            </label>
            <div>
              <div className="mb-1 text-xs text-zinc-400">Resolução {real && <span className="text-zinc-500">· a câmara está a dar {real}</span>}</div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(RESOLUCOES) as Resolucao[]).map((r) => (
                  <button key={r} type="button" onClick={() => setPrefs({ resolucao: r })} aria-pressed={prefs.resolucao === r} className="min-h-11 rounded-xl border text-xs" style={prefs.resolucao === r ? { borderColor: cor, color: cor } : { borderColor: 'rgba(255,255,255,.15)' }}>
                    {RESOLUCOES[r].nome}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-zinc-500">Máximo de {mmss(maxSegundos(prefs.resolucao))} por take nesta resolução, para caber no envio.</p>
            </div>
            <div>
              <div className="mb-1 text-xs text-zinc-400">Imagens por segundo</div>
              <div className="grid grid-cols-2 gap-2">
                {([30, 60] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setPrefs({ fps: f })} aria-pressed={prefs.fps === f} className="min-h-11 rounded-xl border text-xs" style={prefs.fps === f ? { borderColor: cor, color: cor } : { borderColor: 'rgba(255,255,255,.15)' }}>
                    {f} fps
                  </button>
                ))}
              </div>
            </div>
          </fieldset>
          <div className="mt-4 space-y-4">
            {caps.exposicao && (
              <label className="block text-xs text-zinc-400">
                Exposição <span className="tabular-nums text-zinc-500">{exposicao > 0 ? '+' : ''}{exposicao.toFixed(1)}</span>
                <input type="range" min={caps.exposicao.min} max={caps.exposicao.max} step={caps.exposicao.step} value={exposicao} onChange={(e) => mudarExposicao(Number(e.target.value))} className="mt-1 h-11 w-full" style={{ accentColor: cor }} />
              </label>
            )}
            {MANUAIS.filter((m) => caps.manuais?.[m.k]).map((m) => {
              const f = caps.manuais![m.k]!
              const v = manuais[m.k] ?? f.min
              const emAuto = m.modo ? autos[m.modo] !== false : false
              return (
                <div key={m.k}>
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{m.nome} <span className="tabular-nums text-zinc-500">{emAuto ? 'auto' : m.fmt ? m.fmt(v) : Number(v.toFixed(2))}</span></span>
                    {m.modo && !emAuto && (
                      <button type="button" onClick={() => voltarAuto(m.modo!)} className="min-h-9 rounded-full border border-white/15 px-3 text-[11px]">Auto</button>
                    )}
                  </div>
                  <input type="range" min={f.min} max={f.max} step={f.step} value={v} onChange={(e) => mudarManual(m, Number(e.target.value))} aria-label={m.nome} className="mt-1 h-11 w-full" style={{ accentColor: cor }} />
                </div>
              )
            })}
            <details className="rounded-xl border border-white/10 p-3 text-xs text-zinc-400">
              <summary className="cursor-pointer text-zinc-300">Retrato, luz de estúdio e enquadramento automático</summary>
              <p className="mt-2">
                Estes efeitos são do sistema e funcionam aqui também. No iPhone, iPad e Mac abre o Centro de Controlo enquanto o gravador está aberto e toca em
                «Efeitos de vídeo»: Retrato (fundo desfocado), Luz de estúdio, Palco central (segue-te no enquadramento) e Reações. Se não vires a opção, o aparelho não a suporta.
              </p>
              <p className="mt-2">ISO, obturador, balanço de brancos e foco manual só aparecem quando a câmara os deixa mexer pelo browser. No Chrome em Android e em muitas webcams aparecem quase todos; no Safari aparecem poucos.</p>
            </details>
            {!caps.zoom && !caps.torch && !caps.exposicao && !caps.pontos && (
              <p className="text-xs text-zinc-500">Este browser não deixa mexer no zoom, na lanterna nem na exposição desta câmara. No iPhone isso chega com o iOS 17 ou mais recente; experimenta também a câmara traseira.</p>
            )}
          </div>
          <fieldset disabled={emCurso} className="mt-4 space-y-4 disabled:opacity-50">
            <div className={semTexto ? 'hidden' : ''}>
              <div className="mb-1 text-xs text-zinc-400">Modo</div>
              <div className="grid grid-cols-2 gap-2">
                {([['continuo', 'Contínuo'], ['blocos', 'Por blocos (planos)']] as const).map(([m, t]) => (
                  <button key={m} type="button" onClick={() => setPrefs({ modo: m })} aria-pressed={prefs.modo === m} className="min-h-11 rounded-xl border px-3 text-xs" style={prefs.modo === m ? { borderColor: cor, color: cor } : { borderColor: 'rgba(255,255,255,.15)' }}>
                    {t}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {prefs.modo === 'blocos' ? `Cada parágrafo é um bloco (${blocos.length}). No fim de cada um a gravação pausa para mudares de plano; sai um só vídeo.` : 'O texto rola e grava-se tudo de seguida.'}
              </p>
            </div>
            <div>
              <div className="mb-1 text-xs text-zinc-400">Contagem decrescente</div>
              <div className="grid grid-cols-4 gap-2">
                {[0, 3, 5, 10].map((n) => (
                  <button key={n} type="button" onClick={() => setPrefs({ contagem: n })} aria-pressed={prefs.contagem === n} className="min-h-11 rounded-xl border text-xs" style={prefs.contagem === n ? { borderColor: cor, color: cor } : { borderColor: 'rgba(255,255,255,.15)' }}>
                    {n === 0 ? 'Sem' : `${n} s`}
                  </button>
                ))}
              </div>
            </div>
            {!semTexto && prefs.modo === 'blocos' && (
              <label className="flex min-h-11 items-center justify-between gap-3">
                <span>Retomar sozinho no bloco seguinte (com a contagem)</span>
                <input type="checkbox" checked={prefs.autoRetomar} onChange={(e) => setPrefs({ autoRetomar: e.target.checked })} className="h-5 w-5" style={{ accentColor: cor }} />
              </label>
            )}
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="flex items-center gap-2"><FlipHorizontal className="h-4 w-4" aria-hidden /> Espelhar câmara frontal</span>
              <input type="checkbox" checked={prefs.espelho} onChange={(e) => setPrefs({ espelho: e.target.checked })} className="h-5 w-5" style={{ accentColor: cor }} />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="flex items-center gap-2"><Grid3x3 className="h-4 w-4" aria-hidden /> Grelha de enquadramento</span>
              <input type="checkbox" checked={prefs.grelha} onChange={(e) => setPrefs({ grelha: e.target.checked })} className="h-5 w-5" style={{ accentColor: cor }} />
            </label>
          </fieldset>
          <p className="mt-4 text-xs text-zinc-500">
            Teclado ou comando Bluetooth: Enter grava/pára · espaço pausa o texto · P pausa a gravação · ↑/↓ velocidade · ← ou PageUp recua o texto · Home volta ao início · → ou PageDown bloco seguinte.
          </p>
        </div>
      )}

      {/* Teleprompter: junto ao topo, perto da lente, para o olhar não fugir */}
      {!semTexto && captura === 'video' && (estado === 'pronto' || estado === 'contagem' || aGravar) && (
        <div
          ref={textoRef}
          onClick={() => aGravar && setTextoPausado((p) => !p)}
          className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-10 h-[42%] overflow-y-auto bg-black/55 px-5 [scrollbar-width:none]"
          style={{ maskImage: 'linear-gradient(to bottom, transparent, black 12%, black 85%, transparent)' }}
        >
          <div className="h-[30%]" aria-hidden />
          <p className="whitespace-pre-line pb-[30vh] font-semibold leading-snug" style={{ fontSize: prefs.tamanho }}>
            {textoVisivel}
          </p>
        </div>
      )}
      {aGravar && (textoPausado || gravPausada) && (
        <div className="absolute left-1/2 top-[48%] z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs">
          {gravPausada ? 'Gravação em pausa · P ou ▶ para retomar' : 'Texto em pausa · toca para continuar'}
        </div>
      )}

      {estado === 'entre_blocos' && (
        <div className="absolute inset-x-4 top-[22%] z-30 rounded-2xl bg-black/80 p-5 text-center" aria-live="polite">
          <div className="text-xs text-zinc-400">Gravação em pausa · muda de plano</div>
          <div className="mt-1 text-lg font-semibold" style={{ color: cor }}>Bloco {bloco + 2} de {blocos.length}</div>
          {planoDe(bloco + 1) && (
            <p className="mt-2 text-sm">
              <span className="font-medium" style={{ color: cor }}>Próximo: {planoDe(bloco + 1)!.nome}</span>
              <span className="text-zinc-400"> · {planoDe(bloco + 1)!.dica}</span>
            </p>
          )}
          <p className="mt-3 line-clamp-4 text-sm text-zinc-200">{blocos[bloco + 1]}</p>
          {prefs.autoRetomar && <p className="mt-3 text-xs text-zinc-400">Retoma sozinho…</p>}
        </div>
      )}

      {estado === 'contagem' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/40" aria-live="assertive">
          <span className="text-8xl font-bold tabular-nums" style={{ color: cor }}>{contagem}</span>
        </div>
      )}

      {/* Controlos de baixo */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10">
        {erro && <p role="alert" className="mb-3 rounded-lg bg-red-600/80 p-2 text-center text-sm">{erro}</p>}

        {caps.zoom && comCamara && (
          <div className="mb-3 flex items-center justify-center gap-2">
            {[caps.zoom.min, 2, 3, 5].filter((z, i, a) => z >= caps.zoom!.min && z <= caps.zoom!.max && a.indexOf(z) === i).map((z) => (
              <button key={z} type="button" onClick={() => mudarZoom(z)} aria-pressed={Math.abs(zoom - z) < 0.05} className="grid h-9 min-w-9 place-items-center rounded-full bg-black/50 px-2 text-xs tabular-nums" style={Math.abs(zoom - z) < 0.05 ? { color: cor } : undefined}>
                {Number(z.toFixed(1))}×
              </button>
            ))}
            <label className="flex flex-1 max-w-[12rem] items-center gap-2 text-[10px] text-zinc-400">
              <span className="sr-only">Zoom</span>
              <input type="range" min={caps.zoom.min} max={caps.zoom.max} step={caps.zoom.step} value={zoom} onChange={(e) => mudarZoom(Number(e.target.value))} className="h-9 w-full" style={{ accentColor: cor }} aria-label="Zoom" />
              <span className="w-8 tabular-nums">{zoom.toFixed(1)}×</span>
            </label>
          </div>
        )}

        {!semTexto && captura === 'video' && (estado === 'pronto' || aGravar) && (
          <div className="mb-3 flex items-center justify-center gap-2" role="group" aria-label="Controlo do texto">
            <button type="button" onClick={() => moverTexto(0)} aria-label="Texto do início" className="grid h-11 w-11 place-items-center rounded-full bg-white/15">
              <RotateCcw className="h-5 w-5" aria-hidden />
            </button>
            <button type="button" onClick={() => moverTexto(-1)} aria-label="Recuar o texto" className="flex h-11 items-center gap-1 rounded-full bg-white/15 px-4 text-xs">
              <ChevronsLeft className="h-5 w-5" aria-hidden /> Recuar
            </button>
            <button type="button" onClick={() => setTextoPausado((p) => !p)} disabled={!aGravar} aria-label={textoPausado ? 'Continuar texto' : 'Pausar texto'} className="grid h-11 w-11 place-items-center rounded-full bg-white/15 disabled:opacity-30">
              {textoPausado ? <Play className="h-5 w-5" aria-hidden /> : <Pause className="h-5 w-5" aria-hidden />}
            </button>
            <button type="button" onClick={() => moverTexto(1)} aria-label="Avançar o texto" className="flex h-11 items-center gap-1 rounded-full bg-white/15 px-4 text-xs">
              Avançar <ChevronsRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
        )}

        {!semTexto && captura === 'video' && (estado === 'pronto' || aGravar) && (
          <div className="mb-4 grid grid-cols-2 gap-4 text-xs text-zinc-300">
            <label className="block">
              Velocidade <span className="tabular-nums text-zinc-500">≈{wpm} pal/min</span>
              <input type="range" min={5} max={160} value={prefs.velocidade} onChange={(e) => setPrefs({ velocidade: Number(e.target.value) })} className="mt-1 h-11 w-full" style={{ accentColor: cor }} />
            </label>
            <label className="block">
              Letra
              <input type="range" min={20} max={56} value={prefs.tamanho} onChange={(e) => setPrefs({ tamanho: Number(e.target.value) })} className="mt-1 h-11 w-full" style={{ accentColor: cor }} />
            </label>
          </div>
        )}

        <div className="flex items-center justify-center gap-5">
          {estado === 'pronto' && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-1 rounded-full bg-black/50 p-1 text-xs" role="radiogroup" aria-label="Tipo de captura">
                {([['video', 'Vídeo'], ['foto', 'Foto'], ['timelapse', 'Timelapse']] as const).map(([id, nome]) => (
                  <button key={id} type="button" role="radio" aria-checked={captura === id} onClick={() => setCaptura(id)} className="min-h-9 rounded-full px-3" style={captura === id ? { background: cor, color: '#000' } : undefined}>
                    {nome}
                  </button>
                ))}
              </div>
              {captura === 'timelapse' && (
                <div className="flex items-center gap-1 text-[11px] text-zinc-300" role="radiogroup" aria-label="Intervalo">
                  <span className="mr-1 text-zinc-400">1 foto a cada</span>
                  {INTERVALOS_TL.map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={intervaloTL === n} onClick={() => setIntervaloTL(n)} className="min-h-8 rounded-full border px-2" style={intervaloTL === n ? { borderColor: cor, color: cor } : { borderColor: 'rgba(255,255,255,.2)' }}>
                      {String(n).replace('.', ',')} s
                    </button>
                  ))}
                </div>
              )}
              {captura === 'video' && (
                <button type="button" onClick={comecar} aria-label="Começar a gravar" className="grid h-20 w-20 place-items-center rounded-full border-4 border-white">
                  <Circle className="h-14 w-14 fill-red-600 text-red-600" aria-hidden />
                </button>
              )}
              {captura === 'foto' && (
                <button type="button" onClick={tirarFoto} disabled={fotoEstado === 'a_tirar'} aria-label="Tirar foto" className="grid h-20 w-20 place-items-center rounded-full border-4 border-white disabled:opacity-50">
                  <span className="h-14 w-14 rounded-full bg-white" />
                </button>
              )}
              {captura === 'timelapse' && (
                <button type="button" onClick={comecarTimelapse} aria-label="Começar timelapse" className="grid h-20 w-20 place-items-center rounded-full border-4 border-white">
                  <Circle className="h-14 w-14 fill-amber-500 text-amber-500" aria-hidden />
                </button>
              )}
              {fotoEstado && (
                <p className="text-xs" aria-live="polite" style={{ color: fotoEstado === 'erro' ? '#f87171' : cor }}>
                  {fotoEstado === 'a_tirar' ? 'A guardar a foto…' : fotoEstado === 'guardada' ? 'Foto guardada nos Ativos' : 'Não consegui guardar a foto'}
                </p>
              )}
            </div>
          )}
          {estado === 'timelapse' && (
            <div className="flex flex-col items-center gap-2" aria-live="polite">
              <p className="text-xs text-zinc-300">
                ● {nFrames} fotogramas · {mmss(nFrames * intervaloTL)} captados · vídeo de {(nFrames / 30).toFixed(1).replace('.', ',')} s
              </p>
              <button type="button" onClick={() => void pararTimelapse()} aria-label="Parar timelapse" className="grid h-20 w-20 place-items-center rounded-full border-4 border-white">
                <Square className="h-9 w-9 fill-amber-500 text-amber-500" aria-hidden />
              </button>
            </div>
          )}
          {estado === 'a_montar' && (
            <div className="w-full max-w-xs text-center text-sm" aria-live="polite">
              A montar o timelapse… {progresso}%
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full transition-[width]" style={{ width: `${progresso}%`, background: cor }} />
              </div>
            </div>
          )}
          {aGravar && (
            <>
              <button type="button" onClick={() => setTextoPausado((p) => !p)} aria-label={textoPausado ? 'Continuar texto' : 'Pausar texto'} className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-[10px]">
                {textoPausado ? <Play className="h-6 w-6" aria-hidden /> : <Pause className="h-6 w-6" aria-hidden />}
              </button>
              <button type="button" onClick={parar} aria-label="Parar gravação" className="grid h-20 w-20 place-items-center rounded-full border-4 border-white">
                <Square className="h-9 w-9 fill-red-600 text-red-600" aria-hidden />
              </button>
              <button type="button" onClick={alternarGravacao} aria-label={gravPausada ? 'Retomar gravação' : 'Pausar gravação'} className="grid h-14 w-14 place-items-center rounded-full bg-red-600/30">
                {gravPausada ? <Circle className="h-6 w-6 fill-red-600 text-red-600" aria-hidden /> : <Pause className="h-6 w-6 text-red-400" aria-hidden />}
              </button>
              {!semTexto && prefs.modo === 'blocos' && !gravPausada && (
                <button type="button" onClick={fimDeBloco} aria-label="Acabar bloco" className="grid h-14 w-14 place-items-center rounded-full bg-white/15">
                  <SkipForward className="h-6 w-6" aria-hidden />
                </button>
              )}
            </>
          )}
          {estado === 'entre_blocos' && (
            <>
              <button type="button" onClick={parar} className="min-h-12 rounded-full bg-white/15 px-5 text-sm">Terminar aqui</button>
              <button type="button" onClick={proximoBloco} className="flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-medium text-black" style={{ background: cor }}>
                <Play className="h-4 w-4" aria-hidden /> Continuar
              </button>
            </>
          )}
          {estado === 'rever' && (
            <>
              <button type="button" onClick={repetir} className="flex min-h-12 items-center gap-2 rounded-full bg-white/15 px-5 text-sm">
                <RefreshCw className="h-4 w-4" aria-hidden /> Repetir
              </button>
              <button type="button" onClick={guardar} className="flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-medium text-black" style={{ background: cor }}>
                <Upload className="h-4 w-4" aria-hidden /> Guardar take
              </button>
            </>
          )}
          {estado === 'a_subir' && (
            <div className="w-full max-w-xs text-center text-sm" aria-live="polite">
              A guardar… {progresso}%
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full transition-[width]" style={{ width: `${progresso}%`, background: cor }} />
              </div>
            </div>
          )}
          {estado === 'guardado' && (
            <>
              <span className="flex items-center gap-2 text-sm" style={{ color: cor }}>
                <Check className="h-4 w-4" aria-hidden /> Guardado para edição
              </span>
              <button type="button" onClick={repetir} className="min-h-12 rounded-full bg-white/15 px-5 text-sm">Outro take</button>
            </>
          )}
        </div>
      </div>
    </main>
  )
  return montado ? createPortal(ecra, document.body) : null
}

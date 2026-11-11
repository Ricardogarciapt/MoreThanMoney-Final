'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Camera, Check, ChevronLeft, Circle, Flashlight, FlipHorizontal, Grid3x3, Mic, Pause, Play, RefreshCw, Settings2, SkipForward, Square, Upload } from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'

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
export type Guiao = { pecaId: string | null; marca: MarcaCasa; titulo: string; texto: string; palavraChave: string }

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
type Capacidades = { zoom?: Faixa; torch?: boolean; focus?: string[]; exposicao?: Faixa; pontos?: boolean }

type Modo = 'continuo' | 'blocos'
type Prefs = { velocidade: number; tamanho: number; espelho: boolean; contagem: number; modo: Modo; autoRetomar: boolean; grelha: boolean; camara: 'user' | 'environment'; resolucao: Resolucao; fps: 30 | 60; micId: string }
const PREFS_OMISSAO: Prefs = { velocidade: 40, tamanho: 30, espelho: true, contagem: 3, modo: 'continuo', autoRetomar: false, grelha: false, camara: 'user', resolucao: '1080', fps: 30, micId: '' }
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

type Estado = 'pronto' | 'contagem' | 'a_gravar' | 'entre_blocos' | 'rever' | 'a_subir' | 'guardado'

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
  const [nivel, setNivel] = useState(0)
  const [real, setReal] = useState<string>('')
  const [versao, setVersao] = useState(0) // muda a cada stream novo (para o medidor)

  useEffect(() => {
    setPrefsState(lerPrefs())
    setPrefsLidas(true)
  }, [])
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
    const video: MediaTrackConstraints = { facingMode: prefs.camara, width: { ideal: r.w }, height: { ideal: r.h }, aspectRatio: { ideal: 9 / 16 }, frameRate: { ideal: prefs.fps } }
    const md = navigator.mediaDevices
    if (!md?.getUserMedia) {
      setErro('Este browser não dá acesso à câmara. Abre em https no Safari ou no Chrome.')
      return
    }
    md.getUserMedia({ video, audio })
      // o microfone guardado pode ter desaparecido (auscultadores desligados): tenta com o de omissão
      .catch(() => md.getUserMedia({ video, audio: { echoCancellation: true, noiseSuppression: true } }))
      .then(async (s) => {
        if (!vivo) return s.getTracks().forEach((t) => t.stop())
        streamRef.current = s
        if (videoRef.current) videoRef.current.srcObject = s
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
        })
        setZoom(typeof st.zoom === 'number' ? st.zoom : 1)
        setExposicao(typeof st.exposureCompensation === 'number' ? st.exposureCompensation : 0)
        setLanterna(false)
        setReal(st.width && st.height ? `${Math.min(st.width, st.height)}p${st.frameRate ? ` · ${Math.round(st.frameRate)} fps` : ''}` : '')
        try {
          const lista = await md.enumerateDevices()
          setMics(lista.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, nome: d.label || `Microfone ${i + 1}` })))
        } catch {}
      })
      .catch(() => setErro('Sem acesso à câmara ou ao microfone. Dá permissão nas definições do browser.'))
    return () => {
      vivo = false
    }
  }, [prefsLidas, prefs.camara, prefs.resolucao, prefs.fps, prefs.micId])

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
    if (prefs.espelho && prefs.camara === 'user') x = 1 - x
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
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) videoRef.current.srcObject = streamRef.current
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

  const gravar = () => {
    const mime = escolherMime()
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(streamRef.current!, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: (RESOLUCOES[prefsRef.current.resolucao] ?? RESOLUCOES['1080']).bps })
    } catch {
      setEstado('pronto')
      return setErro('Este browser não grava vídeo. Usa o Safari ou o Chrome actualizados.')
    }
    pedacosRef.current = []
    gravadoRef.current = 0
    rec.ondataavailable = (e) => e.data.size && pedacosRef.current.push(e.data)
    rec.onstop = () => {
      cancelAnimationFrame(rafRef.current)
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
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
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
  const emCurso = aGravar || estado === 'entre_blocos' || (estado === 'contagem' && !!recRef.current && recRef.current.state !== 'inactive')
  const MAX_SEGUNDOS = maxSegundos(prefs.resolucao)
  const comCamara = !take && estado !== 'rever' && estado !== 'a_subir' && estado !== 'guardado'
  const textoVisivel = prefs.modo === 'blocos' ? blocos[bloco] ?? '' : blocos.join('\n\n')
  const wpm = Math.round((prefs.velocidade / (prefs.tamanho * 1.3)) * 60 * 2.2) // estimativa grosseira

  return (
    <main className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      {estado === 'rever' || estado === 'a_subir' || estado === 'guardado' ? (
        <video src={take?.url} controls playsInline className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <div className="absolute inset-0" onPointerDown={tocarParaFocar}>
          <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" style={{ transform: prefs.espelho && prefs.camara === 'user' ? 'scaleX(-1)' : undefined }} />
          {foco && (
            <span className="pointer-events-none absolute z-[6] h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-md border-2" style={{ left: `${foco.x * 100}%`, top: `${foco.y * 100}%`, borderColor: cor }} aria-hidden />
          )}
        </div>
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
          <button type="button" disabled={emCurso} onClick={() => setPrefs({ camara: prefs.camara === 'user' ? 'environment' : 'user' })} aria-label="Trocar de câmara" className="grid h-11 w-11 place-items-center rounded-full bg-black/40 disabled:opacity-30">
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
            {mics.length > 0 && (
              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs text-zinc-400"><Mic className="h-3.5 w-3.5" aria-hidden /> Microfone</span>
                <select value={prefs.micId} onChange={(e) => setPrefs({ micId: e.target.value })} className="min-h-11 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 text-sm">
                  <option value="">O do aparelho (omissão)</option>
                  {mics.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </label>
            )}
          </fieldset>
          <div className="mt-4 space-y-4">
            {caps.exposicao && (
              <label className="block text-xs text-zinc-400">
                Exposição <span className="tabular-nums text-zinc-500">{exposicao > 0 ? '+' : ''}{exposicao.toFixed(1)}</span>
                <input type="range" min={caps.exposicao.min} max={caps.exposicao.max} step={caps.exposicao.step} value={exposicao} onChange={(e) => mudarExposicao(Number(e.target.value))} className="mt-1 h-11 w-full" style={{ accentColor: cor }} />
              </label>
            )}
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
            Teclado ou comando Bluetooth: Enter grava/pára · espaço pausa o texto · P pausa a gravação · ↑/↓ velocidade · → ou PageDown bloco seguinte.
          </p>
        </div>
      )}

      {/* Teleprompter: junto ao topo, perto da lente, para o olhar não fugir */}
      {!semTexto && (estado === 'pronto' || estado === 'contagem' || aGravar) && (
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

        {!semTexto && (estado === 'pronto' || aGravar) && (
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
            <button type="button" onClick={comecar} aria-label="Começar a gravar" className="grid h-20 w-20 place-items-center rounded-full border-4 border-white">
              <Circle className="h-14 w-14 fill-red-600 text-red-600" aria-hidden />
            </button>
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
}

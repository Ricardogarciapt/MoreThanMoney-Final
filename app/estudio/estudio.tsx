'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, Circle, FlipHorizontal, Loader2, Pause, Play, RefreshCw, Square, Trash2, Upload, Wand2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'

/**
 * Estúdio de gravação (telemóvel). Três ecrãs: escolher guião → teleprompter a gravar → rever o take.
 * Cores: ouro MTM sobre carvão; o destaque muda para teal quando o guião é da marca Ricardo Garcia.
 */

type MarcaCasa = 'ricardo-garcia' | 'morethanmoney'
type Peca = {
  id: string
  formato: string
  marca: string
  criado_em: string
  guiao: {
    nicho?: string
    palavra_chave?: string
    reel?: { duracao_estimada_segundos?: number; segmentos?: { fala: string }[] } | null
    laminas?: { titulo?: string; corpo?: string }[]
  }
}
type Take = { id: string; marca: string; estado: string; duracao_s: number | null; criado_em: string; url: string | null; peca_id: string | null }
type Guiao = { pecaId: string | null; marca: MarcaCasa; titulo: string; texto: string; palavraChave: string }

const COR: Record<MarcaCasa, string> = { morethanmoney: '#D2A63C', 'ricardo-garcia': '#0097b2' }
const NOME: Record<MarcaCasa, string> = { morethanmoney: 'More Than Money', 'ricardo-garcia': 'Ricardo Garcia' }
const MAX_SEGUNDOS = 120 // ~45 MB a 3 Mbps: cabe no limite do Storage

function textoDaPeca(p: Peca): string {
  const segs = p.guiao.reel?.segmentos
  if (segs?.length) return segs.map((s) => s.fala).filter(Boolean).join('\n\n')
  return (p.guiao.laminas ?? []).map((l) => [l.titulo, l.corpo].filter(Boolean).join('. ')).join('\n\n')
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

export default function Estudio({ pecaInicial }: { pecaInicial?: string | null } = {}) {
  const [ecra, setEcra] = useState<'escolher' | 'gravar' | 'rever'>('escolher')
  const [pecas, setPecas] = useState<Peca[]>([])
  const [takes, setTakes] = useState<Take[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(true)
  const [guiao, setGuiao] = useState<Guiao | null>(null)

  // gerar guião novo
  const [tema, setTema] = useState('')
  const [marcaNova, setMarcaNova] = useState<MarcaCasa>('ricardo-garcia')
  const [aGerar, setAGerar] = useState(false)
  const [textoLivre, setTextoLivre] = useState('')

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const [g, t] = await Promise.all([api('/api/conteudo-magnetico/guiao'), api('/api/estudio/gravacao')])
      setPecas((g.pecas ?? []).filter((p: Peca) => p.marca === 'morethanmoney' || p.marca === 'ricardo-garcia'))
      setTakes(t.takes ?? [])
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui carregar.')
    } finally {
      setACarregar(false)
    }
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  const abrirPeca = (p: Peca) => {
    const marca = p.marca as MarcaCasa
    setGuiao({ pecaId: p.id, marca, titulo: p.guiao.nicho || 'Guião', texto: textoDaPeca(p), palavraChave: p.guiao.palavra_chave || '' })
    setEcra('gravar')
  }

  // Vindo do separador «Criar» com um reel acabado: abre logo esse guião no teleprompter.
  const abertaRef = useRef<string | null>(null)
  useEffect(() => {
    if (!pecaInicial || abertaRef.current === pecaInicial) return
    const p = pecas.find((x) => x.id === pecaInicial)
    if (p) { abertaRef.current = pecaInicial; abrirPeca(p) }
  }, [pecaInicial, pecas])

  const gerar = async () => {
    if (!tema.trim()) return
    setAGerar(true)
    setErro(null)
    try {
      const r = await api('/api/conteudo-magnetico/guiao', {
        method: 'POST',
        body: JSON.stringify({ formato: 'reel', marca: marcaNova, nicho: tema.trim(), objectivo: 'atracao', tom: 'educativo' }),
      })
      const p: Peca = { id: r.id, formato: 'reel', marca: marcaNova, criado_em: new Date().toISOString(), guiao: r.guiao }
      setPecas((ps) => [p, ...ps])
      setTema('')
      abrirPeca(p)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'A IA não respondeu. Tenta outra vez.')
    } finally {
      setAGerar(false)
    }
  }

  const usarTextoLivre = () => {
    if (!textoLivre.trim()) return
    setGuiao({ pecaId: null, marca: marcaNova, titulo: 'Texto livre', texto: textoLivre.trim(), palavraChave: '' })
    setEcra('gravar')
  }

  if (ecra === 'gravar' && guiao) {
    return <Teleprompter guiao={guiao} onSair={() => { setEcra('escolher'); void carregar() }} />
  }

  const cor = COR[marcaNova]
  return (
    <main className="min-h-dvh bg-[#0b0b0c] text-zinc-100 px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold">Estúdio</h1>
        <p className="mt-1 text-sm text-zinc-400">Escolhe o guião, lê no teleprompter e grava. Cada take vai para a edição no Mac.</p>

        {erro && <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>}

        <section aria-labelledby="novo" className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 id="novo" className="text-base font-medium">Guião novo</h2>
          <fieldset className="mt-3 flex gap-2">
            <legend className="sr-only">Marca</legend>
            {(['ricardo-garcia', 'morethanmoney'] as MarcaCasa[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={marcaNova === m}
                onClick={() => setMarcaNova(m)}
                className="min-h-11 flex-1 rounded-xl border px-3 text-sm transition-colors"
                style={marcaNova === m ? { borderColor: COR[m], color: COR[m], background: `${COR[m]}1a` } : { borderColor: '#3f3f46' }}
              >
                {NOME[m]}
              </button>
            ))}
          </fieldset>
          <label htmlFor="tema" className="mt-3 block text-sm text-zinc-300">Tema</label>
          <div className="mt-1 flex gap-2">
            <input
              id="tema"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="Ex.: porque é que perdes dinheiro a mexer no stop"
              className="min-h-11 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base outline-none focus:border-zinc-400"
            />
            <button
              type="button"
              onClick={gerar}
              disabled={aGerar || !tema.trim()}
              className="flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-black disabled:opacity-40"
              style={{ background: cor }}
            >
              {aGerar ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
              Gerar
            </button>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer py-2 text-sm text-zinc-400">Ou cola o teu próprio texto</summary>
            <label htmlFor="livre" className="sr-only">Texto para ler</label>
            <textarea
              id="livre"
              value={textoLivre}
              onChange={(e) => setTextoLivre(e.target.value)}
              rows={5}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-base outline-none focus:border-zinc-400"
            />
            <button type="button" onClick={usarTextoLivre} disabled={!textoLivre.trim()} className="mt-2 min-h-11 rounded-xl border border-zinc-600 px-4 text-sm disabled:opacity-40">
              Ler este texto
            </button>
          </details>
        </section>

        <section aria-labelledby="guioes" className="mt-6">
          <div className="flex items-center justify-between">
            <h2 id="guioes" className="text-base font-medium">Guiões recentes</h2>
            <button type="button" onClick={() => void carregar()} aria-label="Actualizar" className="grid h-11 w-11 place-items-center rounded-xl text-zinc-400 hover:text-zinc-100">
              <RefreshCw className={`h-4 w-4 ${aCarregar ? 'animate-spin' : ''}`} aria-hidden />
            </button>
          </div>
          {!aCarregar && pecas.length === 0 && <p className="mt-2 text-sm text-zinc-500">Ainda não há guiões das marcas da casa. Gera um acima.</p>}
          <ul className="mt-2 space-y-2">
            {pecas.map((p) => {
              const c = COR[p.marca as MarcaCasa] ?? '#D2A63C'
              const n = takes.filter((t) => t.peca_id === p.id).length
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => abrirPeca(p)} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-left hover:border-zinc-600">
                    <span className="h-8 w-1 rounded-full" style={{ background: c }} aria-hidden />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{p.guiao.nicho || 'Sem tema'}</span>
                      <span className="block text-xs text-zinc-400">
                        {NOME[p.marca as MarcaCasa]} · {p.formato}{p.guiao.palavra_chave ? ` · ${p.guiao.palavra_chave}` : ''}{n ? ` · ${n} take${n > 1 ? 's' : ''}` : ''}
                      </span>
                    </span>
                    <Play className="h-4 w-4 text-zinc-400" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="takes" className="mt-8">
          <h2 id="takes" className="text-base font-medium">Takes gravados</h2>
          <p className="mt-1 text-xs text-zinc-400">«Escolher» manda o take para a edição automática no Mac; o reel editado entra na fila do Instagram para aprovação.</p>
          {!aCarregar && takes.length === 0 && <p className="mt-2 text-sm text-zinc-500">Nenhum take ainda.</p>}
          <ul className="mt-2 grid grid-cols-2 gap-3">
            {takes.map((t) => (
              <TakeCartao key={t.id} take={t} onMudou={carregar} />
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}

function TakeCartao({ take, onMudou }: { take: Take; onMudou: () => void }) {
  const [a, setA] = useState(false)
  const marcar = async (estado: string) => {
    setA(true)
    try {
      await api('/api/estudio/gravacao', { method: 'PATCH', body: JSON.stringify({ id: take.id, estado }) })
      onMudou()
    } finally {
      setA(false)
    }
  }
  const c = COR[take.marca as MarcaCasa] ?? '#D2A63C'
  return (
    <li className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      {take.url ? (
        <video src={take.url} controls playsInline preload="metadata" className="aspect-[9/16] w-full bg-black object-cover" />
      ) : (
        <div className="aspect-[9/16] w-full bg-black" />
      )}
      <div className="p-2 text-xs text-zinc-400">
        <span style={{ color: c }}>{take.estado}</span>
        {take.duracao_s ? ` · ${Math.round(take.duracao_s)} s` : ''}
      </div>
      <div className="flex gap-1 p-2 pt-0">
        <button type="button" disabled={a} onClick={() => marcar('escolhido')} className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-700 text-xs">
          <Check className="h-4 w-4" aria-hidden /> Escolher
        </button>
        <button type="button" disabled={a} onClick={() => marcar('descartado')} aria-label="Descartar take" className="grid min-h-11 w-11 place-items-center rounded-lg border border-zinc-700 text-zinc-400">
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </li>
  )
}

function Teleprompter({ guiao, onSair }: { guiao: Guiao; onSair: () => void }) {
  const cor = COR[guiao.marca]
  const videoRef = useRef<HTMLVideoElement>(null)
  const textoRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const pedacosRef = useRef<Blob[]>([])
  const inicioRef = useRef(0)
  const rafRef = useRef(0)

  const [estado, setEstado] = useState<'pronto' | 'contagem' | 'a_gravar' | 'rever' | 'a_subir' | 'guardado'>('pronto')
  const [contagem, setContagem] = useState(3)
  const [segundos, setSegundos] = useState(0)
  const [velocidade, setVelocidade] = useState(40) // px por segundo
  const [tamanho, setTamanho] = useState(30)
  const [espelho, setEspelho] = useState(true)
  const [pausado, setPausado] = useState(false)
  const [take, setTake] = useState<{ blob: Blob; url: string; mime: string; dur: number } | null>(null)
  const [progresso, setProgresso] = useState(0)
  const [erro, setErro] = useState<string | null>(null)

  // câmara frontal 9:16
  useEffect(() => {
    let vivo = true
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      .then((s) => {
        if (!vivo) return s.getTracks().forEach((t) => t.stop())
        streamRef.current = s
        if (videoRef.current) videoRef.current.srcObject = s
      })
      .catch(() => setErro('Sem acesso à câmara ou ao microfone. Dá permissão nas definições do browser.'))
    return () => {
      vivo = false
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // o <video> da câmara volta a montar depois de rever um take: religar o stream
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [estado])

  // rolagem do texto
  const pausadoRef = useRef(pausado)
  pausadoRef.current = pausado
  const velRef = useRef(velocidade)
  velRef.current = velocidade
  const rolar = useCallback(() => {
    let ultimo = performance.now()
    const passo = (agora: number) => {
      const dt = (agora - ultimo) / 1000
      ultimo = agora
      const el = textoRef.current
      if (el && !pausadoRef.current) el.scrollTop += velRef.current * dt
      const s = (agora - inicioRef.current) / 1000
      setSegundos(s)
      if (s >= MAX_SEGUNDOS) return parar()
      rafRef.current = requestAnimationFrame(passo)
    }
    rafRef.current = requestAnimationFrame(passo)
  }, [])

  const comecar = () => {
    if (!streamRef.current) return setErro('A câmara ainda não está pronta.')
    setErro(null)
    if (textoRef.current) textoRef.current.scrollTop = 0
    setEstado('contagem')
    let n = 3
    setContagem(n)
    const t = setInterval(() => {
      n -= 1
      if (n > 0) return setContagem(n)
      clearInterval(t)
      gravar()
    }, 1000)
  }

  const gravar = () => {
    const mime = escolherMime()
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(streamRef.current!, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 3_000_000 })
    } catch {
      setEstado('pronto')
      return setErro('Este browser não grava vídeo. Usa o Safari ou o Chrome actualizados.')
    }
    pedacosRef.current = []
    rec.ondataavailable = (e) => e.data.size && pedacosRef.current.push(e.data)
    rec.onstop = () => {
      const tipo = rec.mimeType || mime || 'video/webm'
      const blob = new Blob(pedacosRef.current, { type: tipo })
      const dur = (performance.now() - inicioRef.current) / 1000
      setTake({ blob, url: URL.createObjectURL(blob), mime: tipo, dur })
      setEstado('rever')
    }
    recRef.current = rec
    rec.start(1000)
    inicioRef.current = performance.now()
    setPausado(false)
    setEstado('a_gravar')
    rolar()
  }

  function parar() {
    cancelAnimationFrame(rafRef.current)
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }

  const repetir = () => {
    if (take) URL.revokeObjectURL(take.url)
    setTake(null)
    setSegundos(0)
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

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const aGravar = estado === 'a_gravar'

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white">
      {estado === 'rever' || estado === 'a_subir' || estado === 'guardado' ? (
        <video src={take?.url} controls playsInline className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" style={{ transform: espelho ? 'scaleX(-1)' : undefined }} />
      )}

      {/* Barra de topo */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onSair} disabled={aGravar} aria-label="Voltar" className="grid h-11 w-11 place-items-center rounded-full bg-black/40 disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="text-center text-xs">
          <div className="font-medium" style={{ color: cor }}>{NOME[guiao.marca]}</div>
          <div className="tabular-nums text-zinc-300" aria-live="polite">{aGravar ? `● ${mmss(segundos)} / ${mmss(MAX_SEGUNDOS)}` : guiao.titulo}</div>
        </div>
        <button type="button" onClick={() => setEspelho((v) => !v)} aria-pressed={espelho} aria-label="Espelhar pré-visualização" className="grid h-11 w-11 place-items-center rounded-full bg-black/40">
          <FlipHorizontal className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Teleprompter: junto ao topo, perto da lente, para o olhar não fugir */}
      {(estado === 'pronto' || estado === 'contagem' || aGravar) && (
        <div
          ref={textoRef}
          onClick={() => aGravar && setPausado((p) => !p)}
          className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-10 h-[42%] overflow-y-auto bg-black/55 px-5 [scrollbar-width:none]"
          style={{ maskImage: 'linear-gradient(to bottom, transparent, black 12%, black 85%, transparent)' }}
        >
          <div className="h-[30%]" aria-hidden />
          <p className="whitespace-pre-line pb-[60vh] font-semibold leading-snug" style={{ fontSize: tamanho }}>
            {guiao.texto}
            {guiao.palavraChave ? `\n\nComenta «${guiao.palavraChave}».` : ''}
          </p>
        </div>
      )}
      {aGravar && pausado && <div className="absolute left-1/2 top-[48%] z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs">Texto em pausa · toca para continuar</div>}

      {estado === 'contagem' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/40" aria-live="assertive">
          <span className="text-8xl font-bold tabular-nums" style={{ color: cor }}>{contagem}</span>
        </div>
      )}

      {/* Controlos de baixo */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10">
        {erro && <p role="alert" className="mb-3 rounded-lg bg-red-600/80 p-2 text-center text-sm">{erro}</p>}

        {(estado === 'pronto' || aGravar) && (
          <div className="mb-4 grid grid-cols-2 gap-4 text-xs text-zinc-300">
            <label className="block">
              Velocidade
              <input type="range" min={10} max={120} value={velocidade} onChange={(e) => setVelocidade(Number(e.target.value))} className="mt-1 h-11 w-full" style={{ accentColor: cor }} />
            </label>
            <label className="block">
              Letra
              <input type="range" min={20} max={48} value={tamanho} onChange={(e) => setTamanho(Number(e.target.value))} className="mt-1 h-11 w-full" style={{ accentColor: cor }} />
            </label>
          </div>
        )}

        <div className="flex items-center justify-center gap-6">
          {estado === 'pronto' && (
            <button type="button" onClick={comecar} aria-label="Começar a gravar" className="grid h-20 w-20 place-items-center rounded-full border-4 border-white">
              <Circle className="h-14 w-14 fill-red-600 text-red-600" aria-hidden />
            </button>
          )}
          {aGravar && (
            <>
              <button type="button" onClick={() => setPausado((p) => !p)} aria-label={pausado ? 'Continuar texto' : 'Pausar texto'} className="grid h-14 w-14 place-items-center rounded-full bg-white/15">
                {pausado ? <Play className="h-6 w-6" aria-hidden /> : <Pause className="h-6 w-6" aria-hidden />}
              </button>
              <button type="button" onClick={parar} aria-label="Parar gravação" className="grid h-20 w-20 place-items-center rounded-full border-4 border-white">
                <Square className="h-9 w-9 fill-red-600 text-red-600" aria-hidden />
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

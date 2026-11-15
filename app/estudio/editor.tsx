'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Copy, Download, Film, Image as ImageIcon, Loader2, Music, Pause, Play,
  Plus, Scissors, Send, Sparkles, Trash2, Type, Wand2, X,
} from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'
import {
  ANIMACOES_IMAGEM, ANIMACOES_TEXTO, ESTILOS_TEXTO, FILTROS, FORMATOS_VIDEO, POSICOES_TEXTO, TRANSICOES, VELOCIDADES,
  dividirClip, duracaoClip, duracaoProjeto, iniciosDosClips, normalizarClip, novoId,
  type Clip, type FormatoVideo, type Projeto, type TextoSobreposto,
} from '@/lib/estudio/projeto'

/**
 * EDITOR DE VÍDEO do /estudio — timeline de clips (takes, ativos, vídeos criados), com aparar,
 * dividir no cursor, reordenar, duplicar, velocidade, filtros de cor da marca, transições, zoom,
 * textos animados, música com «duck» e formatos 9:16 / 4:5 / 1:1 / 16:9. A pré-visualização é no
 * browser (aproximada); «Exportar» manda o projecto ao Mac, que monta o MP4 final com ffmpeg.
 */

type Resumo = { id: string; titulo: string; marca: string; estado: string; video_url: string | null; erro: string | null; atualizado_em: string }
type Take = { id: string; marca: string; caminho: string; duracao_s: number | null; estado: string; url: string | null; criado_em: string }
type Ativo = { id: string; tipo: 'imagem' | 'video' | 'audio'; nome: string; caminho: string; animacao: string | null; url: string | null }
type Render = { id: string; video_url: string; criado_em: string }
type Biblioteca = { takes: Take[]; ativos: Ativo[]; renders: Render[] }
type Aberto = { id: string; titulo: string; marca: string; estado: string; video_url: string | null; erro: string | null; projeto: Projeto }

const ESTADOS: Record<string, string> = { rascunho: 'Rascunho', a_render: 'Na fila do Mac', a_montar: 'O Mac está a montar', pronto: 'Pronto', erro: 'Erro' }
const MARCAS: [string, string][] = [['morethanmoney', 'MoreThanMoney'], ['ricardo-garcia', 'Ricardo Garcia']]
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(await authHeaders()) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`)
  return j
}

export default function EditorVideo() {
  const [lista, setLista] = useState<Resumo[] | null>(null)
  const [bib, setBib] = useState<Biblioteca | null>(null)
  const [aberto, setAberto] = useState<Aberto | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aCriar, setACriar] = useState(false)

  const ler = useCallback(async () => {
    try {
      const j = await api('/api/estudio/projeto?biblioteca=1')
      setLista(j.projetos)
      setBib(j.biblioteca)
    } catch (e) { setErro((e as Error).message) }
  }, [])
  useEffect(() => { void ler() }, [ler])

  const abrir = async (id: string) => {
    try {
      const j = await api(`/api/estudio/projeto?id=${id}`)
      setAberto(j.projeto)
    } catch (e) { setErro((e as Error).message) }
  }

  const criar = async (corpo: Record<string, unknown>) => {
    setACriar(true)
    try {
      const j = await api('/api/estudio/projeto', { method: 'POST', body: JSON.stringify(corpo) })
      await abrir(j.id)
      void ler()
    } catch (e) { setErro((e as Error).message) } finally { setACriar(false) }
  }

  const apagar = async (id: string) => {
    if (!window.confirm('Apagar este projecto e o vídeo exportado?')) return
    await api(`/api/estudio/projeto?id=${id}`, { method: 'DELETE' }).catch(() => {})
    void ler()
  }

  if (aberto && bib) {
    return <Mesa inicial={aberto} bib={bib} onFechar={() => { setAberto(null); void ler() }} />
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-24 pt-4 text-zinc-200">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-white">Editor de vídeo</h1>
        <p className="text-sm text-zinc-400">Junta takes, imagens e vídeos numa timeline, com cortes, filtros, transições, textos e música. O Mac monta o MP4 final.</p>
      </header>
      {erro && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{erro}</p>}

      <section className="grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={aCriar} onClick={() => void criar({ titulo: 'Projecto sem título' })}
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 text-left hover:border-[#D2A63C]/60">
          <Plus className="h-5 w-5 text-[#E9C46A]" /> <span><b className="block text-sm text-white">Projecto vazio</b><span className="text-xs text-zinc-400">Começas do zero e escolhes o material.</span></span>
        </button>
        <MontarComIA takes={bib?.takes ?? []} aCriar={aCriar} onMontar={(take_id) => void criar({ take_id })} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-300">Projectos</h2>
        {!lista ? <Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /> : lista.length === 0 ? (
          <p className="text-xs text-zinc-500">Ainda não há projectos.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
            {lista.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <button type="button" onClick={() => void abrir(p.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm text-white">{p.titulo}</p>
                  <p className="text-[11px] text-zinc-500">{ESTADOS[p.estado] ?? p.estado} · {new Date(p.atualizado_em).toLocaleString('pt-PT')}{p.erro ? ` · ${p.erro}` : ''}</p>
                </button>
                {p.video_url && <a href={p.video_url} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-700 p-2 text-zinc-300" aria-label="Descarregar"><Download className="h-4 w-4" /></a>}
                <button type="button" onClick={() => void apagar(p.id)} className="rounded-lg border border-zinc-800 p-2 text-rose-300" aria-label="Apagar"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function MontarComIA({ takes, aCriar, onMontar }: { takes: Take[]; aCriar: boolean; onMontar: (id: string) => void }) {
  const [take, setTake] = useState('')
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[#D2A63C]/30 bg-[#D2A63C]/[0.05] p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#E9C46A]"><Sparkles className="h-4 w-4" /> Montar com IA</p>
      <p className="text-xs text-zinc-400">Parte de um take: mantém o que não cortaste no texto, alterna planos, mete o gancho, o CTA, os ativos do guião e a música.</p>
      <div className="flex gap-2">
        <select value={take} onChange={(e) => setTake(e.target.value)} className="min-h-10 flex-1 rounded-lg border border-zinc-700 bg-black/40 px-2 text-sm">
          <option value="">Escolhe um take…</option>
          {takes.map((t) => <option key={t.id} value={t.id}>{new Date(t.criado_em).toLocaleString('pt-PT')} · {t.duracao_s ? `${Math.round(t.duracao_s)} s` : '?'} · {t.marca}</option>)}
        </select>
        <button type="button" disabled={!take || aCriar} onClick={() => onMontar(take)} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-[#D2A63C] px-3 text-sm font-semibold text-black disabled:opacity-50">
          {aCriar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Montar
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────── A mesa de edição ─────────────────────────────── */

function Mesa({ inicial, bib, onFechar }: { inicial: Aberto; bib: Biblioteca; onFechar: () => void }) {
  const [proj, setProj] = useState<Projeto>(inicial.projeto)
  const [titulo, setTitulo] = useState(inicial.titulo)
  const [marca, setMarca] = useState(inicial.marca)
  const [estado, setEstado] = useState(inicial.estado)
  const [videoUrl, setVideoUrl] = useState(inicial.video_url)
  const [erroMotor, setErroMotor] = useState(inicial.erro)
  const [sel, setSel] = useState<string | null>(inicial.projeto.clips[0]?.id ?? null)
  const [selTexto, setSelTexto] = useState<string | null>(null)
  const [painel, setPainel] = useState<'clip' | 'material' | 'textos' | 'audio' | 'projeto'>(inicial.projeto.clips.length ? 'clip' : 'material')
  const [t, setT] = useState(0)
  const [aTocar, setATocar] = useState(false)
  const [guardado, setGuardado] = useState<'sim' | 'a_guardar' | 'nao'>('sim')
  const [msg, setMsg] = useState<string | null>(null)
  const primeira = useRef(true)

  const total = useMemo(() => duracaoProjeto(proj), [proj])
  const inicios = useMemo(() => iniciosDosClips(proj), [proj])
  const bloqueado = estado === 'a_render' || estado === 'a_montar'

  // Guarda sozinho 1,2 s depois da última alteração.
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return }
    if (bloqueado) return
    setGuardado('nao')
    const id = setTimeout(async () => {
      setGuardado('a_guardar')
      try {
        await api('/api/estudio/projeto', { method: 'PUT', body: JSON.stringify({ id: inicial.id, titulo, marca, projeto: proj }) })
        setGuardado('sim')
      } catch (e) { setMsg((e as Error).message); setGuardado('nao') }
    }, 1200)
    return () => clearTimeout(id)
  }, [proj, titulo, marca, inicial.id, bloqueado])

  // Enquanto o Mac trabalha, vê o estado de 10 em 10 s.
  useEffect(() => {
    if (!bloqueado) return
    const id = setInterval(async () => {
      try {
        const j = await api(`/api/estudio/projeto?id=${inicial.id}`)
        setEstado(j.projeto.estado); setVideoUrl(j.projeto.video_url); setErroMotor(j.projeto.erro)
      } catch { /* tenta outra vez */ }
    }, 10_000)
    return () => clearInterval(id)
  }, [bloqueado, inicial.id])

  const mudar = (fn: (p: Projeto) => Projeto) => setProj((p) => fn(p))
  const mudarClip = (id: string, campos: Partial<Clip>) => mudar((p) => ({ ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, ...campos } : c)) }))
  const mudarTexto = (id: string, campos: Partial<TextoSobreposto>) => mudar((p) => ({ ...p, textos: p.textos.map((x) => (x.id === id ? { ...x, ...campos } : x)) }))
  const clip = proj.clips.find((c) => c.id === sel) ?? null
  const texto = proj.textos.find((x) => x.id === selTexto) ?? null

  const acrescentar = (c: Partial<Clip> & Pick<Clip, 'media' | 'fonte' | 'nome' | 'duracao_fonte'>) => {
    const novo = normalizarClip({ id: novoId(), de: 0, ate: c.duracao_fonte, ...c })
    if (!novo) return
    mudar((p) => ({ ...p, clips: [...p.clips, novo] }))
    setSel(novo.id); setPainel('clip')
  }
  const mover = (id: string, d: -1 | 1) => mudar((p) => {
    const i = p.clips.findIndex((c) => c.id === id); const j = i + d
    if (i < 0 || j < 0 || j >= p.clips.length) return p
    const clips = [...p.clips];[clips[i], clips[j]] = [clips[j], clips[i]]
    return { ...p, clips }
  })

  const exportar = async () => {
    try {
      await api('/api/estudio/projeto', { method: 'PUT', body: JSON.stringify({ id: inicial.id, titulo, marca, projeto: proj }) })
      await api('/api/estudio/projeto', { method: 'PATCH', body: JSON.stringify({ id: inicial.id, accao: 'exportar' }) })
      setEstado('a_render'); setErroMotor(null); setMsg('Na fila: o Mac monta o vídeo e ele aparece aqui.')
    } catch (e) { setMsg((e as Error).message) }
  }
  const cancelar = async () => {
    await api('/api/estudio/projeto', { method: 'PATCH', body: JSON.stringify({ id: inicial.id, accao: 'cancelar' }) }).catch(() => {})
    setEstado('rascunho')
  }

  // Atalhos: espaço toca, S divide, Delete apaga, ←/→ anda 1 s.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)) return
      if (e.code === 'Space') { e.preventDefault(); setATocar((v) => !v) }
      else if (e.key === 's' && sel) mudar((p) => ({ ...p, clips: dividirClip(p, sel, t) }))
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { mudar((p) => ({ ...p, clips: p.clips.filter((c) => c.id !== sel) })); setSel(null) }
      else if (e.key === 'ArrowRight') setT((x) => Math.min(total, x + 1))
      else if (e.key === 'ArrowLeft') setT((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [sel, t, total])

  return (
    <main className="mx-auto max-w-6xl px-3 pb-28 pt-3 text-zinc-200">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onFechar} className="rounded-lg border border-zinc-800 p-2" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></button>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="min-w-[160px] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-base font-semibold text-white hover:border-zinc-800 focus:border-[#D2A63C]/60 focus:outline-none" />
        <select value={marca} onChange={(e) => setMarca(e.target.value)} className="rounded-lg border border-zinc-800 bg-black/40 px-2 py-1.5 text-xs">
          {MARCAS.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <select value={proj.formato} onChange={(e) => mudar((p) => ({ ...p, formato: e.target.value as FormatoVideo }))} className="rounded-lg border border-zinc-800 bg-black/40 px-2 py-1.5 text-xs">
          {Object.entries(FORMATOS_VIDEO).map(([id, f]) => <option key={id} value={id}>{f.nome}</option>)}
        </select>
        <span className="text-[11px] text-zinc-500">{guardado === 'sim' ? 'Guardado' : guardado === 'a_guardar' ? 'A guardar…' : 'Por guardar'}</span>
        {bloqueado ? (
          <button type="button" onClick={() => void cancelar()} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {ESTADOS[estado]} · cancelar</button>
        ) : (
          <button type="button" disabled={!proj.clips.length} onClick={() => void exportar()} className="inline-flex items-center gap-1 rounded-lg bg-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"><Send className="h-3.5 w-3.5" /> Exportar</button>
        )}
      </header>
      {msg && <p className="mb-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">{msg} <button type="button" onClick={() => setMsg(null)} className="ml-2 text-zinc-500">fechar</button></p>}
      {estado === 'erro' && erroMotor && <p className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">O Mac não conseguiu montar: {erroMotor}</p>}
      {estado === 'pronto' && videoUrl && (
        <p className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Vídeo pronto. <a href={videoUrl} target="_blank" rel="noreferrer" className="underline">Abrir / descarregar o MP4</a> · se mudares a timeline, exporta outra vez.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <Previsualizacao proj={proj} inicios={inicios} total={total} t={t} setT={setT} aTocar={aTocar} setATocar={setATocar} />
          <Timeline
            proj={proj} inicios={inicios} total={total} t={t} setT={setT}
            sel={sel} onSel={(id) => { setSel(id); setSelTexto(null); setPainel('clip') }}
            selTexto={selTexto} onSelTexto={(id) => { setSelTexto(id); setPainel('textos') }}
          />
          <div className="flex flex-wrap gap-2 text-xs">
            <Botao icone={Scissors} disabled={!sel} onClick={() => sel && mudar((p) => ({ ...p, clips: dividirClip(p, sel, t) }))}>Dividir no cursor (S)</Botao>
            <Botao icone={ChevronLeft} disabled={!sel} onClick={() => sel && mover(sel, -1)}>Para trás</Botao>
            <Botao icone={ChevronRight} disabled={!sel} onClick={() => sel && mover(sel, 1)}>Para a frente</Botao>
            <Botao icone={Copy} disabled={!clip} onClick={() => clip && mudar((p) => {
              const i = p.clips.findIndex((c) => c.id === clip.id)
              return { ...p, clips: [...p.clips.slice(0, i + 1), { ...clip, id: novoId() }, ...p.clips.slice(i + 1)] }
            })}>Duplicar</Botao>
            <Botao icone={Trash2} disabled={!sel} onClick={() => { mudar((p) => ({ ...p, clips: p.clips.filter((c) => c.id !== sel) })); setSel(null) }}>Apagar</Botao>
          </div>
        </div>

        <aside className="rounded-2xl border border-zinc-800 bg-zinc-950">
          <div className="flex border-b border-zinc-800 text-xs" role="tablist">
            {([['clip', 'Clip'], ['material', 'Material'], ['textos', 'Textos'], ['audio', 'Áudio'], ['projeto', 'Projecto']] as const).map(([id, nome]) => (
              <button key={id} type="button" role="tab" aria-selected={painel === id} onClick={() => setPainel(id)}
                className={`flex-1 px-2 py-2.5 ${painel === id ? 'border-b-2 border-[#D2A63C] text-[#E9C46A]' : 'text-zinc-400'}`}>{nome}</button>
            ))}
          </div>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto p-3 text-sm">
            {painel === 'clip' && (clip ? <PainelClip clip={clip} mudar={(c) => mudarClip(clip.id, c)} primeiro={proj.clips[0]?.id === clip.id} /> : <p className="text-xs text-zinc-500">Toca num clip da timeline para o editar.</p>)}
            {painel === 'material' && <PainelMaterial bib={bib} onAcrescentar={acrescentar} />}
            {painel === 'textos' && (
              <PainelTextos proj={proj} t={t} total={total} texto={texto} setSel={setSelTexto} mudarTexto={mudarTexto}
                acrescentar={(x) => { mudar((p) => ({ ...p, textos: [...p.textos, x] })); setSelTexto(x.id) }}
                apagar={(id) => { mudar((p) => ({ ...p, textos: p.textos.filter((x) => x.id !== id) })); setSelTexto(null) }} />
            )}
            {painel === 'audio' && <PainelAudio proj={proj} bib={bib} mudar={mudar} />}
            {painel === 'projeto' && <PainelProjeto proj={proj} mudar={mudar} />}
          </div>
        </aside>
      </div>
    </main>
  )
}

function Botao({ icone: Icone, children, ...r }: { icone: typeof Play; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...r} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 text-zinc-300 hover:border-zinc-600 disabled:opacity-40"><Icone className="h-3.5 w-3.5" />{children}</button>
}

/* ─── Pré-visualização: toca a timeline no browser (aproximada ao render final) ─── */

function Previsualizacao({ proj, inicios, total, t, setT, aTocar, setATocar }: {
  proj: Projeto; inicios: number[]; total: number; t: number; setT: (f: number | ((x: number) => number)) => void; aTocar: boolean; setATocar: (v: boolean | ((x: boolean) => boolean)) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const musica = useRef<HTMLAudioElement>(null)
  const f = FORMATOS_VIDEO[proj.formato]
  // O clip activo é o último que já começou.
  let i = -1
  for (let k = 0; k < inicios.length; k++) if (t >= inicios[k]) i = k
  const c = i >= 0 ? proj.clips[i] : null
  const local = c ? c.de + (t - inicios[i]) * c.velocidade : 0
  const prog = c ? Math.min(1, (t - inicios[i]) / duracaoClip(c)) : 0
  const textos = proj.textos.filter((x) => t >= x.inicio && t < x.fim)

  // Relógio da reprodução.
  useEffect(() => {
    if (!aTocar) return
    let ultimo = performance.now(); let id = 0
    const passo = (agora: number) => {
      const dt = (agora - ultimo) / 1000; ultimo = agora
      setT((x) => { const n = x + dt; if (n >= total) { setATocar(false); return 0 } return n })
      id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [aTocar, total, setT, setATocar])

  // Sincroniza o <video> com o clip activo.
  useEffect(() => {
    const v = video.current
    if (!v || !c || c.media !== 'video' || !c.fonte.url) return
    if (v.dataset.src !== c.fonte.url) { v.src = c.fonte.url; v.dataset.src = c.fonte.url }
    v.playbackRate = c.velocidade
    v.volume = Math.min(1, c.volume * proj.volume_geral * (proj.musica?.duck ? 1 : 1))
    if (Math.abs(v.currentTime - local) > 0.3) v.currentTime = local
    if (aTocar && v.paused) void v.play().catch(() => {})
    if (!aTocar && !v.paused) v.pause()
  }, [c, local, aTocar, proj.volume_geral, proj.musica?.duck])

  useEffect(() => {
    const a = musica.current
    if (!a || !proj.musica?.fonte.url) return
    if (a.dataset.src !== proj.musica.fonte.url) { a.src = proj.musica.fonte.url; a.dataset.src = proj.musica.fonte.url }
    a.volume = proj.musica.volume * (proj.musica.duck && c?.media === 'video' && c.volume > 0 ? 0.45 : 1)
    if (Math.abs(a.currentTime - t) > 0.5) a.currentTime = t
    if (aTocar && a.paused) void a.play().catch(() => {})
    if (!aTocar && !a.paused) a.pause()
  }, [proj.musica, t, aTocar, c])

  const anim = c?.media === 'imagem' ? ({
    zoom_in: `scale(${1 + 0.15 * prog})`, zoom_out: `scale(${1.15 - 0.15 * prog})`, pan_esq: `scale(1.15) translateX(${6 - 12 * prog}%)`,
    pan_dir: `scale(1.15) translateX(${-6 + 12 * prog}%)`, sobe: `scale(1.15) translateY(${5 - 10 * prog}%)`, sem: 'none',
  } as Record<string, string>)[c.animacao] : `scale(${c?.zoom ?? 1})`
  const transform = `${anim ?? ''}${c?.espelhar ? ' scaleX(-1)' : ''}`
  // Transição de entrada: esbate nos primeiros instantes do clip.
  const entrada = c && i > 0 && c.transicao !== 'corte' ? Math.min(1, (t - inicios[i]) / c.trans_dur) : 1

  return (
    <div className="space-y-2">
      <div className="mx-auto overflow-hidden rounded-xl border border-zinc-800 bg-black" style={{ aspectRatio: `${f.w} / ${f.h}`, maxHeight: '62vh' }}>
        <div className="relative h-full w-full">
          {c ? (
            <div className="absolute inset-0" style={{ opacity: entrada, filter: FILTROS[c.filtro].css }}>
              {c.media === 'video'
                ? <video ref={video} playsInline muted={c.volume === 0} className="h-full w-full object-cover" style={{ transform }} />
                : c.fonte.url && <img src={c.fonte.url} alt="" className="h-full w-full object-cover" style={{ transform }} />}
            </div>
          ) : <div className="flex h-full items-center justify-center text-xs text-zinc-500">Acrescenta material à timeline</div>}
          {textos.map((x) => <TextoNoEcra key={x.id} x={x} t={t} />)}
          {proj.marca_dagua && <img src="/logo-mtm-transparent.png" alt="" className="absolute right-3 top-3 w-12 opacity-70" />}
        </div>
      </div>
      <audio ref={musica} preload="auto" />
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setATocar((v) => !v)} className="rounded-full bg-[#D2A63C] p-2.5 text-black" aria-label={aTocar ? 'Pausar' : 'Tocar'}>
          {aTocar ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <input type="range" min={0} max={Math.max(0.1, total)} step={0.05} value={t} onChange={(e) => setT(Number(e.target.value))} className="flex-1 accent-[#D2A63C]" aria-label="Posição" />
        <span className="w-24 text-right font-mono text-xs text-zinc-400">{fmt(t)} / {fmt(total)}</span>
      </div>
    </div>
  )
}

function TextoNoEcra({ x, t }: { x: TextoSobreposto; t: number }) {
  const p = Math.min(1, (t - x.inicio) / 0.4)
  const pos = x.posicao === 'cima' ? 'top-[12%]' : x.posicao === 'baixo' ? 'bottom-[14%]' : 'top-1/2 -translate-y-1/2'
  const visivel = x.animacao === 'escrever' ? x.texto.slice(0, Math.ceil(x.texto.length * Math.min(1, (t - x.inicio) / 1.2))) : x.texto
  const estilo = {
    titulo: 'text-[clamp(18px,5vw,34px)] font-extrabold text-white [text-shadow:0_2px_8px_rgba(0,0,0,.8)]',
    legenda: 'text-[clamp(13px,3.4vw,20px)] font-semibold text-white [text-shadow:0_1px_4px_rgba(0,0,0,.9)]',
    destaque: 'rounded-lg bg-[#D2A63C] px-3 py-1 text-[clamp(15px,4vw,26px)] font-bold text-black',
    cta: 'rounded-full border-2 border-[#E9C46A] bg-black/70 px-4 py-1.5 text-[clamp(14px,3.8vw,24px)] font-bold text-[#E9C46A]',
  }[x.estilo]
  return (
    <div className={`absolute inset-x-4 flex justify-center text-center ${pos}`}
      style={{ opacity: x.animacao === 'nenhuma' ? 1 : p, transform: x.animacao === 'subir' ? `translateY(${(1 - p) * 20}px)` : undefined }}>
      <span className={`inline-block max-w-full whitespace-pre-wrap leading-tight ${estilo}`}>{visivel}</span>
    </div>
  )
}

/* ─── Timeline ─── */

function Timeline({ proj, inicios, total, t, setT, sel, onSel, selTexto, onSelTexto }: {
  proj: Projeto; inicios: number[]; total: number; t: number; setT: (x: number) => void
  sel: string | null; onSel: (id: string) => void; selTexto: string | null; onSelTexto: (id: string) => void
}) {
  const [zoom, setZoom] = useState(1)
  const largura = Math.max(100, zoom * 100)
  const pct = (s: number) => `${total ? (s / total) * 100 : 0}%`
  const ref = useRef<HTMLDivElement>(null)
  const clicar = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r || !total) return
    setT(Math.max(0, Math.min(total, ((e.clientX - r.left) / r.width) * total)))
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2">
      <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
        <span>{proj.clips.length} clips · {proj.textos.length} textos{proj.musica ? ' · música' : ''}</span>
        <label className="flex items-center gap-1">zoom <input type="range" min={1} max={6} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-20 accent-[#D2A63C]" /></label>
      </div>
      <div className="overflow-x-auto">
        <div ref={ref} className="relative space-y-1 py-1" style={{ width: `${largura}%` }} onClick={clicar}>
          <div className="relative h-14">
            {proj.clips.map((c, i) => (
              <button key={c.id} type="button" onClick={(e) => { e.stopPropagation(); onSel(c.id); setT(inicios[i] + 0.01) }}
                className={`absolute top-0 flex h-14 items-center gap-1 overflow-hidden rounded-md border px-1.5 text-left text-[10px] ${sel === c.id ? 'border-[#E9C46A] bg-[#D2A63C]/25 text-white' : c.media === 'imagem' ? 'border-sky-800 bg-sky-950/60 text-sky-100' : 'border-zinc-700 bg-zinc-800/80 text-zinc-200'}`}
                style={{ left: pct(inicios[i]), width: pct(duracaoClip(c)) }} title={c.nome}>
                {c.media === 'imagem' ? <ImageIcon className="h-3 w-3 shrink-0" /> : <Film className="h-3 w-3 shrink-0" />}
                <span className="truncate">{c.nome}{c.velocidade !== 1 ? ` ×${c.velocidade}` : ''}</span>
                {i > 0 && c.transicao !== 'corte' && <span className="absolute left-0 top-0 h-full w-1.5 bg-[#E9C46A]/60" />}
              </button>
            ))}
          </div>
          <div className="relative h-6">
            {proj.textos.map((x) => (
              <button key={x.id} type="button" onClick={(e) => { e.stopPropagation(); onSelTexto(x.id) }}
                className={`absolute top-0 h-6 overflow-hidden rounded border px-1 text-left text-[10px] ${selTexto === x.id ? 'border-[#E9C46A] bg-[#D2A63C]/30 text-white' : 'border-violet-800 bg-violet-950/60 text-violet-100'}`}
                style={{ left: pct(x.inicio), width: pct(x.fim - x.inicio) }}><span className="truncate">T · {x.texto}</span></button>
            ))}
          </div>
          {proj.musica && <div className="h-3 rounded bg-emerald-900/60" title={proj.musica.nome} />}
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-[#E9C46A]" style={{ left: pct(t) }} />
        </div>
      </div>
    </div>
  )
}

/* ─── Painéis ─── */

const Rotulo = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{children}</span>
const Sel = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className="min-h-9 w-full rounded-lg border border-zinc-800 bg-black/40 px-2 text-sm" />

function PainelClip({ clip, mudar, primeiro }: { clip: Clip; mudar: (c: Partial<Clip>) => void; primeiro: boolean }) {
  return (
    <div className="space-y-3">
      <input value={clip.nome} onChange={(e) => mudar({ nome: e.target.value })} className="w-full rounded-lg border border-zinc-800 bg-black/40 px-2 py-1.5 text-sm" />
      {clip.media === 'video' ? (
        <div>
          <Rotulo>Aparar · {fmt(clip.de)} → {fmt(clip.ate)} (de {fmt(clip.duracao_fonte)})</Rotulo>
          <input type="range" min={0} max={clip.duracao_fonte} step={0.05} value={clip.de} onChange={(e) => mudar({ de: Math.min(Number(e.target.value), clip.ate - 0.2) })} className="w-full accent-[#D2A63C]" aria-label="Início" />
          <input type="range" min={0} max={clip.duracao_fonte} step={0.05} value={clip.ate} onChange={(e) => mudar({ ate: Math.max(Number(e.target.value), clip.de + 0.2) })} className="w-full accent-[#D2A63C]" aria-label="Fim" />
        </div>
      ) : (
        <div>
          <Rotulo>Duração · {clip.ate.toFixed(1)} s</Rotulo>
          <input type="range" min={0.5} max={15} step={0.1} value={clip.ate} onChange={(e) => mudar({ ate: Number(e.target.value), duracao_fonte: Number(e.target.value) })} className="w-full accent-[#D2A63C]" />
          <Rotulo>Animação</Rotulo>
          <Sel value={clip.animacao} onChange={(e) => mudar({ animacao: e.target.value as Clip['animacao'] })}>
            {ANIMACOES_IMAGEM.map((a) => <option key={a} value={a}>{({ zoom_in: 'Aproximar', zoom_out: 'Afastar', pan_esq: 'Deslizar ←', pan_dir: 'Deslizar →', sobe: 'Subir', sem: 'Parada' } as Record<string, string>)[a]}</option>)}
          </Sel>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label><Rotulo>Velocidade</Rotulo>
          <Sel value={clip.velocidade} onChange={(e) => mudar({ velocidade: Number(e.target.value) })}>{VELOCIDADES.map((v) => <option key={v} value={v}>×{v}</option>)}</Sel>
        </label>
        <label><Rotulo>Filtro</Rotulo>
          <Sel value={clip.filtro} onChange={(e) => mudar({ filtro: e.target.value as Clip['filtro'] })}>{Object.entries(FILTROS).map(([id, f]) => <option key={id} value={id}>{f.nome}</option>)}</Sel>
        </label>
      </div>
      {!primeiro && (
        <div className="grid grid-cols-2 gap-2">
          <label><Rotulo>Transição de entrada</Rotulo>
            <Sel value={clip.transicao} onChange={(e) => mudar({ transicao: e.target.value as Clip['transicao'] })}>{Object.entries(TRANSICOES).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Sel>
          </label>
          <label><Rotulo>Duração · {clip.trans_dur.toFixed(2)} s</Rotulo>
            <input type="range" min={0.15} max={1.5} step={0.05} value={clip.trans_dur} disabled={clip.transicao === 'corte'} onChange={(e) => mudar({ trans_dur: Number(e.target.value) })} className="w-full accent-[#D2A63C]" />
          </label>
        </div>
      )}
      {clip.media === 'video' && (
        <>
          <label className="block"><Rotulo>Zoom (enquadrar) · {clip.zoom.toFixed(2)}×</Rotulo>
            <input type="range" min={1} max={2} step={0.05} value={clip.zoom} onChange={(e) => mudar({ zoom: Number(e.target.value) })} className="w-full accent-[#D2A63C]" />
          </label>
          <label className="block"><Rotulo>Volume · {Math.round(clip.volume * 100)} %</Rotulo>
            <input type="range" min={0} max={2} step={0.05} value={clip.volume} onChange={(e) => mudar({ volume: Number(e.target.value) })} className="w-full accent-[#D2A63C]" />
          </label>
        </>
      )}
      <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={clip.espelhar} onChange={(e) => mudar({ espelhar: e.target.checked })} className="accent-[#D2A63C]" /> Espelhar (câmara frontal)</label>
    </div>
  )
}

function PainelMaterial({ bib, onAcrescentar }: { bib: Biblioteca; onAcrescentar: (c: Partial<Clip> & Pick<Clip, 'media' | 'fonte' | 'nome' | 'duracao_fonte'>) => void }) {
  const [aba, setAba] = useState<'takes' | 'ativos' | 'renders'>('takes')
  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-xs">
        {([['takes', 'Takes'], ['ativos', 'Imagens e vídeos'], ['renders', 'Vídeos criados']] as const).map(([id, n]) => (
          <button key={id} type="button" onClick={() => setAba(id)} className={`rounded-md border px-2 py-1 ${aba === id ? 'border-[#D2A63C]/60 text-[#E9C46A]' : 'border-zinc-800 text-zinc-400'}`}>{n}</button>
        ))}
      </div>
      <ul className="space-y-1.5">
        {aba === 'takes' && bib.takes.map((tk) => (
          <Item key={tk.id} titulo={`Take · ${new Date(tk.criado_em).toLocaleString('pt-PT')}`} sub={`${tk.duracao_s ? Math.round(tk.duracao_s) : '?'} s · ${tk.marca}`}
            onAdd={() => onAcrescentar({ media: 'video', nome: 'Take', duracao_fonte: Number(tk.duracao_s) || 10, fonte: { tipo: 'take', ref: tk.id, caminho: tk.caminho, url: tk.url } })} />
        ))}
        {aba === 'ativos' && bib.ativos.filter((a) => a.tipo !== 'audio').map((a) => (
          <Item key={a.id} titulo={a.nome} sub={a.tipo === 'imagem' ? 'Imagem' : 'Vídeo'} miniatura={a.tipo === 'imagem' ? a.url : null}
            onAdd={() => onAcrescentar({ media: a.tipo === 'imagem' ? 'imagem' : 'video', nome: a.nome, duracao_fonte: a.tipo === 'imagem' ? 3 : 8, animacao: (a.animacao && a.animacao !== 'auto' ? a.animacao : 'zoom_in') as Clip['animacao'], fonte: { tipo: 'ativo', ref: a.id, caminho: a.caminho, url: a.url } })} />
        ))}
        {aba === 'renders' && bib.renders.map((r) => (
          <Item key={r.id} titulo={`Vídeo criado · ${new Date(r.criado_em).toLocaleString('pt-PT')}`} sub="Do separador Criar"
            onAdd={() => onAcrescentar({ media: 'video', nome: 'Vídeo criado', duracao_fonte: 30, fonte: { tipo: 'url', ref: r.id, caminho: null, url: r.video_url } })} />
        ))}
      </ul>
      <p className="text-[11px] text-zinc-500">Para subir fotos, vídeos ou músicas novas usa o separador «Ativos». Um vídeo criado entra com 30 s: apara-o no clip.</p>
    </div>
  )
}

function Item({ titulo, sub, miniatura, onAdd }: { titulo: string; sub: string; miniatura?: string | null; onAdd: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-zinc-800 p-2">
      {miniatura ? <img src={miniatura} alt="" className="h-10 w-10 rounded object-cover" /> : <Film className="h-5 w-5 text-zinc-500" />}
      <div className="min-w-0 flex-1"><p className="truncate text-xs text-zinc-100">{titulo}</p><p className="text-[11px] text-zinc-500">{sub}</p></div>
      <button type="button" onClick={onAdd} className="rounded-md bg-[#D2A63C] p-1.5 text-black" aria-label="Acrescentar à timeline"><Plus className="h-4 w-4" /></button>
    </li>
  )
}

function PainelTextos({ proj, t, total, texto, setSel, mudarTexto, acrescentar, apagar }: {
  proj: Projeto; t: number; total: number; texto: TextoSobreposto | null; setSel: (id: string | null) => void
  mudarTexto: (id: string, c: Partial<TextoSobreposto>) => void; acrescentar: (x: TextoSobreposto) => void; apagar: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      <button type="button" disabled={!total} onClick={() => acrescentar({ id: novoId(), texto: 'Escreve aqui', inicio: t, fim: Math.min(total, t + 3), posicao: 'meio', estilo: 'titulo', animacao: 'aparecer' })}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"><Type className="h-3.5 w-3.5" /> Texto no cursor</button>
      {texto ? (
        <div className="space-y-2 rounded-xl border border-zinc-800 p-2">
          <div className="flex justify-between"><Rotulo>Texto seleccionado</Rotulo><button type="button" onClick={() => setSel(null)} aria-label="Fechar"><X className="h-3.5 w-3.5 text-zinc-500" /></button></div>
          <textarea value={texto.texto} onChange={(e) => mudarTexto(texto.id, { texto: e.target.value })} rows={2} className="w-full rounded-lg border border-zinc-800 bg-black/40 px-2 py-1.5 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <label><Rotulo>Estilo</Rotulo><Sel value={texto.estilo} onChange={(e) => mudarTexto(texto.id, { estilo: e.target.value as TextoSobreposto['estilo'] })}>{Object.entries(ESTILOS_TEXTO).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Sel></label>
            <label><Rotulo>Posição</Rotulo><Sel value={texto.posicao} onChange={(e) => mudarTexto(texto.id, { posicao: e.target.value as TextoSobreposto['posicao'] })}>{POSICOES_TEXTO.map((p) => <option key={p} value={p}>{p}</option>)}</Sel></label>
            <label><Rotulo>Animação</Rotulo><Sel value={texto.animacao} onChange={(e) => mudarTexto(texto.id, { animacao: e.target.value as TextoSobreposto['animacao'] })}>{Object.entries(ANIMACOES_TEXTO).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Sel></label>
          </div>
          <label className="block"><Rotulo>Entra · {fmt(texto.inicio)}</Rotulo><input type="range" min={0} max={total} step={0.05} value={texto.inicio} onChange={(e) => mudarTexto(texto.id, { inicio: Math.min(Number(e.target.value), texto.fim - 0.2) })} className="w-full accent-[#D2A63C]" /></label>
          <label className="block"><Rotulo>Sai · {fmt(texto.fim)}</Rotulo><input type="range" min={0} max={total} step={0.05} value={texto.fim} onChange={(e) => mudarTexto(texto.id, { fim: Math.max(Number(e.target.value), texto.inicio + 0.2) })} className="w-full accent-[#D2A63C]" /></label>
          <button type="button" onClick={() => apagar(texto.id)} className="text-xs text-rose-300">Apagar texto</button>
        </div>
      ) : (
        <ul className="space-y-1">
          {proj.textos.map((x) => <li key={x.id}><button type="button" onClick={() => setSel(x.id)} className="w-full truncate rounded-md border border-zinc-800 px-2 py-1.5 text-left text-xs">{fmt(x.inicio)} · {x.texto}</button></li>)}
          {!proj.textos.length && <p className="text-xs text-zinc-500">Sem textos. Põe o gancho no início e o CTA no fim.</p>}
        </ul>
      )}
    </div>
  )
}

function PainelAudio({ proj, bib, mudar }: { proj: Projeto; bib: Biblioteca; mudar: (fn: (p: Projeto) => Projeto) => void }) {
  const audios = bib.ativos.filter((a) => a.tipo === 'audio')
  return (
    <div className="space-y-3">
      <label className="block"><Rotulo><Music className="mr-1 inline h-3 w-3" />Música de fundo</Rotulo>
        <Sel value={proj.musica?.fonte.ref ?? ''} onChange={(e) => {
          const a = audios.find((x) => x.id === e.target.value)
          mudar((p) => ({ ...p, musica: a ? { fonte: { tipo: 'ativo', ref: a.id, caminho: a.caminho, url: a.url }, nome: a.nome, volume: p.musica?.volume ?? 0.25, duck: p.musica?.duck ?? true } : null }))
        }}>
          <option value="">Sem música</option>
          {audios.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </Sel>
      </label>
      {proj.musica && (
        <>
          <label className="block"><Rotulo>Volume da música · {Math.round(proj.musica.volume * 100)} %</Rotulo>
            <input type="range" min={0} max={1} step={0.05} value={proj.musica.volume} onChange={(e) => mudar((p) => ({ ...p, musica: p.musica && { ...p.musica, volume: Number(e.target.value) } }))} className="w-full accent-[#D2A63C]" />
          </label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={proj.musica.duck} onChange={(e) => mudar((p) => ({ ...p, musica: p.musica && { ...p.musica, duck: e.target.checked } }))} className="accent-[#D2A63C]" /> Baixar a música quando há voz (duck)</label>
        </>
      )}
      <label className="block"><Rotulo>Volume geral · {Math.round(proj.volume_geral * 100)} %</Rotulo>
        <input type="range" min={0} max={2} step={0.05} value={proj.volume_geral} onChange={(e) => mudar((p) => ({ ...p, volume_geral: Number(e.target.value) }))} className="w-full accent-[#D2A63C]" />
      </label>
      {!audios.length && <p className="text-[11px] text-zinc-500">Sobe músicas no separador «Ativos» (só música com licença para redes).</p>}
    </div>
  )
}

function PainelProjeto({ proj, mudar }: { proj: Projeto; mudar: (fn: (p: Projeto) => Projeto) => void }) {
  return (
    <div className="space-y-3">
      <label className="block"><Rotulo>Legendas automáticas (da transcrição dos takes)</Rotulo>
        <Sel value={proj.legendas} onChange={(e) => mudar((p) => ({ ...p, legendas: e.target.value as Projeto['legendas'] }))}>
          <option value="karaoke">Karaoke (palavra a palavra, cor da marca)</option>
          <option value="simples">Simples (frases)</option>
          <option value="nenhuma">Sem legendas</option>
        </Sel>
      </label>
      <label className="block"><Rotulo>Quando o material não enche o formato</Rotulo>
        <Sel value={proj.fundo} onChange={(e) => mudar((p) => ({ ...p, fundo: e.target.value as Projeto['fundo'] }))}>
          <option value="desfoque">Fundo desfocado</option>
          <option value="marca">Fundo da marca</option>
          <option value="preto">Preto</option>
        </Sel>
      </label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={proj.marca_dagua} onChange={(e) => mudar((p) => ({ ...p, marca_dagua: e.target.checked }))} className="accent-[#D2A63C]" /> Logótipo da marca no canto</label>
      <div className="space-y-1 rounded-lg border border-zinc-800 p-2 text-[11px] text-zinc-400">
        <p className="font-semibold text-zinc-300">Aplicar a todos os clips</p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(FILTROS).slice(0, 5).map(([id, f]) => (
            <button key={id} type="button" onClick={() => mudar((p) => ({ ...p, clips: p.clips.map((c) => ({ ...c, filtro: id as Clip['filtro'] })) }))} className="rounded border border-zinc-700 px-1.5 py-0.5">{f.nome}</button>
          ))}
          <button type="button" onClick={() => mudar((p) => ({ ...p, clips: p.clips.map((c, i) => ({ ...c, transicao: i ? 'fade' : 'corte', trans_dur: 0.35 })) }))} className="rounded border border-zinc-700 px-1.5 py-0.5">Esbater entre todos</button>
          <button type="button" onClick={() => mudar((p) => ({ ...p, clips: p.clips.map((c) => ({ ...c, transicao: 'corte' })) }))} className="rounded border border-zinc-700 px-1.5 py-0.5">Só cortes secos</button>
        </div>
      </div>
      <p className="text-[11px] text-zinc-500">Atalhos: espaço toca/pausa · S divide no cursor · Delete apaga o clip · ←/→ anda 1 s.</p>
    </div>
  )
}

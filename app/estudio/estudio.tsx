'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, Copy, Images, Loader2, Play, RefreshCw, Sparkles, Trash2, Type, Wand2, X } from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'
import { EditorTexto, PainelGanchos } from './editar-texto'
import { Teleprompter } from './teleprompter'

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
    reel?: { duracao_estimada_segundos?: number; segmentos?: { fala: string; plano?: string | null }[] } | null
    laminas?: { titulo?: string; corpo?: string }[]
  }
}
type Take = {
  id: string
  marca: string
  estado: string
  duracao_s: number | null
  criado_em: string
  url: string | null
  peca_id: string | null
  notas?: string | null
  editado_url?: string | null
  transcricao?: { palavras?: { w: string; ini: number; fim: number }[] } | null
  transcricao_estado?: string | null
  cortes?: { ini: number; fim: number }[] | null
  estilo?: Record<string, unknown> | null
}
type Guiao = { pecaId: string | null; marca: MarcaCasa; titulo: string; texto: string; palavraChave: string; planos?: (string | null)[] }

const COR: Record<MarcaCasa, string> = { morethanmoney: '#D2A63C', 'ricardo-garcia': '#0097b2' }
const NOME: Record<MarcaCasa, string> = { morethanmoney: 'More Than Money', 'ricardo-garcia': 'Ricardo Garcia' }

function textoDaPeca(p: Peca): string {
  const segs = p.guiao.reel?.segmentos
  if (segs?.length) return segs.map((s) => s.fala).filter(Boolean).join('\n\n')
  return (p.guiao.laminas ?? []).map((l) => [l.titulo, l.corpo].filter(Boolean).join('. ')).join('\n\n')
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
  const [ganchosDe, setGanchosDe] = useState<Peca | null>(null)

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
    const segs = (p.guiao.reel?.segmentos ?? []).filter((s) => s.fala)
    setGuiao({ pecaId: p.id, marca, titulo: p.guiao.nicho || 'Guião', texto: textoDaPeca(p), palavraChave: p.guiao.palavra_chave || '', planos: segs.map((s) => s.plano ?? null) })
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

  // câmara sem guião: testar enquadramento/luz/microfone ou gravar à vontade
  const abrirCamara = () => {
    setGuiao({ pecaId: null, marca: marcaNova, titulo: 'Gravação livre', texto: '', palavraChave: '' })
    setEcra('gravar')
  }

  const usarTextoLivre = () => {
    if (!textoLivre.trim()) return
    setGuiao({ pecaId: null, marca: marcaNova, titulo: 'Texto livre', texto: textoLivre.trim(), palavraChave: '' })
    setEcra('gravar')
  }

  if (ganchosDe) {
    return <PainelGanchos pecaId={ganchosDe.id} marca={ganchosDe.marca} onFechar={(mudou) => { setGanchosDe(null); if (mudou) void carregar() }} />
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

        <button
          type="button"
          onClick={abrirCamara}
          className="mt-5 flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-left transition-colors hover:bg-white/5"
          style={{ borderColor: `${cor}66` }}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: `${cor}1f`, color: cor }}>
            <Camera className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">Abrir câmara</span>
            <span className="block text-xs text-zinc-400">Testa enquadramento, luz, zoom e microfone, ou grava sem guião.</span>
          </span>
        </button>

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
                <li key={p.id} className="flex gap-2">
                  <button type="button" onClick={() => abrirPeca(p)} className="flex min-h-14 flex-1 items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-left hover:border-zinc-600">
                    <span className="h-8 w-1 rounded-full" style={{ background: c }} aria-hidden />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{p.guiao.nicho || 'Sem tema'}</span>
                      <span className="block text-xs text-zinc-400">
                        {NOME[p.marca as MarcaCasa]} · {p.formato}{p.guiao.palavra_chave ? ` · ${p.guiao.palavra_chave}` : ''}{n ? ` · ${n} take${n > 1 ? 's' : ''}` : ''}
                      </span>
                    </span>
                    <Play className="h-4 w-4 text-zinc-400" aria-hidden />
                  </button>
                  {p.formato === 'reel' && (
                    <button
                      type="button"
                      onClick={() => setGanchosDe(p)}
                      aria-label={`Ganchos A/B de ${p.guiao.nicho || 'guião'}`}
                      title="Ganchos A/B"
                      className="grid min-h-14 w-12 place-items-center rounded-xl border border-zinc-800 text-zinc-400 hover:text-white"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="takes" className="mt-8">
          <h2 id="takes" className="text-base font-medium">Takes gravados</h2>
          <p className="mt-1 text-xs text-zinc-400">«Editar este» manda o take para a edição no Mac, que usa os ativos do guião; o reel entra na fila do Instagram como rascunho. Podes tirar da fila, duplicar ou apagar a qualquer momento.</p>
          {!aCarregar && takes.length === 0 && <p className="mt-2 text-sm text-zinc-500">Nenhum take ainda.</p>}
          <ul className="mt-2 grid grid-cols-2 gap-3">
            {takes.map((t) => (
              <TakeCartao key={t.id} take={t} peca={pecas.find((p) => p.id === t.peca_id) ?? null} onMudou={carregar} />
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}

const ESTADO_TAKE: Record<string, string> = {
  bruto: 'Por editar',
  escolhido: 'Na fila de edição',
  a_editar: 'A editar no Mac',
  editado: 'Editado · na fila do IG',
  publicado: 'Publicado',
}

function TakeCartao({ take, peca, onMudou }: { take: Take; peca: Peca | null; onMudou: () => void }) {
  const [a, setA] = useState(false)
  const [editor, setEditor] = useState<{ ativos: number } | null>(null)
  const abrirTexto = async () => {
    let n = 0
    if (take.peca_id) n = ((await api(`/api/estudio/ativo?peca=${take.peca_id}`).catch(() => ({}))).ativos ?? []).length
    setEditor({ ativos: n })
  }
  const [erro, setErro] = useState<string | null>(null)
  const fazer = async (f: () => Promise<unknown>) => {
    setA(true)
    setErro(null)
    try {
      await f()
      onMudou()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falhou')
    } finally {
      setA(false)
    }
  }
  const retranscrever = () => fazer(() => api('/api/estudio/gravacao', { method: 'PATCH', body: JSON.stringify({ id: take.id, accao: 'retranscrever' }) }))
  const escolher = () => fazer(() => api('/api/estudio/gravacao', { method: 'PATCH', body: JSON.stringify({ id: take.id, estado: 'escolhido' }) }))
  const cancelar = () => fazer(() => api('/api/estudio/gravacao', { method: 'PATCH', body: JSON.stringify({ id: take.id, accao: 'cancelar' }) }))
  const duplicar = () => fazer(() => api('/api/estudio/gravacao', { method: 'PUT', body: JSON.stringify({ id: take.id }) }))
  const apagar = () => {
    if (!window.confirm('Apagar este take? O vídeo, o reel editado e o rascunho na fila desaparecem.')) return
    void fazer(() => api(`/api/estudio/gravacao?id=${take.id}`, { method: 'DELETE' }))
  }
  const c = COR[take.marca as MarcaCasa] ?? '#D2A63C'
  const naFila = take.estado === 'escolhido' || take.estado === 'a_editar' || take.estado === 'editado'
  const botao = 'flex min-h-11 items-center justify-center gap-1 rounded-lg border border-zinc-700 text-xs disabled:opacity-40'
  return (
    <li className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      {take.estado === 'editado' && take.editado_url ? (
        <video src={take.editado_url} controls playsInline preload="metadata" className="aspect-[9/16] w-full bg-black object-cover" />
      ) : take.url ? (
        <video src={take.url} controls playsInline preload="metadata" className="aspect-[9/16] w-full bg-black object-cover" />
      ) : (
        <div className="aspect-[9/16] w-full bg-black" />
      )}
      <div className="p-2 text-xs text-zinc-400">
        <span style={{ color: c }}>{ESTADO_TAKE[take.estado] ?? take.estado}</span>
        {take.duracao_s ? ` · ${Math.round(take.duracao_s)} s` : ''}
        {take.estado === 'escolhido' && take.notas?.startsWith('motor:') ? <span className="block text-red-300">{take.notas}</span> : null}
        {erro && <span role="alert" className="block text-red-300">{erro}</span>}
      </div>
      <div className="grid grid-cols-2 gap-1 p-2 pt-0">
        {naFila ? (
          <button type="button" disabled={a} onClick={cancelar} className={`${botao} col-span-2`}>
            <X className="h-4 w-4" aria-hidden /> {take.estado === 'editado' ? 'Cancelar na fila' : 'Tirar da fila'}
          </button>
        ) : take.estado === 'bruto' ? (
          <button type="button" disabled={a} onClick={escolher} className={`${botao} col-span-2`}>
            <Check className="h-4 w-4" aria-hidden /> Editar este
          </button>
        ) : null}
        {(take.estado === 'bruto' || take.estado === 'escolhido') && (
          take.transcricao_estado === 'pronta' ? (
            <button type="button" disabled={a} onClick={() => void abrirTexto()} className={`${botao} col-span-2`}>
              <Type className="h-4 w-4" aria-hidden /> Editar pelo texto{take.cortes?.length ? ' ✓' : ''}
            </button>
          ) : take.transcricao_estado === 'falhou' ? (
            <button type="button" disabled={a} onClick={retranscrever} className={`${botao} col-span-2 text-zinc-400`}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Transcrição falhou · repetir
            </button>
          ) : (
            <p className="col-span-2 flex min-h-11 items-center justify-center gap-1 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> A transcrever no Mac…
            </p>
          )
        )}
        <button type="button" disabled={a} onClick={duplicar} className={botao}>
          <Copy className="h-4 w-4" aria-hidden /> Duplicar
        </button>
        <button type="button" disabled={a || take.estado === 'publicado'} onClick={apagar} className={`${botao} text-zinc-400 hover:text-red-300`}>
          <Trash2 className="h-4 w-4" aria-hidden /> Apagar
        </button>
        {take.peca_id && (
          <a href={`/estudio?tab=ativos&peca=${take.peca_id}`} className={`${botao} col-span-2 text-zinc-300`}>
            <Images className="h-4 w-4" aria-hidden /> Ativos deste guião
          </a>
        )}
      </div>
      {editor && (
        <EditorTexto
          take={take}
          palavraChave={peca?.guiao.palavra_chave}
          ativos={editor.ativos}
          onFechar={(mudou) => { setEditor(null); if (mudou) onMudou() }}
        />
      )}
    </li>
  )
}

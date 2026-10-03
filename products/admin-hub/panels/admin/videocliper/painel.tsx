'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LISTA_ESTILOS } from '@/lib/videocliper/estilos'
import { Loader2, Scissors, Check, X, Send, RefreshCw, Youtube, Instagram, Clock, ChevronUp, ChevronDown, Play, Download, Trash2 } from 'lucide-react'

/**
 * O PAINEL DO VIDEOCLIPER.
 *
 * Um campo em cima e dez cartões em baixo. O que se decide aqui é só uma coisa — quais dos dez
 * momentos valem a pena — e o ecrã existe para essa decisão se tomar depressa: o gancho, o score
 * e os tempos à vista, sem ter de abrir nada.
 *
 * A aprovação é humana de propósito, mesmo quando o modelo acerta. Um clipe é a cara da marca
 * durante quinze segundos; o custo de publicar um mau é maior do que o de olhar para dez durante
 * um minuto.
 */

interface Job {
  id: string
  origem: string
  youtube_url: string | null
  titulo: string | null
  duracao_seg: number | null
  estado: string
  erro: string | null
  progresso: string | null
  created_at: string
  clips?: number
  publicados?: number
  aprovados?: number
  estilo?: string
}

interface Clip {
  id: string
  ordem: number
  titulo: string
  hook: string | null
  score: number
  porque: string | null
  inicio_seg: number
  fim_seg: number
  duracao_seg: number
  caption: string | null
  cta_palavra: string | null
  estado: string
  erro: string | null
  video_url: string | null
  thumbnail_url: string | null
  ig_permalink: string | null
  youtube_short_url: string | null
  legendas: { palavra: string; inicio: number; fim: number }[] | null
  preview_url: string | null
  preview_estado: string | null
  preview_erro: string | null
  broll: { inicio: number; fim: number; descricao: string }[] | null
  enfase?: { palavra: string; emoji?: string }[] | null
}

const relogio = (s: number) => {
  const t = Math.max(0, Math.round(s))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** O estado em palavras de quem usa, não de quem escreveu a tabela. */
const ESTADO: Record<string, { texto: string; cor: string }> = {
  pedido: { texto: 'na fila', cor: 'text-neutral-400' },
  a_descarregar: { texto: 'a descarregar', cor: 'text-sky-400' },
  a_transcrever: { texto: 'a transcrever', cor: 'text-sky-400' },
  a_analisar: { texto: 'a escolher os momentos', cor: 'text-amber-400' },
  pronto: { texto: 'à espera de ti', cor: 'text-emerald-400' },
  a_render: { texto: 'a cortar', cor: 'text-sky-400' },
  concluido: { texto: 'concluído', cor: 'text-emerald-400' },
  erro: { texto: 'erro', cor: 'text-red-400' },
}

export default function PainelVideocliper() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [aberto, setAberto] = useState<string | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [clips, setClips] = useState<Clip[]>([])
  const [url, setUrl] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [emFoco, setEmFoco] = useState<number | null>(null)
  useEffect(() => { setEmFoco((x) => (x !== null && x >= clips.length ? (clips.length ? clips.length - 1 : null) : x)) }, [clips.length])

  const carregar = useCallback(async () => {
    const r = await fetch('/api/admin/videocliper', { cache: 'no-store' })
    const j = await r.json()
    setJobs(j.jobs ?? [])
  }, [])

  const abrir = useCallback(async (id: string) => {
    setAberto(id)
    const r = await fetch(`/api/admin/videocliper?job=${id}`, { cache: 'no-store' })
    const j = await r.json()
    setJob(j.job ?? null)
    setClips(j.clips ?? [])
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  /**
   * Enquanto há trabalho a decorrer, o ecrã pergunta sozinho.
   *
   * Uma transcrição de duas horas demora minutos e não muda de estado nesse tempo. Sem isto, a
   * pessoa recarregava a página à mão para saber se já estava — ou fechava-a e esquecia.
   */
  useEffect(() => {
    // Com o vídeo aberto, as pré-visualizações e os cortes também são trabalho a decorrer.
    const clipsADecorrer = clips.some(
      (c) => c.estado === 'a_render' || c.estado === 'aprovado' ||
        (['proposto', 'rejeitado', 'erro'].includes(c.estado) && !['feito', 'erro'].includes(c.preview_estado ?? '')),
    )
    const aDecorrer = jobs.some((j) => !['pronto', 'concluido', 'erro'].includes(j.estado)) || (aberto && clipsADecorrer)
    if (!aDecorrer) return
    const t = setInterval(() => {
      void carregar()
      if (aberto) void abrir(aberto)
    }, 10_000)
    return () => clearInterval(t)
  }, [jobs, clips, aberto, carregar, abrir])

  const accao = async (corpo: Record<string, unknown>, marca: string) => {
    setOcupado(marca)
    setErro(null)
    try {
      const r = await fetch('/api/admin/videocliper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const j = await r.json()
      if (j.erro) setErro(j.erro)
      await carregar()
      if (aberto) await abrir(aberto)
      return j
    } catch {
      setErro('não deu')
    } finally {
      setOcupado(null)
    }
  }

  const campo = 'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100'

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5">
      <div>
        {/* A barra lateral vive dentro de /admin; as ferramentas em página própria voltam por aqui,
            como o Conteúdo Social. */}
        <a href="/admin" className="text-[12px] text-neutral-500 hover:text-neutral-300">← Admin</a>
        <h1 className="mt-1 text-xl font-bold text-neutral-100">Videocliper</h1>
        <p className="mt-1 text-[13px] text-neutral-400">
          Um link de uma sessão, dez momentos propostos. Escolhes os que valem a pena e eles
          saem como Short e como Reel.
        </p>
      </div>

      {/* ── pedir ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 p-4 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() && void accao({ accao: 'clipar', url }, 'clipar').then(() => setUrl(''))}
          placeholder="https://www.youtube.com/watch?v=…"
          className={campo}
        />
        <button
          onClick={() => void accao({ accao: 'clipar', url }, 'clipar').then(() => setUrl(''))}
          disabled={ocupado === 'clipar' || url.trim().length < 10}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
        >
          {ocupado === 'clipar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
          Clipar
        </button>
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      {/* ── vídeos ────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {jobs.map((j) => {
          const e = ESTADO[j.estado] ?? { texto: j.estado, cor: 'text-neutral-400' }
          return (
            <div key={j.id} className="rounded-lg border border-neutral-800">
              <div className="flex items-stretch">
              <button
                onClick={() => void (aberto === j.id ? setAberto(null) : abrir(j.id))}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 p-3 text-left hover:bg-neutral-900/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">
                    {j.titulo || j.youtube_url || 'sem título'}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-neutral-500">
                    <span className={e.cor}>{e.texto}</span>
                    {/* Parado, o texto de progresso fica velho (dizia «10 clips» depois de eles serem
                        apagados); a contagem vem das linhas que existem. */}
                    {j.progresso && !['pronto', 'concluido'].includes(j.estado) && <span>· {j.progresso}</span>}
                    {['pronto', 'concluido'].includes(j.estado) && <span>· {j.clips ?? 0} clips</span>}
                    {Boolean(j.publicados) && <span className="text-emerald-500">· {j.publicados} publicados</span>}
                    {j.duracao_seg ? <span>· {relogio(j.duracao_seg)}</span> : null}
                  </p>
                  {j.erro && <p className="mt-0.5 text-[12px] text-red-400">{j.erro}</p>}
                </div>
                {!['pronto', 'concluido', 'erro'].includes(j.estado) && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-500" />
                )}
              </button>
              <button
                onClick={() => {
                  if (!window.confirm(`Apagar «${j.titulo || 'este vídeo'}» e os ${j.clips ?? 0} clips dele? Os ficheiros saem do storage; o que já foi publicado continua publicado.`)) return
                  void accao({ accao: 'apagar_job', jobId: j.id }, `apagar-${j.id}`).then(() => { if (aberto === j.id) { setAberto(null); setClips([]) } })
                }}
                disabled={ocupado === `apagar-${j.id}`}
                title="Apagar vídeo e clips"
                className="shrink-0 border-l border-neutral-800 px-3 text-neutral-500 hover:bg-red-950/40 hover:text-red-400 disabled:opacity-40"
              >
                {ocupado === `apagar-${j.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
              </div>

              {/* ── os dez cartões ──────────────────────────────────────── */}
              {aberto === j.id && (
                <div className="border-t border-neutral-800 p-3">
                  {/* O estilo visual (letra, cores, efeitos) do que ainda está por cortar. Mudar
                      refaz as pré-visualizações; os clips já cortados ficam como estão. */}
                  {job?.id === j.id && (
                    <label className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-neutral-400">
                      Estilo
                      <select
                        value={job.estilo ?? 'ricardogarciapt'}
                        disabled={ocupado === `estilo-${j.id}`}
                        onChange={(e) => {
                          if (e.target.value === job.estilo) return
                          void accao({ accao: 'estilo', jobId: j.id, estilo: e.target.value }, `estilo-${j.id}`)
                        }}
                        className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[12px] text-neutral-100 disabled:opacity-40"
                      >
                        {LISTA_ESTILOS.map((e) => (
                          <option key={e.id} value={e.id}>{e.nome}</option>
                        ))}
                      </select>
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-neutral-700"
                        style={{ background: LISTA_ESTILOS.find((e) => e.id === (job.estilo ?? 'ricardogarciapt'))?.cor }}
                      />
                      {ocupado === `estilo-${j.id}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span className="text-neutral-600">muda as pré-visualizações e os cortes que ainda não foram feitos</span>
                    </label>
                  )}
                  {!clips.length && (
                    <p className="py-6 text-center text-[13px] text-neutral-500">
                      {job?.estado === 'pronto' ? 'sem clips propostos' : 'ainda a preparar…'}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {clips.map((c, i) => (
                      <CartaoClipe key={c.id} c={c} aoAbrir={() => setEmFoco(i)} />
                    ))}
                  </div>

                  {job?.estado === 'pronto' && clips.length > 0 && (
                    <button
                      onClick={() => void accao({ accao: 'rever_legendas', jobId: j.id }, 'rever')}
                      disabled={ocupado === 'rever'}
                      className="mt-3 mr-2 inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-[12px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
                    >
                      {ocupado === 'rever' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Rever legendas
                    </button>
                  )}
                  {job?.estado === 'pronto' && (
                    <button
                      onClick={() => void accao({ accao: 'reanalisar', jobId: j.id }, 'reanalisar')}
                      disabled={ocupado === 'reanalisar'}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-[12px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
                    >
                      {ocupado === 'reanalisar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Escolher outros dez
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {!jobs.length && (
          <p className="py-10 text-center text-[13px] text-neutral-500">
            Ainda não clipaste nada. Cola aí em cima o link de uma sessão.
          </p>
        )}
      </div>
      {emFoco !== null && clips[emFoco] && (
        <ModalClipe
          c={clips[emFoco]}
          posicao={emFoco}
          total={clips.length}
          aoMudar={(d) => setEmFoco((x) => (x === null ? x : Math.min(clips.length - 1, Math.max(0, x + d))))}
          aoFechar={() => setEmFoco(null)}
          accoes={<AccoesClipe c={clips[emFoco]} ocupado={ocupado} accao={accao} />}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
 * O CARTÃO — o frame do clipe, como num feed
 *
 * Decide-se pela imagem e pelo gancho, não por uma ficha. Passar o rato por cima já toca o
 * clipe sem som: dá para varrer dez propostas em segundos sem abrir nenhuma.
 * ────────────────────────────────────────────────────────────────────────────*/
function CartaoClipe({ c, aoAbrir }: { c: Clip; aoAbrir: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const fonte = c.video_url || c.preview_url
  const aPreparar = !fonte && !c.thumbnail_url && !['feito', 'erro'].includes(c.preview_estado ?? '')

  return (
    <button
      onClick={aoAbrir}
      onMouseEnter={() => { void video.current?.play().catch(() => {}) }}
      onMouseLeave={() => { if (video.current) { video.current.pause(); video.current.currentTime = 0 } }}
      className={`group text-left ${c.estado === 'rejeitado' ? 'opacity-45' : ''}`}
    >
      <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
        {c.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {fonte && (
          <video
            ref={video}
            src={fonte}
            muted
            playsInline
            loop
            preload="none"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
        {!c.thumbnail_url && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-[11.5px] text-neutral-500">
            {aPreparar ? <><Loader2 className="h-4 w-4 animate-spin" /> a gerar pré-visualização</>
              : c.preview_estado === 'erro' ? <span className="text-red-400/80">sem pré-visualização{c.preview_erro ? `: ${c.preview_erro.slice(0, 80)}` : ''}</span>
                : <Play className="h-5 w-5" />}
          </div>
        )}
        <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] text-white">
          {c.estado === 'publicado' ? 'Publicado' : c.video_url ? 'Cortado' : c.estado === 'rejeitado' ? 'De lado' : c.estado === 'a_render' ? 'A cortar' : 'Proposto'}
        </span>
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10.5px] text-white">
          {relogio(c.duracao_seg)}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-xl font-bold tabular-nums ${c.score >= 80 ? 'text-emerald-400' : c.score >= 60 ? 'text-amber-400' : 'text-neutral-400'}`}>
          {c.score}
        </span>
        {c.cta_palavra && <span className="rounded border border-neutral-700 px-1.5 text-[10.5px] text-neutral-300">{c.cta_palavra}</span>}
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-neutral-100">{c.titulo}</p>
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
 * O MODAL — ver o clipe inteiro e decidir ali mesmo
 * ────────────────────────────────────────────────────────────────────────────*/
function ModalClipe({
  c, posicao, total, aoMudar, aoFechar, accoes,
}: {
  c: Clip
  posicao: number
  total: number
  aoMudar: (d: number) => void
  aoFechar: () => void
  accoes: ReactNode
}) {
  const fonte = c.video_url || c.preview_url

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') aoMudar(1)
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') aoMudar(-1)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar, aoMudar])

  const transcricao = (c.legendas ?? []).map((p) => p.palavra).join(' ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={aoFechar}>
      <div className="absolute right-4 top-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => aoMudar(-1)} disabled={posicao === 0} className="rounded-md border border-neutral-700 bg-neutral-900 p-2 text-neutral-300 disabled:opacity-30" aria-label="Clipe anterior"><ChevronUp className="h-4 w-4" /></button>
        <button onClick={() => aoMudar(1)} disabled={posicao === total - 1} className="rounded-md border border-neutral-700 bg-neutral-900 p-2 text-neutral-300 disabled:opacity-30" aria-label="Clipe seguinte"><ChevronDown className="h-4 w-4" /></button>
        <button onClick={aoFechar} className="rounded-md border border-neutral-700 bg-neutral-900 p-2 text-neutral-300" aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 sm:flex-row"
      >
        <div className="relative aspect-[9/16] w-full shrink-0 bg-black sm:w-[300px]">
          {fonte ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video key={fonte} src={fonte} poster={c.thumbnail_url ?? undefined} controls autoPlay playsInline className="h-full w-full object-contain" />
          ) : c.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.thumbnail_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-neutral-500">pré-visualização a caminho</div>
          )}
          {!c.video_url && c.preview_url && (
            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">pré-visualização leve</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
          <p className="text-[11px] text-neutral-500">#{c.ordem} · {relogio(c.inicio_seg)} → {relogio(c.fim_seg)} · {c.duracao_seg}s</p>
          <h2 className="mt-1 text-[15px] font-semibold text-neutral-100">{c.titulo}</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-3xl font-bold tabular-nums ${c.score >= 80 ? 'text-emerald-400' : c.score >= 60 ? 'text-amber-400' : 'text-neutral-400'}`}>{c.score}</span>
            <span className="text-[12px] text-neutral-500">/100</span>
            {c.cta_palavra && <span className="ml-2 rounded border border-neutral-700 px-1.5 text-[11px] text-neutral-300">CTA {c.cta_palavra}</span>}
          </div>

          {c.hook && <p className="mt-3 border-l-2 border-amber-500/60 pl-2 text-[13px] italic text-neutral-200">“{c.hook}”</p>}
          {c.porque && <p className="mt-2 text-[12.5px] text-neutral-400">{c.porque}</p>}

          {(c.enfase ?? []).length > 0 && (
            <p className="mt-3 text-[12px] text-neutral-400">
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">Palavras-chave</span>{' '}
              {(c.enfase ?? []).map((e) => `${e.palavra}${e.emoji ? ` ${e.emoji}` : ''}`).join(' · ')}
            </p>
          )}

          {(c.broll ?? []).length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">B-roll (imagens de apoio)</p>
              <ul className="mt-1 space-y-0.5 text-[12px] text-neutral-400">
                {(c.broll ?? []).map((b, i) => (
                  <li key={i}><span className="font-mono text-neutral-500">{b.inicio}s–{b.fim}s</span> · {b.descricao}</li>
                ))}
              </ul>
            </div>
          )}

          {transcricao && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Transcrição</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-300">{transcricao}</p>
            </div>
          )}
          {c.caption && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Legenda da publicação</p>
              <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-neutral-300">{c.caption}</p>
            </div>
          )}
          {c.erro && <p className="mt-3 text-[12px] text-red-400">{c.erro}</p>}

          <div className="mt-4 border-t border-neutral-800 pt-3">{accoes}</div>
        </div>
      </div>
    </div>
  )
}

function AccoesClipe({
  c, ocupado, accao,
}: {
  c: Clip
  ocupado: string | null
  accao: (corpo: Record<string, unknown>, marca: string) => Promise<unknown>
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {['proposto', 'rejeitado', 'erro'].includes(c.estado) && (
        <>
          <button
            onClick={() => void accao({ accao: 'aprovar', clipId: c.id }, c.id)}
            disabled={ocupado === c.id}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" /> Aprovar e cortar
          </button>
          {c.estado === 'proposto' && (
            <button
              onClick={() => void accao({ accao: 'rejeitar', clipId: c.id }, c.id)}
              disabled={ocupado === c.id}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2.5 py-1.5 text-[12px] text-neutral-300 hover:bg-neutral-800"
            >
              <X className="h-3.5 w-3.5" /> Pôr de lado
            </button>
          )}
        </>
      )}

      {['aprovado', 'a_render'].includes(c.estado) && (
        <span className="inline-flex items-center gap-1.5 text-[12px] text-sky-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> a cortar no VPS
        </span>
      )}

      {c.estado === 'renderizado' && (
        <button
          onClick={() => void accao({ accao: 'publicar', clipId: c.id }, c.id)}
          disabled={ocupado === c.id}
          className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1.5 text-[12px] font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
        >
          {ocupado === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Publicar nos dois
        </button>
      )}

      {(c.broll ?? []).length > 0 && ['proposto', 'rejeitado', 'erro'].includes(c.estado) && (
        <button
          onClick={() => void accao({ accao: 'broll_limpar', clipId: c.id }, `broll-${c.id}`)}
          disabled={ocupado === `broll-${c.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2.5 py-1.5 text-[12px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
        >
          Sem B-roll
        </button>
      )}

      <button
        onClick={() => {
          if (!window.confirm(`Apagar o clipe «${c.titulo}»? Sai do painel e do storage; se já foi publicado, continua publicado.`)) return
          void accao({ accao: 'apagar_clip', clipId: c.id }, `apagar-${c.id}`)
        }}
        disabled={ocupado === `apagar-${c.id}` || c.estado === 'a_render'}
        className="inline-flex items-center gap-1 rounded-md border border-neutral-800 px-2.5 py-1.5 text-[12px] text-neutral-400 hover:border-red-900 hover:text-red-400 disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" /> Apagar
      </button>

      {c.video_url && (
        <a href={c.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2.5 py-1.5 text-[12px] text-neutral-300 hover:bg-neutral-800">
          <Download className="h-3.5 w-3.5" /> HD
        </a>
      )}
      {c.ig_permalink && (
        <a href={c.ig_permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-pink-400 hover:underline">
          <Instagram className="h-3.5 w-3.5" /> Reel
        </a>
      )}
      {c.youtube_short_url && (
        <a href={c.youtube_short_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-red-400 hover:underline">
          <Youtube className="h-3.5 w-3.5" /> Short
        </a>
      )}
    </div>
  )
}

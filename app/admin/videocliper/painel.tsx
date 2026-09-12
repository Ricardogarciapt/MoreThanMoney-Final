'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Scissors, Check, X, Send, RefreshCw, Youtube, Instagram, Clock } from 'lucide-react'

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
    const aDecorrer = jobs.some((j) => !['pronto', 'concluido', 'erro'].includes(j.estado))
    if (!aDecorrer) return
    const t = setInterval(() => {
      void carregar()
      if (aberto) void abrir(aberto)
    }, 10_000)
    return () => clearInterval(t)
  }, [jobs, aberto, carregar, abrir])

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
        <h1 className="text-xl font-bold text-neutral-100">Videocliper</h1>
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
              <button
                onClick={() => void (aberto === j.id ? setAberto(null) : abrir(j.id))}
                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-neutral-900/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">
                    {j.titulo || j.youtube_url || 'sem título'}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-neutral-500">
                    <span className={e.cor}>{e.texto}</span>
                    {j.progresso && <span>· {j.progresso}</span>}
                    {Boolean(j.clips) && <span>· {j.clips} clips</span>}
                    {Boolean(j.publicados) && <span className="text-emerald-500">· {j.publicados} publicados</span>}
                    {j.duracao_seg ? <span>· {relogio(j.duracao_seg)}</span> : null}
                  </p>
                  {j.erro && <p className="mt-0.5 text-[12px] text-red-400">{j.erro}</p>}
                </div>
                {!['pronto', 'concluido', 'erro'].includes(j.estado) && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-500" />
                )}
              </button>

              {/* ── os dez cartões ──────────────────────────────────────── */}
              {aberto === j.id && (
                <div className="border-t border-neutral-800 p-3">
                  {!clips.length && (
                    <p className="py-6 text-center text-[13px] text-neutral-500">
                      {job?.estado === 'pronto' ? 'sem clips propostos' : 'ainda a preparar…'}
                    </p>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    {clips.map((c) => (
                      <div
                        key={c.id}
                        className={`rounded-lg border p-3 ${
                          c.estado === 'publicado'
                            ? 'border-emerald-700/50 bg-emerald-950/20'
                            : c.estado === 'rejeitado'
                              ? 'border-neutral-800 opacity-45'
                              : 'border-neutral-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold text-neutral-100">{c.titulo}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-neutral-500">
                              <Clock className="h-3 w-3" />
                              {relogio(c.inicio_seg)} → {relogio(c.fim_seg)} · {c.duracao_seg}s
                              {c.cta_palavra && <span className="text-amber-500">· {c.cta_palavra}</span>}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              c.score >= 80 ? 'bg-emerald-500/15 text-emerald-400'
                                : c.score >= 60 ? 'bg-amber-500/15 text-amber-400'
                                  : 'bg-neutral-700/40 text-neutral-400'
                            }`}
                            title="Score de viralização"
                          >
                            {c.score}
                          </span>
                        </div>

                        {c.hook && (
                          <p className="mt-2 border-l-2 border-neutral-700 pl-2 text-[12.5px] italic leading-snug text-neutral-300">
                            “{c.hook}”
                          </p>
                        )}
                        {c.porque && <p className="mt-1.5 text-[11.5px] text-neutral-500">{c.porque}</p>}

                        {c.caption && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-[11.5px] text-neutral-400 hover:text-neutral-200">
                              Legenda da publicação
                            </summary>
                            <p className="mt-1 whitespace-pre-wrap rounded border border-neutral-800 bg-neutral-900/60 p-2 text-[12px] leading-relaxed text-neutral-300">
                              {c.caption}
                            </p>
                          </details>
                        )}

                        {c.video_url && (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <video src={c.video_url} controls className="mt-2 w-full rounded border border-neutral-800" />
                        )}
                        {c.erro && <p className="mt-2 text-[12px] text-red-400">{c.erro}</p>}

                        {/* ── o que se pode fazer com este clipe ─────────── */}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
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

                          {c.estado === 'a_render' && (
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
                      </div>
                    ))}
                  </div>

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
    </div>
  )
}

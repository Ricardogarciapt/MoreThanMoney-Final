'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Scissors, Sparkles, Wand2, X } from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'
import {
  ehBengala,
  normalizarEstilo,
  riscadasDe,
  zonasACortar,
  type Corte,
  type EstiloTake,
  type Palavra,
} from '@/lib/estudio/texto'
import { notaGancho, notaReel, type Nota } from '@/lib/estudio/nota'

/**
 * Editar o take pelo texto (ideias do OpenCut-AI, MIT): tocas numa palavra para a riscar e o vídeo
 * salta-a na pré-visualização; «Tirar bengalas» risca os «ãh/hum»; «Encolher pausas» corta os
 * silêncios. Escolhes o estilo das legendas e da música. O Mac aplica exactamente estes cortes.
 */

const COR: Record<string, string> = { morethanmoney: '#D2A63C', 'ricardo-garcia': '#0097b2' }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(await authHeaders()) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`)
  return j
}

function Barra({ nota, cor }: { nota: number; cor: string }) {
  return (
    <span className="block h-1.5 w-full rounded bg-zinc-800" aria-hidden>
      <span className="block h-1.5 rounded" style={{ width: `${nota}%`, background: nota >= 75 ? cor : nota >= 50 ? '#a1a1aa' : '#f87171' }} />
    </span>
  )
}

function PainelNota({ nota, cor, titulo }: { nota: Nota; cor: string; titulo: string }) {
  return (
    <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
        <span>{titulo}</span>
        <span className="text-lg font-semibold" style={{ color: nota.nota >= 75 ? cor : undefined }}>{nota.nota}</span>
      </summary>
      <ul className="mt-3 space-y-2">
        {nota.sinais.map((s) => (
          <li key={s.id} className="text-xs">
            <div className="flex justify-between text-zinc-300"><span>{s.nome}</span><span>{s.nota}</span></div>
            <Barra nota={s.nota} cor={cor} />
            {s.nota < 75 && <p className="mt-1 text-zinc-500">{s.dica}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-zinc-500">Regras medidas no texto e no take, para comparar versões. Não prevê alcance.</p>
    </details>
  )
}

export type TakeTexto = {
  id: string
  marca: string
  url: string | null
  peca_id: string | null
  duracao_s: number | null
  transcricao?: { palavras?: Palavra[] } | null
  cortes?: Corte[] | null
  estilo?: Partial<EstiloTake> | null
}

export function EditorTexto({
  take,
  palavraChave,
  ativos,
  onFechar,
}: {
  take: TakeTexto
  palavraChave?: string | null
  ativos: number
  onFechar: (mudou: boolean) => void
}) {
  const cor = COR[take.marca] ?? '#D2A63C'
  const palavras = useMemo(() => take.transcricao?.palavras ?? [], [take])
  const [riscadas, setRiscadas] = useState<Set<number>>(() => riscadasDe(palavras, take.cortes ?? []))
  const [estilo, setEstilo] = useState<EstiloTake>(() => normalizarEstilo(take.estilo))
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const [duracao, setDuracao] = useState(take.duracao_s ?? (palavras.length ? palavras[palavras.length - 1].fim + 0.5 : 0))

  const cortes = useMemo(
    () => zonasACortar(palavras, riscadas, { pausas: estilo.pausas, duracao }),
    [palavras, riscadas, estilo.pausas, duracao],
  )
  const final = Math.max(0, duracao - cortes.reduce((s, c) => s + c.fim - c.ini, 0))
  const nota = notaReel({ palavras, riscadas, cortes, duracaoBruto: duracao, palavraChave, legendas: estilo.legenda !== 'sem', ativos })

  // Pré-visualização: o vídeo salta as zonas cortadas.
  useEffect(() => {
    const v = video.current
    if (!v) return
    const passo = () => {
      setAgora(v.currentTime)
      const c = cortes.find((z) => v.currentTime >= z.ini && v.currentTime < z.fim - 0.02)
      if (c) v.currentTime = Math.min(c.fim, v.duration || c.fim)
    }
    v.addEventListener('timeupdate', passo)
    return () => v.removeEventListener('timeupdate', passo)
  }, [cortes])

  const alternar = (i: number) =>
    setRiscadas((r) => {
      const n = new Set(r)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  const tirarBengalas = (tipo: 'som' | 'palavra') =>
    setRiscadas((r) => {
      const n = new Set(r)
      palavras.forEach((p, i) => ehBengala(p.w) === tipo && n.add(i))
      return n
    })
  const irPara = (p: Palavra) => {
    if (video.current) {
      video.current.currentTime = p.ini
      void video.current.play().catch(() => {})
    }
  }

  const guardar = async (editar: boolean) => {
    setAGuardar(true)
    setErro(null)
    try {
      await api('/api/estudio/gravacao', { method: 'PATCH', body: JSON.stringify({ id: take.id, cortes, estilo }) })
      if (editar) await api('/api/estudio/gravacao', { method: 'PATCH', body: JSON.stringify({ id: take.id, estado: 'escolhido' }) })
      onFechar(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui guardar.')
      setAGuardar(false)
    }
  }

  const nBengalasSom = palavras.filter((p, i) => !riscadas.has(i) && ehBengala(p.w) === 'som').length
  const nBengalasPalavra = palavras.filter((p, i) => !riscadas.has(i) && ehBengala(p.w) === 'palavra').length
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

  return (
    <div role="dialog" aria-modal="true" aria-label="Editar pelo texto" className="fixed inset-0 z-50 overflow-y-auto bg-[#0b0b0c] text-zinc-100">
      <div className="mx-auto max-w-xl px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Editar pelo texto</h2>
          <button type="button" onClick={() => onFechar(false)} aria-label="Fechar" className="grid h-11 w-11 place-items-center rounded-xl text-zinc-400 hover:text-white">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {take.url && (
          <video
            ref={video}
            src={take.url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuracao(e.currentTarget.duration)}
            className="mx-auto mt-2 aspect-[9/16] max-h-[45vh] rounded-xl bg-black object-contain"
          />
        )}
        <p className="mt-2 text-center text-xs text-zinc-400">
          {mmss(duracao)} → <span style={{ color: cor }}>{mmss(final)}</span> · {riscadas.size} palavra{riscadas.size === 1 ? '' : 's'} riscada{riscadas.size === 1 ? '' : 's'}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => tirarBengalas('som')} disabled={!nBengalasSom} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-sm disabled:opacity-40">
            <Scissors className="h-4 w-4" aria-hidden /> Tirar «ãh/hum» ({nBengalasSom})
          </button>
          <button type="button" onClick={() => tirarBengalas('palavra')} disabled={!nBengalasPalavra} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-sm disabled:opacity-40">
            <Scissors className="h-4 w-4" aria-hidden /> Tirar «tipo/pronto» ({nBengalasPalavra})
          </button>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-3 text-sm">
            <input type="checkbox" checked={estilo.pausas} onChange={(e) => setEstilo({ ...estilo, pausas: e.target.checked })} className="h-4 w-4" />
            Encolher pausas
          </label>
          {riscadas.size > 0 && (
            <button type="button" onClick={() => setRiscadas(new Set())} className="min-h-11 rounded-xl px-3 text-sm text-zinc-400 hover:text-white">
              Limpar
            </button>
          )}
        </div>

        <p className="mt-4 text-xs text-zinc-500">Toca numa palavra para a riscar. Toca duas vezes seguidas para ouvir a partir dali.</p>
        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-[17px] leading-9">
          {palavras.map((p, i) => {
            const r = riscadas.has(i)
            const b = ehBengala(p.w)
            const aTocar = agora >= p.ini && agora < p.fim
            return (
              <button
                key={i}
                type="button"
                onClick={() => alternar(i)}
                onDoubleClick={() => irPara(p)}
                aria-pressed={r}
                className={`mr-1 rounded px-0.5 transition-colors ${r ? 'text-zinc-600 line-through' : b === 'som' ? 'text-amber-300' : 'text-zinc-100'}`}
                style={aTocar && !r ? { background: `${cor}40` } : undefined}
              >
                {p.w}
              </button>
            )
          })}
        </div>

        <section className="mt-5 space-y-3" aria-label="Estilo">
          <fieldset>
            <legend className="text-sm text-zinc-300">Legendas</legend>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {([
                ['karaoke', 'Karaoke'],
                ['caixa', 'Caixa'],
                ['classica', 'Clássica'],
                ['sem', 'Sem'],
              ] as const).map(([id, nome]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={estilo.legenda === id}
                  onClick={() => setEstilo({ ...estilo, legenda: id })}
                  className="min-h-11 rounded-xl border text-sm"
                  style={estilo.legenda === id ? { borderColor: cor, color: cor, background: `${cor}1a` } : { borderColor: '#3f3f46' }}
                >
                  {nome}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="musica-db" className="flex justify-between text-sm text-zinc-300">
              <span>Volume da música</span><span>{estilo.musica_db} dB</span>
            </label>
            <input id="musica-db" type="range" min={-30} max={-8} value={estilo.musica_db} onChange={(e) => setEstilo({ ...estilo, musica_db: Number(e.target.value) })} className="mt-2 w-full" />
            <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={estilo.duck} onChange={(e) => setEstilo({ ...estilo, duck: e.target.checked })} className="h-4 w-4" />
              Auto-duck: a música baixa quando falas
            </label>
            <p className="text-xs text-zinc-500">A música vem do separador Ativos (um áudio ligado a este guião).</p>
          </div>
        </section>

        <div className="mt-5">
          <PainelNota nota={nota} cor={cor} titulo="Nota do reel" />
        </div>

        {erro && <p role="alert" className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-[#0b0b0c]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2">
          <button type="button" disabled={aGuardar} onClick={() => void guardar(false)} className="min-h-12 flex-1 rounded-xl border border-zinc-700 text-sm">
            Guardar
          </button>
          <button type="button" disabled={aGuardar} onClick={() => void guardar(true)} className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl text-sm font-semibold text-black" style={{ background: cor }}>
            {aGuardar ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
            Guardar e editar
          </button>
        </div>
      </div>
    </div>
  )
}

type GanchoNota = { fala: string; ecra: string; gatilho: string } & Nota

/** Ganchos A/B: 5 alternativas para a 1.ª fala, com nota; «Usar» põe-no no guião para gravar. */
export function PainelGanchos({ pecaId, marca, onFechar }: { pecaId: string; marca: string; onFechar: (mudou: boolean) => void }) {
  const cor = COR[marca] ?? '#D2A63C'
  const [estado, setEstado] = useState<'a_gerar' | 'pronto' | 'erro'>('a_gerar')
  const [actual, setActual] = useState<GanchoNota | null>(null)
  const [ganchos, setGanchos] = useState<GanchoNota[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [aUsar, setAUsar] = useState<number | null>(null)
  const [proprio, setProprio] = useState('')

  const gerar = async () => {
    setEstado('a_gerar')
    setErro(null)
    try {
      const r = await api('/api/estudio/ganchos', { method: 'POST', body: JSON.stringify({ peca_id: pecaId }) })
      setActual(r.actual)
      setGanchos(r.ganchos ?? [])
      setEstado('pronto')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'A IA não respondeu.')
      setEstado('erro')
    }
  }
  useEffect(() => { void gerar() }, [pecaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const usar = async (g: { fala: string; ecra: string }, i: number) => {
    setAUsar(i)
    try {
      await api('/api/estudio/ganchos', { method: 'PATCH', body: JSON.stringify({ peca_id: pecaId, fala: g.fala, ecra: g.ecra }) })
      onFechar(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui guardar.')
      setAUsar(null)
    }
  }

  const notaProprio = proprio.trim() ? notaGancho(proprio) : null

  return (
    <div role="dialog" aria-modal="true" aria-label="Ganchos A/B" className="fixed inset-0 z-50 overflow-y-auto bg-[#0b0b0c] text-zinc-100">
      <div className="mx-auto max-w-xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ganchos A/B</h2>
          <button type="button" onClick={() => onFechar(false)} aria-label="Fechar" className="grid h-11 w-11 place-items-center rounded-xl text-zinc-400 hover:text-white">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="text-sm text-zinc-400">Cinco aberturas diferentes para o mesmo reel. Escolhe uma e ela passa a ser a 1.ª fala no teleprompter. Grava duas versões e compara.</p>

        {actual && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Actual</p>
            <div className="mt-1 rounded-xl border border-zinc-800 p-3">
              <p className="text-sm">«{actual.fala}»</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400"><span className="w-8">{actual.nota}</span><Barra nota={actual.nota} cor={cor} /></div>
            </div>
          </div>
        )}

        {estado === 'a_gerar' && <p className="mt-6 flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> A escrever ganchos…</p>}
        {erro && <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>}

        <ul className="mt-4 space-y-3">
          {ganchos.map((g, i) => (
            <li key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px]">«{g.fala}»</p>
                  <p className="mt-1 text-xs font-semibold tracking-wide" style={{ color: cor }}>{g.ecra}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{g.gatilho}</p>
                </div>
                <span className="text-xl font-semibold" style={{ color: g.nota >= 75 ? cor : undefined }}>{g.nota}</span>
              </div>
              <div className="mt-2"><Barra nota={g.nota} cor={cor} /></div>
              <button type="button" disabled={aUsar !== null} onClick={() => void usar(g, i)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 text-sm disabled:opacity-40">
                {aUsar === i ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} Usar este
              </button>
            </li>
          ))}
        </ul>

        {estado !== 'a_gerar' && (
          <button type="button" onClick={() => void gerar()} className="mt-4 min-h-11 w-full rounded-xl border border-zinc-700 text-sm">Gerar outros 5</button>
        )}

        <section className="mt-6" aria-labelledby="proprio">
          <h3 id="proprio" className="text-sm text-zinc-300">Testar o teu</h3>
          <input value={proprio} onChange={(e) => setProprio(e.target.value)} placeholder="Escreve um gancho e vê a nota" className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base" />
          {notaProprio && (
            <div className="mt-3 space-y-3">
              <PainelNota nota={notaProprio} cor={cor} titulo="Nota" />
              <button type="button" disabled={aUsar !== null} onClick={() => void usar({ fala: proprio.trim(), ecra: '' }, -1)} className="min-h-11 w-full rounded-lg border border-zinc-700 text-sm">Usar este</button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

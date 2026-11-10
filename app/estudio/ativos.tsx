'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileAudio, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'

/**
 * ATIVOS do Estúdio: fotos, vídeos, capturas, logos e áudios para o editor usar num guião.
 * Cada ativo liga-se a uma peça (guião) e, num reel, a um segmento; o editor do Mac põe-no
 * nesse segmento por cima do take. Sem peça, fica na biblioteca.
 */

type Peca = {
  id: string
  formato: string
  marca: string
  guiao: { nicho?: string; reel?: { segmentos?: { fala?: string; visual?: string }[] } | null }
}
type Ativo = {
  id: string
  peca_id: string | null
  segmento: number | null
  tipo: 'imagem' | 'video' | 'audio'
  nome: string
  mime: string
  tamanho: number | null
  url: string | null
}
type Subida = { nome: string; progresso: number; erro?: string }

const ACEITA = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(await authHeaders()) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`)
  return j
}

function subir(url: string, f: File, onProgresso: (p: number) => void) {
  return new Promise<void>((ok, falha) => {
    const x = new XMLHttpRequest()
    x.open('PUT', url)
    x.setRequestHeader('content-type', f.type)
    x.upload.onprogress = (e) => e.lengthComputable && onProgresso(Math.round((e.loaded / e.total) * 100))
    x.onload = () => (x.status < 300 ? ok() : falha(new Error(`Upload falhou (${x.status})`)))
    x.onerror = () => falha(new Error('Sem rede durante o upload.'))
    x.send(f)
  })
}

const tituloPeca = (p: Peca) => `${p.guiao.nicho || 'Guião'} · ${p.formato}`

export default function AtivosEstudio({ pecaInicial }: { pecaInicial?: string | null }) {
  const [pecas, setPecas] = useState<Peca[]>([])
  const [pecaId, setPecaId] = useState<string>(pecaInicial ?? '')
  const [segmento, setSegmento] = useState<string>('')
  const [ativos, setAtivos] = useState<Ativo[]>([])
  const [subidas, setSubidas] = useState<Subida[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(true)
  const input = useRef<HTMLInputElement>(null)

  const peca = pecas.find((p) => p.id === pecaId) ?? null
  const segmentos = peca?.guiao.reel?.segmentos ?? []

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const [g, a] = await Promise.all([
        api('/api/conteudo-magnetico/guiao'),
        api(`/api/estudio/ativo${pecaId ? `?peca=${pecaId}` : ''}`),
      ])
      setPecas((g.pecas ?? []).filter((p: Peca) => p.marca === 'morethanmoney' || p.marca === 'ricardo-garcia'))
      setAtivos(a.ativos ?? [])
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui carregar.')
    } finally {
      setACarregar(false)
    }
  }, [pecaId])
  useEffect(() => { void carregar() }, [carregar])

  const carregarFicheiros = async (lista: FileList | null) => {
    if (!lista?.length) return
    const ficheiros = Array.from(lista)
    setErro(null)
    setSubidas(ficheiros.map((f) => ({ nome: f.name, progresso: 0 })))
    const seg = segmento === '' ? null : Number(segmento)
    for (let i = 0; i < ficheiros.length; i++) {
      const f = ficheiros[i]
      const marca = (p: Partial<Subida>) => setSubidas((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)))
      try {
        const r = await api('/api/estudio/ativo', {
          method: 'POST',
          body: JSON.stringify({ nome: f.name, mime: f.type, tamanho: f.size, peca_id: pecaId || null, segmento: seg }),
        })
        await subir(r.upload_url, f, (p) => marca({ progresso: p }))
        await api('/api/estudio/ativo', { method: 'PATCH', body: JSON.stringify({ id: r.id, estado: 'pronto' }) })
        marca({ progresso: 100 })
      } catch (e) {
        marca({ erro: e instanceof Error ? e.message : 'Falhou' })
      }
    }
    if (input.current) input.current.value = ''
    await carregar()
    setSubidas((s) => s.filter((x) => x.erro))
  }

  const mudar = async (a: Ativo, campos: { peca_id?: string | null; segmento?: number | null }) => {
    setAtivos((xs) => xs.map((x) => (x.id === a.id ? { ...x, ...campos } : x)))
    try {
      await api('/api/estudio/ativo', { method: 'PATCH', body: JSON.stringify({ id: a.id, ...campos }) })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui guardar.')
      void carregar()
    }
  }

  const apagar = async (a: Ativo) => {
    if (!window.confirm(`Apagar «${a.nome}»?`)) return
    setAtivos((xs) => xs.filter((x) => x.id !== a.id))
    try {
      await api(`/api/estudio/ativo?id=${a.id}`, { method: 'DELETE' })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui apagar.')
      void carregar()
    }
  }

  const rotuloSeg = (i: number) => {
    const s = segmentos[i]
    const fala = (s?.fala || '').slice(0, 48)
    return `${i + 1}. ${fala}${(s?.fala?.length ?? 0) > 48 ? '…' : ''}`
  }

  return (
    <main className="min-h-dvh bg-[#0b0b0c] px-4 pb-16 pt-6 text-zinc-100">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold">Ativos</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Fotos, vídeos, capturas, logos ou áudios para a edição. Liga-os a um guião e ao momento em que entram; o editor
          põe-nos por cima do teu take nesse ponto. Ficam privados.
        </p>

        {erro && <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>}

        <section aria-labelledby="carregar" className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 id="carregar" className="text-base font-medium">Carregar</h2>
          <label className="mt-3 block text-sm text-zinc-300" htmlFor="ativo-peca">Guião</label>
          <select
            id="ativo-peca"
            value={pecaId}
            onChange={(e) => { setPecaId(e.target.value); setSegmento('') }}
            className="mt-1 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm"
          >
            <option value="">Biblioteca (sem guião)</option>
            {pecas.map((p) => <option key={p.id} value={p.id}>{tituloPeca(p)}</option>)}
          </select>

          {segmentos.length > 0 && (
            <>
              <label className="mt-3 block text-sm text-zinc-300" htmlFor="ativo-seg">Momento do reel</label>
              <select
                id="ativo-seg"
                value={segmento}
                onChange={(e) => setSegmento(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm"
              >
                <option value="">Qualquer (o editor escolhe)</option>
                {segmentos.map((_, i) => <option key={i} value={i}>{rotuloSeg(i)}</option>)}
              </select>
            </>
          )}

          <input
            ref={input}
            id="ativo-ficheiros"
            type="file"
            multiple
            accept={ACEITA}
            className="sr-only"
            onChange={(e) => void carregarFicheiros(e.target.files)}
          />
          <label
            htmlFor="ativo-ficheiros"
            className="mt-4 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#D2A63C] px-4 text-sm font-semibold text-black hover:bg-[#E9C46A]"
          >
            <ImagePlus className="h-4 w-4" aria-hidden /> Escolher ficheiros
          </label>
          <p className="mt-2 text-xs text-zinc-500">JPG, PNG, WEBP, HEIC, MP4, MOV, MP3, M4A ou WAV, até 200 MB cada.</p>

          {subidas.length > 0 && (
            <ul className="mt-3 space-y-2" aria-live="polite">
              {subidas.map((s, i) => (
                <li key={i} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="truncate text-zinc-300">{s.nome}</span>
                    <span className={s.erro ? 'text-red-300' : 'text-zinc-400'}>{s.erro ?? `${s.progresso}%`}</span>
                  </div>
                  {!s.erro && (
                    <div className="mt-1 h-1 rounded bg-zinc-800">
                      <div className="h-1 rounded bg-[#D2A63C]" style={{ width: `${s.progresso}%` }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="lista" className="mt-6">
          <h2 id="lista" className="text-base font-medium">{peca ? `Neste guião (${ativos.length})` : `Todos (${ativos.length})`}</h2>
          {aCarregar ? (
            <Loader2 className="mt-4 h-5 w-5 animate-spin text-zinc-500" aria-label="A carregar" />
          ) : ativos.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Ainda não há ativos aqui.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3">
              {ativos.map((a) => {
                const pa = pecas.find((p) => p.id === a.peca_id)
                const segs = pa?.guiao.reel?.segmentos ?? []
                return (
                  <li key={a.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
                    <div className="flex aspect-[4/5] items-center justify-center bg-black">
                      {a.tipo === 'imagem' && a.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.url} alt={a.nome} className="h-full w-full object-cover" />
                      ) : a.tipo === 'video' && a.url ? (
                        <video src={a.url} muted playsInline controls preload="metadata" className="h-full w-full object-cover" />
                      ) : (
                        <FileAudio className="h-8 w-8 text-zinc-500" aria-hidden />
                      )}
                    </div>
                    <div className="space-y-2 p-2">
                      <p className="truncate text-xs text-zinc-300" title={a.nome}>{a.nome}</p>
                      <select
                        aria-label={`Guião de ${a.nome}`}
                        value={a.peca_id ?? ''}
                        onChange={(e) => void mudar(a, { peca_id: e.target.value || null, segmento: null })}
                        className="min-h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-xs"
                      >
                        <option value="">Biblioteca</option>
                        {pecas.map((p) => <option key={p.id} value={p.id}>{tituloPeca(p)}</option>)}
                      </select>
                      {segs.length > 0 && (
                        <select
                          aria-label={`Momento de ${a.nome}`}
                          value={a.segmento ?? ''}
                          onChange={(e) => void mudar(a, { segmento: e.target.value === '' ? null : Number(e.target.value) })}
                          className="min-h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-xs"
                        >
                          <option value="">Qualquer momento</option>
                          {segs.map((s, i) => <option key={i} value={i}>{`${i + 1}. ${(s.fala || '').slice(0, 30)}`}</option>)}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => void apagar(a)}
                        className="flex min-h-9 w-full items-center justify-center gap-1 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Apagar
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}

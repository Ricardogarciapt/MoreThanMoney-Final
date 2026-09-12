'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Wand2, Download, Share2, Upload, Plus, Check, Trash2, Sparkles } from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'

/**
 * MTM SOCIAL — o estúdio de cartões, para os membros.
 *
 * O mesmo motor do estúdio do admin, com duas diferenças que são toda a diferença:
 *
 * · A peça é assinada com a marca de QUEM a faz — nome, arroba, cor e logótipo dele. Sem isso,
 *   cada peça saía assinada com a conta da casa, que é pôr a marca da MTM em conteúdo que não
 *   é da MTM.
 * · A imagem é gerada por via GRATUITA, nunca pelas chaves da MTM. Cada membro a carregar em
 *   «gerar» estaria a gastar dinheiro nosso.
 *
 * E a publicação é só dele: descarregar ou a folha de partilha do telemóvel. Não há aqui
 * caminho nenhum para as contas do Ricardo ou da marca — nem sequer desactivado.
 */

interface Marca {
  id: string
  nome: string
  arroba: string | null
  logo: string
  logo_url: string | null
  cor: string
  ativa: boolean
}

const LOGOS = [
  { id: 'nenhum', nome: 'Sem logótipo' },
  { id: 'mtm', nome: 'More Than Money' },
  { id: 'mtm_auto', nome: 'MTM Auto' },
  { id: 'mtm_funded', nome: 'MTM Funded' },
  { id: 'proprio', nome: 'O meu' },
] as const

const campo =
  'w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-[#D2A63C]/50'

export default function PainelSocial() {
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // ── a marca em edição ─────────────────────────────────────────────────────
  const [aEditarMarca, setAEditarMarca] = useState(false)
  const [nome, setNome] = useState('')
  const [arroba, setArroba] = useState('')
  const [cor, setCor] = useState('#D2A63C')
  const [logo, setLogo] = useState<string>('nenhum')
  const [logoUrl, setLogoUrl] = useState('')

  // ── a peça ────────────────────────────────────────────────────────────────
  const [tipo, setTipo] = useState<'cartao' | 'carrossel' | 'capa_reel'>('carrossel')
  const [tema, setTema] = useState('')
  const [cta, setCta] = useState('QUERO')
  const [fundo, setFundo] = useState('')
  const [destaque, setDestaque] = useState('')
  const [camada, setCamada] = useState<'fundo' | 'destaque'>('fundo')
  const [descricaoIA, setDescricaoIA] = useState('')

  const [aCriar, setACriar] = useState(false)
  const [aSubir, setASubir] = useState(false)
  const [porCima, setPorCima] = useState(false)
  const [urls, setUrls] = useState<string[]>([])
  const [caption, setCaption] = useState('')

  const activa = marcas.find((m) => m.ativa) ?? marcas[0] ?? null

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const r = await fetch('/api/mtmsocial/marcas', { cache: 'no-store', headers: await authHeaders() })
      const j = await r.json()
      setMarcas(j.marcas ?? [])
      if (!(j.marcas ?? []).length) setAEditarMarca(true)
    } catch {
      setErro('não consegui carregar as tuas marcas')
    }
    setACarregar(false)
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  const guardarMarca = async () => {
    setErro(null)
    if (nome.trim().length < 2) { setErro('Dá um nome à marca'); return }
    const r = await fetch('/api/mtmsocial/marcas', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ nome, arroba, cor, logo, logoUrl }),
    })
    const j = await r.json()
    if (j.ok) {
      setAEditarMarca(false)
      setNome(''); setArroba(''); setLogoUrl('')
      await carregar()
    } else setErro(j.erro ?? 'não consegui guardar')
  }

  const activar = async (id: string) => {
    await fetch('/api/mtmsocial/marcas', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ accao: 'activar', id }),
    })
    await carregar()
  }

  const apagar = async (id: string) => {
    await fetch('/api/mtmsocial/marcas', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ accao: 'apagar', id }),
    })
    await carregar()
  }

  /** Sobe uma imagem do dispositivo para a camada escolhida. */
  const subir = async (ficheiro: File, paraLogo = false) => {
    setASubir(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.append('ficheiro', ficheiro)
      const r = await fetch('/api/mtmsocial/media', { method: 'POST', body: fd, headers: await authHeaders() })
      const j = await r.json()
      if (j.ok) {
        if (paraLogo) { setLogoUrl(j.url); setLogo('proprio') }
        else if (camada === 'destaque') setDestaque(j.url)
        else setFundo(j.url)
      } else setErro(j.erro ?? 'a imagem não subiu')
    } catch {
      setErro('a imagem não subiu')
    }
    setASubir(false)
  }

  const gerarImagem = async () => {
    setASubir(true)
    setErro(null)
    try {
      const r = await fetch('/api/mtmsocial/media', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ descricao: descricaoIA, camada, formato: tipo === 'capa_reel' ? 'reel' : 'post' }),
      })
      const j = await r.json()
      if (j.ok) { camada === 'destaque' ? setDestaque(j.url) : setFundo(j.url) }
      else setErro(j.erro ?? 'a geração falhou')
    } catch {
      setErro('a geração falhou')
    }
    setASubir(false)
  }

  const criar = async () => {
    setACriar(true)
    setErro(null)
    setUrls([])
    try {
      const r = await fetch('/api/mtmsocial/criar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tipo, tema, cta, comIA: true,
          marcaId: activa?.id,
          fundo: fundo || undefined,
          destaque: destaque || undefined,
        }),
      })
      const j = await r.json()
      if (j.ok) { setUrls(j.urls ?? []); setCaption(j.caption ?? '') }
      else setErro(j.erro ?? 'não consegui criar')
    } catch {
      setErro('não consegui criar')
    }
    setACriar(false)
  }

  /**
   * DESCARREGAR. As imagens vivem noutra origem, e um `<a download>` para fora do domínio é
   * ignorado pelo browser — abre o separador em vez de guardar.
   */
  const descarregar = async (u: string, i: number) => {
    try {
      const b = await fetch(u).then((r) => r.blob())
      const obj = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = obj
      a.download = `${(activa?.arroba || 'mtm-social')}-${String(i + 1).padStart(2, '0')}.png`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(obj), 1000)
    } catch {
      setErro('não consegui descarregar')
    }
  }

  /**
   * A FOLHA DE PARTILHA do telemóvel — o caminho para o Instagram sem API.
   *
   * No computador não há folha nenhuma para abrir, por isso descarrega: mesmo resultado por
   * outro caminho, em vez de um botão que não faz nada.
   */
  const partilhar = async () => {
    if (!urls.length) return
    try {
      const ficheiros = await Promise.all(
        urls.map(async (u, i) => {
          const b = await fetch(u).then((r) => r.blob())
          return new File([b], `peca-${i + 1}.png`, { type: b.type || 'image/png' })
        }),
      )
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> }
      if (nav.share && nav.canShare?.({ files: ficheiros })) {
        await navigator.clipboard?.writeText(caption).catch(() => undefined)
        await nav.share({ files: ficheiros, text: caption })
        setAviso('partilhado — a legenda ficou copiada')
      } else {
        for (let i = 0; i < urls.length; i++) { await descarregar(urls[i], i); await new Promise((r) => setTimeout(r, 400)) }
        setAviso('o computador não tem folha de partilha — descarreguei em vez disso')
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setErro('não consegui partilhar')
    }
  }

  if (aCarregar) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#08080a]">
        <Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#08080a] text-white">
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-black">MTM Social</h1>
          <p className="mt-1 text-[13.5px] leading-snug text-white/55">
            Cartões, carrosséis e capas de reel com a <strong className="text-white">tua</strong> marca.
            Sai para o teu perfil, não para o nosso.
          </p>
        </div>

        {erro && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[13px] text-rose-300">{erro}</p>}
        {aviso && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[13px] text-emerald-300">{aviso}</p>}

        {/* ── as marcas ───────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold">A tua marca</p>
            {!aEditarMarca && (
              <button onClick={() => setAEditarMarca(true)} className="inline-flex items-center gap-1 text-[12.5px] text-[#D2A63C]">
                <Plus className="h-3.5 w-3.5" /> Nova
              </button>
            )}
          </div>

          {marcas.length > 0 && !aEditarMarca && (
            <div className="mt-3 space-y-1.5">
              {marcas.map((m) => (
                <div key={m.id} className={`flex items-center gap-2.5 rounded-lg border p-2.5 ${m.ativa ? 'border-[#D2A63C]/40 bg-[#D2A63C]/[0.06]' : 'border-white/10'}`}>
                  <span className="h-6 w-6 shrink-0 rounded-full" style={{ background: m.cor }} />
                  <button onClick={() => void activar(m.id)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-[14px] font-medium">{m.nome}</p>
                    {m.arroba && <p className="truncate text-[12px] text-white/45">@{m.arroba}</p>}
                  </button>
                  {m.ativa && <Check className="h-4 w-4 shrink-0 text-[#D2A63C]" />}
                  <button onClick={() => void apagar(m.id)} className="shrink-0 text-white/30 hover:text-rose-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {aEditarMarca && (
            <div className="mt-3 space-y-2.5">
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da marca" className={campo} />
              <input value={arroba} onChange={(e) => setArroba(e.target.value)} placeholder="@ do Instagram" className={campo} />
              <div className="flex items-center gap-2">
                <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-10 w-14 rounded border border-white/12 bg-transparent" />
                <select value={logo} onChange={(e) => setLogo(e.target.value)} className={`${campo} flex-1`}>
                  {LOGOS.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              {logo === 'proprio' && (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-3 text-[13px] text-white/60">
                  <Upload className="h-4 w-4" />
                  {logoUrl ? 'Trocar o logótipo' : 'Carregar o meu logótipo'}
                  <input type="file" accept="image/png,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f, true); e.target.value = '' }} />
                </label>
              )}
              <div className="flex gap-2">
                <button onClick={() => void guardarMarca()} className="flex-1 rounded-lg bg-[#D2A63C] py-2.5 text-[14px] font-bold text-black">Guardar</button>
                {marcas.length > 0 && (
                  <button onClick={() => setAEditarMarca(false)} className="rounded-lg border border-white/15 px-4 text-[14px] text-white/70">Cancelar</button>
                )}
              </div>
            </div>
          )}
        </section>

        {activa && !aEditarMarca && (
          <>
            {/* ── a peça ──────────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex gap-1 rounded-lg bg-black/40 p-1">
                {([['carrossel', 'Carrossel'], ['cartao', 'Cartão'], ['capa_reel', 'Capa de reel']] as const).map(([k, r]) => (
                  <button key={k} onClick={() => setTipo(k)}
                    className={`flex-1 rounded px-2 py-1.5 text-[12.5px] font-semibold ${tipo === k ? 'bg-[#D2A63C] text-black' : 'text-white/50'}`}>
                    {r}
                  </button>
                ))}
              </div>

              <input value={tema} onChange={(e) => setTema(e.target.value)}
                placeholder="Sobre o que é? (vazio = escolho eu)" className={`${campo} mt-3`} />
              <input value={cta} onChange={(e) => setCta(e.target.value.toUpperCase())}
                placeholder="Palavra do comentário" className={`${campo} mt-2`} />

              {/* ── imagens ─────────────────────────────────────────────── */}
              <div className="mt-3 rounded-lg border border-white/10 p-3">
                <div className="flex gap-1 rounded-md bg-black/40 p-1">
                  {([['fundo', 'Fundo'], ['destaque', 'Destaque']] as const).map(([k, r]) => (
                    <button key={k} onClick={() => setCamada(k)}
                      className={`flex-1 rounded px-2 py-1 text-[12px] font-semibold ${camada === k ? 'bg-white/15 text-white' : 'text-white/45'}`}>
                      {r}{(k === 'fundo' ? fundo : destaque) && <span className="ml-1 opacity-60">•</span>}
                    </button>
                  ))}
                </div>

                <div
                  onDragOver={(e) => { e.preventDefault(); setPorCima(true) }}
                  onDragLeave={() => setPorCima(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setPorCima(false)
                    const f = e.dataTransfer.files?.[0]
                    if (f?.type.startsWith('image/')) void subir(f)
                  }}
                  className={`mt-2 rounded-lg border border-dashed p-4 text-center transition ${porCima ? 'border-[#D2A63C] bg-[#D2A63C]/10' : 'border-white/15'}`}
                >
                  <label className="cursor-pointer text-[12.5px] text-white/55">
                    {aSubir ? 'A subir…' : 'Arrasta uma imagem, ou toca para escolher'}
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = '' }} />
                  </label>
                  {(camada === 'fundo' ? fundo : destaque) && (
                    <button onClick={() => (camada === 'fundo' ? setFundo('') : setDestaque(''))}
                      className="mt-1.5 block w-full text-[11.5px] text-white/40 hover:text-rose-400">
                      remover esta
                    </button>
                  )}
                </div>

                <div className="mt-2 flex gap-2">
                  <input value={descricaoIA} onChange={(e) => setDescricaoIA(e.target.value)}
                    placeholder="ou descreve e eu gero" className={`${campo} flex-1 text-[13px]`} />
                  <button onClick={() => void gerarImagem()} disabled={aSubir || descricaoIA.trim().length < 6}
                    className="shrink-0 rounded-lg border border-white/15 px-3 text-[12.5px] font-semibold text-white/80 disabled:opacity-40">
                    {aSubir ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-white/35">
                  A geração é gratuita e partilhada — às vezes demora. Para o destaque, usa um PNG
                  com fundo transparente.
                </p>
              </div>

              <button onClick={() => void criar()} disabled={aCriar}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D2A63C] py-3 text-[15px] font-bold text-black disabled:opacity-40">
                {aCriar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {aCriar ? 'A criar…' : 'Criar com IA'}
              </button>
            </section>

            {/* ── o resultado ─────────────────────────────────────────────── */}
            {urls.length > 0 && (
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[13px] font-semibold">{urls.length} {urls.length === 1 ? 'imagem' : 'imagens'}</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {urls.map((u, i) => (
                    <button key={u} onClick={() => void descarregar(u, i)} className="overflow-hidden rounded border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="w-full" />
                    </button>
                  ))}
                </div>

                {caption && (
                  <textarea rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} className={`${campo} mt-3 text-[13px]`} />
                )}

                <div className="mt-3 flex gap-2">
                  <button onClick={() => void partilhar()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#D2A63C] py-2.5 text-[14px] font-bold text-black">
                    <Share2 className="h-4 w-4" /> Partilhar
                  </button>
                  <button onClick={async () => { for (let i = 0; i < urls.length; i++) { await descarregar(urls[i], i); await new Promise((r) => setTimeout(r, 400)) } }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2.5 text-[14px] font-semibold text-white/80">
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}

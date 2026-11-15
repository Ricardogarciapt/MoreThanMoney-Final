'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, Download, Film, Loader2, Magnet, RefreshCw, Upload, Video, Wand2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'
import { PLANOS } from '@/lib/conteudo-magnetico/guiao'

/**
 * O separador «Criar» do Estúdio (antigo /conteudomagnetico, fundido a 10/11).
 *
 * Três passos à vista, de cima para baixo: (1) marca e formato, (2) a estratégia (nicho,
 * objectivo, tom, notas), (3) o resultado — lâminas editáveis com pré-visualização, legenda e,
 * nos reels, os segmentos e a fila do vídeo. Os avisos das regras ficam em vermelho no topo do
 * resultado e o vídeo não entra na fila enquanto existirem.
 */

type Formato = 'carrossel' | 'post' | 'story' | 'reel'
type IdMarca = 'ricardo-garcia' | 'morethanmoney' | 'propria'
type Lamina = { papel: 'capa' | 'meio' | 'fim'; antetitulo: string; titulo: string; destaque: string; corpo: string }
type Segmento = {
  id: number
  fala: string
  texto_ecra: string
  visual: 'cartao' | 'apresentador' | 'b_roll'
  zoom: string
  b_roll_busca: string | null
  sfx: string
  legenda_estilo: string
  efeito?: 'normal' | 'pb' | 'cor'
  plano?: string | null
  /** clip próprio: undefined/null = automático, -1 = nenhum, n = índice em «clips» */
  clip?: number | null
}
type Clip = { id: string; nome: string; url: string | null }
type Guiao = {
  formato: Formato
  marca: IdMarca
  nicho: string
  objectivo: string
  tom: string
  palavra_chave: string
  legenda: string
  hashtags: string[]
  laminas: Lamina[]
  reel: { duracao_estimada_segundos: number; musica_termo: string; musica_volume_db: number; segmentos: Segmento[] } | null
}
type Aviso = { tipo: string; trecho: string }
type Render = { id: string; estado: string; video_url: string | null; erro: string | null; criado_em: string }

const NOMES_MARCA: Record<IdMarca, { nome: string; arroba: string; cor: string }> = {
  'ricardo-garcia': { nome: 'Ricardo Garcia', arroba: '@ricardogarciapt', cor: '#0097b2' },
  morethanmoney: { nome: 'More Than Money', arroba: '@morethanmoney.pt', cor: '#D2A63C' },
  propria: { nome: 'A tua marca', arroba: 'o teu @', cor: '#D2A63C' },
}
const FORMATOS: { id: Formato; nome: string; medida: string }[] = [
  { id: 'carrossel', nome: 'Carrossel', medida: '4:5' },
  { id: 'post', nome: 'Publicação', medida: '4:5' },
  { id: 'story', nome: 'Story', medida: '9:16' },
  { id: 'reel', nome: 'Reel', medida: '9:16' },
]
const OBJECTIVOS = [
  { id: 'atracao', nome: 'Atração (alcance)' },
  { id: 'autoridade', nome: 'Autoridade (retenção)' },
  { id: 'conversao', nome: 'Conversão (venda)' },
]
const TONS = [
  { id: 'disruptivo', nome: 'Disruptivo e ousado' },
  { id: 'educativo', nome: 'Educativo e próximo' },
  { id: 'autoridade', nome: 'Sofisticado e autoritário' },
  { id: 'directo', nome: 'Directo' },
]
const VISUAIS = [
  { id: 'cartao', nome: 'Cartão da marca' },
  { id: 'apresentador', nome: 'Foto (apresentador)' },
  { id: 'b_roll', nome: 'Vídeo de apoio' },
]

const campo =
  'w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-[#D2A63C]/60'
const rotulo = 'mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-white/50'
const botaoOuro =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[#D2A63C] px-4 py-2.5 text-[15px] font-bold text-black transition hover:bg-[#E9C46A] disabled:cursor-not-allowed disabled:opacity-50'
const botaoLinha =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-[14px] font-semibold text-white/85 transition hover:border-[#D2A63C]/60 hover:text-white disabled:opacity-40'

const TEXTO_AVISO: Record<string, string> = {
  nome_proibido: 'Nome que não se cita',
  taxa_acerto: 'Taxa de acerto / percentagem de resultado',
  promessa: 'Promessa de ganhos',
}

export default function PainelConteudoMagnetico({ onGravar }: { onGravar?: (pecaId: string) => void } = {}) {
  const [marcas, setMarcas] = useState<IdMarca[]>(['propria'])
  const [marca, setMarca] = useState<IdMarca>('propria')
  const [propria, setPropria] = useState({ nome: '', arroba: '', cor: '#D2A63C' })
  const [formato, setFormato] = useState<Formato>('carrossel')
  const [nicho, setNicho] = useState('')
  const [objectivo, setObjectivo] = useState('atracao')
  const [tom, setTom] = useState('disruptivo')
  const [notas, setNotas] = useState('')
  const [quantas, setQuantas] = useState(6)
  const [fundo, setFundo] = useState('')
  const [clips, setClips] = useState<Clip[]>([])
  const [aSubirClip, setASubirClip] = useState(false)
  const [ativosVideo, setAtivosVideo] = useState<Clip[] | null>(null)

  const [aGerar, setAGerar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [guiao, setGuiao] = useState<Guiao | null>(null)
  const [pecaId, setPecaId] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [fornecedor, setFornecedor] = useState<string | null>(null)
  const [previas, setPrevias] = useState<(string | null)[]>([])
  const [aDesenhar, setADesenhar] = useState(false)
  const [aSubir, setASubir] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [renders, setRenders] = useState<Render[]>([])
  const [aEnfileirar, setAEnfileirar] = useState(false)
  const previasRef = useRef<(string | null)[]>([])

  // ── arranque: que marcas posso usar ─────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/conteudo-magnetico/guiao', { cache: 'no-store', headers: await authHeaders() })
        // Sem sessão → login, e volta aqui depois. (Com sessão mas sem perfil, o middleware já
        // mandou para o registo antes de a página abrir.)
        if (r.status === 401) {
          window.location.href = `/login?redirect=${encodeURIComponent('/estudio?tab=criar')}`
          return
        }
        const j = await r.json()
        if (j.ok && Array.isArray(j.marcas)) {
          setMarcas(j.marcas)
          setMarca(j.marcas.includes('ricardo-garcia') ? 'ricardo-garcia' : j.marcas[0])
        }
      } catch {
        /* sem sessão: o middleware já trata; fica a marca própria */
      }
    })()
  }, [])

  const cancelarRender = useCallback(async (id: string, pronto = false) => {
    if (!window.confirm(pronto ? 'Apagar este vídeo de vez?' : 'Tirar este vídeo da fila?')) return
    const r = await fetch(`/api/conteudo-magnetico/render?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    }).catch(() => null)
    if (r?.ok) setRenders((lista) => lista.filter((x) => x.id !== id))
  }, [])

  const carregarRenders = useCallback(async () => {
    try {
      const r = await fetch('/api/conteudo-magnetico/render', { cache: 'no-store', headers: await authHeaders() })
      const j = await r.json()
      if (j.ok) setRenders(j.renders)
    } catch {
      /* silencioso: é só a lista */
    }
  }, [])
  useEffect(() => {
    carregarRenders()
  }, [carregarRenders])
  // Enquanto houver vídeos na fila, pergunta de 10 em 10 s.
  useEffect(() => {
    if (!renders.some((r) => r.estado === 'na_fila' || r.estado === 'a_render')) return
    const t = setInterval(carregarRenders, 10_000)
    return () => clearInterval(t)
  }, [renders, carregarRenders])

  // ── desenhar as pré-visualizações ───────────────────────────────────────────
  const desenhar = useCallback(
    async (g: Guiao, so?: number) => {
      setADesenhar(true)
      const fmt = g.formato === 'reel' ? 'reel' : g.formato
      const total = g.laminas.length
      const novas = [...previasRef.current]
      const indices = so === undefined ? g.laminas.map((_, i) => i) : [so]
      try {
        const cab = { ...(await authHeaders()), 'content-type': 'application/json' }
        for (const i of indices) {
          const r = await fetch('/api/conteudo-magnetico/imagem', {
            method: 'POST',
            headers: cab,
            body: JSON.stringify({
              formato: fmt,
              marca: g.marca,
              propria,
              lamina: g.laminas[i],
              indice: i,
              total,
              fundo_url: i === 0 && fundo ? fundo : null,
              palavra_chave: g.palavra_chave,
            }),
          })
          if (!r.ok) {
            novas[i] = null
            continue
          }
          if (novas[i]) URL.revokeObjectURL(novas[i] as string)
          novas[i] = URL.createObjectURL(await r.blob())
        }
        novas.length = total
        previasRef.current = novas
        setPrevias([...novas])
      } finally {
        setADesenhar(false)
      }
    },
    [fundo, propria],
  )

  async function gerar() {
    if (!nicho.trim()) {
      setErro('Escreve o nicho ou o tema.')
      return
    }
    setAGerar(true)
    setErro(null)
    try {
      const r = await fetch('/api/conteudo-magnetico/guiao', {
        method: 'POST',
        headers: { ...(await authHeaders()), 'content-type': 'application/json' },
        body: JSON.stringify({ formato, marca, propria, nicho, objectivo, tom, notas, quantas }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.erro || 'Não foi possível gerar.')
      setGuiao(j.guiao)
      setPecaId(j.id)
      setAvisos(j.avisos || [])
      setFornecedor(j.fornecedor ? `${j.fornecedor} · ${j.modelo}` : null)
      previasRef.current = []
      setPrevias([])
      await desenhar(j.guiao)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro.')
    } finally {
      setAGerar(false)
    }
  }

  /** Guarda as edições e volta a passar o texto pelas regras. */
  async function guardar(g: Guiao = guiao as Guiao) {
    const r = await fetch('/api/conteudo-magnetico/guiao', {
      method: 'PUT',
      headers: { ...(await authHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify({ id: pecaId, guiao: g, fundo_url: fundo || null }),
    })
    const j = await r.json()
    if (j.ok) {
      setGuiao(j.guiao)
      setAvisos(j.avisos || [])
      await desenhar(j.guiao)
    }
  }

  function mudarLamina(i: number, campoL: keyof Lamina, valor: string) {
    if (!guiao) return
    const laminas = guiao.laminas.map((l, k) =>
      k === i ? { ...l, [campoL]: campoL === 'titulo' || campoL === 'destaque' ? valor.toUpperCase() : valor } : l,
    )
    setGuiao({ ...guiao, laminas })
  }
  function mudarSegmento(i: number, patch: Partial<Segmento>) {
    if (!guiao?.reel) return
    const segmentos = guiao.reel.segmentos.map((s, k) => (k === i ? { ...s, ...patch } : s))
    setGuiao({ ...guiao, reel: { ...guiao.reel, segmentos } })
  }

  async function subirFoto(f: File) {
    setASubir(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.append('ficheiro', f)
      const r = await fetch('/api/mtmsocial/media', { method: 'POST', body: fd, headers: await authHeaders() })
      const j = await r.json()
      if (!j.ok) throw new Error(j.erro || 'Falhou o envio.')
      setFundo(j.url)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falhou o envio.')
    } finally {
      setASubir(false)
    }
  }

  /** Sobe um vídeo directo para o Storage (nunca passa pela Vercel) e guarda-o nos Ativos. */
  async function subirClips(ficheiros: FileList) {
    setASubirClip(true)
    setErro(null)
    try {
      for (const f of Array.from(ficheiros)) {
        const cab = { ...(await authHeaders()), 'content-type': 'application/json' }
        const mime = f.type || (/\.mov$/i.test(f.name) ? 'video/quicktime' : 'video/mp4')
        const r = await fetch('/api/estudio/ativo', { method: 'POST', headers: cab, body: JSON.stringify({ nome: f.name, mime, tamanho: f.size, peca_id: pecaId }) })
        const j = await r.json()
        if (!r.ok || !j.ok) throw new Error(j.erro || `Não consegui preparar o envio de ${f.name}.`)
        const up = await fetch(j.upload_url, { method: 'PUT', headers: { 'content-type': mime }, body: f })
        if (!up.ok) throw new Error(`Falhou o envio de ${f.name}.`)
        await fetch('/api/estudio/ativo', { method: 'PATCH', headers: cab, body: JSON.stringify({ id: j.id, estado: 'pronto' }) })
        setClips((c) => [...c, { id: j.id, nome: f.name, url: null }])
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falhou o envio.')
    } finally {
      setASubirClip(false)
    }
  }

  async function verAtivosVideo() {
    const r = await fetch('/api/estudio/ativo', { cache: 'no-store', headers: await authHeaders() })
    const j = await r.json().catch(() => ({}))
    setAtivosVideo(
      (j.ativos || [])
        .filter((a: { tipo: string }) => a.tipo === 'video')
        .map((a: { id: string; nome: string; url: string | null }) => ({ id: a.id, nome: a.nome, url: a.url })),
    )
  }

  async function pedirVideo() {
    if (!guiao) return
    setAEnfileirar(true)
    setErro(null)
    try {
      const r = await fetch('/api/conteudo-magnetico/render', {
        method: 'POST',
        headers: { ...(await authHeaders()), 'content-type': 'application/json' },
        body: JSON.stringify({ guiao, peca_id: pecaId, fundo_url: fundo || null, propria, clips: clips.map((c) => c.id) }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        if (j.avisos) setAvisos(j.avisos)
        throw new Error(j.erro || 'Não entrou na fila.')
      }
      await carregarRenders()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro.')
    } finally {
      setAEnfileirar(false)
    }
  }

  const textoLegenda = guiao ? `${guiao.legenda}\n\n${guiao.hashtags.join(' ')}`.trim() : ''
  const corMarca = marca === 'propria' ? propria.cor : NOMES_MARCA[marca].cor
  const ehAlto = guiao?.formato === 'story' || guiao?.formato === 'reel'

  return (
    <div className="min-h-screen bg-[#07080b] pb-24 pt-6 text-white">
      <div className="mx-auto max-w-6xl px-4">
        {/* Cabeçalho */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D2A63C]/40 bg-[#D2A63C]/10">
            <Magnet className="h-6 w-6 text-[#D2A63C]" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">MTM Conteúdo Magnético</h1>
            <p className="text-sm text-white/55">Guião, peças e reel a partir de uma estratégia. IA grátis, regras da casa verificadas.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* ── Coluna da estratégia ── */}
          <section className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div>
              <span className={rotulo}>Marca</span>
              <div className="grid gap-2">
                {marcas.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMarca(m)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                      marca === m ? 'border-[#D2A63C] bg-[#D2A63C]/10' : 'border-white/10 hover:border-white/25'
                    }`}
                  >
                    <span>
                      <span className="block text-[15px] font-bold">{NOMES_MARCA[m].nome}</span>
                      <span className="block text-xs text-white/50">{NOMES_MARCA[m].arroba}</span>
                    </span>
                    <span className="h-5 w-5 rounded-full border border-white/20" style={{ background: m === 'propria' ? propria.cor : NOMES_MARCA[m].cor }} />
                  </button>
                ))}
              </div>
              {marca === 'propria' && (
                <div className="mt-3 grid grid-cols-[1fr_1fr_44px] gap-2">
                  <input className={campo} placeholder="Nome" value={propria.nome} onChange={(e) => setPropria({ ...propria, nome: e.target.value })} />
                  <input className={campo} placeholder="@arroba" value={propria.arroba} onChange={(e) => setPropria({ ...propria, arroba: e.target.value })} />
                  <input
                    type="color"
                    aria-label="Cor da marca"
                    className="h-[46px] w-11 cursor-pointer rounded-lg border border-white/12 bg-transparent"
                    value={propria.cor}
                    onChange={(e) => setPropria({ ...propria, cor: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div>
              <span className={rotulo}>Formato</span>
              <div className="grid grid-cols-4 gap-2">
                {FORMATOS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormato(f.id)}
                    className={`rounded-lg border px-2 py-2 text-center transition ${
                      formato === f.id ? 'border-[#D2A63C] bg-[#D2A63C]/10' : 'border-white/10 hover:border-white/25'
                    }`}
                  >
                    <span className="block text-[13px] font-bold">{f.nome}</span>
                    <span className="block text-[11px] text-white/45">{f.medida}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className={rotulo}>Nicho / tema</span>
              <input className={campo} value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="Ex.: militares que querem um plano B, gestão de risco no ouro" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={rotulo}>Objectivo</span>
                <select className={campo} value={objectivo} onChange={(e) => setObjectivo(e.target.value)}>
                  {OBJECTIVOS.map((o) => (
                    <option key={o.id} value={o.id}>{o.nome}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={rotulo}>Tom</span>
                <select className={campo} value={tom} onChange={(e) => setTom(e.target.value)}>
                  {TONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.nome}</option>
                  ))}
                </select>
              </label>
            </div>

            {formato === 'carrossel' && (
              <label className="block">
                <span className={rotulo}>Lâminas: {quantas}</span>
                <input type="range" min={3} max={10} value={quantas} onChange={(e) => setQuantas(Number(e.target.value))} className="w-full accent-[#D2A63C]" />
              </label>
            )}

            <label className="block">
              <span className={rotulo}>Notas (história, dados reais)</span>
              <textarea
                className={`${campo} min-h-[88px]`}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Só números que tenhas e possas provar. Sem notas, a IA não usa números."
              />
            </label>

            <div>
              <span className={rotulo}>Fotografia da capa (opcional)</span>
              <div className="flex gap-2">
                <input className={campo} value={fundo} onChange={(e) => setFundo(e.target.value)} placeholder="https://… ou carrega" />
                <label className={`${botaoLinha} shrink-0 cursor-pointer`}>
                  {aSubir ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && subirFoto(e.target.files[0])} />
                </label>
              </div>
            </div>

            <div>
              <span className={rotulo}>Os teus vídeos (opcional)</span>
              <div className="flex gap-2">
                <label className={`${botaoLinha} flex-1 cursor-pointer`}>
                  {aSubirClip ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {aSubirClip ? 'A enviar…' : 'Carregar vídeos'}
                  <input type="file" multiple accept="video/mp4,video/quicktime,video/webm,.mov" className="hidden" disabled={aSubirClip} onChange={(e) => e.target.files?.length && subirClips(e.target.files)} />
                </label>
                <button type="button" className={`${botaoLinha} shrink-0`} onClick={verAtivosVideo}>
                  Dos Ativos
                </button>
              </div>
              {ativosVideo && (
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2 text-sm">
                  {ativosVideo.length === 0 && <p className="text-white/45">Ainda não tens vídeos nos Ativos.</p>}
                  {ativosVideo.map((a) => {
                    const tem = clips.some((c) => c.id === a.id)
                    return (
                      <label key={a.id} className="flex cursor-pointer items-center gap-2">
                        <input type="checkbox" checked={tem} onChange={() => setClips((c) => (tem ? c.filter((x) => x.id !== a.id) : [...c, a]))} className="accent-[#D2A63C]" />
                        <span className="truncate">{a.nome}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              {clips.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {clips.map((c, i) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-2 py-1">
                      <span className="truncate"><span className="font-mono text-[#D2A63C]">V{i + 1}</span> {c.nome}</span>
                      <button type="button" onClick={() => setClips((x) => x.filter((y) => y.id !== c.id))} className="text-xs text-white/45 hover:text-red-300">tirar</button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-white/40">
                No reel, os teus clips entram nos segmentos de apresentador e de imagens de apoio, em vertical e sem o som do clip. Escolhes o clip de cada segmento em baixo.
              </p>
            </div>

            <button type="button" onClick={gerar} disabled={aGerar} className={`${botaoOuro} w-full`}>
              {aGerar ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
              {aGerar ? 'A escrever o guião…' : 'Gerar conteúdo magnético'}
            </button>
            {erro && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{erro}</p>}
          </section>

          {/* ── Coluna do resultado ── */}
          <section className="min-w-0 space-y-5">
            {!guiao && (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 p-8 text-center text-white/45">
                <Magnet className="mb-3 h-10 w-10" style={{ color: corMarca }} />
                <p className="max-w-sm text-sm">
                  Escolhe a marca e o formato, diz o tema e o objectivo. Sai um guião com gancho, lâminas desenhadas na marca, legenda e, nos reels, o vídeo.
                </p>
              </div>
            )}

            {guiao && (
              <>
                {avisos.length > 0 && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                    <div className="mb-1 flex items-center gap-2 font-bold">
                      <AlertTriangle className="h-4 w-4" /> O texto falha as regras da casa. Corrige antes de publicar:
                    </div>
                    <ul className="list-disc pl-5">
                      {avisos.map((a, i) => (
                        <li key={i}>
                          {TEXTO_AVISO[a.tipo] ?? a.tipo}: «{a.trecho}»
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-white/55">
                    Palavra-chave: <b className="text-[#E9C46A]">{guiao.palavra_chave}</b>
                    {fornecedor && <span className="ml-3 text-white/35">IA: {fornecedor}</span>}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className={botaoLinha} onClick={() => guardar()} disabled={aDesenhar}>
                      {aDesenhar ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Aplicar edições
                    </button>
                  </div>
                </div>

                {/* Lâminas */}
                <div className="flex snap-x gap-4 overflow-x-auto pb-2">
                  {guiao.laminas.map((l, i) => (
                    <div key={i} className="w-[280px] shrink-0 snap-start space-y-2">
                      <div
                        className="relative overflow-hidden rounded-xl border border-white/10 bg-black/50"
                        style={{ aspectRatio: ehAlto ? '9 / 16' : '4 / 5' }}
                      >
                        {previas[i] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previas[i] as string} alt={l.titulo} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
                          </div>
                        )}
                      </div>
                      <input className={`${campo} text-sm font-bold`} value={l.titulo} onChange={(e) => mudarLamina(i, 'titulo', e.target.value)} />
                      <input className={`${campo} text-sm`} placeholder="Palavra em destaque" value={l.destaque} onChange={(e) => mudarLamina(i, 'destaque', e.target.value)} />
                      <textarea className={`${campo} min-h-[70px] text-sm`} value={l.corpo} onChange={(e) => mudarLamina(i, 'corpo', e.target.value)} />
                      {previas[i] && (
                        <a href={previas[i] as string} download={`conteudo-magnetico-${i + 1}.png`} className={`${botaoLinha} w-full`}>
                          <Download className="h-4 w-4" /> PNG {i + 1}
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                {/* Legenda */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className={rotulo}>Legenda</span>
                    <button
                      type="button"
                      className={botaoLinha}
                      onClick={async () => {
                        await navigator.clipboard.writeText(textoLegenda)
                        setCopiado(true)
                        setTimeout(() => setCopiado(false), 1500)
                      }}
                    >
                      {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copiar
                    </button>
                  </div>
                  <textarea
                    className={`${campo} min-h-[160px] text-sm`}
                    value={guiao.legenda}
                    onChange={(e) => setGuiao({ ...guiao, legenda: e.target.value })}
                  />
                  <p className="mt-2 text-sm text-[#E9C46A]/80">{guiao.hashtags.join(' ')}</p>
                </div>

                {/* Reel */}
                {guiao.reel && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className={rotulo}>
                        Segmentos do reel · ~{guiao.reel.duracao_estimada_segundos}s · música «{guiao.reel.musica_termo}»
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {/* Gravar eu próprio no teleprompter (marcas da casa) ou gerar o vídeo no motor. */}
                        {onGravar && pecaId && marca !== 'propria' && (
                          <button type="button" className={botaoOuro} onClick={() => onGravar(pecaId)} disabled={avisos.length > 0}>
                            <Video className="h-4 w-4" /> Gravar no teleprompter
                          </button>
                        )}
                        <button type="button" className={botaoOuro} onClick={pedirVideo} disabled={aEnfileirar || avisos.length > 0}>
                          {aEnfileirar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />} Gerar vídeo
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {guiao.reel.segmentos.map((s, i) => (
                        <div key={s.id} className="grid gap-2 rounded-xl border border-white/8 bg-black/30 p-3 md:grid-cols-[28px_1fr_200px]">
                          <span className="font-mono text-sm text-[#D2A63C]">{s.id}</span>
                          <div className="space-y-2">
                            <textarea className={`${campo} min-h-[56px] text-sm`} value={s.fala} onChange={(e) => mudarSegmento(i, { fala: e.target.value })} />
                            <input className={`${campo} text-sm font-bold`} value={s.texto_ecra} onChange={(e) => mudarSegmento(i, { texto_ecra: e.target.value.toUpperCase() })} />
                          </div>
                          <div className="space-y-2">
                            <select
                              className={`${campo} text-sm`}
                              value={s.visual}
                              onChange={(e) => mudarSegmento(i, { visual: e.target.value as Segmento['visual'] })}
                            >
                              {VISUAIS.map((v) => (
                                <option key={v.id} value={v.id}>{v.nome}</option>
                              ))}
                            </select>
                            <select
                              className={`${campo} text-sm`}
                              value={s.plano ?? ''}
                              onChange={(e) => mudarSegmento(i, { plano: e.target.value || null })}
                              aria-label="Plano de câmara"
                              title={s.plano && s.plano in PLANOS ? PLANOS[s.plano as keyof typeof PLANOS].dica : 'Plano de câmara sugerido'}
                            >
                              <option value="">Plano: sem sugestão</option>
                              {Object.entries(PLANOS).map(([id, p]) => (
                                <option key={id} value={id}>{p.nome}</option>
                              ))}
                            </select>
                            {clips.length > 0 && (
                              <select
                                className={`${campo} text-sm`}
                                value={s.clip == null ? '' : String(s.clip)}
                                onChange={(e) => mudarSegmento(i, { clip: e.target.value === '' ? null : Number(e.target.value) })}
                                aria-label="Clip teu neste segmento"
                              >
                                <option value="">Clip: automático</option>
                                <option value="-1">Sem clip meu</option>
                                {clips.map((c, k) => (
                                  <option key={c.id} value={k}>V{k + 1} · {c.nome.slice(0, 24)}</option>
                                ))}
                              </select>
                            )}
                            <select
                              className={`${campo} text-sm`}
                              value={s.efeito ?? 'normal'}
                              onChange={(e) => mudarSegmento(i, { efeito: e.target.value as Segmento['efeito'] })}
                              aria-label="Efeito de cor"
                            >
                              <option value="normal">Cor: automático</option>
                              <option value="pb">Preto e branco (erro, passado)</option>
                              <option value="cor">Sempre a cores (solução)</option>
                            </select>
                            {s.visual === 'b_roll' && (
                              <input
                                className={`${campo} text-sm`}
                                placeholder="busca em inglês"
                                value={s.b_roll_busca ?? ''}
                                onChange={(e) => mudarSegmento(i, { b_roll_busca: e.target.value })}
                              />
                            )}
                            <p className="text-xs text-white/40">
                              som: {s.sfx} · legenda: {s.legenda_estilo}
                              {s.visual === 'cartao' && s.texto_ecra.trim().split(/\s+/).filter(Boolean).length <= 2 ? ' · cartão em ecrã inteiro' : s.texto_ecra.trim() ? ' · título por cima do plano' : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-white/40">
                      O vídeo é montado fora do site (máquina da casa), com voz sintética PT-PT, legendas palavra a palavra, efeitos nos cortes e música com
                      ducking. Demora uns minutos; esta lista actualiza sozinha.
                    </p>
                  </div>
                )}
              </>
            )}

            {renders.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span className={rotulo}>Os teus vídeos</span>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {renders.map((r) => (
                    <div key={r.id} className="rounded-xl border border-white/8 bg-black/30 p-3 text-sm">
                      {r.estado === 'pronto' && r.video_url ? (
                        <>
                          <video src={r.video_url} controls playsInline className="mb-2 aspect-[9/16] w-full rounded-lg bg-black" />
                          <a href={r.video_url} download className={`${botaoLinha} w-full`}>
                            <Download className="h-4 w-4" /> MP4
                          </a>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-white/60">
                          {r.estado === 'erro' ? <AlertTriangle className="h-4 w-4 text-red-400" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                          {r.estado === 'na_fila' ? 'Na fila' : r.estado === 'a_render' ? 'A montar o vídeo…' : `Falhou: ${r.erro ?? ''}`}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-white/35">{new Date(r.criado_em).toLocaleString('pt-PT')}</p>
                        {(r.estado === 'na_fila' || r.estado === 'erro' || r.estado === 'pronto') && (
                          <button
                            type="button"
                            onClick={() => cancelarRender(r.id, r.estado === 'pronto')}
                            className="text-xs text-white/45 underline-offset-2 hover:text-red-300 hover:underline"
                          >
                            {r.estado === 'na_fila' ? 'Tirar da fila' : 'Apagar'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

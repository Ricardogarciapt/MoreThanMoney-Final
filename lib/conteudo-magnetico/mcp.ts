/**
 * O MTM Conteúdo Magnético como ferramentas MCP (servidas por /api/mcp, ao lado das outras).
 *
 * A ideia é o Claude (ou o AIOS) conduzir o gerador inteiro e ligá-lo a OUTROS servidores MCP de
 * imagem e vídeo — ArtCraft, Higgsfield, Canva, o Studify no Mac — sem nós termos de integrar
 * cada um:
 *
 *   1. conteudo_criar_guiao  → guião com um `prompt_visual` em inglês por lâmina e por segmento
 *   2. o cliente leva esses prompts ao MCP de imagem/vídeo que quiser e recebe um URL
 *   3. conteudo_meter_media  → copia esse URL para o nosso Storage e prende-o à lâmina/segmento
 *   4. conteudo_desenhar     → PNGs das lâminas (carrossel/post/story) com a marca por cima
 *   5. conteudo_pedir_video  → põe o reel na fila do motor (VPS/Mac), que usa a media gerada
 *
 * Fica dentro da regra de `lib/mcp/ferramentas`: nada aqui publica. Tudo é rascunho ou fila,
 * e publicar continua a ser um gesto humano.
 *
 * Dono das peças: o MCP não tem sessão. As peças ficam em nome de `MCP_CONTEUDO_USER_ID` ou,
 * sem ela, do primeiro admin activo — aparecem-lhe em /estudio (separador Criar) como as outras.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { Ferramenta } from '@/lib/mcp/ferramentas'
import { gerarGuiao } from './gerar'
import { FORMATOS, resolverMarca, MARCAS, type Formato, type IdMarca } from './marcas'
import { OBJECTIVOS, TONS, normalizarGuiao, type Guiao, type Objectivo, type Tom } from './guiao'
import { verificarObjecto } from './regras'
import { fundoComoDataUri, publicoComoDataUri, renderPeca } from './desenho'

const BUCKET = 'uploads'

async function dono(): Promise<string> {
  const env = process.env.MCP_CONTEUDO_USER_ID?.trim()
  if (env) return env
  const { data } = await getSupabaseAdmin()
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!data?.id) throw new Error('Sem dono para as peças: define MCP_CONTEUDO_USER_ID.')
  return data.id as string
}

async function lerPeca(id: unknown) {
  const s = String(id || '')
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new Error('id da peça inválido')
  const { data } = await getSupabaseAdmin()
    .from('conteudo_magnetico_pecas')
    .select('id, user_id, formato, marca, guiao, fundo_url, criado_em')
    .eq('id', s)
    .maybeSingle()
  if (!data) throw new Error('Peça não encontrada')
  return data as { id: string; user_id: string; formato: Formato; marca: IdMarca; guiao: Guiao; fundo_url: string | null }
}

function renormalizar(g: Guiao): Guiao {
  return normalizarGuiao(g, { formato: g.formato, marca: g.marca, nicho: g.nicho, objectivo: g.objectivo, tom: g.tom })
}

/** Os prompts visuais de um guião, prontos a levar a um MCP de imagem/vídeo. */
function promptsDe(g: Guiao) {
  const proporcao = g.formato === 'carrossel' || g.formato === 'post' ? '4:5' : '9:16'
  return {
    laminas: g.laminas.map((l, i) => ({ indice: i, proporcao, tipo: 'imagem', prompt: l.prompt_visual || '' })),
    segmentos: (g.reel?.segmentos ?? []).map((s, i) => ({
      indice: i,
      proporcao: '9:16',
      tipo: s.visual === 'cartao' ? 'imagem' : 'video',
      prompt: s.prompt_visual || s.b_roll_busca || '',
    })),
  }
}

/** Um endereço público https que não aponta para dentro da nossa rede. */
function urlExterno(v: unknown): URL {
  let u: URL
  try {
    u = new URL(String(v || ''))
  } catch {
    throw new Error('URL inválido')
  }
  if (u.protocol !== 'https:') throw new Error('Só https')
  const h = u.hostname
  if (h === 'localhost' || /^[\d.]+$/.test(h) || h.includes(':') || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new Error('Endereço não permitido')
  }
  return u
}

const TIPOS: Record<string, { ext: string; video: boolean }> = {
  'image/png': { ext: 'png', video: false },
  'image/jpeg': { ext: 'jpg', video: false },
  'image/webp': { ext: 'webp', video: false },
  'video/mp4': { ext: 'mp4', video: true },
  'video/quicktime': { ext: 'mov', video: true },
  'video/webm': { ext: 'webm', video: true },
}

/** Copia media de fora (o resultado de outro MCP) para o nosso Storage e devolve o URL público. */
async function copiarParaCasa(url: unknown, pecaId: string): Promise<{ url: string; video: boolean }> {
  const u = urlExterno(url)
  const r = await fetch(u, { signal: AbortSignal.timeout(40_000), redirect: 'follow' })
  if (!r.ok) throw new Error(`download HTTP ${r.status}`)
  const tipo = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  const t = TIPOS[tipo]
  if (!t) throw new Error(`Tipo não aceite: ${tipo || 'desconhecido'} (png, jpg, webp, mp4, mov, webm)`)
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.byteLength > (t.video ? 80_000_000 : 15_000_000)) throw new Error('Ficheiro grande demais')
  const caminho = `conteudo-magnetico/media/${pecaId}-${Date.now().toString(36)}.${t.ext}`
  const db = getSupabaseAdmin()
  const { error } = await db.storage.from(BUCKET).upload(caminho, buf, { contentType: tipo, upsert: false })
  if (error) throw new Error(`Storage: ${error.message}`)
  return { url: db.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl, video: t.video }
}

export const FERRAMENTAS_CONTEUDO: Ferramenta[] = [
  {
    nome: 'conteudo_criar_guiao',
    descricao:
      'MTM Conteúdo Magnético: escreve um carrossel, post, story ou reel (com IA grátis e as regras da casa ' +
      'verificadas por código). Devolve o id da peça, o guião e `prompts` visuais em inglês por lâmina e por ' +
      'segmento, para levares a um MCP de imagem/vídeo (ArtCraft, Higgsfield, Canva…). Nada é publicado.',
    esquema: {
      type: 'object',
      properties: {
        formato: { type: 'string', enum: Object.keys(FORMATOS) },
        marca: { type: 'string', enum: Object.keys(MARCAS), description: 'ricardo-garcia (ciano) ou morethanmoney (ouro)' },
        nicho: { type: 'string', description: 'tema ou produto, ex.: «disciplina no trading»' },
        objectivo: { type: 'string', enum: Object.keys(OBJECTIVOS) },
        tom: { type: 'string', enum: Object.keys(TONS) },
        notas: { type: 'string', description: 'história e dados reais — os únicos números que a IA pode usar' },
        quantas: { type: 'number', description: 'lâminas do carrossel (3-10)' },
      },
      required: ['formato', 'marca', 'nicho'],
      additionalProperties: false,
    },
    correr: async (a) => {
      const formato = (String(a.formato) in FORMATOS ? a.formato : 'carrossel') as Formato
      const marca = resolverMarca(String(a.marca || 'morethanmoney'))
      const nicho = String(a.nicho || '').trim().slice(0, 200)
      if (!nicho) throw new Error('Falta o nicho/tema.')
      const r = await gerarGuiao({
        formato,
        marca,
        nicho,
        objectivo: (String(a.objectivo) in OBJECTIVOS ? a.objectivo : 'atracao') as Objectivo,
        tom: (String(a.tom) in TONS ? a.tom : 'educativo') as Tom,
        notas: typeof a.notas === 'string' ? a.notas : undefined,
        quantas: Number(a.quantas) || undefined,
      })
      const { data, error } = await getSupabaseAdmin()
        .from('conteudo_magnetico_pecas')
        .insert({ user_id: await dono(), formato, marca: marca.id, guiao: r.guiao })
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      return { id: data?.id, avisos: r.avisos, guiao: r.guiao, prompts: promptsDe(r.guiao), ia: `${r.fornecedor}/${r.modelo}` }
    },
  },

  {
    nome: 'conteudo_listar',
    descricao: 'As últimas peças do Conteúdo Magnético (id, formato, marca, título da capa) e os últimos vídeos com o estado.',
    esquema: { type: 'object', properties: {}, additionalProperties: false },
    correr: async () => {
      const db = getSupabaseAdmin()
      const [p, v] = await Promise.all([
        db.from('conteudo_magnetico_pecas').select('id, formato, marca, guiao, criado_em').order('criado_em', { ascending: false }).limit(15),
        db.from('conteudo_magnetico_renders').select('id, peca_id, estado, video_url, erro, criado_em').order('criado_em', { ascending: false }).limit(10),
      ])
      return {
        pecas: (p.data ?? []).map((x) => ({
          id: x.id,
          formato: x.formato,
          marca: x.marca,
          capa: (x.guiao as Guiao)?.laminas?.[0]?.titulo ?? '',
          criado_em: x.criado_em,
        })),
        videos: v.data ?? [],
      }
    },
  },

  {
    nome: 'conteudo_ver',
    descricao: 'Uma peça inteira: guião, media já presa e os prompts visuais.',
    esquema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    correr: async (a) => {
      const p = await lerPeca(a.id)
      return { ...p, prompts: promptsDe(p.guiao), avisos: verificarObjecto(p.guiao) }
    },
  },

  {
    nome: 'conteudo_editar_guiao',
    descricao: 'Grava um guião editado (o objecto inteiro, como veio de conteudo_ver). Volta a passar pelas regras.',
    esquema: {
      type: 'object',
      properties: { id: { type: 'string' }, guiao: { type: 'object' } },
      required: ['id', 'guiao'],
      additionalProperties: false,
    },
    correr: async (a) => {
      const p = await lerPeca(a.id)
      const g = { ...(a.guiao as Guiao), formato: p.formato, marca: p.marca } as Guiao
      const guiao = renormalizar(g)
      await getSupabaseAdmin().from('conteudo_magnetico_pecas').update({ guiao }).eq('id', p.id)
      return { ok: true, avisos: verificarObjecto(guiao), guiao }
    },
  },

  {
    nome: 'conteudo_meter_media',
    descricao:
      'Prende uma imagem ou clip gerado noutro MCP (ArtCraft, Higgsfield, Canva…) a uma peça. O ficheiro é ' +
      'COPIADO para o Storage da MTM (png/jpg/webp até 15 MB, mp4/mov/webm até 80 MB). alvo: «fundo» (fundo de ' +
      'todas as lâminas e foto do apresentador no reel), «lamina» (fundo de uma lâmina) ou «segmento» (plano do ' +
      'reel: o motor usa-o em vez do Pexels/cartão).',
    esquema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        url: { type: 'string', description: 'https público do ficheiro gerado' },
        alvo: { type: 'string', enum: ['fundo', 'lamina', 'segmento'] },
        indice: { type: 'number', description: 'índice (0…) da lâmina ou do segmento' },
      },
      required: ['id', 'url', 'alvo'],
      additionalProperties: false,
    },
    correr: async (a) => {
      const p = await lerPeca(a.id)
      const alvo = String(a.alvo)
      const i = Math.max(0, Math.floor(Number(a.indice) || 0))
      const media = await copiarParaCasa(a.url, p.id)
      const db = getSupabaseAdmin()
      if (alvo === 'fundo') {
        if (media.video) throw new Error('O fundo tem de ser imagem.')
        await db.from('conteudo_magnetico_pecas').update({ fundo_url: media.url }).eq('id', p.id)
        return { ok: true, alvo, url: media.url }
      }
      const g = structuredClone(p.guiao)
      if (alvo === 'lamina') {
        if (media.video) throw new Error('O fundo de uma lâmina tem de ser imagem.')
        if (!g.laminas[i]) throw new Error(`Não há lâmina ${i}`)
        g.laminas[i].fundo_url = media.url
      } else {
        const s = g.reel?.segmentos[i]
        if (!s) throw new Error(`Não há segmento ${i}`)
        s.media_url = media.url
        if (s.visual === 'cartao') s.visual = 'b_roll'
      }
      const guiao = renormalizar(g)
      await db.from('conteudo_magnetico_pecas').update({ guiao }).eq('id', p.id)
      return { ok: true, alvo, indice: i, url: media.url }
    },
  },

  {
    nome: 'conteudo_desenhar',
    descricao:
      'Desenha as lâminas da peça em PNG com a marca (título, destaque, assinatura, CTA, aviso legal) e devolve ' +
      'os URLs públicos. Usa o fundo de cada lâmina, ou o da peça.',
    esquema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    correr: async (a) => {
      const p = await lerPeca(a.id)
      const marca = resolverMarca(p.marca)
      const formato = (p.formato === 'reel' ? 'story' : p.formato) as Formato
      const dims = FORMATOS[formato]
      const db = getSupabaseAdmin()
      const logo = publicoComoDataUri(marca.logo)
      const total = p.guiao.laminas.length
      const urls: string[] = []
      for (let i = 0; i < total; i++) {
        const l = p.guiao.laminas[i]
        const png = await renderPeca({
          lamina: l,
          marca,
          largura: dims.largura,
          altura: dims.altura,
          indice: i,
          total,
          fundo: await fundoComoDataUri(l.fundo_url || p.fundo_url),
          logo,
          palavraChave: p.guiao.palavra_chave,
          aviso: true,
        })
        const caminho = `conteudo-magnetico/pecas/${p.id}-${i + 1}-${Date.now().toString(36)}.png`
        const { error } = await db.storage.from(BUCKET).upload(caminho, png, { contentType: 'image/png', upsert: true })
        if (error) throw new Error(`Storage: ${error.message}`)
        urls.push(db.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl)
      }
      return { ok: true, imagens: urls, legenda: p.guiao.legenda, hashtags: p.guiao.hashtags }
    },
  },

  {
    nome: 'conteudo_pedir_video',
    descricao:
      'Põe o reel da peça na fila do motor de vídeo (corre fora da Vercel: voz pt-PT, legendas karaoke, SFX, ' +
      'música, e a media que prendeste aos segmentos). Recusa se o guião falhar as regras. Vê o estado em conteudo_listar.',
    esquema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    correr: async (a) => {
      const p = await lerPeca(a.id)
      if (!p.guiao.reel?.segmentos.length) throw new Error('A peça não é um reel com segmentos.')
      const avisos = verificarObjecto(p.guiao)
      if (avisos.length) return { ok: false, erro: 'O guião falha as regras de conteúdo.', avisos }
      const { data, error } = await getSupabaseAdmin()
        .from('conteudo_magnetico_renders')
        .insert({ user_id: p.user_id, peca_id: p.id, guiao: p.guiao, marca: resolverMarca(p.marca), fundo_url: p.fundo_url })
        .select('id, estado, criado_em')
        .maybeSingle()
      if (error) throw new Error(error.message)
      return { ok: true, render: data }
    },
  },
]

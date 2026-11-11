/**
 * O GUIÃO — o contrato entre a IA, o ecrã e o motor de vídeo.
 *
 * Nasce da especificação «Magnetic.IA PRO MAX» (o JSON de engenharia de vídeo com
 * `timeline_segments`), adaptado ao que a casa publica: além do reel, o mesmo guião serve
 * carrosséis, publicações e stories. Tudo o que vem da IA passa por `normalizarGuiao` —
 * campos em falta ganham valores seguros, listas são cortadas, opções fora da lista caem na
 * omissão. O motor de vídeo nunca recebe um campo que não conheça.
 */
import type { Formato, IdMarca } from './marcas'

export const OBJECTIVOS = {
  atracao: 'Atração (topo de funil, alcance)',
  autoridade: 'Retenção (meio de funil, autoridade)',
  conversao: 'Conversão (fundo de funil, venda)',
} as const
export type Objectivo = keyof typeof OBJECTIVOS

export const TONS = {
  disruptivo: 'Disruptivo e ousado',
  educativo: 'Educacional e amigável',
  autoridade: 'Sofisticado e autoritário',
  directo: 'Corporativo e directo',
} as const
export type Tom = keyof typeof TONS

export const VISUAIS = ['cartao', 'apresentador', 'b_roll'] as const
export type Visual = (typeof VISUAIS)[number]
export const ZOOMS = ['normal', 'zoom_in', 'close_up'] as const
export type Zoom = (typeof ZOOMS)[number]
export const SFX = ['boom', 'whoosh', 'click', 'nenhum'] as const
export type Sfx = (typeof SFX)[number]
export const ESTILOS_LEGENDA = ['impacto', 'palavra_a_palavra', 'simples'] as const
export type EstiloLegenda = (typeof ESTILOS_LEGENDA)[number]
/** Efeito de cor do segmento: 'pb' liga o preto e branco (erro, passado), 'cor' impede o automático. */
export const EFEITOS = ['normal', 'pb', 'cor'] as const
export type Efeito = (typeof EFEITOS)[number]
/**
 * Plano de câmara com intenção (método dos 8 enquadramentos). O gravador mostra-o entre blocos e o
 * editor do Mac ajusta o zoom digital (detalhe ≈1,45×, aberto sem zoom).
 */
export const PLANOS = {
  aberto: { nome: 'Plano aberto', dica: 'corpo inteiro e o espaço: situa quem vê' },
  de_cima: { nome: 'De cima', dica: 'câmara acima dos olhos: a dor, a vulnerabilidade' },
  de_baixo: { nome: 'De baixo (ligeiro)', dica: 'câmara um pouco abaixo dos olhos: autoridade e prova' },
  medio: { nome: 'Plano médio', dica: 'dos joelhos ou da cintura para cima: explicar com postura' },
  fechado: { nome: 'Fechado', dica: 'cara e ombros: a frase forte' },
  detalhe: { nome: 'Detalhe', dica: 'mãos, caderno, ecrã com o gráfico, olhos' },
  mao: { nome: 'Câmara na mão', dica: 'íntimo, bastidores, em movimento' },
} as const
export type Plano = keyof typeof PLANOS
export const IDS_PLANOS = Object.keys(PLANOS) as Plano[]

/** Uma lâmina (carrossel), a peça única (post/story) ou o cartão de um segmento do reel. */
export type Lamina = {
  papel: 'capa' | 'meio' | 'fim'
  /** Linha pequena por cima. */
  antetitulo: string
  /** O título — CAIXA ALTA, curto. */
  titulo: string
  /** A palavra/expressão do título que vai na cor de destaque. */
  destaque: string
  /** Texto de apoio (pode ser vazio na capa). */
  corpo: string
  /** Prompt em inglês para um gerador de imagem externo (ArtCraft, Higgsfield, Canva… via MCP). */
  prompt_visual?: string
  /** Fundo próprio desta lâmina (já copiado para o nosso Storage). Sem ele usa-se o fundo da peça. */
  fundo_url?: string | null
}

export type Segmento = {
  id: number
  /** O que se diz (narração). */
  fala: string
  /** O que aparece escrito no ecrã, curto. */
  texto_ecra: string
  visual: Visual
  zoom: Zoom
  /** Termo em inglês para procurar vídeo de apoio (Pexels) quando visual = b_roll. */
  b_roll_busca: string | null
  sfx: Sfx
  legenda_estilo: EstiloLegenda
  /** Prompt em inglês para gerar o plano num gerador de imagem/vídeo externo (via MCP). */
  prompt_visual: string
  /** Imagem ou clip gerado fora (já no nosso Storage): o motor usa-o em vez do Pexels/cartão. */
  media_url: string | null
  /** Preto e branco ('pb'), forçar cor ('cor') ou deixar o automático ('normal'). */
  efeito: Efeito
  /** Plano de câmara sugerido para este segmento (ou null). */
  plano: Plano | null
}

export type Reel = {
  duracao_estimada_segundos: number
  musica_termo: string
  musica_volume_db: number
  segmentos: Segmento[]
}

export type Guiao = {
  formato: Formato
  marca: IdMarca
  nicho: string
  objectivo: Objectivo
  tom: Tom
  /** Palavra-chave para comentar (o funil nativo do IG apanha-a). */
  palavra_chave: string
  legenda: string
  hashtags: string[]
  laminas: Lamina[]
  reel: Reel | null
}

const txt = (v: unknown, max: number, omissao = ''): string => {
  const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
  const limpo = s.replace(/\s+/g, ' ').trim()
  return (limpo || omissao).slice(0, max)
}
const umDe = <T extends string>(v: unknown, lista: readonly T[], omissao: T): T =>
  (lista as readonly string[]).includes(String(v)) ? (v as T) : omissao

/** Mapeia os nomes da especificação original (avatar_talking, dramatic_boom.mp3…) para os nossos. */
function visualDe(v: unknown): Visual {
  const s = String(v || '').toLowerCase()
  if (s.includes('roll')) return 'b_roll'
  if (s.includes('avatar') || s.includes('apresent') || s.includes('talking')) return 'apresentador'
  return umDe(s, VISUAIS, 'cartao')
}
function sfxDe(v: unknown): Sfx {
  const s = String(v || '').toLowerCase()
  if (s.includes('boom')) return 'boom'
  if (s.includes('whoosh') || s.includes('transi')) return 'whoosh'
  if (s.includes('click') || s.includes('notifica')) return 'click'
  return 'nenhum'
}
function legendaDe(v: unknown): EstiloLegenda {
  const s = String(v || '').toLowerCase()
  if (s.includes('impact') || s.includes('atenc')) return 'impacto'
  if (s.includes('word') || s.includes('palavra')) return 'palavra_a_palavra'
  if (s.includes('padrao') || s.includes('padrão') || s.includes('branco') || s.includes('simple')) return 'simples'
  return umDe(s, ESTILOS_LEGENDA, 'palavra_a_palavra')
}

/**
 * Só aceitamos media que já está em casa (o nosso Storage ou o site). Quem traz media de fora
 * passa por `conteudo_meter_media`, que a copia primeiro: assim o motor e o desenho nunca vão
 * buscar endereços arbitrários.
 */
export function urlDeCasa(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:') return null
    const h = u.hostname
    return h.endsWith('.supabase.co') || h === 'morethanmoney.pt' || h === 'www.morethanmoney.pt' ? u.toString().slice(0, 1000) : null
  } catch {
    return null
  }
}

export const LIMITES: Record<Formato, { min: number; max: number }> = {
  carrossel: { min: 3, max: 10 },
  post: { min: 1, max: 1 },
  story: { min: 1, max: 5 },
  reel: { min: 1, max: 1 },
}

export function normalizarLamina(l: unknown, papel: Lamina['papel']): Lamina {
  const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>
  const titulo = txt(o.titulo ?? o.title, 90, '…').toUpperCase()
  let destaque = txt(o.destaque ?? o.highlight, 40).toUpperCase()
  if (destaque && !titulo.includes(destaque)) destaque = ''
  return {
    papel: umDe(o.papel, ['capa', 'meio', 'fim'] as const, papel),
    antetitulo: txt(o.antetitulo ?? o.eyebrow, 40),
    titulo,
    destaque,
    corpo: txt(o.corpo ?? o.body, 320),
    prompt_visual: txt(o.prompt_visual ?? o.image_prompt, 400),
    fundo_url: urlDeCasa(o.fundo_url),
  }
}

export function normalizarGuiao(
  bruto: unknown,
  pedido: { formato: Formato; marca: IdMarca; nicho: string; objectivo: Objectivo; tom: Tom },
): Guiao {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const { formato } = pedido
  const lim = LIMITES[formato]
  const laminasBrutas = Array.isArray(o.laminas) ? o.laminas : Array.isArray(o.slides) ? o.slides : []
  let laminas = laminasBrutas.slice(0, lim.max).map((l, i, arr) =>
    normalizarLamina(l, i === 0 ? 'capa' : i === arr.length - 1 && arr.length > 1 ? 'fim' : 'meio'),
  )
  if (laminas.length === 0) laminas = [normalizarLamina({ titulo: pedido.nicho }, 'capa')]

  let reel: Reel | null = null
  if (formato === 'reel') {
    const r = (o.reel && typeof o.reel === 'object' ? o.reel : o) as Record<string, unknown>
    const segsBrutos = Array.isArray(r.segmentos) ? r.segmentos : Array.isArray(r.timeline_segments) ? r.timeline_segments : []
    const segmentos: Segmento[] = segsBrutos.slice(0, 12).map((s, i) => {
      const so = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
      const cv = (so.config_visual && typeof so.config_visual === 'object' ? so.config_visual : {}) as Record<string, unknown>
      const fala = txt(so.fala ?? so.texto_fala, 260)
      const visual = visualDe(so.visual ?? so.tipo_visual)
      const busca = txt(so.b_roll_busca ?? cv.b_roll_busca, 80)
      return {
        id: i + 1,
        fala,
        texto_ecra: txt(so.texto_ecra, 60, fala.split(/[.!?]/)[0].slice(0, 60)).toUpperCase(),
        visual: visual === 'b_roll' && !busca && !urlDeCasa(so.media_url) ? 'cartao' : visual,
        zoom: umDe(so.zoom ?? cv.camera_zoom, ZOOMS, 'normal'),
        b_roll_busca: visual === 'b_roll' && busca ? busca : null,
        sfx: sfxDe(so.sfx ?? so.efeito_sonoro),
        legenda_estilo: legendaDe(so.legenda_estilo),
        prompt_visual: txt(so.prompt_visual ?? cv.prompt_visual, 400),
        media_url: urlDeCasa(so.media_url),
        efeito: umDe(so.efeito, EFEITOS, 'normal'),
        plano: (IDS_PLANOS as string[]).includes(String(so.plano)) ? (so.plano as Plano) : null,
      }
    }).filter((s) => s.fala)
    const dur = Number(r.duracao_estimada_segundos)
    reel = {
      duracao_estimada_segundos: Number.isFinite(dur) && dur > 0 ? Math.min(Math.round(dur), 90) : segmentos.length * 4,
      musica_termo: txt(r.musica_termo ?? r.musica_pesquisa_termo, 60, 'cinematic hip hop slow'),
      musica_volume_db: -24,
      segmentos,
    }
  }

  const hashtags = (Array.isArray(o.hashtags) ? o.hashtags : [])
    .map((h) => txt(h, 40).replace(/^#?/, '#').replace(/\s+/g, ''))
    .filter((h) => h.length > 1)
    .slice(0, 12)

  return {
    ...pedido,
    palavra_chave: txt(o.palavra_chave, 20, 'QUERO').toUpperCase().replace(/[^A-ZÀ-Ú0-9 ]/g, ''),
    legenda: String(o.legenda ?? o.caption ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000),
    hashtags,
    laminas,
    reel,
  }
}

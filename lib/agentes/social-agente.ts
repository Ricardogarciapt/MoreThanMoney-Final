/**
 * POSTS DOS AGENTES NO INSTAGRAM — a guarda da marca e os tectos diários. Puro.
 *
 * Decisão do dono (07/10, «activa tudo»): o Social (AG-SOCIAL e filhos) cria posts e agenda-os na
 * fila nativa (`social_scheduled_posts` → cron `ig-publish`). Com o botão «Auto-publicar posts dos
 * agentes» ligado (`site_settings.social_auto_publicar_agentes`), entram APROVADOS e publicam
 * sozinhos — mas só depois de passarem esta guarda. Se falhar, ficam em rascunho com o motivo.
 *
 * O que a guarda verifica, por esta ordem (o primeiro que falha é o motivo escrito):
 *  1. conta — só @morethanmoney.pt; o pessoal do Ricardo nunca recebe automação;
 *  2. paleta — ouro sobre carvão (#D2A63C / #E9C46A, quase preto, neutros). Creme, terracota e
 *     qualquer cor saturada que não seja ouro são outra marca;
 *  3. promessas de lucro («lucro garantido», «sem risco», «fica rico», …);
 *  4. números de resultado inventados — euros/dólares ganhos, «+340%», «win rate»: a prova da casa
 *     mede-se em PIPS e só com origem declarada («Fonte: …»);
 *  5. o @ da marca certo (@morethanmoney.pt, nunca @morethanmoneypt nem @morethanmoney_mtm);
 *  6. o `?ag=` do agente num link nosso — sem ele o post não mede, e um agente sem medição morre.
 *
 * Os tectos: no máximo 2 posts (feed) por dia por conta e 1 história por dia por conta, contando
 * só o que os AGENTES puseram na fila (`created_by` = `agente:<código>`), no dia de Lisboa da
 * hora agendada.
 */
import { normalizar } from './atribuicao'

export const CHAVE_AUTO_PUBLICAR = 'social_auto_publicar_agentes'
export const CONTA_MARCA = '17841474872672009'
export const HANDLE_MARCA = 'morethanmoney.pt'

export interface ConfigAutoPublicar {
  ligado: boolean
  posts_dia_conta: number
  historias_dia_conta: number
}
export const AUTO_PADRAO: ConfigAutoPublicar = { ligado: false, posts_dia_conta: 2, historias_dia_conta: 1 }

/** Lê o setting. Ilegível = desligado. Os tectos nunca sobem acima do que o dono decidiu (2 / 1). */
export function lerAutoPublicar(v: unknown): ConfigAutoPublicar {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const n = (x: unknown, d: number) => {
    const k = Math.floor(Number(x))
    return Number.isFinite(k) && k >= 0 ? Math.min(k, d) : d
  }
  return {
    ligado: o.ligado === true,
    posts_dia_conta: n(o.posts_dia_conta, AUTO_PADRAO.posts_dia_conta),
    historias_dia_conta: n(o.historias_dia_conta, AUTO_PADRAO.historias_dia_conta),
  }
}

/** O código é do Social (AG-SOCIAL ou um filho AG-SOCIAL-n)? */
export function eDoSocial(codigo: unknown): boolean {
  const c = normalizar(codigo)
  return !!c && (c === 'AG-SOCIAL' || /^AG-SOCIAL(-\d{1,3})+$/.test(c))
}

// ── Paleta ──────────────────────────────────────────────────────────────────────────────────
/** A paleta do cartão da casa (`lib/social-card.tsx`, conta da marca). */
export const PALETA_CARTAO_CASA = ['#D2A63C', '#E9C46A', '#E4A84D', '#141414', '#0B0D12', '#23282E', '#FFFFFF', '#8B9199']

function rgb(hex: string): [number, number, number] | null {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

/** Uma cor cabe na marca? Ouro (matiz 34–50°, saturada), quase preto, ou neutro (cinzento/branco). */
export function corDaCasa(hex: string): boolean {
  const c = rgb(hex)
  if (!c) return false
  const [r, g, b] = c
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const croma = (max - min) / 255
  // Neutros puros: preto, carvão, cinzentos, branco. O creme (#F5F2EA, croma 0,043) já não passa.
  if (croma < 0.035) return true
  // Quase preto com um toque frio/quente (#0B0D12, #23282E).
  if (max <= 0x40 && croma < 0.12) return true
  let h = 0
  if (max === r) h = 60 * (((g - b) / (max - min)) % 6)
  else if (max === g) h = 60 * ((b - r) / (max - min) + 2)
  else h = 60 * ((r - g) / (max - min) + 4)
  if (h < 0) h += 360
  // Cinzento frio do texto secundário (#8B9199). Um cinzento QUENTE claro é creme — não passa.
  if (croma < 0.08 && h >= 180 && h <= 260) return true
  // Ouro.
  return h >= 34 && h <= 50 && croma >= 0.25
}

// ── Texto ───────────────────────────────────────────────────────────────────────────────────
const PROMESSA = /(lucros?|ganhos?|rendimentos?|retornos?|resultados?)\s+(garantid|certo|assegurad)|sem\s+risco|risco\s+zero|fica(r|s)?\s+ric[oa]|dinheiro\s+f[aá]cil|garantimos|100\s*%\s*(de\s+)?(acerto|certeza)|nunca\s+perde|enriquec/i
const DINHEIRO_GANHO = /\+\s*\d[\d.,]*\s*(k\b|mil\b)?\s*(€|\$|eur\b|euros|usd|d[oó]lares)|(€|\$)\s*\d[\d.,]*\s*(de\s+)?(lucro|ganho)|(ganh|lucr|fatur|rend)\w*\s+(de\s+|mais\s+de\s+)?\d[\d.,]*\s*(k\b|mil\b)?\s*(€|\$|eur|euros|usd|d[oó]lares)/i
const PERCENTAGEM_RESULTADO = /\+\s*\d[\d.,]*\s*%|\d[\d.,]*\s*%\s*(de\s+)?(acerto|win|lucro|retorno|rentabilidade|ganho|em\s+\d+\s+dias)|win\s*-?\s*rate|taxa\s+de\s+acerto\s+de\s+\d/i
const PIPS_COM_NUMERO = /\d[\d.,]*\s*pips/i
const ORIGEM = /(fonte|origem)\s*:\s*\S/i
const HANDLE_ERRADO = /@morethanmoney_mtm\b|@morethanmoneypt\b|instagram\.com\/morethanmoneypt\b|@morethanmoney(?!\.pt)\b/i

export interface PostDoAgente {
  ig_account_id: string
  media_type: string
  caption: string
  paleta: string[]
  agente_codigo: string
}

export type Veredicto = { ok: true } | { ok: false; motivo: string }

/** A guarda da marca. Pura. `caption` já deve vir marcada (marcarConteudo com o código do agente). */
export function guardaDaMarca(p: PostDoAgente): Veredicto {
  if (!eDoSocial(p.agente_codigo)) return { ok: false, motivo: `«${p.agente_codigo}» não é o agente Social — só ele publica.` }
  if (p.ig_account_id !== CONTA_MARCA) return { ok: false, motivo: 'Só a conta @morethanmoney.pt recebe posts dos agentes.' }
  if (!['IMAGE', 'CAROUSEL', 'STORIES'].includes(String(p.media_type).toUpperCase())) {
    return { ok: false, motivo: `Tipo «${p.media_type}» não é dos agentes (IMAGE, CAROUSEL ou STORIES).` }
  }
  const paleta = Array.isArray(p.paleta) ? p.paleta : []
  if (!paleta.length) return { ok: false, motivo: 'Paleta não declarada — não se aprova uma imagem que não se sabe de que cor é.' }
  const fora = paleta.filter((c) => !corDaCasa(c))
  if (fora.length) return { ok: false, motivo: `Fora da paleta da casa (ouro sobre carvão): ${fora.join(', ')}.` }

  const t = String(p.caption ?? '')
  if (!t.trim()) return { ok: false, motivo: 'Legenda vazia.' }
  if (PROMESSA.test(t)) return { ok: false, motivo: 'Promessa de lucro na legenda.' }
  if (DINHEIRO_GANHO.test(t)) return { ok: false, motivo: 'Resultado em dinheiro na legenda — a prova da casa é em pips, com origem.' }
  if (PERCENTAGEM_RESULTADO.test(t)) return { ok: false, motivo: 'Número de resultado em percentagem — não se inventam números.' }
  if (PIPS_COM_NUMERO.test(t) && !ORIGEM.test(t)) return { ok: false, motivo: 'Prova em pips sem origem declarada («Fonte: …»).' }
  if (HANDLE_ERRADO.test(t)) return { ok: false, motivo: 'Handle errado — o Instagram da marca é @morethanmoney.pt.' }

  const codigo = normalizar(p.agente_codigo)
  const temAg = new RegExp(`morethanmoney\\.pt[^\\s]*[?&]ag=${codigo}(?![\\w-])`, 'i').test(t)
  if (!temAg) return { ok: false, motivo: `Sem link nosso com ?ag=${codigo} — o post não mediria nada.` }
  return { ok: true }
}

export function eHistoria(mediaType: string): boolean {
  return String(mediaType).toUpperCase() === 'STORIES'
}

/** Dia de Lisboa (AAAA-MM-DD) de um instante. */
export function diaLisboa(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export interface Contagem {
  posts: number
  historias: number
}

/**
 * A decisão final: entra APROVADO ou fica RASCUNHO com o motivo. Pura.
 * `contagem` = posts/histórias de agentes JÁ na fila para essa conta nesse dia de Lisboa.
 */
export function decidirEntrada(
  post: PostDoAgente,
  cfg: ConfigAutoPublicar,
  contagem: Contagem | null,
): { status: 'approved' | 'draft'; motivo: string } {
  const g = guardaDaMarca(post)
  if (!g.ok) return { status: 'draft', motivo: `Guarda da marca: ${g.motivo}` }
  if (!cfg.ligado) return { status: 'draft', motivo: 'Auto-publicar dos agentes desligado — fica para o dono aprovar.' }
  if (!contagem) return { status: 'draft', motivo: 'Não consegui contar os posts do dia — não se aprova às cegas.' }
  if (eHistoria(post.media_type)) {
    if (contagem.historias >= cfg.historias_dia_conta) {
      return { status: 'draft', motivo: `Tecto diário de histórias (${cfg.historias_dia_conta}) atingido nessa conta.` }
    }
  } else if (contagem.posts >= cfg.posts_dia_conta) {
    return { status: 'draft', motivo: `Tecto diário de posts (${cfg.posts_dia_conta}) atingido nessa conta.` }
  }
  return { status: 'approved', motivo: 'Guarda da marca verde e dentro do tecto — publica sozinho.' }
}

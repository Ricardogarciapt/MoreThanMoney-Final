import { createHmac, timingSafeEqual } from 'crypto'

/**
 * REDES NOVAS — regras puras (sem rede nem base), para se poderem testar com `npx tsx`.
 *
 * O que entra no Instagram da marca volta a sair no TikTok, no YouTube Shorts e no LinkedIn. Cada
 * rede tem as suas manhas: a palavra-chave para comentar só funciona no Instagram (é o motor
 * nativo de lá que a apanha), o LinkedIn escapa parênteses e cardinais, o YouTube precisa do
 * #Shorts no título. Tudo isso está aqui.
 */

export const REDES = ['tiktok', 'youtube', 'linkedin'] as const
export type Rede = (typeof REDES)[number]
export const MARCAS = ['morethanmoney', 'ricardo-garcia'] as const
export type Marca = (typeof MARCAS)[number]

export const NOME_REDE: Record<Rede, string> = { tiktok: 'TikTok', youtube: 'YouTube Shorts', linkedin: 'LinkedIn' }
export const NOME_MARCA: Record<Marca, string> = { morethanmoney: 'More Than Money', 'ricardo-garcia': 'Ricardo Garcia' }

/** A conta de Instagram de onde sai o conteúdo de cada marca. */
export const IG_DA_MARCA: Record<Marca, string> = {
  morethanmoney: '17841474872672009',
  'ricardo-garcia': '17841405656956716',
}

/** Quantas publicações por conta e por dia, no máximo (prudência com contas novas). */
export const MAX_POR_DIA = 3

export const SITE = 'https://www.morethanmoney.pt'

export function linkDaRede(rede: Rede, caminho = '/'): string {
  const u = new URL(caminho, SITE)
  u.searchParams.set('ag', 'AG-SOCIAL')
  u.searchParams.set('utm_source', rede)
  return u.toString()
}

const MARCA_INTERNA = '—INTERNO—'

/**
 * Adapta a legenda do Instagram a outra rede.
 *  · tira o bloco interno;
 *  · troca a linha «Comenta PALAVRA…» por um link com ?ag= (fora do Instagram ninguém responde
 *    à palavra-chave, e prometer uma resposta que não vem queima o contacto);
 *  · no TikTok os links não são clicáveis: fica «link na bio».
 */
export function adaptarLegenda(original: string, rede: Rede): string {
  let t = String(original ?? '')
  const i = t.indexOf(MARCA_INTERNA)
  if (i >= 0) t = t.slice(0, i)
  const cta = rede === 'tiktok' ? '👉 Link na bio: morethanmoney.pt' : `👉 ${linkDaRede(rede)}`
  let trocou = false
  t = t
    .split('\n')
    .map((linha) => {
      if (/^\s*(?:👉\s*)?comenta\b/i.test(linha)) {
        trocou = true
        return cta
      }
      return linha
    })
    .join('\n')
  if (!trocou) t = `${t.trim()}\n\n${cta}`
  t = t.replace(/\n{3,}/g, '\n\n').trim()
  const max = rede === 'tiktok' ? 2200 : rede === 'linkedin' ? 3000 : 5000
  return t.slice(0, max)
}

/** Título de um Short: a primeira linha com conteúdo, até 90 caracteres, mais #Shorts. */
export function tituloShort(legenda: string): string {
  const primeira = String(legenda ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('👉')) ?? 'More Than Money'
  const curto = primeira.length > 88 ? `${primeira.slice(0, 87).trimEnd()}…` : primeira
  return `${curto} #Shorts`
}

/**
 * O LinkedIn lê o texto como «little text format»: estes caracteres têm de ir escapados com
 * barra, senão o post é recusado ou parte-se (os parênteses são o caso mais comum).
 */
export function escaparLinkedin(texto: string): string {
  return texto.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`)
}

// ── state do OAuth ─────────────────────────────────────────────────────────────
// O pedido de ligação sai do /admin/redes (admin verificado) e volta pelo callback da rede, que
// não traz sessão. O `state` assinado prova que fomos nós a pedir, para esta rede e marca, há
// menos de 15 minutos.

const VALIDADE_MS = 15 * 60_000

export function assinarState(rede: Rede, marca: Marca, segredo: string, agora = Date.now()): string {
  const corpo = `${rede}.${marca}.${agora}`
  const sig = createHmac('sha256', segredo).update(corpo).digest('base64url')
  return `${Buffer.from(corpo).toString('base64url')}.${sig}`
}

export function lerState(state: string, segredo: string, agora = Date.now()): { rede: Rede; marca: Marca } | null {
  const [b64, sig] = String(state ?? '').split('.')
  if (!b64 || !sig) return null
  let corpo: string
  try { corpo = Buffer.from(b64, 'base64url').toString() } catch { return null }
  const esperado = createHmac('sha256', segredo).update(corpo).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const [rede, marca, ts] = corpo.split('.')
  if (!(REDES as readonly string[]).includes(rede) || !(MARCAS as readonly string[]).includes(marca)) return null
  const t = Number(ts)
  if (!Number.isFinite(t) || agora - t > VALIDADE_MS || t - agora > 60_000) return null
  return { rede: rede as Rede, marca: marca as Marca }
}

/** Partes de um ficheiro para o TikTok: até 64 MB vai inteiro; acima, pedaços de 10 MB. */
export function partesTiktok(tamanho: number): { chunk: number; total: number } {
  const MB = 1024 * 1024
  if (tamanho <= 64 * MB) return { chunk: tamanho, total: 1 }
  const chunk = 10 * MB
  return { chunk, total: Math.floor(tamanho / chunk) }
}

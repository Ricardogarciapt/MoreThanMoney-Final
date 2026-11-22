/**
 * E-BOOKS DA CASA — quem pode abrir e como.
 *
 * Os ficheiros vivem em `conteudo-privado/ebooks/<slug>/` (fora de `public/`), por isso só saem
 * pela rota `/api/ebooks/<slug>`, que decide no servidor:
 *   1. quem comprou o produto do marketplace com o mesmo slug (`temAcessoAoProduto`), ou um admin;
 *   2. quem traz um LINK ASSINADO (`?t=`) — é assim que se entrega um e-book resgatado com XP na
 *      app do Ricardo (os membros dessa app não têm conta Supabase) ou oferecido como bónus.
 *
 * O link assinado leva o slug e a data de fim; a assinatura é HMAC-SHA256. Não há segredo novo a
 * configurar: usa `EBOOKS_TOKEN_SECRET` se existir, senão a service role (que nunca sai do servidor).
 */
import crypto from 'node:crypto'

export const EBOOKS = {
  'destrui-tudo-e-ainda-bem': { titulo: 'Destruí Tudo. E Ainda Bem.', autor: 'Ricardo Garcia' },
  'a-primeira-chave': { titulo: 'A Primeira Chave', autor: 'Ruben Pereira' },
  'so-as-maos': { titulo: 'Só as Mãos', autor: 'Maria Costa' },
  'o-metodo-frio': { titulo: 'O Método Frio', autor: 'Ricardo Garcia' },
  // versões traduzidas (mesmo livro, outra língua; conteudo-privado/ebooks/<slug>-en|es/)
  'destrui-tudo-e-ainda-bem-en': { titulo: "I Destroyed It All. And I'm Glad.", autor: 'Ricardo Garcia' },
  'destrui-tudo-e-ainda-bem-es': { titulo: 'Lo Destruí Todo. Y Menos Mal.', autor: 'Ricardo Garcia' },
  'o-metodo-frio-en': { titulo: 'The Cold Method', autor: 'Ricardo Garcia' },
  'o-metodo-frio-es': { titulo: 'El Método Frío', autor: 'Ricardo Garcia' },
  'a-primeira-chave-en': { titulo: 'The First Key', autor: 'Ruben Pereira' },
  'a-primeira-chave-es': { titulo: 'La Primera Llave', autor: 'Ruben Pereira' },
  'so-as-maos-en': { titulo: 'Just the Hands', autor: 'Maria Costa' },
  'so-as-maos-es': { titulo: 'Solo las Manos', autor: 'Maria Costa' },
} as const
export type LinguaEbook = 'pt' | 'en' | 'es'
/** 'o-metodo-frio-en' → { base: 'o-metodo-frio', lingua: 'en' } */
export function partesEbook(slug: string): { base: string; lingua: LinguaEbook } {
  const m = slug.match(/^(.*)-(en|es)$/)
  return m ? { base: m[1], lingua: m[2] as LinguaEbook } : { base: slug, lingua: 'pt' }
}
export type SlugEbook = keyof typeof EBOOKS
export const ehEbook = (s: string): s is SlugEbook => Object.prototype.hasOwnProperty.call(EBOOKS, s)

function segredo(): string {
  const s = process.env.EBOOKS_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!s) throw new Error('Sem segredo para assinar links de e-book.')
  return s
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Link assinado: válido até `dias` dias a partir de agora. `quem` vai na assinatura (rasto). */
export function assinarEbook(slug: SlugEbook, dias = 365, quem = ''): string {
  const fim = Math.floor(Date.now() / 1000) + dias * 86400
  const corpo = `${slug}.${fim}.${b64url(Buffer.from(quem.slice(0, 60)))}`
  const sig = b64url(crypto.createHmac('sha256', segredo()).update(corpo).digest()).slice(0, 32)
  return `${corpo}.${sig}`
}

export function verificarEbook(token: string | null | undefined, slug: string, agora = Date.now()): boolean {
  if (!token) return false
  const partes = token.split('.')
  if (partes.length !== 4) return false
  const [s, fim, quem, sig] = partes
  if (s !== slug) return false
  if (!/^\d+$/.test(fim) || Number(fim) * 1000 < agora) return false
  const esperado = b64url(crypto.createHmac('sha256', segredo()).update(`${s}.${fim}.${quem}`).digest()).slice(0, 32)
  const a = Buffer.from(sig), b = Buffer.from(esperado)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function linkEbook(slug: SlugEbook, token?: string): string {
  const rota = partesEbook(slug).lingua === 'pt' ? 'ebooks' : 'ebooks-traducoes'
  const base = `https://www.morethanmoney.pt/api/${rota}/${slug}`
  return token ? `${base}?t=${encodeURIComponent(token)}` : base
}

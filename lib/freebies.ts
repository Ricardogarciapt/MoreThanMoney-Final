/**
 * OS TRÊS FREEBIES DA MTM (ímanes de leads, 23/11/2026, pedido do Ricardo).
 *
 * Uma fonte só para tudo o que os mostra: a página /gratis, a /gratis/goldkiller, o marketplace,
 * as landings dos anúncios (/f/*), os funis do Instagram, do Telegram e do WhatsApp.
 *
 *  1. «O Primeiro Passo»: topo do funil, para quem nunca investiu.
 *  2. «O Plano de 3 Passos»: educar, criar rendimento, automatizar, com folhas de trabalho.
 *  3. «Guia dos Scanners MTM» + 30 dias do Scanner GoldKiller com o cupão FREEBIE.
 *
 * Os livros vivem no motor de e-books (tools/ebooks, conteudo-privado/ebooks/<slug>) e entregam-se
 * pelo circuito do e-book grátis (/api/ebooks/<slug>/gratis → pedidos_contacto + vendas_negocios).
 * Depois de qualquer freebie, o passo seguinte é sempre o mesmo: Premium 3 dias grátis e o plano Membro.
 */
import type { SlugEbook } from '@/lib/ebooks/acesso'
import { TRIAL_CURTO } from '@/lib/escada-caminhos'

export const BASE_SITE = 'https://www.morethanmoney.pt'

/** Cupão que dá os 30 dias do GoldKiller (linha em `coupons`, ligada ao produto goldkiller-semestral). */
export const CUPAO_FREEBIE = 'FREEBIE'
export const DIAS_GOLDKILLER_GRATIS = 30
export const PLANO_GOLDKILLER_GRATIS = 'goldkiller_freebie'

export type Freebie = {
  slug: SlugEbook
  titulo: string
  gancho: string
  para: string
  /** Página pública onde se pede (o formulário grátis do e-book, ou a do GoldKiller). */
  pagina: string
  capa: string
  /** Palavras que, comentadas no Instagram ou escritas no Telegram, levam a este freebie (regras em
   *  `mtm_automacoes`, sem repetir as que já têm dono: SISTEMA, COMEÇAR, QUERO, GUIA, APRENDER…). */
  palavras: string[]
  /** Etiqueta no pipeline (vendas_negocios.etiquetas). */
  etiqueta: string
}

export const FREEBIES: Freebie[] = [
  {
    slug: 'o-primeiro-passo',
    titulo: 'O Primeiro Passo',
    gancho: 'Para quem nunca investiu e quer parar de trocar só tempo por dinheiro.',
    para: 'Onde está o teu dinheiro hoje, que caminhos existem (com o risco à vista) e um plano de 7 dias.',
    pagina: '/ebooks/o-primeiro-passo#gratis',
    capa: '/marketplace/ebooks/o-primeiro-passo-3d.png',
    palavras: ['ACORDEI', 'MUDO AGORA', 'QUERO APRENDER', 'LIBERDADE', 'PASSO'],
    etiqueta: 'freebie-primeiro-passo',
  },
  {
    slug: 'o-plano-de-3-passos',
    titulo: 'O Plano de 3 Passos',
    gancho: 'Educar, criar rendimento, automatizar. Um plano escrito, com folhas de trabalho.',
    para: 'As quatro ideias que separam quem dura de quem desaparece, a primeira operação a frio e um plano de 30 dias.',
    pagina: '/ebooks/o-plano-de-3-passos#gratis',
    capa: '/marketplace/ebooks/o-plano-de-3-passos-3d.png',
    palavras: ['PLANO', '15MIN', 'ENTENDI'],
    etiqueta: 'freebie-plano-3-passos',
  },
  {
    slug: 'guia-dos-scanners',
    titulo: 'Guia dos Scanners MTM',
    gancho: 'O Scanner GoldKiller 30 dias grátis, com o guia passo a passo e os vídeos do bootcamp.',
    para: 'Ativar no TradingView, ler cada sinal, passar do sinal à operação com risco controlado, e os bootcamps de todas as ferramentas.',
    pagina: '/gratis/goldkiller',
    capa: '/marketplace/ebooks/guia-dos-scanners-3d.png',
    palavras: ['SCANNER', 'SCANNERS', 'GOLDKILLER', 'BOOTCAMP', 'FREEBIE'],
    etiqueta: 'freebie-goldkiller',
  },
]

export const freebieDe = (slug: string) => FREEBIES.find((f) => slug === f.slug || slug.startsWith(`${f.slug}-`)) ?? null

/** Freebie que corresponde a uma palavra escrita num comentário ou mensagem (ou null). */
export function freebieDaPalavra(texto: string): Freebie | null {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  return FREEBIES.find((f) => f.palavras.some((p) => new RegExp(`(^|\\W)${p.normalize('NFD').replace(/[̀-ͯ]/g, '')}(\\W|$)`).test(t))) ?? null
}

/** Link absoluto com origem, para colar em DMs, emails e mensagens. */
export function linkDoFreebie(f: Freebie, origem?: { s?: string; c?: string }): string {
  const [caminho, ancora] = f.pagina.split('#')
  const q = new URLSearchParams()
  if (origem?.s) q.set('utm_source', origem.s)
  if (origem?.c) q.set('utm_campaign', origem.c)
  const qs = q.toString()
  return `${BASE_SITE}${caminho}${qs ? `?${qs}` : ''}${ancora ? `#${ancora}` : ''}`
}

/** O passo seguinte a qualquer freebie: o mesmo em todo o lado (página de sucesso, email, setter). */
export const PROXIMO_PASSO = {
  premiumGratis: { texto: `Experimentar o Premium · ${TRIAL_CURTO}`, href: '/register?plan=premium' },
  membro: { texto: 'Ser Membro MoreThanMoney', href: '/upgrade?plan=app_member_monthly' },
  agendar: { texto: 'Falar com a equipa (conversa grátis)', href: '/agendar' },
  caminho: { texto: 'Ver o meu caminho (3 portas)', href: '/caminho' },
} as const

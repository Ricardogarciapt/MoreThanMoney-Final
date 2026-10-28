/**
 * O FIM DE CADA DESCRIÇÃO DO YOUTUBE — os quatro caminhos que levam quem viu o vídeo para dentro.
 *
 * Registo pelo onboarding, ebook grátis, Telegram e corretora. Vale para todos os vídeos e Shorts
 * MTM no canal Ricardo Garcia: os que se sobem pelo browser no Mac (copiam o bloco de
 * `docs/youtube-descricao-modelo.md`, gerado daqui) e os que saem pela API (`publicarClipe`).
 *
 * Os links são CURTOS e são NOSSOS (`/l/<nome>`, em `app/l/[slug]/route.ts`). Uma descrição
 * publicada não se reescreve com facilidade — são dezenas de vídeos, um a um ou em lote no
 * Studio. Com o destino atrás de um redirect, trocar o IB, o ebook ou o grupo é uma linha aqui,
 * e os vídeos antigos acompanham sem ninguém lhes tocar.
 *
 * Os nomes dos produtos (Golden Zone, PU Prime, MTM) não se traduzem.
 */

export type LinguaYoutube = 'pt' | 'en'

const SITE = 'https://www.morethanmoney.pt'

/** Os destinos reais dos links curtos. É aqui que se muda para onde cada um leva. */
export const DESTINOS_CURTOS: Record<string, string> = {
  // A corretora resolve-se na rota (rotação diária dos IB, ver lib/broker-links.ts).
  corretora: '/abrir-conta',
  telegram: 'https://t.me/MoreThanMoney_aibot?start=lead',
  ebook: '/educador/estrategias/golden-zone-guia.pdf',
  'ebook-en': '/educador/estrategias/golden-zone-guide-en.pdf',
  registo: '/onboarding/mtm?lang=pt',
  start: '/onboarding/mtm?lang=en',
}

export const linkCurto = (nome: keyof typeof DESTINOS_CURTOS | string) => `${SITE}/l/${nome}`

/**
 * As marcas do princípio e do fim. É por elas que se reconhece um bloco já posto — para o trocar
 * em vez de o empilhar quando o modelo muda e se volta a correr por cima de vídeos antigos.
 */
const INICIO: Record<LinguaYoutube, string> = {
  pt: '▬▬▬▬ Começa aqui ▬▬▬▬',
  en: '▬▬▬▬ Start here ▬▬▬▬',
}
const FIM = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬'

const PADRAO_BLOCO = /\n*▬{4} (?:Começa aqui|Start here) ▬{4}[\s\S]*?▬{16}\s*$/

export function blocoDescricao(lingua: LinguaYoutube): string {
  if (lingua === 'en') {
    return [
      INICIO.en,
      `🚀 Join MTM (3 days of Premium free): ${linkCurto('start')}`,
      `📘 Free ebook, the Golden Zone guide (PDF): ${linkCurto('ebook-en')}`,
      `💬 Join us on Telegram: ${linkCurto('telegram')}`,
      `🏦 Open your PU Prime broker account: ${linkCurto('corretora')}`,
      '',
      '⚠️ Educational content, not financial advice. Trading involves risk of loss; past results do not guarantee future results.',
      FIM,
    ].join('\n')
  }
  return [
    INICIO.pt,
    `🚀 Regista-te no MTM (3 dias de Premium grátis): ${linkCurto('registo')}`,
    `📘 Ebook grátis, o guia Golden Zone (PDF): ${linkCurto('ebook')}`,
    `💬 Entra no nosso Telegram: ${linkCurto('telegram')}`,
    `🏦 Abre a tua conta na corretora PU Prime: ${linkCurto('corretora')}`,
    '',
    '⚠️ Conteúdo educativo, não constitui consultoria financeira. O trading envolve risco de perda; resultados passados não garantem resultados futuros.',
    FIM,
  ].join('\n')
}

/** O YouTube corta a descrição nos 5000 caracteres e recusa `<` e `>`. */
const MAX_DESCRICAO = 5000

/**
 * A descrição com o bloco no fim. Se já tinha um (de qualquer língua), troca-o; nunca o repete.
 * O texto do vídeo é que encolhe se não houver espaço: o bloco é o que vende.
 */
export function juntarBloco(descricao: string, lingua: LinguaYoutube): string {
  const bloco = blocoDescricao(lingua)
  const texto = String(descricao ?? '').replace(PADRAO_BLOCO, '').replace(/[<>]/g, '').trim()
  const espaco = MAX_DESCRICAO - bloco.length - 2
  const corpo = texto.length > espaco ? `${texto.slice(0, espaco - 1).trimEnd()}…` : texto
  return corpo ? `${corpo}\n\n${bloco}` : bloco
}

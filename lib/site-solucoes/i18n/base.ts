/**
 * Idiomas do /solucoes e das demos (pedido do Ricardo, 17/11/2026): PT, EN, DE, FR e IT.
 *
 * Como funciona:
 *  · O texto original fica em português, onde já estava (conteudo.ts, automacao.ts, demos-diarias.ts
 *    e os componentes). A tradução é um dicionário «texto PT → texto no idioma» por idioma
 *    (en.json, de.json, fr.json, it.json). Texto sem tradução cai para PT, nunca parte a página.
 *  · Os componentes chamam t("texto PT") e tf("texto com {marcas}", { marcas }). A guarda
 *    (i18n.check.ts) apanha esses textos no código e os dos ficheiros de conteúdo, e falha se algum
 *    idioma não tiver a tradução. Assim uma demo nova não entra sem as quatro línguas.
 *  · Este ficheiro é puro e não importa os dicionários: entra no browser sem os carregar todos.
 *
 * O idioma escolhe-se por esta ordem: ?lang= no endereço, o cookie mtm_lang (o mesmo do resto do
 * site), o idioma do browser e, se o browser pedir uma língua que não temos, o país. Sem nenhum
 * sinal (robôs de pesquisa) fica PT, que é a versão canónica.
 */

export const IDIOMAS = ['pt', 'en', 'de', 'fr', 'it'] as const
export type Idioma = (typeof IDIOMAS)[number]

export const NOME_IDIOMA: Record<Idioma, string> = {
  pt: 'Português',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
}

export const LOCALE: Record<Idioma, string> = { pt: 'pt-PT', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', it: 'it-IT' }
export const LOCALE_OG: Record<Idioma, string> = { pt: 'pt_PT', en: 'en_GB', de: 'de_DE', fr: 'fr_FR', it: 'it_IT' }

export type Dicionario = Record<string, string>

export function eIdioma(v: unknown): v is Idioma {
  return typeof v === 'string' && (IDIOMAS as readonly string[]).includes(v)
}

function base(v: string): string {
  return v.trim().toLowerCase().split(/[-_]/)[0]
}

/** País (x-vercel-ip-country) → idioma, só para quem pede ao browser uma língua que não temos. */
const PAIS: Record<string, Idioma> = {
  DE: 'de', AT: 'de', CH: 'de', LI: 'de',
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr',
  IT: 'it', SM: 'it', VA: 'it',
  PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt', CV: 'pt',
}

export function escolherIdioma(s: { pedido?: string | null; cookie?: string | null; aceita?: string | null; pais?: string | null }): Idioma {
  if (s.pedido && eIdioma(base(s.pedido))) return base(s.pedido) as Idioma
  if (s.cookie && eIdioma(base(s.cookie))) return base(s.cookie) as Idioma
  const aceita = (s.aceita ?? '').trim()
  if (!aceita) return 'pt'
  const pedidos = aceita
    .split(',')
    .map((p, i) => {
      const [l, ...ps] = p.trim().split(';')
      const q = ps.map((x) => x.trim()).find((x) => x.startsWith('q='))
      return { l: base(l), q: q ? Number(q.slice(2)) || 0 : 1, i }
    })
    .filter((p) => p.l && p.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
  const achado = pedidos.find((p) => eIdioma(p.l))
  if (achado) return achado.l as Idioma
  const pais = PAIS[(s.pais ?? '').toUpperCase()]
  return pais ?? 'en'
}

export function preencher(texto: string, vars: Record<string, string | number>): string {
  return texto.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

export interface Tradutor {
  idioma: Idioma
  t: (pt: string) => string
  tf: (pt: string, vars: Record<string, string | number>) => string
  /** Número no formato do idioma. */
  n: (v: number, casas?: number) => string
  /** Liga interna que mantém o idioma escolhido. */
  ligar: (href: string) => string
}

export function criarTradutor(idioma: Idioma, dic: Dicionario = {}): Tradutor {
  const t = (pt: string) => (idioma === 'pt' ? pt : dic[pt] || pt)
  return {
    idioma,
    t,
    tf: (pt, vars) => preencher(t(pt), vars),
    n: (v, casas = 0) => v.toLocaleString(LOCALE[idioma], { maximumFractionDigits: casas, minimumFractionDigits: casas }),
    ligar: (href) => comIdioma(href, idioma),
  }
}

export function comIdioma(href: string, idioma: Idioma): string {
  if (idioma === 'pt' || !href.startsWith('/')) return href
  const [semHash, hash] = href.split('#')
  const sep = semHash.includes('?') ? '&' : '?'
  return `${semHash}${sep}lang=${idioma}${hash !== undefined ? `#${hash}` : ''}`
}

/** A linha de «em que língua escreves» dos prompts da IA do /solucoes. */
const ESCRITA: Record<Idioma, string> = {
  pt: 'Escreves em português de Portugal, a tratar por «tu», tom próximo e claro, sem jargão.',
  en: 'Escreves em inglês (British English), em segunda pessoa, tom próximo e claro, sem jargão.',
  de: 'Escreves em alemão, a tratar por «du», tom próximo e claro, sem jargão.',
  fr: 'Escreves em francês, a tratar por «tu», tom próximo e claro, sem jargão.',
  it: 'Escreves em italiano, a tratar por «tu», tom próximo e claro, sem jargão.',
}

export function instrucaoIdioma(idioma: Idioma = 'pt'): string {
  return ESCRITA[idioma]
}

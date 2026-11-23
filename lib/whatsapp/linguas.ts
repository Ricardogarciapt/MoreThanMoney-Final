/**
 * AS LÍNGUAS DO FUNIL DE WHATSAPP (23/11/2026) — PT, EN, FR, DE, ES.
 *
 * Pedido do Ricardo: «prepara os funis para usar os idiomas de outros países (FR, DE, EN, ES) conforme o
 * indicativo, com opção de escolher a linguagem com bandeiras para o lead mudar».
 *
 * A língua de partida sai do indicativo; a pessoa pode trocar a qualquer momento (lista de bandeiras).
 * Os países lusófonos ficam em português. Atenção: muitos contactos com indicativo estrangeiro são
 * emigrantes portugueses (Reino Unido, Suíça, Luxemburgo, França) — por isso a abertura nas outras
 * línguas leva sempre um botão «🇵🇹 Português».
 *
 * PURO: sem rede, sem base.
 */

export const LINGUAS = ['pt', 'en', 'fr', 'de', 'es'] as const
export type Lingua = (typeof LINGUAS)[number]

export const INFO_LINGUA: Record<Lingua, { bandeira: string; nome: string; codigoMeta: string }> = {
  pt: { bandeira: '🇵🇹', nome: 'Português', codigoMeta: 'pt_PT' },
  en: { bandeira: '🇬🇧', nome: 'English', codigoMeta: 'en' },
  fr: { bandeira: '🇫🇷', nome: 'Français', codigoMeta: 'fr' },
  de: { bandeira: '🇩🇪', nome: 'Deutsch', codigoMeta: 'de' },
  es: { bandeira: '🇪🇸', nome: 'Español', codigoMeta: 'es' },
}

export function ehLingua(v: unknown): v is Lingua {
  return typeof v === 'string' && (LINGUAS as readonly string[]).includes(v)
}

// Indicativos por língua. Os mais compridos primeiro (ex.: 352 antes de 35…).
const PREFIXOS: Array<[string, Lingua]> = [
  // Lusofonia
  ['351', 'pt'], ['244', 'pt'], ['238', 'pt'], ['258', 'pt'], ['245', 'pt'], ['239', 'pt'], ['670', 'pt'], ['853', 'pt'], ['55', 'pt'],
  // Francofonia
  ['352', 'fr'], ['377', 'fr'], ['221', 'fr'], ['225', 'fr'], ['237', 'fr'], ['212', 'fr'], ['213', 'fr'], ['216', 'fr'], ['33', 'fr'], ['32', 'fr'],
  // Língua alemã
  ['423', 'de'], ['49', 'de'], ['43', 'de'], ['41', 'de'],
  // Hispanofonia
  ['593', 'es'], ['591', 'es'], ['595', 'es'], ['598', 'es'], ['502', 'es'], ['503', 'es'], ['504', 'es'], ['505', 'es'], ['506', 'es'], ['507', 'es'],
  ['34', 'es'], ['52', 'es'], ['54', 'es'], ['56', 'es'], ['57', 'es'], ['58', 'es'], ['51', 'es'], ['53', 'es'],
]

/** Língua de partida pelo indicativo. Sem número ou país desconhecido: inglês (PT se for português). */
export function linguaDoIndicativo(telefone: string | null | undefined): Lingua {
  let d = String(telefone ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 9 && /^[29]/.test(d)) return 'pt' // número português sem indicativo
  for (const [p, l] of PREFIXOS) if (d.startsWith(p)) return l
  return d ? 'en' : 'pt'
}

/** Prefixo dos ids das linhas da lista de bandeiras: `lingua:fr`. */
export const ID_LINGUA = 'lingua:'

/** As linhas da lista de bandeiras (WhatsApp: título ≤ 24). */
export function linhasDeLinguas(): Array<{ id: string; titulo: string }> {
  return LINGUAS.map((l) => ({ id: `${ID_LINGUA}${l}`, titulo: `${INFO_LINGUA[l].bandeira} ${INFO_LINGUA[l].nome}` }))
}

/** Lê uma escolha de língua: id `lingua:xx`, título com bandeira, ou o nome da língua escrito. */
export function linguaEscolhida(v: string | null | undefined): Lingua | null {
  const t = String(v ?? '').trim()
  if (!t) return null
  if (t.startsWith(ID_LINGUA)) {
    const l = t.slice(ID_LINGUA.length)
    return ehLingua(l) ? l : null
  }
  for (const l of LINGUAS) {
    const i = INFO_LINGUA[l]
    if (t.includes(i.bandeira)) return l
    if (t.toLowerCase() === i.nome.toLowerCase()) return l
  }
  if (/^(portugu[eê]s|em portugu[eê]s)$/i.test(t)) return 'pt'
  if (/^(ingl[eê]s|in english)$/i.test(t)) return 'en'
  if (/^(fran[cç][eê]s|en fran[cç]ais)$/i.test(t)) return 'fr'
  if (/^(alem[aã]o|auf deutsch)$/i.test(t)) return 'de'
  if (/^(espanhol|en espa[nñ]ol)$/i.test(t)) return 'es'
  return null
}

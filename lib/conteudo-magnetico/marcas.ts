/**
 * As MARCAS (templates) do MTM Conteúdo Magnético.
 *
 * Duas marcas da casa, cada uma com a sua identidade, e uma terceira para quem não é a casa:
 *
 *   · ricardo-garcia — @ricardogarciapt. Fotografia por baixo, tipografia condensada enorme,
 *     ciano + branco, traço de pincel. É o estilo das capas que o Ricardo já publica
 *     (ver lib/social-card.tsx: CIANO #0097b2 foi medido no template real).
 *   · morethanmoney  — @morethanmoney.pt. Ouro sobre carvão (#D2A63C / #E9C46A), logótipo MTM.
 *   · propria        — a marca de um membro: o nome e a arroba dele, cor dele, sem logótipo da casa.
 *     Sem isto, um membro publicava com a assinatura da MTM conteúdo que não é da MTM.
 *
 * As duas da casa só as usam admins (o servidor decide em `marcasPermitidas`).
 */

export type IdMarca = 'ricardo-garcia' | 'morethanmoney' | 'propria'

export type Marca = {
  id: IdMarca
  nome: string
  arroba: string
  /** Cor do destaque (a palavra que «salta» e o traço). */
  destaque: string
  /** Segunda cor de destaque (gradiente do traço, CTA). */
  destaque2: string
  /** Texto principal. */
  texto: string
  /** Fundo quando não há fotografia. */
  fundo: string
  /** Fundo com gradiente (sem foto). */
  fundoGradiente: string
  /** Logótipo (caminho público do site) ou null. */
  logo: string | null
  /** Voz da marca, para o prompt. */
  voz: string
  /** Só admins. */
  daCasa: boolean
}

export const MARCAS: Record<IdMarca, Marca> = {
  'ricardo-garcia': {
    id: 'ricardo-garcia',
    nome: 'Ricardo Garcia',
    arroba: '@ricardogarciapt',
    destaque: '#0097b2',
    destaque2: '#29a8f0',
    texto: '#ffffff',
    fundo: '#0d1117',
    fundoGradiente: 'radial-gradient(900px 900px at 50% 30%, #12324a, #0b1220 55%, #06090f 100%)',
    logo: '/logo-mtm-transparent.png',
    voz:
      'Ricardo Garcia: ex-militar (GNR, Fuzileiros) que trocou 14 anos de «estar ocupado» por um método de trading com regras. ' +
      'Fala na primeira pessoa, directo, honesto, com história de vida e disciplina. PT-PT, «tu», frases curtas que batem.',
    daCasa: true,
  },
  morethanmoney: {
    id: 'morethanmoney',
    nome: 'More Than Money',
    arroba: '@morethanmoney.pt',
    destaque: '#D2A63C',
    destaque2: '#E9C46A',
    texto: '#ffffff',
    fundo: '#0b0d12',
    fundoGradiente: 'radial-gradient(900px 900px at 30% 20%, #2a2418, #0f0e0b 55%, #070707 100%)',
    logo: '/logo-mtm-transparent.png',
    voz:
      'More Than Money (marca): educação financeira e trading com método, tom científico e transparente, anti-pirâmide, ' +
      'dados e processo em vez de estilo de vida. PT-PT, «tu», próximo mas sério.',
    daCasa: true,
  },
  propria: {
    id: 'propria',
    nome: 'A tua marca',
    arroba: '@atuamarca',
    destaque: '#D2A63C',
    destaque2: '#E9C46A',
    texto: '#ffffff',
    fundo: '#101010',
    fundoGradiente: 'radial-gradient(900px 900px at 50% 25%, #252525, #0c0c0c 60%, #050505 100%)',
    logo: null,
    voz: 'Criador independente: autêntico, educativo, próximo. PT-PT, «tu».',
    daCasa: false,
  },
}

export function marcasPermitidas(admin: boolean): IdMarca[] {
  return (Object.keys(MARCAS) as IdMarca[]).filter((id) => admin || !MARCAS[id].daCasa)
}

const HEX = /^#[0-9a-f]{6}$/i

/** A marca final: a base + o que o membro personalizou na «propria» (nome, arroba, cor). */
export function resolverMarca(
  id: string,
  personal?: { nome?: string; arroba?: string; cor?: string } | null,
): Marca {
  const base = MARCAS[(id as IdMarca)] ?? MARCAS.propria
  if (base.id !== 'propria' || !personal) return base
  const nome = String(personal.nome || '').trim().slice(0, 40) || base.nome
  let arroba = String(personal.arroba || '').trim().slice(0, 40)
  if (arroba && !arroba.startsWith('@')) arroba = `@${arroba}`
  const cor = HEX.test(String(personal.cor || '')) ? String(personal.cor) : base.destaque
  return { ...base, nome, arroba: arroba || base.arroba, destaque: cor, destaque2: cor }
}

/** Formatos e as medidas de cada um (px). */
export const FORMATOS = {
  carrossel: { largura: 1080, altura: 1350, nome: 'Carrossel' },
  post: { largura: 1080, altura: 1350, nome: 'Publicação' },
  story: { largura: 1080, altura: 1920, nome: 'Story' },
  reel: { largura: 1080, altura: 1920, nome: 'Reel' },
} as const

export type Formato = keyof typeof FORMATOS

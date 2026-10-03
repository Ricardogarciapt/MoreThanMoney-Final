/**
 * OS PILARES PÚBLICOS — que áreas existem, quem as dá, e para que porta se manda quem clica.
 *
 * Alimenta `/mtmmarkets` e `/contentbussiness`, e tem de contar a mesma história que a `/mtm` e a
 * `/new-landing`. As regras abaixo não são gosto: são decisões do dono, de 28/09/2026.
 *
 * ═══ REGRA 1 · AS ÁREAS ESTÃO TODAS PRONTAS ════════════════════════════════════════════════
 *
 * Nada de «a abrir», «em preparação», «sem aulas próprias» ou contagens partidas. Todas as áreas
 * levam o MESMO cartão. As que têm sala ao vivo mostram quem a dá; as outras dizem como se
 * acompanham — «Percurso organizado · módulo a módulo · ao teu ritmo».
 *
 * A página a dizer o que falta estava a vender a casa a menos do que ela é.
 *
 * ═══ REGRA 2 · NÃO SE NOMEIA A PLATAFORMA ══════════════════════════════════════════════════
 *
 * Os cursos das áreas sem sala ao vivo vivem numa plataforma de terceiros, e o nome dela não
 * aparece em lado nenhum destas páginas. A fórmula é a de cima, e está escrita uma vez só.
 */

/** A frase, escrita uma vez. Se aparecer um segundo sítio a escrevê-la à mão, divergem. */
export const PERCURSO_ORGANIZADO = 'Percurso organizado · módulo a módulo · ao teu ritmo'

export type PilarId = 'markets' | 'content'

export interface Pilar {
  id: PilarId
  href: string
  nome: string
  /** A definição que o dono escreveu. Não se parafraseia. */
  definicao: string
  /** O que este pilar tem além das aulas. Factos, não promessas. */
  mais: string[]
}

export const PILARES: Record<PilarId, Pilar> = {
  markets: {
    id: 'markets',
    href: '/mtmmarkets',
    nome: 'MTM Markets',
    definicao:
      'Os mercados e o dinheiro: aprender a operá-los, e as ferramentas que os operam por ti quando não podes estar.',
    mais: [
      'Sinais e Tap to Trade', 'MTM Copy', 'Quatro scanners', 'Terminal com IA',
      'Portefólios e DCA', 'Alertas MTM', 'MTM Auto', 'MTM Funded', 'Certificação',
    ],
  },
  content: {
    id: 'content',
    href: '/contentbussiness',
    nome: 'MTM Content & Business',
    definicao:
      'Construir audiência e construir negócio: marca pessoal, conteúdo, e as formas de ganhar aqui sem abrir uma ordem.',
    mais: [
      'Programa de criadores', 'Convida e ganha', 'Parceria IB',
      'Material de marketing', 'Vagas na equipa', 'Estúdio MTM Social (na app)',
    ],
  },
}

export interface Area {
  pilar: PilarId
  /** O nome público da área. */
  titulo: string
  /** Os slugs das academias que a sustentam. Vazio = a área não tem academia na base. */
  academias: string[]
  descricao: string
}

/**
 * AS ÁREAS, pela ordem em que se mostram.
 *
 * A lista é escrita à mão e não lida da base de propósito: `lms_academies` tem entradas de
 * serviço («Academia», «Introdução») que nunca foram áreas públicas, e uma página que se gerasse
 * sozinha a partir da tabela punha-as na montra ao lado do Forex. O que VEM da base é quem as dá
 * e que salas têm — isso sim muda sem ninguém mexer no código, que é o que se quer para os
 * educadores que ainda hão-de chegar.
 */
export const AREAS: Area[] = [
  {
    pilar: 'markets', titulo: 'Forex e metais', academias: ['forex'],
    descricao:
      'Regressão de tendências e scanners, ao vivo. É a divisão mais cheia da casa: das salas básicas à mentoria, e gravações organizadas em curso para quem falta.',
  },
  {
    pilar: 'markets', titulo: 'Criptomoedas', academias: ['criptomoedas'],
    descricao:
      'Salas próprias ligadas aos portefólios e à análise de reforço mensal que corre no site — do DCA ao acompanhamento ao vivo.',
  },
  {
    pilar: 'markets', titulo: 'Ações e ETF', academias: [],
    descricao:
      'A carteira de ETF a preço ao vivo, ações para analisares no Terminal com IA, e a leitura diária de onde vale a pena reforçar.',
  },
  {
    pilar: 'markets', titulo: 'Imobiliário', academias: ['imobiliario'],
    descricao:
      'Comprar, arrendar e viver de rendas: avaliar o negócio, tratar do financiamento e montar a carteira sem ficar preso a ela.',
  },
  {
    pilar: 'content', titulo: 'Social Media e UGC', academias: ['social-media'],
    descricao:
      'Marca pessoal e conteúdo: como começar nas redes e como produzir. Tens ainda o estúdio MTM Social para fazeres as tuas peças com a tua marca.',
  },
  {
    pilar: 'content', titulo: 'Faceless Marketing', academias: ['faceless-marketing'],
    descricao:
      'Construir e vender sem mostrar a cara. Marca, conteúdo e vendas para quem não quer — ou não pode — expor-se.',
  },
  {
    pilar: 'content', titulo: 'Mindset e Liderança', academias: ['mindset'],
    descricao: 'A cabeça, a disciplina e a forma de conduzir pessoas — e esta abre-se sem pagar nada.',
  },
  {
    pilar: 'content', titulo: 'Inteligência Artificial', academias: ['ia'],
    descricao:
      'Pôr a IA a trabalhar no teu negócio: automatizar o que se repete, produzir conteúdo e devolver-te as horas.',
  },
  {
    pilar: 'content', titulo: 'Network Marketing', academias: ['network-marketing'],
    descricao: 'Prospetar, comunicar e fazer crescer uma equipa — do primeiro contacto à duplicação.',
  },
]

export function areasDoPilar(pilar: PilarId): Area[] {
  return AREAS.filter((a) => a.pilar === pilar)
}

// ── A SALA PARA ONDE SE MANDA QUEM CLICA ─────────────────────────────────────────────────────

export interface SalaPublica {
  id: string
  title: string
  access_tier?: string | null
  academy_slug?: string | null
  educator_id?: string | null
}

/**
 * Quão ABERTA é uma sala. Menor = mais aberta.
 *
 * `free` é a única que se vê sem conta nenhuma (ver `podeVerReproducaoDaSala`). As outras exigem
 * perfil, e `vip` exige o direito mais forte da casa.
 */
const ABERTURA: Record<string, number> = { free: 0, all: 1, app_member: 2, premium: 3, vip: 4 }

export function aberturaDe(tier: string | null | undefined): number {
  return ABERTURA[String(tier ?? '').trim().toLowerCase()] ?? 5
}

/**
 * A SALA QUE O BOTÃO «Ir para a sala» DEVE ABRIR.
 *
 * ═══ O ERRO QUE ISTO EXISTE PARA TRAVAR ════════════════════════════════════════════════════
 *
 * Um educador pode ter várias salas. O Ricardo tem quatro, e duas delas são VIP. A escolha ingénua
 * — a primeira da lista, ou a mais recente — manda um visitante que nunca nos viu para a «Mentoria
 * VIP», onde ele bate num cadeado logo no primeiro clique da página de apresentação.
 *
 * Não dá erro nenhum. A pessoa só conclui que isto não é para ela, e vai-se embora. Por isso
 * escolhe-se sempre a sala MAIS ABERTA, e só se desempata pelo nome para a ligação não mudar
 * sozinha quando alguém acrescenta uma sala.
 */
export function salaDeEntrada(salas: SalaPublica[]): SalaPublica | null {
  const validas = salas.filter((s) => s?.id)
  if (!validas.length) return null
  return [...validas].sort((a, b) => {
    const d = aberturaDe(a.access_tier) - aberturaDe(b.access_tier)
    if (d !== 0) return d
    return String(a.title ?? '').localeCompare(String(b.title ?? ''), 'pt')
  })[0]
}

/** O caminho da sala. Um sítio só, para nenhum ecrã inventar outro formato. */
export function hrefDaSala(sala: { id: string } | null | undefined): string | null {
  const id = String(sala?.id ?? '').trim()
  return id ? `/live-sessions/${id}` : null
}

// ── COMO SE ACOMPANHA ESTA ÁREA ──────────────────────────────────────────────────────────────

export interface EducadorPublico {
  id: string
  display_name: string
  specialty?: string | null
  avatar_url?: string | null
}

export interface AreaMontada {
  area: Area
  /** Os educadores desta área, já com a sala de entrada escolhida. */
  educadores: Array<{ educador: EducadorPublico; salas: SalaPublica[]; href: string | null }>
  /** A primeira linha do cartão. Nunca diz o que falta. */
  comoSeAcompanha: string
}

/**
 * Monta uma área com quem a dá.
 *
 * Quando não há educador, a linha NÃO diz «sem educador» nem «a abrir» — diz como se acompanha.
 * É a regra 1 em código, e é o sítio onde ela se perde se alguém escrever um `?? 'em breve'`.
 */
export function montarArea(
  area: Area,
  educadores: EducadorPublico[],
  salasPorEducador: Record<string, SalaPublica[]>,
): AreaMontada {
  const comEducador = educadores.map((educador) => {
    const salas = salasPorEducador[educador.id] ?? []
    return { educador, salas, href: hrefDaSala(salaDeEntrada(salas)) }
  })
  return {
    area,
    educadores: comEducador,
    comoSeAcompanha: comEducador.length
      ? comEducador.map((e) => e.educador.display_name).join(' · ')
      : PERCURSO_ORGANIZADO,
  }
}

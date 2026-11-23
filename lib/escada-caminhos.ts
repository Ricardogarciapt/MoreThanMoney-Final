/**
 * Os CAMINHOS da escada — a única fonte do «passo seguinte» que cada canal oferece a um lead.
 *
 * Os preços vivem em `escada-precos.ts`. Este ficheiro guarda o resto: por que porta entra cada
 * pessoa, que degrau vem a seguir, e as frases honestas do trial.
 *
 * Porque existe (23/11/2026, estudo da escada): o passo seguinte estava escrito à mão em seis
 * sítios, e cada um dizia outra coisa — o Telegram «não lideres com o grátis, começa no Membro»,
 * o closer das DMs «começa pelo Premium 3 dias sem cartão», os freebies «Premium e depois Membro»,
 * o GoldKiller «30 dias e depois Membro», o follow-up «Membro e depois corretora». O mesmo lead,
 * em dois canais, recebia duas escadas. E a frase «sem cartão» ficou nas páginas depois de o trial
 * passar a pedir o cartão (16/11, `TRIAL_PEDE_CARTAO`): quem chega ao checkout e vê o pedido do
 * cartão sente-se enganado e sai — no único passo em que já tinha decidido experimentar.
 *
 * Regra: um guião novo importa daqui. Não escreve o caminho à mão.
 */
import { BOOTCAMP_HREF, ENTRADA_LER_EUR, ENTRADA_PRATICAR_EUR, MENTORIA_HREF, SLUG_ENTRADA_PRATICAR, MIN_DEPOSIT, NOME_DEGRAU_TOPO, PRECO_BOOTCAMP, PRECO_MEMBRO, PRECO_MENTORIA, PRECO_PREMIUM, PRECO_PREMIUM_1O_MES, PRECO_TOPO } from '@/lib/escada-precos'
import { DIAS_TRIAL_PREMIUM, TRIAL_PEDE_CARTAO } from '@/lib/stripe-checkout-premium'

// ───────────────────────── o trial, dito com verdade ─────────────────────────

/** «3 dias grátis» + a condição real do cartão. Curto, para botões e títulos. */
export const TRIAL_CURTO = TRIAL_PEDE_CARTAO
  ? `${DIAS_TRIAL_PREMIUM} dias grátis, cancelas quando quiseres`
  : `${DIAS_TRIAL_PREMIUM} dias grátis, sem cartão`

/** A condição completa, para corpo de texto, FAQ e prompts. */
export const TRIAL_CONDICAO = TRIAL_PEDE_CARTAO
  ? `${DIAS_TRIAL_PREMIUM} dias grátis: pedimos o cartão à entrada, não cobramos nada nesses ${DIAS_TRIAL_PREMIUM} dias, avisamos-te por email na véspera e cancelas com um clique`
  : `${DIAS_TRIAL_PREMIUM} dias grátis, sem cartão`

// ───────────────────────── perfis (as três portas) ─────────────────────────

/**
 * Quem é o lead, pelo que quer — não pelo canal de onde veio.
 *  • aprender     — começa do zero ou já perdeu dinheiro; quer método antes de arriscar.
 *  • ferramentas  — já opera; quer scanners e alertas para o próprio trading.
 *  • capital      — tem o depósito mínimo e quer operar a sério, com acompanhamento.
 */
export type PerfilLead = 'aprender' | 'ferramentas' | 'capital'

export const PERFIS: readonly PerfilLead[] = ['aprender', 'ferramentas', 'capital']

/** Uma porta: o que se diz e para onde se manda. `href` é sempre relativo ao site. */
export interface Porta {
  chave: string
  titulo: string
  texto: string
  href: string
  /** pago | grátis — para a guarda provar que o primeiro passo pago existe em todos os perfis. */
  tipo: 'gratis' | 'pago' | 'corretora'
  /** A porta a oferecer quando a pessoa recusa esta (ex.: não quer pôr cartão no trial → Membro). */
  alternativa?: string
}

const PORTAS = {
  iman_aprender: {
    chave: 'iman_aprender',
    titulo: 'O Primeiro Passo (guia grátis)',
    texto: 'O guia para quem nunca investiu: o que é o mercado, o risco e por onde começar.',
    href: '/ebooks/o-primeiro-passo#gratis',
    tipo: 'gratis',
  },
  iman_ferramentas: {
    chave: 'iman_ferramentas',
    titulo: 'GoldKiller 30 dias grátis',
    texto: 'O scanner de ouro no teu TradingView durante 30 dias, com o guia passo a passo.',
    href: '/gratis/goldkiller',
    tipo: 'gratis',
  },
  iman_capital: {
    chave: 'iman_capital',
    titulo: 'Como funciona a Rota Corretora',
    texto: 'Conta em teu nome numa corretora regulada; o dinheiro é sempre teu.',
    href: '/onboarding/mtm',
    tipo: 'gratis',
  },
  entrada_ler: {
    chave: 'entrada_ler',
    titulo: `«O Método Frio» + 7 dias comigo · ${ENTRADA_LER_EUR} €`,
    texto: 'O e-book do método e uma semana de acompanhamento com o Ricardo. Pagamento único, sem mensalidade.',
    href: '/ebooks/o-metodo-frio',
    tipo: 'pago',
  },
  entrada_praticar: {
    chave: 'entrada_praticar',
    titulo: `Desafio MTM Funded Launch 10K · ${ENTRADA_PRATICAR_EUR} €`,
    texto: 'Praticas com regras reais numa conta SIMULADA de 10K, sem arriscar o teu dinheiro. Pagamento único, um por pessoa.',
    href: `/mtmfunded/checkout?programa=${SLUG_ENTRADA_PRATICAR}`,
    tipo: 'pago',
  },
  membro: {
    chave: 'membro',
    titulo: `Membro · ${PRECO_MEMBRO}`,
    texto: 'A versão leve do Premium: aulas ao vivo, academias e as estratégias base. Cancelas quando quiseres.',
    href: '/upgrade?plan=app_member_monthly',
    tipo: 'pago',
    alternativa: 'entrada_ler',
  },
  pack_scanners: {
    chave: 'pack_scanners',
    titulo: `Pack de Scanners · ${PRECO_MEMBRO}`,
    texto: 'Todos os scanners MTM no teu TradingView, incluindo o GoldKiller e o Sensei.',
    href: '/scanner',
    tipo: 'pago',
  },
  premium: {
    chave: 'premium',
    titulo: `Premium · ${PRECO_PREMIUM}`,
    texto: `Scanners, Trading Alerts, Tap to Trade, salas Premium e a comunidade privada. ${TRIAL_CURTO}, ou o 1.º mês a ${PRECO_PREMIUM_1O_MES}.`,
    href: '/register?plan=premium',
    tipo: 'pago',
    alternativa: 'membro',
  },
  corretora: {
    chave: 'corretora',
    titulo: 'Rota Corretora (PU Prime)',
    texto: `Abres conta em teu nome e depositas no mínimo ${MIN_DEPOSIT} $. Enquanto estiver financiada, o Premium e o MTM Auto ficam incluídos.`,
    href: '/abrir-conta',
    tipo: 'corretora',
    alternativa: 'entrada_praticar',
  },
  bootcamp: {
    chave: 'bootcamp',
    titulo: `Bootcamp de Trading completo · ${PRECO_BOOTCAMP}`,
    texto: 'O curso completo, módulo a módulo, com avaliação final e certificado. Compra única, fica teu; não está incluído no Premium.',
    href: BOOTCAMP_HREF,
    tipo: 'pago',
  },
  mentoria: {
    chave: 'mentoria',
    titulo: `Mentoria Privada MTM · ${PRECO_MENTORIA}`,
    texto: 'O Método MTM com acompanhamento pessoal do Ricardo, em privado. Começa por uma chamada para ver se faz sentido para ti.',
    href: MENTORIA_HREF,
    tipo: 'pago',
  },
  topo: {
    chave: 'topo',
    titulo: `${NOME_DEGRAU_TOPO} · ${PRECO_TOPO}`,
    texto: 'O Premium pago ao ano, com estatuto VIP. Para quem já está dentro e quer ficar.',
    href: '/upgrade',
    tipo: 'pago',
  },
} as const satisfies Record<string, Porta>

export type ChavePorta = keyof typeof PORTAS

/**
 * Cada perfil tem UMA sequência. O índice 0 é o íman; o 1 é o primeiro passo pago.
 *
 * 23/11/2026, à noite — a escada do Ricardo: grátis → Premium 65 €/mês (com a comunidade privada)
 * → Bootcamp de Trading completo 310 € (compra única) → Mentoria Privada MTM 2.000 €.
 * Os degraus baratos da manhã (Método Frio 5 €, Desafio simulado 10 €) e o Membro 35 € ficam como
 * ALTERNATIVA para quem recusa a mensalidade, nunca como caminho principal.
 *  • aprender    — guia grátis → Premium (recusa: Membro → Método Frio) → Bootcamp → Mentoria.
 *  • ferramentas — GoldKiller 30 dias → Premium (recusa: Membro) → Bootcamp → Mentoria.
 *  • capital     — como funciona → Rota Corretora, que já traz o Premium (hesita: Desafio simulado) → Bootcamp → Mentoria.
 * O público virtual (MiroFish) corre em paralelo para afinar; muda-se AQUI.
 */
export const CAMINHO_DO_PERFIL: Readonly<Record<PerfilLead, readonly ChavePorta[]>> = Object.freeze({
  aprender: ['iman_aprender', 'premium', 'bootcamp', 'mentoria'],
  ferramentas: ['iman_ferramentas', 'premium', 'bootcamp', 'mentoria'],
  capital: ['iman_capital', 'corretora', 'bootcamp', 'mentoria'],
})

/**
 * O que cada patamar ABRE — a divisão de acessos por preço. A página /caminho desenha-a e o
 * trabalho da comunidade usa a mesma lista para dividir os cursos. Acima do grátis, cada curso
 * pertence a um patamar e só a um.
 */
export interface Patamar {
  chave: 'gratis' | 'premium' | 'bootcamp' | 'mentoria'
  nome: string
  preco: string
  inclui: readonly string[]
  href: string
}

export const PATAMARES: readonly Patamar[] = [
  {
    chave: 'gratis',
    nome: 'Grátis',
    preco: '0 €',
    inclui: ['Guias grátis (O Primeiro Passo, Plano de 3 Passos, Guia dos Scanners)', 'GoldKiller 30 dias', 'Aulas e vídeos abertos', 'Comunidade aberta'],
    href: '/gratis',
  },
  {
    chave: 'premium',
    nome: 'Premium',
    preco: PRECO_PREMIUM,
    inclui: ['Tudo do grátis', 'Scanners MTM no TradingView', 'Trading Alerts e Tap to Trade', 'Salas Premium e aulas ao vivo', 'Comunidade privada e os cursos de cada scanner'],
    href: '/register?plan=premium',
  },
  {
    chave: 'bootcamp',
    nome: 'Bootcamp de Trading',
    preco: PRECO_BOOTCAMP,
    inclui: ['O curso completo, módulo a módulo', 'Avaliação final e certificado verificável', 'Compra única, fica teu', 'Não está incluído no Premium'],
    href: BOOTCAMP_HREF,
  },
  {
    chave: 'mentoria',
    nome: 'Mentoria Privada MTM',
    preco: PRECO_MENTORIA,
    inclui: ['O Método MTM completo', 'Acompanhamento pessoal do Ricardo, em privado', 'Formato e calendário combinados na chamada'],
    href: MENTORIA_HREF,
  },
]

export function porta(chave: ChavePorta): Porta {
  return PORTAS[chave]
}

// ───────────────────────── o passo seguinte ─────────────────────────

/** O que se sabe do lead. Tudo opcional: o que não se sabe conta como «ainda não». */
export interface EstadoNaEscada {
  recebeuIman?: boolean
  /** Já comprou um degrau de entrada (Método Frio pago ou Desafio Launch). */
  comprouEntrada?: boolean
  ehMembro?: boolean
  temPackScanners?: boolean
  ehPremium?: boolean
  depositoValidado?: boolean
  ehTopo?: boolean
  comprouBootcamp?: boolean
  ehMentorado?: boolean
}

function jaTem(chave: ChavePorta, e: EstadoNaEscada): boolean {
  switch (chave) {
    case 'iman_aprender':
    case 'iman_ferramentas':
    case 'iman_capital':
      return !!e.recebeuIman
    case 'entrada_ler':
    case 'entrada_praticar':
      return !!(e.comprouEntrada || e.ehMembro || e.temPackScanners || e.ehPremium || e.depositoValidado || e.ehTopo)
    case 'membro':
      return !!(e.ehMembro || e.ehPremium || e.depositoValidado || e.ehTopo)
    case 'pack_scanners':
      return !!(e.temPackScanners || e.ehPremium || e.depositoValidado || e.ehTopo)
    case 'premium':
      return !!(e.ehPremium || e.depositoValidado || e.ehTopo)
    case 'corretora':
      return !!e.depositoValidado
    case 'topo':
      return !!e.ehTopo
    case 'bootcamp':
      return !!(e.comprouBootcamp || e.ehMentorado)
    case 'mentoria':
      return !!e.ehMentorado
  }
}

/**
 * O próximo degrau que o lead ainda não deu, no caminho do seu perfil.
 * Perfil desconhecido → `aprender` (é a porta mais larga e a que não pede capital).
 * Devolve `null` quando já subiu tudo.
 *
 * Função pura: o guião do WhatsApp, o closer das DMs, o funil do Telegram e os emails chamam-na.
 */
export function passoSeguinte(perfil: PerfilLead | null | undefined, estado: EstadoNaEscada = {}): Porta | null {
  const caminho = CAMINHO_DO_PERFIL[perfil ?? 'aprender'] ?? CAMINHO_DO_PERFIL.aprender
  for (const chave of caminho) if (!jaTem(chave, estado)) return PORTAS[chave]
  return null
}

/**
 * Lê o perfil a partir do interesse que o CRM já guarda (`vendas_negocios.interesse`) ou de
 * palavras do próprio lead. Não adivinha: sem sinal claro devolve `null`.
 */
export function perfilDoInteresse(interesse: string | null | undefined): PerfilLead | null {
  const t = (interesse || '').toLowerCase()
  if (!t) return null
  if (/corretora|broker|pu ?prime|capital|deposit|ib\b|conta real/.test(t)) return 'capital'
  if (/scanner|indicador|tradingview|goldkiller|ferrament|alerta/.test(t)) return 'ferramentas'
  if (/forma|aprend|curso|educa|iniciante|zero|ebook|guia/.test(t)) return 'aprender'
  return null
}

// ───────────────────────── para os prompts das IAs ─────────────────────────

/**
 * O caminho por perfil, em texto, para colar nos prompts dos closers. Uma porta por mensagem,
 * nunca duas; o grátis só abre a conversa, nunca a fecha.
 */
export function caminhosNumaLinha(): string {
  const nome = (c: ChavePorta) => {
    const pt: Porta = PORTAS[c]
    const alt = pt.alternativa ? PORTAS[pt.alternativa as ChavePorta] : undefined
    return alt ? `${pt.titulo} (se recusar: ${alt.titulo})` : pt.titulo
  }
  const linha = (p: PerfilLead) => CAMINHO_DO_PERFIL[p].map(nome).join(' → ')
  return (
    `CAMINHOS POR PERFIL (uma porta por mensagem; descobre o perfil antes de mandar link): ` +
    `[aprender, começa do zero ou já perdeu] ${linha('aprender')} · ` +
    `[ferramentas, já opera] ${linha('ferramentas')} · ` +
    `[capital, tem ${MIN_DEPOSIT} $ e quer operar a sério] ${linha('capital')}. ` +
    `Trial do Premium: ${TRIAL_CONDICAO}. Nunca digas «sem cartão» sobre o trial do Premium se ele pedir cartão. ` +
    `Os degraus de 5 € e 10 € existem SÓ no site: dentro da comunidade privada salta-se do grátis para o Premium (decisão do Ricardo, 23/11).`
  )
}

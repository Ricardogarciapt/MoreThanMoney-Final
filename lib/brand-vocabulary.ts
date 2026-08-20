/**
 * VOCABULÁRIO DA MARCA — nomes, preços e descrições dos produtos, num sítio só.
 *
 * As páginas públicas tinham derivado umas das outras: o mesmo pack chamava-se "Pack Membro" na
 * landing, "Pack Membro App" na apresentação e "Membro" no /upgrade; o pack de scanners aparecia
 * ora como "Pack Scanners" ora como "Pack Total"; e o scanner chamava-se "Sensei X" nuns sítios e
 * "Sensei" noutros. Quem vê duas páginas nossas seguidas via nomes diferentes para a mesma coisa.
 *
 * Os preços aqui têm de bater com os planos do Stripe (lib/stripe-prices.ts) — é isso que o
 * cliente paga. Mudar um preço numa página sem mudar aqui volta a criar a divergência.
 */

export interface Pack {
  /** planId do Stripe — a ligação ao que é cobrado. */
  planId: string
  nome: string
  preco: string
  periodo: string
  /** Uma linha: para quem é e o que resolve. */
  linha: string
}

/** Os quatro packs de subscrição. */
export const PACKS: Record<'membro' | 'premium' | 'fundador' | 'scanners', Pack> = {
  membro: {
    planId: 'app_member_monthly',
    nome: 'Pack Membro',
    preco: '35€',
    periodo: '/mês',
    linha: 'App completa, sessões ao vivo, formação e comunidade.',
  },
  premium: {
    planId: 'premium_monthly',
    nome: 'Pack Premium',
    preco: '65€',
    periodo: '/mês',
    linha: 'Tudo do Membro mais os sinais Premium, os scanners e o Tap to Trade.',
  },
  fundador: {
    planId: 'elite_annual',
    nome: 'Pack Fundador',
    preco: '597€',
    periodo: '/ano',
    linha: 'Um ano de Premium com o preço travado, scanners vitalícios e produtos PAMM.',
  },
  scanners: {
    planId: 'scanners_monthly',
    nome: 'Pack Scanners',
    preco: '35€',
    periodo: '/mês',
    linha: 'Todos os scanners no TradingView, sem a app nem os sinais.',
  },
}

/**
 * Nomes canónicos dos scanners. O sufixo "X" do Sensei foi retirado — o nome do produto é Sensei
 * (correção pedida pelo Ricardo); "Sensei X" ficou só onde descreve a versão interna do indicador.
 */
export const SCANNERS = {
  sensei: { nome: 'Sensei', linha: 'Multi-confluência com validação de entrada.' },
  goldkiller: { nome: 'GoldKiller', linha: 'Ouro, com gestão automática até ao alvo.' },
  aurum: { nome: 'Aurum Flow', linha: 'Rutura de intervalo em ouro e perpétuos.' },
  mtmscanner: { nome: 'MTM Scanner', linha: 'Forex e índices, o mais rentável da casa.' },
} as const

/** Funcionalidades, com o nome exato a usar em qualquer página. */
export const FUNCIONALIDADES = {
  mtmCopy: {
    nome: 'MTM Copy',
    linha: 'As nossas estratégias copiam para a tua conta, com o teu risco e os teus lotes.',
  },
  tapToTrade: {
    nome: 'Tap to Trade',
    linha: 'Aceitas um sinal com um toque e ele abre na tua conta, gerido até ao fim.',
  },
  sessoes: {
    nome: 'Sessões ao vivo',
    linha: 'Educadores em direto, com legendas traduzidas e as gravações organizadas em cursos.',
  },
  certificacao: {
    nome: 'Certificação',
    linha: 'Fast Start, Validação do Bootcamp (30 horas) e Teste Final — Junior Trader.',
  },
} as const

/** Como nos apresentamos numa linha. Usar o mesmo em todas as páginas. */
export const POSICIONAMENTO =
  'A casa onde a formação, os sinais, a execução e a certificação vivem no mesmo sítio — e todos construídos por nós.'

/** Aviso de risco. Obrigatório em qualquer página que mostre resultados. */
export const AVISO_RISCO =
  'O trading envolve risco. Resultados passados não garantem resultados futuros.'

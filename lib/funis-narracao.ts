/**
 * NARRAÇÃO E DEMO DAS PÁGINAS QUE OS AGENTES ENVIAM (23/11/2026, pedido do Ricardo).
 *
 * «As páginas que os agentes enviam, se forem específicas do agente (/f/educacao?ag=AG-CLOSER),
 * devem ter uma pequena narração e demo do segmento que está a fechar ou a vender. Não podem ser
 * meramente estáticas.»
 *
 * Quem chega por um link de agente (`?ag=`) ou por um canal da máquina (`utm_source` = whatsapp,
 * telegram, instagram, email) vê, no topo de /f/<funil>, uma demo da app que passa cena a cena e
 * ouve o Ricardo (voz clone, `lib/voz`) a explicá-la em ~40 s. O segmento sai de `utm_campaign`
 * (os links do funil de WhatsApp passam por /w/<código> e trazem-no) ou, sem ele, do funil.
 *
 * Regras de sempre: nada de números de desempenho, nada de promessas, aviso educativo, PT-PT.
 * O áudio gera-se uma vez por texto (cache no storage `lms-tts`) em /api/narracao.
 */
import { AG } from '@/lib/agentes/codigos'
import type { FunilPublicidade } from '@/lib/funis-publicidade'

export type Cena = {
  /** Imagem real da app (nunca IA de pessoas). */
  imagem: string
  /** Legenda curta por cima do ecrã. */
  legenda: string
  /** O que o Ricardo diz enquanto esta cena está no ecrã. */
  fala: string
}

export type Segmento = {
  chave: string
  titulo: string
  cenas: Cena[]
  /** Fecho falado e botão. */
  fecho: string
}

const APP = '/images/apresentacao'

export const SEGMENTOS = {
  educacao: {
    chave: 'educacao',
    titulo: 'Aprender com método, dentro da app',
    cenas: [
      { imagem: `${APP}/app-aulas.jpg`, legenda: 'Aulas e bootcamps', fala: 'Aqui começas pelas aulas: do primeiro gráfico à gestão de risco, ao teu ritmo e em português.' },
      { imagem: `${APP}/app-scanner.jpg`, legenda: 'Scanners com a lógica à vista', fala: 'Depois vês os scanners a trabalhar, e percebes porque aparece cada ideia, não só o quê.' },
      { imagem: `${APP}/app-chat.jpg`, legenda: 'Comunidade e sessões ao vivo', fala: 'E não ficas sozinho: há comunidade e sessões ao vivo para tirares dúvidas.' },
    ],
    fecho: 'Experimenta o Premium três dias, sem cartão, e decide com calma.',
  },
  premium: {
    chave: 'premium',
    titulo: 'O Premium por dentro',
    cenas: [
      { imagem: `${APP}/app-feed.jpg`, legenda: 'Ideias com entrada, stop e alvos', fala: 'No Premium recebes as ideias com entrada, stop e alvos, acompanhadas até fechar e medidas em pips.' },
      { imagem: `${APP}/app-alertas.jpg`, legenda: 'Alertas no telemóvel', fala: 'Os alertas chegam ao telemóvel, e com um toque abres a ideia toda.' },
      { imagem: `${APP}/app-aulas.jpg`, legenda: 'Bootcamps e sessões', fala: 'E tens os bootcamps de cada estratégia para perceberes o que estás a seguir.' },
    ],
    fecho: 'São três dias grátis, sem cartão. Nada se renova sem tu quereres.',
  },
  membro: {
    chave: 'membro',
    titulo: 'Ser Membro MoreThanMoney',
    cenas: [
      { imagem: `${APP}/app-feed.jpg`, legenda: 'A app, as ideias e o feed', fala: 'Como Membro tens a app completa: o feed de ideias, acompanhadas até fecharem.' },
      { imagem: `${APP}/app-webtrader.jpg`, legenda: 'WebTrader para treinar', fala: 'Treinas no WebTrader, em conta simulada, antes de arriscares dinheiro teu.' },
      { imagem: `${APP}/app-chat.jpg`, legenda: 'Sessões ao vivo e comunidade', fala: 'E estás nas sessões ao vivo e na comunidade, com quem está no mesmo caminho.' },
    ],
    fecho: 'Se preferires, experimenta primeiro o Premium três dias, sem cartão.',
  },
  corretora: {
    chave: 'corretora',
    titulo: 'Rota Corretora: a conta é tua',
    cenas: [
      { imagem: '/videos/stories/corretora-pt-capa.jpg', legenda: 'Conta numa corretora regulada', fala: 'Abres conta numa corretora regulada, pelo nosso link. A conta e o dinheiro ficam sempre em teu nome.' },
      { imagem: `${APP}/app-feed.jpg`, legenda: 'Premium incluído', fala: 'Enquanto a conta estiver financiada, o Premium da MoreThanMoney fica incluído.' },
      { imagem: `${APP}/app-aulas.jpg`, legenda: 'Passo a passo connosco', fala: 'E a equipa acompanha-te passo a passo: abrir, validar e começar em demo.' },
    ],
    fecho: 'Deixa o contacto e mandamos-te o passo a passo. Decides tu.',
  },
  funded: {
    chave: 'funded',
    titulo: 'MTM Funded: desafios em conta simulada',
    cenas: [
      { imagem: `${APP}/app-webtrader.jpg`, legenda: 'Conta simulada, regras claras', fala: 'No MTM Funded fazes desafios em conta simulada, com regras claras e escritas.' },
      { imagem: `${APP}/app-scanner.jpg`, legenda: 'As tuas operações, medidas', fala: 'Cada operação fica medida, para veres a tua disciplina com números verdadeiros.' },
      { imagem: `${APP}/app-chat.jpg`, legenda: 'Patrocínio de desempenho', fala: 'Quem cumpre as regras pode ganhar o patrocínio de desempenho para abrir conta própria. Não somos uma prop firm.' },
    ],
    fecho: 'Vê os desafios e começa quando estiveres pronto.',
  },
  goldkiller: {
    chave: 'goldkiller',
    titulo: 'O GoldKiller 30 dias grátis',
    cenas: [
      { imagem: '/scanners/gold-killer/render-1.jpg', legenda: 'O scanner no teu TradingView', fala: 'O GoldKiller fica trinta dias no teu TradingView, grátis, com o cupão FREEBIE.' },
      { imagem: '/scanners/gold-killer/render-2.jpg', legenda: 'Viragem e níveis', fala: 'Mostra a tendência, a viragem e os níveis do ouro, e o guia explica-te cada sinal.' },
      { imagem: '/scanners/gold-killer/render-3.jpg', legenda: 'Do sinal à operação', fala: 'Treinas primeiro em demo, com o plano de trinta dias e os vídeos do bootcamp.' },
    ],
    fecho: 'Pede o acesso grátis. Um scanner ajuda a ler, não garante resultados.',
  },
} as const satisfies Record<string, Segmento>

export type ChaveSegmento = keyof typeof SEGMENTOS

const DO_FUNIL: Record<FunilPublicidade, ChaveSegmento> = { educacao: 'educacao', corretora: 'corretora', funded: 'funded' }

/** Segmento pela campanha (`utm_campaign`, por palavra) ou, sem campanha conhecida, pelo funil. */
export function segmentoDe(funil: FunilPublicidade, campanha?: string | null): ChaveSegmento {
  const c = String(campanha ?? '').toLowerCase()
  const regras: [RegExp, ChaveSegmento][] = [
    [/gold ?killer|freebie|scanner/, 'goldkiller'],
    [/funded|desafio/, 'funded'],
    [/corretora|broker|pu-?prime|ib\b/, 'corretora'],
    [/membro|member/, 'membro'],
    [/premium|trial|sinais|copy/, 'premium'],
    [/educa|aprender|curso|bootcamp/, 'educacao'],
  ]
  for (const [re, s] of regras) if (re.test(c)) return s
  return DO_FUNIL[funil]
}

/** Abertura conforme quem mandou o link. */
export function aberturaDo(ag?: string | null): string {
  switch (String(ag ?? '').toUpperCase()) {
    case AG.CLOSER: return 'Olá, sou o Ricardo. Como falámos, mostro-te em meio minuto como isto funciona por dentro.'
    case AG.SETTER: return 'Olá, sou o Ricardo. Antes de falarmos, vê em meio minuto como isto funciona.'
    case AG.FORMACAO: return 'Olá, sou o Ricardo. Já que pediste no Telegram, aqui tens como funciona.'
    default: return 'Olá, sou o Ricardo. Em meio minuto mostro-te como isto funciona por dentro.'
  }
}

/** Canais da máquina que mostram a demo narrada mesmo sem `?ag=`. */
export const CANAIS_COM_NARRACAO = new Set(['whatsapp', 'telegram', 'instagram', 'email', 'dm'])

/** O guião completo, frase a frase, na ordem em que se ouve (a 1.ª é a abertura, a última o fecho). */
export function guiao(seg: ChaveSegmento, ag?: string | null): string[] {
  const s = SEGMENTOS[seg]
  return [aberturaDo(ag), ...s.cenas.map((c) => c.fala), s.fecho]
}

export const ehSegmento = (x: string): x is ChaveSegmento => x in SEGMENTOS

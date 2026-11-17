/**
 * OS TRÊS FUNIS DE PUBLICIDADE (17/11/2026) — Conduta v2: Educação, Rota Corretora, MTM Funded.
 *
 * Cada funil tem o seu caminho próprio, para os anúncios se poderem ligar já e medir em separado:
 *
 *   anúncio (utm_*)  →  /f/<funil>  →  «Quero que me liguem» com consentimento por canal
 *                    →  pedidos_contacto + captacao_consentimento + tarefa do setter + aviso Telegram
 *                    →  evento Lead no pixel Meta (só com consentimento de cookies de medição)
 *
 * PURO: sem servidor, sem base de dados. O texto que sai daqui é lido por pessoas reais e vai a
 * anúncios pagos, por isso é guardado (`funis-publicidade.check.ts`): nada de promessas de
 * retorno, nada de «gestão de carteira», nada de «prop firm» a não ser para dizer que não é.
 *
 * As chaves são as mesmas de `vendas_negocios.funil` (lib/backoffice-funis.ts, PR #262), para o
 * CRM poder classificar o lead pelo prefixo da origem (`funil:<chave>`).
 */
import { MIN_DEPOSIT } from '@/lib/broker/deposito-minimo'
import { TRIAL_DAYS } from '@/lib/trial-access'
import type { Interesse } from '@/lib/pedido-contacto-textos'

export const FUNIS_PUBLICIDADE = ['educacao', 'corretora', 'funded'] as const
export type FunilPublicidade = (typeof FUNIS_PUBLICIDADE)[number]

export interface PassoFunil {
  titulo: string
  texto: string
}

export interface DefinicaoFunil {
  chave: FunilPublicidade
  nome: string
  /** Interesse pré-escolhido no formulário (o setter vê-o na tarefa). */
  interesse: Interesse
  /** Código de agente por omissão quando o anúncio não traz `?ag=`. */
  ag: string
  seo: { titulo: string; descricao: string }
  titulo: string
  /** Máx. 20 palavras: é o que se lê antes de decidir. */
  subtitulo: string
  imagem: { src: string; alt: string }
  /** Três razões curtas, sem números inventados. */
  pontos: PassoFunil[]
  /** O que acontece depois de deixar o contacto. */
  passos: PassoFunil[]
  formulario: { titulo: string; subtitulo: string }
  /** Para quem já sabe o que quer e não precisa de falar connosco primeiro. */
  atalho: { texto: string; href: string }
  /** Avisos específicos do funil (além do aviso geral). */
  avisos: string[]
}

export const AVISO_GERAL =
  'Conteúdo educativo, não constitui consultoria financeira nem recomendação de investimento. Resultados passados não garantem resultados futuros. O trading envolve risco de perda de capital.'

export const FUNIS: Readonly<Record<FunilPublicidade, DefinicaoFunil>> = {
  educacao: {
    chave: 'educacao',
    nome: 'Educação',
    interesse: 'formacao',
    ag: 'AG-SETTER',
    seo: {
      titulo: 'Aprende trading com método · MoreThanMoney',
      descricao: `Formação em trading com gestão de risco, sessões ao vivo e comunidade. Experimenta o Premium ${TRIAL_DAYS} dias sem cartão.`,
    },
    titulo: 'Aprende a ler o mercado antes de arriscar',
    subtitulo: `Formação em trading com método e gestão de risco. Experimenta o Premium ${TRIAL_DAYS} dias, sem cartão.`,
    imagem: { src: '/images/apresentacao/app-aulas.jpg', alt: 'Aulas da MoreThanMoney na app' },
    pontos: [
      { titulo: 'Aulas e sessões ao vivo', texto: 'Em português, do primeiro gráfico à gestão de risco, ao teu ritmo.' },
      { titulo: 'Ferramentas com a lógica à vista', texto: 'Scanners e alertas explicados: percebes porque aparece cada ideia, não só o quê.' },
      { titulo: 'Não ficas sozinho', texto: 'Comunidade e uma chamada de onboarding com uma pessoa da equipa.' },
    ],
    passos: [
      { titulo: 'Deixas o contacto', texto: 'Escolhes por onde preferes falar: chamada, WhatsApp ou email.' },
      { titulo: 'Falamos contigo', texto: 'Uma conversa curta sobre o teu ponto de partida e o tempo que tens.' },
      { titulo: 'Começas pelo plano certo', texto: `Premium com ${TRIAL_DAYS} dias sem cartão, ou Membro se já tens corretora.` },
    ],
    formulario: {
      titulo: 'Falamos contigo sobre a formação',
      subtitulo: 'Deixa o contacto e escolhe como preferes ser contactado. Sem compromisso.',
    },
    atalho: { texto: `Experimentar ${TRIAL_DAYS} dias`, href: '/register' },
    avisos: [],
  },

  corretora: {
    chave: 'corretora',
    nome: 'Rota Corretora',
    interesse: 'rota_corretora',
    ag: 'AG-SETTER',
    seo: {
      titulo: 'Conta própria na corretora com o Premium incluído · MoreThanMoney',
      descricao:
        'Abre conta numa corretora regulada pelo nosso link. A conta é tua. Enquanto estiver financiada, o Premium MoreThanMoney fica incluído.',
    },
    titulo: 'A tua conta, o teu dinheiro, o Premium incluído',
    subtitulo: 'Abres conta numa corretora regulada que recomendamos. Enquanto estiver financiada, o Premium MoreThanMoney fica incluído.',
    imagem: { src: '/videos/stories/corretora-pt-capa.jpg', alt: 'Rota Corretora MoreThanMoney' },
    pontos: [
      { titulo: 'A conta é tua', texto: 'Abres em teu nome. Depositas, levantas e decides tu. Nós não tocamos no teu dinheiro.' },
      { titulo: 'Corretora regulada', texto: 'Recomendamos a PU Prime como parceiro (Introducing Broker). Não gerimos carteiras nem executamos por ti.' },
      { titulo: 'O Premium vem junto', texto: `Com a conta validada e o depósito mínimo de ${MIN_DEPOSIT} USD, o Premium fica aberto enquanto se mantiver.` },
    ],
    passos: [
      { titulo: 'Deixas o contacto', texto: 'Escolhes por onde preferes falar: chamada, WhatsApp ou email.' },
      { titulo: 'Ajudamos na abertura', texto: 'Passo a passo, pelo nosso link, e validamos a conta contigo.' },
      { titulo: 'O Premium abre', texto: 'Formação, scanners e alertas, com a tua conta a decidir o ritmo.' },
    ],
    formulario: {
      titulo: 'Ajudamos-te a abrir a conta',
      subtitulo: 'Deixa o contacto e uma pessoa da equipa acompanha-te na abertura e na validação.',
    },
    atalho: { texto: 'Abrir conta já', href: '/l/corretora' },
    avisos: [
      'A MoreThanMoney é parceira da corretora (Introducing Broker) e pode receber uma comissão dela. Isso não muda o custo para ti.',
      'Os CFD são instrumentos complexos e implicam um risco elevado de perda rápida de dinheiro devido à alavancagem. Só deves investir o que podes perder.',
    ],
  },

  funded: {
    chave: 'funded',
    nome: 'MTM Funded',
    interesse: 'mtm_funded',
    ag: 'AG-SETTER',
    seo: {
      titulo: 'MTM Funded: desafios em conta simulada · MoreThanMoney',
      descricao:
        'Desafios e torneios em conta simulada, com regras de risco claras. Quem cumpre pode ganhar um Patrocínio de Desempenho. Não é prop firm.',
    },
    titulo: 'Prova o teu método sem arriscar o teu capital',
    subtitulo: 'Desafios e torneios em conta simulada. Quem cumpre as regras pode ganhar um Patrocínio de Desempenho.',
    imagem: { src: '/images/apresentacao/app-webtrader.jpg', alt: 'WebTrader MTM Funded' },
    pontos: [
      { titulo: 'Conta simulada', texto: 'Operas no nosso WebTrader com preços de mercado, sem pôr capital próprio em jogo.' },
      { titulo: 'Regras claras', texto: 'Limites de risco e classificação públicos. Sabes desde o início o que conta.' },
      { titulo: 'Não é prop firm', texto: 'A MoreThanMoney não custodia nem executa capital de clientes. O prémio é um Patrocínio de Desempenho.' },
    ],
    passos: [
      { titulo: 'Deixas o contacto', texto: 'Escolhes por onde preferes falar: chamada, WhatsApp ou email.' },
      { titulo: 'Escolhes o desafio', texto: 'Explicamos as regras e qual faz sentido para a tua experiência.' },
      { titulo: 'Começas a operar', texto: 'No WebTrader, com a classificação à vista desde o primeiro dia.' },
    ],
    formulario: {
      titulo: 'Falamos contigo sobre o MTM Funded',
      subtitulo: 'Deixa o contacto e explicamos os desafios e as regras antes de começares.',
    },
    atalho: { texto: 'Ver desafios', href: '/mtmfunded' },
    avisos: [
      'As contas MTM Funded são simuladas. Não há depósito, custódia nem execução de capital real de clientes. O Patrocínio de Desempenho tem condições próprias, descritas nas regras.',
    ],
  },
}

export function ehFunilPublicidade(v: unknown): v is FunilPublicidade {
  return typeof v === 'string' && (FUNIS_PUBLICIDADE as readonly string[]).includes(v)
}

const so = (v: string | null | undefined) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^\w\-.]/g, '')
    .slice(0, 40)

/**
 * A origem que fica no pedido de contacto: `funil:<chave>` e, se o anúncio as trouxer, a campanha
 * e o anúncio (`?c=…&a=…`). Cabe nos 120 caracteres e no alfabeto de `limparOrigem`.
 */
export function origemDoFunil(
  chave: FunilPublicidade,
  q: { utm_campaign?: string | null; utm_content?: string | null; utm_source?: string | null } = {},
): string {
  const partes: string[] = []
  const s = so(q.utm_source)
  const c = so(q.utm_campaign)
  const a = so(q.utm_content)
  if (s) partes.push(`s=${s}`)
  if (c) partes.push(`c=${c}`)
  if (a) partes.push(`a=${a}`)
  return `funil:${chave}${partes.length ? `?${partes.join('&')}` : ''}`.slice(0, 120)
}

/** O funil de uma origem gravada (`funil:corretora?c=…` → 'corretora'), para o CRM classificar. */
export function funilDaOrigem(origem: string | null | undefined): FunilPublicidade | null {
  const m = /^funil:([a-z]+)/.exec(String(origem ?? ''))
  return m && ehFunilPublicidade(m[1]) ? m[1] : null
}

/** O link para pôr no anúncio, já com os UTM. */
export function linkDoAnuncio(
  chave: FunilPublicidade,
  p: { origem?: string; campanha: string; anuncio?: string; site?: string },
): string {
  const u = new URL(`/f/${chave}`, p.site ?? 'https://www.morethanmoney.pt')
  u.searchParams.set('utm_source', p.origem ?? 'meta')
  u.searchParams.set('utm_medium', 'paid')
  u.searchParams.set('utm_campaign', p.campanha)
  if (p.anuncio) u.searchParams.set('utm_content', p.anuncio)
  return u.toString()
}

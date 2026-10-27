/**
 * OS POSTS DO GRUPO «MTM SYSTEM» — o grupo de leads, onde se converte.
 *
 * Gémeo do que o FOREX swings tem desde 27/10 (`app/api/cron/telegram-swings-conversao`), mas com
 * mais ângulos, porque aqui toda a gente ainda está a decidir: uma trade ganha de verdade, os
 * certificados que o site emitiu, criar conta, a rota da corretora, uma dúvida respondida e o
 * convite a perguntar no grupo (o bot responde — `lib/telegram-leads-conversa.ts`).
 *
 * O QUE ISTO SUBSTITUI
 * O post antigo dizia «~63% de acerto» quando não havia dados (um número inventado com ar de
 * medido), tinha «356 membros» escrito à mão e uma citação sem origem. Saíram os três.
 *
 * REGRAS (as da casa, `lib/marketing/regras.ts`)
 *  · Só dados reais. Sem trade ganha nos últimos dias, o ângulo salta — não se inventa uma.
 *  · Uma vencedora mostra-se com a verdade ao lado: medida na conta de demonstração que abre todos
 *    os sinais, e nem todas fecham assim.
 *  · Certificados SEM nomes. Ninguém deu consentimento para ser montra num grupo público; conta-se
 *    o que foi emitido e o tipo, nunca quem.
 *  · Taxas de acerto nunca. Disclaimer em tudo o que fala de trading.
 */
import { MIN_DEPOSIT } from '@/lib/broker/deposito-minimo'
import { escadaEmLinhas } from '@/lib/escada-precos'
import { NOME_FONTE, type TradeExecutada } from '@/lib/pips-proof'

export const DISCLAIMER = '<i>Conteúdo educativo, não constitui consultoria financeira. Resultados não garantidos.</i>'

export interface Botao { text: string; url: string }
export interface PostLeads { tipo: string; texto: string; botoes: Botao[][] }

export interface DadosPosts {
  bot: string
  /** Vencedoras recentes, já desduplicadas (`tradesGanhasRecentes`). */
  ganhas: TradeExecutada[]
  /** Certificados emitidos — só contagens, nunca nomes. */
  certificados: { total: number; ultimos30d: number; ultimoTipo: string | null; ultimoEm: string | null } | null
  membros: number | null
}

const nf = new Intl.NumberFormat('pt-PT')
const ddmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** O que se pergunta mais, respondido com factos que não mudam de semana para semana. */
export const DUVIDAS: Array<{ p: string; r: string }> = [
  {
    p: 'Preciso de experiência para começar?',
    r: 'Não. Começas pela educação gratuita e pelo Bootcamp, e só operas quando perceberes o que estás a fazer. Os sinais vêm sempre com entrada, stop e alvos.',
  },
  {
    p: 'O meu dinheiro fica com a MTM?',
    r: 'Nunca. Fica na TUA conta, na corretora regulada, em teu nome. Nós educamos e partilhamos ideias; quem decide e opera és tu.',
  },
  {
    p: 'Quanto tempo preciso por dia?',
    r: 'Dá para encaixar à volta de um emprego. Há quem siga os alertas à mão, quem use o Tap to Trade (um toque) e quem prefira a cópia automática.',
  },
  {
    p: 'Dá para começar com pouco?',
    r: `Dá. Na rota da corretora o depósito mínimo é ${MIN_DEPOSIT}$, fica na tua conta, e o lote mínimo (0,01) mantém o risco pequeno enquanto aprendes.`,
  },
  {
    p: 'E se uma trade correr mal?',
    r: 'Vai acontecer — faz parte. Cada ideia traz stop loss, e o que ensinamos primeiro é gestão de risco: quanto arriscas por trade, antes de pensar em quanto ganhas.',
  },
]

function nomeFonte(t: TradeExecutada): string {
  return (t.fonte && NOME_FONTE[t.fonte]) || 'MTM'
}

const TIPO_CERT: Record<string, string> = {
  desafio: 'desafio MTM Funded (conta simulada)',
  financiado: 'fase de desempenho MTM Funded (conta simulada)',
  classificacao: 'classificação no torneio',
  participacao: 'participação no torneio',
  avaliacao: 'avaliação de um curso',
}

/** Todos os ângulos possíveis com os dados de hoje. Os que não têm dados reais não entram. */
export function postsPossiveis(d: DadosPosts, dia: number): PostLeads[] {
  const dm = { text: '💬 Tirar uma dúvida em privado', url: `https://t.me/${d.bot}?start=lead` }
  const conta = { text: '📲 Criar a minha conta', url: 'https://www.morethanmoney.pt/register' }
  const lista: PostLeads[] = []

  const t = d.ganhas[dia % Math.max(1, d.ganhas.length)]
  if (t && t.fechadaEm) {
    const dir = t.direcao === 'sell' ? 'venda' : t.direcao === 'buy' ? 'compra' : ''
    const parciais = t.saidas > 1 ? `, com ${t.saidas} saídas parciais pelo caminho` : ''
    lista.push({
      tipo: 'trade-ganha',
      texto:
        `✅ <b>${nomeFonte(t)} · ${t.symbol}${dir ? ` (${dir})` : ''}</b>\n\n` +
        `Fechou a ${ddmm(t.fechadaEm)} com <b>+${nf.format(t.pips)} pips</b>${parciais}.\n\n` +
        `Medido na nossa conta de demonstração, que abre TODOS os sinais publicados — não é escolha a dedo. ` +
        `E sejamos honestos: nem todas fecham assim, também há stops. O que muda o jogo é a gestão de risco.\n\n` +
        `Queres perceber como se lê um sinal destes? Pergunta aqui em baixo. 👇\n\n${DISCLAIMER}`,
      botoes: [[conta], [dm]],
    })
  }

  const c = d.certificados
  if (c && c.total > 0) {
    const ultimo = c.ultimoTipo && c.ultimoEm ? `O mais recente foi de ${TIPO_CERT[c.ultimoTipo] ?? c.ultimoTipo}, a ${ddmm(c.ultimoEm)}.\n` : ''
    lista.push({
      tipo: 'certificados',
      texto:
        `🎓 <b>${nf.format(c.total)} certificados emitidos</b> pelo site até hoje` +
        (c.ultimos30d > 0 ? ` (${nf.format(c.ultimos30d)} nos últimos 30 dias)` : '') +
        `.\n\n${ultimo}` +
        `Cada um sai com o seu código de validação. Não é um print: é um passo que alguém deu mesmo.\n\n` +
        `O teu pode ser o próximo. Começa pela conta grátis. 👇`,
      botoes: [[conta], [dm]],
    })
  }

  lista.push({
    tipo: 'criar-conta',
    texto:
      `👋 <b>Ainda só estás a espreitar?</b> Tudo bem, é assim que se começa.\n\n` +
      `Cria a conta e tens 3 dias de Premium para ver tudo por dentro: os alertas, a app e a educação. ` +
      `Depois decides com calma${d.membros ? `, como fizeram os ${nf.format(d.membros)} membros da comunidade` : ''}.\n\n` +
      `Em 5 passos: morethanmoney.pt/onboarding/mtm`,
    botoes: [[conta], [dm]],
  })

  lista.push({
    tipo: 'corretora',
    texto:
      `🏦 <b>Sem mensalidade?</b> Também dá.\n\n` +
      `Abre conta na corretora parceira com o nosso link, deposita ≥ ${MIN_DEPOSIT}$ e valida no bot. ` +
      `Ficas com a app Premium e os grupos de sinais enquanto mantiveres o saldo. O dinheiro fica sempre na TUA conta.\n\n${DISCLAIMER}`,
    botoes: [[{ text: '✅ Quero este caminho', url: `https://t.me/${d.bot}?start=broker` }], [dm]],
  })

  const q = DUVIDAS[dia % DUVIDAS.length]
  lista.push({
    tipo: 'duvida',
    texto:
      `❓ <b>«${q.p}»</b>\n\n${q.r}\n\n` +
      `Tens outra dúvida? Escreve-a aqui no grupo — eu respondo. Se for coisa da tua conta, falamos em privado. 👇\n\n${DISCLAIMER}`,
    botoes: [[dm]],
  })

  lista.push({
    tipo: 'packs',
    texto: `🪜 <b>Os degraus da MTM</b>\n\n${escadaEmLinhas()}\n\nNão sabes qual é o teu? Diz-me o que procuras e eu aponto-te o caminho. 👇\n\n${DISCLAIMER}`,
    botoes: [[{ text: '👑 Ver os packs', url: 'https://www.morethanmoney.pt/upgrade' }], [dm]],
  })

  return lista
}

/**
 * O post deste slot. A ordem dos ângulos é fixa e o índice avança por slot (dois por dia), por isso
 * dois slots seguidos nunca repetem — e os ângulos sem dados simplesmente encolhem a roda.
 */
export function postDoSlot(d: DadosPosts, slot: number): PostLeads {
  const lista = postsPossiveis(d, Math.floor(slot / 2))
  return lista[slot % lista.length]
}

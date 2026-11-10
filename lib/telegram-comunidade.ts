/**
 * MTM CHAT — o chat de discussão geral da comunidade Telegram (pedido do dono, 05/11/2026).
 *
 * Topo do funil: conversa, prova e curiosidade. Quem mostra interesse passa para o privado do bot e
 * daí para o MTM System (setter → fecho). Este módulo é PURO (sem base, sem rede) para os testes;
 * quem fala com o Telegram é `app/api/cron/telegram-comunidade`.
 *
 * TUDO DESLIGADO POR OMISSÃO. `site_settings.telegram_comunidade`:
 *   { chat_id, convite, posts: false, convites: false, conversa: false }
 *
 * CONVITES — decisão do dono (05/11): SÓ por DM, e só a quem já falou com o bot em privado.
 * Nada de adicionar pessoas pela sessão Telethon (conta pessoal: risco de ban que levava os relays;
 * e adicionar alguém sem consentimento choca com o RGPD). Quem entrou num grupo e nunca escreveu ao
 * bot NÃO recebe DM: o Telegram recusa-a (403) e a pessoa não a pediu.
 */
import { MIN_DEPOSIT } from '@/lib/broker/deposito-minimo'
import type { Botao, PostLeads } from '@/lib/telegram-leads-posts'

/** O mesmo de `lib/telegram-leads-posts.ts` (aqui à parte para este módulo ficar puro). */
export const DISCLAIMER = '<i>Conteúdo educativo, não constitui consultoria financeira. Resultados não garantidos.</i>'

export const CHAVE_CONFIG = 'telegram_comunidade'
export const TAG_CONVIDADO = 'convite_mtm_chat'
export const TAG_CONVITE_FALHOU = 'convite_mtm_chat_falhou'
export const TITULO_GRUPO = /^mtm\s*chat$/i
export const CONVITES_POR_RONDA = 15

export interface ConfigComunidade {
  chat_id: string | null
  convite: string | null
  posts: boolean
  convites: boolean
  conversa: boolean
}

export function lerConfig(v: unknown): ConfigComunidade {
  const e = (v ?? {}) as Record<string, unknown>
  const chat = String(e.chat_id ?? '').trim()
  const convite = String(e.convite ?? '').trim()
  return {
    chat_id: /^-?\d+$/.test(chat) ? chat : null,
    convite: /^https:\/\/t\.me\//.test(convite) ? convite : null,
    posts: e.posts === true,
    convites: e.convites === true,
    conversa: e.conversa === true,
  }
}

/** Descobre o id do MTM Chat pelos grupos que o bot já viu (`telegram_known_groups`). Prefere supergrupo. */
export function acharGrupoPeloTitulo(conhecidos: Record<string, { title?: string | null }>): string | null {
  const ids = Object.entries(conhecidos)
    .filter(([, g]) => TITULO_GRUPO.test(String(g?.title ?? '').trim()))
    .map(([id]) => id)
  return ids.find((id) => id.startsWith('-100')) ?? ids[0] ?? null
}

/** Perguntas do dia: puxam conversa sem pedir dados pessoais. */
export const PERGUNTAS: string[] = [
  'Qual foi o maior erro que já cometeste no trading — e o que aprendeste com ele?',
  'Quanto arriscas por trade, em % da conta? Sê honesto 👀',
  'Ouro, forex, índices ou cripto: onde te sentes mais à vontade e porquê?',
  'Se tivesses só 15 minutos por dia para o mercado, como os usavas?',
  'Stop loss: pões sempre, às vezes, ou "logo vejo"? 😅',
  'O que te trouxe ao trading: liberdade de tempo, rendimento extra ou curiosidade?',
  'Preferes seguir alertas à mão, um toque (Tap to Trade) ou cópia automática? Porquê?',
  'Qual é a tua regra nº 1 quando uma trade corre mal?',
  'Que horário de mercado encaixa melhor na tua rotina: Londres, Nova Iorque ou Ásia?',
  'Já tiveste conta demo antes de real? Quanto tempo ficaste nela?',
  'Que livro, vídeo ou pessoa mudou a forma como vês dinheiro?',
  'Notícias económicas: operas à volta delas ou ficas de fora?',
  'Qual foi a semana em que mais aprendeste — a de ganhos ou a de perdas?',
  'Se pudesses perguntar uma coisa a um trader com 10 anos de mercado, o que perguntavas?',
]

/** Rotação de produtos. Tom da casa: transparente, sem promessas, MTM Funded = contas SIMULADAS. */
function produtos(bot: string): PostLeads[] {
  const dm: Botao = { text: '💬 Saber mais em privado', url: `https://t.me/${bot}?start=lead` }
  return [
    {
      tipo: 'produto-corretora',
      texto:
        `🏦 <b>A rota da corretora</b>\n\n` +
        `Abres conta na corretora parceira (regulada, em teu nome), depositas a partir de ${MIN_DEPOSIT}$ e validas com o bot. ` +
        `Enquanto a conta estiver financiada tens a educação e os grupos de ideias desbloqueados. O dinheiro nunca passa por nós.\n\n${DISCLAIMER}`,
      botoes: [[{ text: '🏦 Começar pela corretora', url: `https://t.me/${bot}?start=broker` }], [dm]],
    },
    {
      tipo: 'produto-premium',
      texto:
        `👑 <b>Premium MTM</b>\n\n` +
        `Ideias de ouro com entrada, stop e alvos, acompanhamento ao vivo e a mesma gestão de risco que ensinamos. ` +
        `Podes experimentar antes de decidir. Mostramos os resultados em pips, com origem, incluindo os stops.\n\n${DISCLAIMER}`,
      botoes: [[{ text: '📲 Experimentar', url: 'https://www.morethanmoney.pt/register' }], [dm]],
    },
    {
      tipo: 'produto-mtm-auto',
      texto:
        `🤖 <b>MTM Auto</b>\n\n` +
        `Para quem não tem tempo de estar ao ecrã: ligas a TUA conta MT5 e as ideias são replicadas com o risco que tu defines. ` +
        `Podes pausar quando quiseres. Risco existe sempre — começa pelo lote mínimo.\n\n${DISCLAIMER}`,
      botoes: [[{ text: '🤖 Ver o MTM Auto', url: 'https://www.morethanmoney.pt/automation' }], [dm]],
    },
    {
      tipo: 'produto-funded',
      texto:
        `🏆 <b>MTM Funded</b>\n\n` +
        `Sem capital para começar? Fazes um desafio numa conta SIMULADA e, se cumprires as regras, ganhas o Patrocínio de Desempenho MTM ` +
        `para abrires a tua conta real. Não é uma prop firm: ninguém opera dinheiro teu nem nosso.\n\n${DISCLAIMER}`,
      botoes: [[{ text: '🏆 Conhecer o MTM Funded', url: 'https://www.morethanmoney.pt/app-mobile' }], [dm]],
    },
  ]
}

export interface DadosDoDia {
  bot: string
  /** Post de prova já feito (trade ganha real, certificados…) — vem de `postDoSlot` do grupo de leads. */
  prova: PostLeads | null
}

/**
 * Três slots por dia: 0 = pergunta do dia, 1 = prova real, 2 = produto. `dia` faz rodar o conteúdo.
 * Sem prova real nesse dia, o slot 1 vira produto (nunca se inventa uma).
 */
export function postDaComunidade(d: DadosDoDia, dia: number, slot: 0 | 1 | 2): PostLeads {
  const dm: Botao = { text: '💬 Falar com o assistente MTM', url: `https://t.me/${d.bot}?start=lead` }
  if (slot === 0) {
    const p = PERGUNTAS[dia % PERGUNTAS.length]
    return { tipo: 'pergunta-do-dia', texto: `☕ <b>Pergunta do dia</b>\n\n${p}\n\nResponde aqui em baixo 👇`, botoes: [[dm]] }
  }
  const lista = produtos(d.bot)
  if (slot === 1 && d.prova) return d.prova
  return lista[(dia + (slot === 1 ? 2 : 0)) % lista.length]
}

/** Slot pela hora UTC (cron às 09, 13 e 19 UTC). */
export function slotDaHora(horaUtc: number): 0 | 1 | 2 {
  return horaUtc < 11 ? 0 : horaUtc < 16 ? 1 : 2
}

export interface LeadParaConvite {
  chat_id: string | null
  source: string | null
  message_count: number | null
  stage: string | null
  tags: string[] | null
  first_name: string | null
}

/**
 * Quem pode receber o convite por DM: falou com o bot em PRIVADO (chat_id positivo e origem DM ou
 * mensagens trocadas), ainda não foi convidado, não está já no MTM Chat e não bloqueou o bot.
 */
export function podeSerConvidado(l: LeadParaConvite, jaNoGrupo: Set<string>): boolean {
  const id = String(l.chat_id ?? '')
  if (!/^\d+$/.test(id)) return false
  const tags = l.tags ?? []
  if (tags.includes(TAG_CONVIDADO) || tags.includes(TAG_CONVITE_FALHOU)) return false
  if (tags.some((t) => /^(optout|opt_out|stop|sair|nao_contactar)$/i.test(String(t)))) return false
  if (l.stage === 'blocked' || l.stage === 'opt_out') return false
  if (jaNoGrupo.has(id)) return false
  return l.source === 'telegram_dm' || (l.message_count ?? 0) > 0
}

export function textoConvite(nome: string | null): string {
  const ola = nome ? `Olá ${nome.split(' ')[0]}` : 'Olá'
  return (
    `${ola} 👋\n\n` +
    `Abrimos o <b>MTM Chat</b>, o espaço de conversa da comunidade MoreThanMoney: ideias, resultados com origem, ` +
    `dúvidas de trading e muita gente no mesmo caminho que tu.\n\n` +
    `Se te fizer sentido, entra pelo botão. É só este convite, não volto a insistir.`
  )
}

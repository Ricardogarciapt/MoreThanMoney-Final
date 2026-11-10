/**
 * OPT-IN DE SEGUIMENTO NO TELEGRAM — a porta que faltava para o executor do pipeline poder escrever.
 *
 * ═══ PORQUE EXISTE (10/11/2026) ════════════════════════════════════════════════════════════
 *
 * O pedido de consentimento dentro da conversa (`captacao-consentimento-conversa.ts`) só aparece à
 * 3.ª mensagem privada. Quase ninguém escreve ao bot em privado: os leads entram pelo GRUPO
 * (`no_grupo`, 50) ou pelo pedido de entrada nos grupos de sinais (`pedido_sinais`, 7), todos com
 * zero mensagens. Resultado medido a 10/11: zero consentimentos de Telegram, e o follow-up nunca
 * tinha a quem escrever.
 *
 * Isto dá um caminho EXPLÍCITO e de um toque: um link `t.me/<bot>?start=seguimento` (posts do grupo,
 * mensagem da porta dos sinais) → o bot pergunta com dois botões → «Sim» grava o consentimento com
 * o texto exacto como prova. Duplo passo de propósito: carregar no link não é consentir; carregar
 * em «Sim» por baixo do texto que diz o que se recebe e como se sai, é.
 *
 * A saída continua a ser a da conversa: «parar», «stop», etc. retiram o consentimento em qualquer
 * momento (`lerResposta` → `registarConsentimento('sair')`).
 */

export const START_OPTIN = 'seguimento'
export const BOTAO_OPTIN_SIM = 'optin:sim'
export const BOTAO_OPTIN_NAO = 'optin:nao'

/** O texto a que a pessoa diz «sim». É ESTE texto que fica como prova na linha do consentimento. */
export const TEXTO_OPTIN =
  'Queres que a MoreThanMoney te mande seguimento aqui no Telegram? ' +
  'No máximo 3 mensagens sobre os próximos passos (formação, corretora, Premium), nunca promessas de lucro. ' +
  'Para deixar de receber, escreve PARAR a qualquer momento.'

export function linkOptin(botUsername = process.env.TELEGRAM_BOT_USERNAME || 'MoreThanMoney_aibot'): string {
  return `https://t.me/${botUsername}?start=${START_OPTIN}`
}

/** A pergunta, com os dois botões. Puro. */
export function pedidoOptin(primeiroNome?: string | null): { texto: string; teclado: unknown } {
  const ola = primeiroNome ? `Olá ${primeiroNome} 👋\n\n` : '👋 '
  return {
    texto: `${ola}${TEXTO_OPTIN}`,
    teclado: {
      inline_keyboard: [[
        { text: '✅ Sim, quero', callback_data: BOTAO_OPTIN_SIM },
        { text: 'Agora não', callback_data: BOTAO_OPTIN_NAO },
      ]],
    },
  }
}

export function respostaDoBotao(data: string): 'sim' | 'nao' | null {
  if (data === BOTAO_OPTIN_SIM) return 'sim'
  if (data === BOTAO_OPTIN_NAO) return 'nao'
  return null
}

export function confirmacaoOptin(r: 'sim' | 'nao'): string {
  return r === 'sim'
    ? '✅ Feito. Mando-te só o essencial, no máximo 3 mensagens. Escreve PARAR quando quiseres deixar de receber.\n\nEntretanto, /premium mostra os packs e /corretora como abrir conta.'
    : 'Sem problema 🙏 Não te mando seguimento. Se tiveres dúvidas, escreve-me aqui quando quiseres.'
}

/** Linha curta para posts do grupo: convida a abrir conversa com o bot, sem DM a ninguém. */
export function linhaConviteOptin(): string {
  return `📩 Queres seguimento em privado? Toca aqui: ${linkOptin()}`
}

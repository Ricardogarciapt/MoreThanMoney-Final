/**
 * DE QUE CONTA SAI O CORREIO DESTA CASA — a decisão, sem rede e sem nodemailer.
 *
 * Hoje tudo sai por Gmail (`morethanmoneypt@gmail.com`). Quando houver caixas no domínio, passa a
 * sair por SMTP próprio e o cliente deixa de receber respostas de um gmail.com. A troca é só de
 * variáveis de ambiente — nenhuma das ~12 rotas que enviam email muda uma linha.
 *
 * ═══ PORQUE É QUE ISTO É UM MÓDULO PURO ════════════════════════════════════════════════════
 *
 * Porque a configuração a meio é o caso perigoso, e é silencioso. `MAIL_SMTP_HOST` preenchido e
 * `MAIL_SMTP_PASSWORD` esquecido dá um transporte que falha em TODOS os emails do site ao mesmo
 * tempo — campanhas, recuperação de password, avisos da agenda, confirmações do MTM Funded — e a
 * falha aparece numa consola que ninguém lê. Foi exactamente assim que o `GMAIL_USER` com uma
 * quebra de linha lá dentro sobreviveu meses (ver `mail-transport.ts`).
 *
 * Por isso a regra é: **ou a configuração de SMTP está COMPLETA, ou não se usa.** Meia configuração
 * volta ao Gmail e grita o que falta. Uma casa que envia password de recuperação por email não pode
 * ficar sem envio porque alguém se esqueceu de uma variável.
 */

/** O que o `nodemailer` precisa de saber, já decidido. */
export type Remetente = {
  conta: string
  password: string
  /** O cabeçalho `From`. */
  de: string
  /**
   * O que se escreve nos registos quando algo está pelo meio. Vive nos DOIS caminhos de propósito:
   * o aviso que importa mais é precisamente o do caminho que voltou ao Gmail por a configuração de
   * SMTP estar incompleta — se só existisse no caminho SMTP, perdia-se exactamente quando faz falta.
   */
  aviso?: string
} & (
  | { via: 'gmail' }
  | { via: 'smtp'; host: string; porta: number; seguro: boolean }
)

export interface AmbienteDeCorreio {
  GMAIL_USER?: string
  GMAIL_APP_PASSWORD?: string
  MAIL_SMTP_HOST?: string
  MAIL_SMTP_PORT?: string
  MAIL_SMTP_USER?: string
  MAIL_SMTP_PASSWORD?: string
  /** Opcional. Tem de ser a própria caixa ou um alias dela — ver a nota em `escolherRemetente`. */
  MAIL_FROM?: string
}

/**
 * Tira o lixo de um valor de ambiente.
 *
 * As aspas e as quebras de linha entram por copiar-e-colar do painel da Vercel, e um endereço com
 * uma quebra de linha lá dentro é um cabeçalho malformado: na melhor das hipóteses cai no spam, na
 * pior o servidor recusa a mensagem.
 */
export function limpar(v: string | undefined): string {
  return String(v ?? '').trim().replace(/^['"]|['"]$/g, '').replace(/[\r\n]+/g, '')
}

export const GMAIL_POR_OMISSAO = 'morethanmoneypt@gmail.com'

/**
 * A decisão.
 *
 * Sobre o `de` (o cabeçalho `From`): quando há SMTP próprio, por omissão é a PRÓPRIA CAIXA
 * autenticada. Não é preciosismo — o Zoho, o Google e a generalidade dos servidores recusam uma
 * mensagem cujo `From` não seja a caixa autenticada nem um alias dela. Um `MAIL_FROM` posto à mão
 * com um endereço que não pertence à conta é correio que nunca sai, e que falha no servidor e não
 * aqui, o que o torna muito mais difícil de encontrar. Aceita-se, porque os aliases são úteis
 * (`suporte@` a partir da caixa `geral@`), mas é escolha explícita de quem o escreve.
 */
export function escolherRemetente(env: AmbienteDeCorreio): Remetente {
  const host = limpar(env.MAIL_SMTP_HOST)
  const conta = limpar(env.MAIL_SMTP_USER)
  const password = limpar(env.MAIL_SMTP_PASSWORD)

  const gmail = (): Remetente => {
    const c = limpar(env.GMAIL_USER) || GMAIL_POR_OMISSAO
    return { via: 'gmail', conta: c, password: limpar(env.GMAIL_APP_PASSWORD), de: limpar(env.MAIL_FROM) || c }
  }

  // Nada configurado: o caminho de hoje, sem ruído.
  if (!host && !conta && !password) return gmail()

  // Configuração a meio: volta ao Gmail e diz o que falta. É o caso que esta função existe para
  // apanhar, e é por isso que o aviso nomeia as variáveis em falta em vez de dizer «mal configurado».
  const faltam = [
    !host ? 'MAIL_SMTP_HOST' : null,
    !conta ? 'MAIL_SMTP_USER' : null,
    !password ? 'MAIL_SMTP_PASSWORD' : null,
  ].filter(Boolean)
  if (faltam.length) {
    return {
      ...gmail(),
      aviso:
        `SMTP próprio ignorado — falta ${faltam.join(', ')}. O correio continua a sair por Gmail. ` +
        'Meia configuração não se usa: rebentava em todos os emails do site ao mesmo tempo.',
    }
  }

  /**
   * A porta decide o modo de cifra, e é aqui que se erra sem saber: 465 é TLS desde o primeiro byte
   * (`secure: true`), 587 começa em claro e sobe com STARTTLS (`secure: false`). Trocar os dois dá
   * um tempo-de-espera sem mensagem de erro útil.
   */
  const porta = Number(limpar(env.MAIL_SMTP_PORT)) || 465
  return {
    via: 'smtp',
    host,
    porta,
    seguro: porta === 465,
    conta,
    password,
    de: limpar(env.MAIL_FROM) || conta,
  }
}

/** O que falta para o SMTP próprio entrar — para quem lê os registos, não para o código. */
export function oQueFalta(env: AmbienteDeCorreio): string[] {
  const nomes = ['MAIL_SMTP_HOST', 'MAIL_SMTP_USER', 'MAIL_SMTP_PASSWORD'] as const
  const postas = nomes.filter((n) => limpar(env[n]))
  if (postas.length === 0 || postas.length === nomes.length) return []
  return nomes.filter((n) => !limpar(env[n]))
}

/** «MoreThanMoney <geral@morethanmoney.pt>» */
export function cabecalhoDe(r: Remetente, nome = 'MoreThanMoney'): string {
  return `"${nome}" <${r.de}>`
}

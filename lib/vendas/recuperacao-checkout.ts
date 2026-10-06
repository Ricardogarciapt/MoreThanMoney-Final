/**
 * RECUPERAÇÃO DE CHECKOUTS ABANDONADOS — quem pode receber UM lembrete, e o que ele diz.
 *
 * PURO: recebe o que se sabe e devolve decisões e textos. A base e o envio vivem no cron
 * (`app/api/cron/recuperacao-checkout`), que só CRIA RASCUNHOS na fila de aprovação
 * (`lib/envios-fila.ts`) — enviar é decisão de uma pessoa.
 *
 * O DINHEIRO PARADO, MEDIDO A 06/10
 *  · `checkout_sessions` em `pending`: 28 — todas com mais de 7 dias (a mais recente é de 09/09).
 *  · `marketplace_leads` em `iniciou_checkout`: 12 (os mais recentes de 29/09 a 03/10).
 *
 * QUEM É ELEGÍVEL (as cinco portas, por esta ordem)
 *  1. Tem email utilizável (não é lixo nem de teste).
 *  2. Pode receber pela regra de `lib/captacao-consentimento.ts`: ou deu consentimento
 *     (finalidade `campanha`), ou é cliente e isto é sobre o serviço dele (finalidade `servico`).
 *     O silêncio é NÃO — quem abandonou um checkout sem nunca ter pedido emails não recebe um.
 *  3. A sessão tem MENOS de 7 dias. Depois disso o lembrete já não é um lembrete: é uma campanha.
 *  4. Não comprou depois (o mesmo email, uma compra a partir do momento da sessão).
 *  5. Ainda não teve lembrete desta sessão — UM por sessão, nunca dois.
 */
import { podeReceber, normalizarEmail, type BaseLegal } from '@/lib/captacao-consentimento'
import { AG, linkAssinado } from '@/lib/agentes/codigos'

export const JANELA_DIAS = 7
const JANELA_MS = JANELA_DIAS * 24 * 3600 * 1000

export type OrigemCheckout = 'checkout_sessions' | 'marketplace_leads'

export interface CheckoutAbandonado {
  origem: OrigemCheckout
  /** O id da linha na origem. É o que faz a chave do lembrete. */
  referencia: string
  email: string | null
  /** Quando o checkout começou (ISO). */
  criadoEm: string
  /** `plan` em checkout_sessions; `slug` do produto em marketplace_leads. */
  produto: string
  /** Nome legível do produto, quando se sabe. */
  produtoNome?: string | null
  primeiroNome?: string | null
}

export interface QuemEAPessoa {
  baseLegal: BaseLegal | null
  retirou: boolean
  ehCliente: boolean
}

export interface Decisao {
  pode: boolean
  porque: string
}

/** A chave do lembrete: um por sessão. É a `chave` única da fila. */
export function chaveDoLembrete(c: Pick<CheckoutAbandonado, 'origem' | 'referencia'>): string {
  return `recuperacao-checkout:${c.origem}:${c.referencia}`
}

export function elegivel(
  c: CheckoutAbandonado,
  pessoa: QuemEAPessoa,
  /** Datas (ISO) das compras feitas por este email. */
  comprasDoEmail: readonly string[],
  /** Chaves dos lembretes que já existem na fila (em qualquer estado). */
  lembretesExistentes: ReadonlySet<string>,
  agora: Date,
): Decisao {
  // 1 + 2: o email e a base legal decidem-se na regra da casa, não aqui.
  const p = { email: c.email, baseLegal: pessoa.baseLegal, retirou: pessoa.retirou, ehCliente: pessoa.ehCliente }
  const campanha = podeReceber(p, 'campanha')
  const servico = podeReceber(p, 'servico')
  if (!campanha.pode && !servico.pode) {
    // O motivo de `campanha` é o que interessa a quem lê: «não pediu nada» é a razão normal.
    return { pode: false, porque: `sem consentimento — ${campanha.porque}` }
  }

  // 3: a janela.
  const inicio = new Date(c.criadoEm).getTime()
  if (!Number.isFinite(inicio)) return { pode: false, porque: 'sessão sem data' }
  if (agora.getTime() - inicio > JANELA_MS) return { pode: false, porque: `sessão com mais de ${JANELA_DIAS} dias` }
  if (inicio > agora.getTime() + 60_000) return { pode: false, porque: 'sessão com data no futuro' }

  // 4: já comprou depois? Compra no próprio instante conta (o webhook pode gravar antes).
  if (comprasDoEmail.some((d) => new Date(d).getTime() >= inicio - 60_000)) {
    return { pode: false, porque: 'já comprou depois deste checkout' }
  }

  // 5: um por sessão.
  if (lembretesExistentes.has(chaveDoLembrete(c))) return { pode: false, porque: 'já tem lembrete desta sessão' }

  return { pode: true, porque: campanha.pode ? 'pediu para receber' : 'cliente — lembrete sobre o serviço' }
}

/**
 * Para onde volta a pessoa. NUNCA o URL da sessão Stripe (expira em 24 h e o lembrete pode ser
 * aprovado depois); a página onde o checkout começa, que cria uma sessão nova. Assinado AG-EMAIL.
 */
export function linkDeRetoma(c: Pick<CheckoutAbandonado, 'origem' | 'produto'>): string {
  if (c.origem === 'marketplace_leads') return linkAssinado(`/marketplace/${encodeURIComponent(c.produto)}`, AG.EMAIL)
  const plano = c.produto.toLowerCase()
  if (plano.startsWith('mtmcopy')) return linkAssinado('/mtmcopy', AG.EMAIL)
  if (plano.startsWith('goldkiller')) return linkAssinado('/scanner', AG.EMAIL)
  return linkAssinado('/upgrade', AG.EMAIL)
}

const NOME_DO_PLANO: Record<string, string> = {
  mtmcopy_addon_monthly: 'MTM Copy',
  app_member_monthly: 'Pack Membro',
  app_member_annual: 'Pack Membro (anual)',
  premium_monthly: 'Premium',
  premium_annual: 'Premium (anual)',
  goldkiller_lifetime: 'GoldKiller (vitalício)',
}

/**
 * O texto. Curto, sem pressão inventada e sem números: é um lembrete de algo que a pessoa
 * começou, não uma venda nova. Nada de «últimas vagas» nem de lucro prometido.
 */
export function rascunhoDoLembrete(c: CheckoutAbandonado, link: string): { assunto: string; texto: string } {
  const nome = (c.primeiroNome || '').trim()
  const produto = c.produtoNome || NOME_DO_PLANO[c.produto] || c.produto
  return {
    assunto: `Ficou a meio: ${produto}`,
    texto:
      `Olá${nome ? ` ${nome}` : ''},\n\n` +
      `Começaste a inscrição em ${produto} e o pagamento ficou por concluir. Se foi por alguma ` +
      `dúvida ou um problema no pagamento, responde a este email e ajudamos.\n\n` +
      `Para retomar: ${link}\n\n` +
      `Se já não te interessa, ignora esta mensagem — não voltamos a escrever sobre isto.\n\n` +
      `Equipa More Than Money`,
  }
}

/** Normaliza o email como a base compara. Reexportado para o cron usar a mesma regra. */
export const emailDaPessoa = normalizarEmail

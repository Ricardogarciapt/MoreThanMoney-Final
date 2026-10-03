/**
 * O ENVIO DE EMAIL PELA API DO AGENTE — as regras, puras e testáveis.
 *
 * ═══ PORQUE É QUE ISTO TEM TRAVÕES ══════════════════════════════════════════════════════════
 *
 * O resto desta API gere conteúdo e definições: se um agente escrever asneira, corrige-se e
 * ninguém do lado de fora deu por nada. Um email é o contrário — sai, chega a uma pessoa, e não
 * há botão de desfazer. O manifesto desta API já dizia, para o `business`, «outreach_draft
 * (rascunho, NUNCA envia)»: esta rota é a primeira que pode mesmo enviar, e por isso traz o que
 * essa fronteira exigia.
 *
 * TRÊS REGRAS, e cada uma existe por um risco concreto:
 *
 * 1. SÓ PARA QUEM JÁ É NOSSO. O destinatário tem de existir em `profiles`. Sem isto, quem tivesse
 *    a chave da API tinha um servidor de envio com o domínio e a reputação da MoreThanMoney para
 *    mandar o que quisesse a quem quisesse — e o custo disso não é o email, é o domínio ir para
 *    listas negras e deixarem de chegar os emails que interessam.
 *
 * 2. ENSAIO POR OMISSÃO. Sem `confirmar: true` nada sai; devolve-se o que sairia. Um agente que
 *    chama uma rota nova para ver o que ela faz não pode descobrir isso mandando email a clientes.
 *
 * 3. TECTO POR CHAMADA. Uma campanha não se dispara por aqui. Isto serve avisos e respostas — o
 *    envio em massa tem o seu caminho, com consentimento e cancelamento de subscrição.
 */

/** Quantos destinatários no máximo por chamada. Ver a regra 3. */
export const LIMITE_POR_CHAMADA = 25

export interface PedidoEnvio {
  to?: unknown
  subject?: unknown
  html?: unknown
  text?: unknown
  confirmar?: unknown
}

export interface EnvioValidado {
  destinatarios: string[]
  assunto: string
  html: string | null
  texto: string | null
  ensaio: boolean
}

export type Recusa = { erro: string; detalhe?: unknown }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Normaliza e valida a lista. Repetidos contam uma vez — enviar duas vezes à mesma pessoa é um erro. */
export function normalizarDestinatarios(bruto: unknown): { validos: string[]; invalidos: string[] } {
  const lista = Array.isArray(bruto) ? bruto : [bruto]
  const validos: string[] = []
  const invalidos: string[] = []
  for (const item of lista) {
    const e = String(item ?? '').trim().toLowerCase()
    if (!e) continue
    if (!EMAIL.test(e)) { invalidos.push(String(item)); continue }
    if (!validos.includes(e)) validos.push(e)
  }
  return { validos, invalidos }
}

/**
 * Valida o pedido inteiro. Devolve a recusa com o MOTIVO — um agente que recebe «erro» e mais nada
 * tenta outra vez à sorte, e é assim que se manda o mesmo email três vezes.
 */
export function validarPedido(p: PedidoEnvio): EnvioValidado | Recusa {
  const { validos, invalidos } = normalizarDestinatarios(p.to)
  if (invalidos.length) return { erro: 'destinatario_invalido', detalhe: invalidos }
  if (!validos.length) return { erro: 'sem_destinatarios' }
  if (validos.length > LIMITE_POR_CHAMADA) {
    return { erro: 'limite_excedido', detalhe: { pedidos: validos.length, limite: LIMITE_POR_CHAMADA } }
  }

  const assunto = String(p.subject ?? '').trim()
  if (!assunto) return { erro: 'sem_assunto' }
  if (assunto.length > 200) return { erro: 'assunto_longo', detalhe: assunto.length }

  const html = typeof p.html === 'string' && p.html.trim() ? p.html : null
  const texto = typeof p.text === 'string' && p.text.trim() ? p.text : null
  if (!html && !texto) return { erro: 'sem_corpo' }

  // O ensaio é o estado por omissão: só `confirmar: true` — o booleano, não a string — envia.
  return { destinatarios: validos, assunto, html, texto, ensaio: p.confirmar !== true }
}

/**
 * Cruza os destinatários pedidos com os que existem em `profiles`.
 * Devolve quem segue e quem fica de fora, com o nome de cada um — para a resposta poder dizer
 * exactamente quem não foi e porquê, em vez de um total que não se sabe interpretar.
 */
export function separarConhecidos(
  pedidos: readonly string[],
  conhecidos: readonly string[],
): { seguem: string[]; desconhecidos: string[] } {
  const conjunto = new Set(conhecidos.map((e) => e.trim().toLowerCase()))
  const seguem: string[] = []
  const desconhecidos: string[] = []
  for (const e of pedidos) (conjunto.has(e) ? seguem : desconhecidos).push(e)
  return { seguem, desconhecidos }
}

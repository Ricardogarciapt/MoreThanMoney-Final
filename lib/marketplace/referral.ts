/**
 * O REFERRAL DE UMA VENDA DO MARKETPLACE — quem indicou, e quanto pode receber.
 *
 * Puro. Sem base de dados, sem Stripe. Recebe factos, devolve decisões.
 *
 * ── AS DUAS REGRAS QUE ESTE FICHEIRO EXISTE PARA GARANTIR ─────────────────────────────────
 *
 * 1. O EDUCADOR NÃO PODE SER REFERRAL DE SI PRÓPRIO.
 *
 *    Regra do dono. A razão é aritmética antes de ser política: o educador já recebe 90% da venda
 *    pela partilha. Somar-lhe a comissão de referral era pagar-lhe duas vezes pela mesma venda — e,
 *    ao contrário de um cêntimo de arredondamento, isto escalava, porque bastava pôr o código dele
 *    em todas as compras dos alunos dele.
 *
 *    Está fechada em TRÊS sítios, de propósito, e cada um cobre a falha do anterior:
 *      · no checkout (`referralAceitavel`), que RECUSA antes de cobrar e diz porquê — é o único
 *        momento em que a pessoa ainda pode ser avisada;
 *      · no cálculo (`comissaoDoReferral`), que devolve ZERO aconteça o que acontecer ao caminho
 *        que lá chegou — porque uma regra que só vive no ecrã não é uma regra;
 *      · na base de dados (trigger `marketplace_compras_referral_proprio`, migração 154), que limpa
 *        o `referral_id` se um caminho novo se esquecer dos dois primeiros.
 *
 *    Ser educador NÃO impede ninguém de ser referral. O que se proíbe é ser referral DE SI PRÓPRIO:
 *    um educador que indica o curso de outro educador recebe comissão normalmente.
 *
 * 2. A SOMA DE TUDO O QUE SAI NUNCA PASSA O QUE ENTROU.
 *
 *    Numa venda de marketplace há DOIS beneficiários e não são o mesmo: o educador (90% pela
 *    partilha) e quem indicou (pela regra de comissão). Se as duas contas fossem feitas
 *    independentemente — 90% para um, 20% para o outro — a casa pagava 110% de uma venda de 100 €.
 *
 *    A comissão sai da PARTE DA CASA, que é o que sobra depois da partilha. É o único sítio de onde
 *    ela pode sair sem tirar dinheiro ao educador (que tem um acordo escrito) nem à casa (que não
 *    pode pagar o que não recebeu). E é aqui que a regra nova da partilha ajuda: como a casa fica
 *    SEMPRE com 10% ou mais, há sempre margem de onde a comissão possa sair — o que com os 95%
 *    antigos quase não havia (5%).
 *
 *    `comissaoDoReferral` LIMITA a comissão a essa margem em vez de confiar na percentagem
 *    configurada. Consequência a levar ao dono: um vendedor que ganhe 10% num pack ganha, num
 *    produto de educador a 90/10, no máximo os 10% da casa — e fica com a margem dela inteira,
 *    sobrando zero para a casa. Se a intenção for a casa guardar algo, a percentagem de comissão do
 *    marketplace tem de ser menor que a margem, ou o educador tem de dar mais à casa (que a regra
 *    nova permite). O limite fica; a percentagem é a combinar.
 *
 * Guarda: `npx tsx lib/marketplace/referral.check.ts`
 */

// ── Quem indicou ──────────────────────────────────────────────────────────────────────────

export type MotivoReferralRecusado =
  | 'codigo_vazio'
  | 'desconhecido'
  | 'e_o_proprio_comprador'
  | 'e_o_educador_do_produto'
  | 'conta_inactiva'

export const TEXTO_REFERRAL: Record<MotivoReferralRecusado, string> = {
  codigo_vazio: 'Escreve o código de quem te indicou, ou deixa em branco.',
  desconhecido: 'Não encontrámos esse código de indicação.',
  e_o_proprio_comprador: 'Não podes indicar-te a ti mesmo.',
  // Dito sem acusar: quem escreve o código pode ser o aluno, que não tem culpa nem contexto.
  e_o_educador_do_produto: 'Esse código é do autor deste produto e não se aplica a esta compra.',
  conta_inactiva: 'Essa conta não está activa.',
}

export type ReferralResolvido = {
  /** O perfil do site de quem indicou. */
  userId: string
  codigo: string
  activo?: boolean | null
}

/**
 * Este referral vale para esta compra?
 *
 * Chamada no checkout, ANTES de cobrar. O `perfilDoEducadorDoProduto` é o `lms_educators.profile_id`
 * do autor — a ponte entre as duas identidades desta casa (um educador não é um utilizador do site).
 * Quando essa coluna está vazia, não há como comparar, e a comparação falha para o lado seguro: o
 * referral passa, e é o trigger da base de dados que apanha o caso se a ligação existir lá.
 */
export function referralAceitavel(entrada: {
  referral: ReferralResolvido | null | undefined
  codigoEscrito?: string | null
  compradorId: string
  perfilDoEducadorDoProduto?: string | null
}): { ok: true; userId: string; codigo: string } | { ok: false; motivo: MotivoReferralRecusado } {
  const escrito = String(entrada.codigoEscrito ?? '').trim()
  if (!entrada.referral) {
    // Distingue «não escreveu nada» de «escreveu e não existe». Um código errado que desaparece em
    // silêncio faz a pessoa acreditar que a indicação contou — e quem indicou nunca vê a comissão.
    return { ok: false, motivo: escrito ? 'desconhecido' : 'codigo_vazio' }
  }
  if (entrada.referral.activo === false) return { ok: false, motivo: 'conta_inactiva' }
  if (entrada.referral.userId === entrada.compradorId) {
    return { ok: false, motivo: 'e_o_proprio_comprador' }
  }
  if (
    entrada.perfilDoEducadorDoProduto &&
    entrada.referral.userId === entrada.perfilDoEducadorDoProduto
  ) {
    return { ok: false, motivo: 'e_o_educador_do_produto' }
  }
  return { ok: true, userId: entrada.referral.userId, codigo: entrada.referral.codigo }
}

// ── Quanto recebe ─────────────────────────────────────────────────────────────────────────

export type Comissao = {
  valorCents: number
  /** Sobre o que foi calculada. É o que entrou, nunca o preço de tabela. */
  baseCents: number
  pctAplicada: number
  /** O tecto que a parte da casa impôs. Null = a regra caberia inteira. */
  limitadaAoTectoCents: number | null
  motivoZero?: 'sem_referral' | 'auto_pagamento' | 'sem_margem' | 'sem_regra'
}

/**
 * A comissão de quem indicou.
 *
 * ── A BASE É O QUE ENTROU ───────────────────────────────────────────────────────────────
 *
 * `baseCents` é o valor PAGO, depois do desconto — nunca o preço de tabela. Numa venda de 100 €
 * com 20% de cupão, a comissão é sobre 80. Se fosse sobre 100, a casa pagava comissão sobre 20 €
 * que nunca entraram.
 *
 * ── O TECTO ─────────────────────────────────────────────────────────────────────────────
 *
 * A comissão nunca passa `parteCasaCents`. Não é uma precaução: é a única forma de a soma do que sai
 * não passar o que entrou, porque a parte do educador já está decidida e congelada por um acordo.
 */
export function comissaoDoReferral(entrada: {
  /** O que o cliente pagou (já com desconto). */
  brutoCents: number
  /** O que sobra para a casa depois da partilha do educador. É daqui que a comissão sai. */
  parteCasaCents: number
  pct: number
  referralUserId?: string | null
  /** O perfil do autor do produto, para a regra 1 valer também aqui. */
  perfilDoEducadorDoProduto?: string | null
}): Comissao {
  const base = Math.max(0, Math.round(Number(entrada.brutoCents) || 0))
  const tecto = Math.max(0, Math.round(Number(entrada.parteCasaCents) || 0))
  const pct = Number(entrada.pct)

  const zero = (motivo: Comissao['motivoZero']): Comissao => ({
    valorCents: 0, baseCents: base, pctAplicada: 0, limitadaAoTectoCents: null, motivoZero: motivo,
  })

  if (!entrada.referralUserId) return zero('sem_referral')

  // A REGRA 1, outra vez, aqui. Redundante de propósito: o checkout já devia ter recusado, mas uma
  // compra pode ser criada por outro caminho (manual, oferta, importação), e nenhum desses passa
  // pelo checkout. Ver o cabeçalho.
  if (
    entrada.perfilDoEducadorDoProduto &&
    entrada.referralUserId === entrada.perfilDoEducadorDoProduto
  ) {
    return zero('auto_pagamento')
  }

  if (!Number.isFinite(pct) || pct <= 0) return zero('sem_regra')
  if (tecto <= 0) return zero('sem_margem')

  const pedido = Math.floor((base * Math.min(100, pct)) / 100)
  const valor = Math.min(pedido, tecto)
  return {
    valorCents: valor,
    baseCents: base,
    pctAplicada: pct,
    limitadaAoTectoCents: valor < pedido ? tecto : null,
  }
}

/**
 * A guarda do dinheiro: tudo o que sai desta venda cabe no que entrou?
 *
 * Usada pelo `referral.check.ts` e pelo caminho de escrita antes de gravar. Existe como função — e
 * não como comentário a dizer «cuidado» — porque é a afirmação que, se falhar em silêncio, faz a
 * casa prometer dinheiro que não tem. Um extracto com mais a pagar do que recebeu só se descobre no
 * dia do pagamento, e nesse dia já é uma conversa e não um bug.
 */
export function contasFecham(entrada: {
  brutoCents: number
  comissaoLojaCents?: number
  parteEducadorCents: number
  parteCasaCents: number
  comissaoReferralCents: number
}): { fecham: boolean; entrou: number; sai: number; sobra: number } {
  const bruto = Math.max(0, Math.round(Number(entrada.brutoCents) || 0))
  const loja = Math.max(0, Math.round(Number(entrada.comissaoLojaCents) || 0))
  // O que a casa pode distribuir é o líquido: o que a Apple leva nunca chega cá.
  const entrou = bruto - loja
  const sai =
    Math.max(0, Math.round(entrada.parteEducadorCents || 0)) +
    Math.max(0, Math.round(entrada.parteCasaCents || 0))
  // A comissão do referral sai de DENTRO da parte da casa, não por cima dela — por isso não se soma
  // ao `sai`. O que se verifica é que ela cabe lá dentro.
  const comissao = Math.max(0, Math.round(entrada.comissaoReferralCents || 0))
  const fecham = sai <= entrou && comissao <= Math.max(0, Math.round(entrada.parteCasaCents || 0))
  return { fecham, entrou, sai, sobra: entrou - sai }
}

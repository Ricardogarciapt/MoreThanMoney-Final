/**
 * OS CUPÕES DA CASA, APLICADOS A UM PRODUTO DO MARKETPLACE.
 *
 * Puro de propósito, como `regras.ts`: recebe factos, devolve uma decisão. Sem base de dados e sem
 * Stripe, para o `cupoes.check.ts` poder correr o caso mau em meio segundo.
 *
 * ── DUAS COISAS DIFERENTES QUE NÃO SE SOMAM ───────────────────────────────────────────────
 *
 *   · A CAMPANHA do produto (`campanha_pct`, na 153) é automática e não tem código: é o preço de
 *     membro, que aparece já descontado a quem tem o tier.
 *   · O CUPÃO é um código que alguém escreve, e vem da tabela `coupons` da casa — a mesma que já
 *     serve os packs do site, o MTM Funded, as parcerias e as ofertas do Apple IAP.
 *
 * Vale a MAIOR das duas, nunca a soma. 20% de campanha mais 30% de cupão não são 50%: são 30%. Um
 * desconto que se empilha é um desconto que, com dois códigos generosos ao mesmo tempo, vende a
 * 0 € — e o MTM Funded já tomou esta decisão pela mesma razão (recusa empilhar cupão sobre um
 * programa em campanha).
 *
 * ── O QUE SE RECUSA, E PORQUE SE RECUSA COM NOME ──────────────────────────────────────────
 *
 * A tabela `coupons` tem tipos que não fazem sentido num produto avulso, e três das cinco linhas de
 * parceria dão VIP. Um cupão desses aplicado a um curso de 40 € daria acesso VIP ao site inteiro por
 * 40 € — e isso não é um desconto mal calculado, é um pack vendido por engano.
 *
 * Por isso cada recusa tem um `motivo` nomeado em vez de um `false`. Um `false` obriga o ecrã a
 * inventar a explicação, e a explicação errada aqui é a diferença entre «este código não serve para
 * cursos» e «o código está inválido» (que manda a pessoa pedir outro à equipa).
 *
 * Guarda: `npx tsx lib/marketplace/cupoes.check.ts`
 */

import { donoValido } from './regras'

/** O desconto máximo, como nas campanhas. Um cupão de 100% não é desconto: é uma oferta. */
export const CUPAO_MAX_PCT = 90

/** O valor de `plan_override` que marca um cupão como sendo do marketplace, a par de 'mtmfunded'. */
export const AMBITO_MARKETPLACE = 'marketplace'

export type CupaoRegra = {
  id?: string
  code?: string | null
  type?: string | null
  discount_value?: number | null
  plan_override?: string | null
  max_uses?: number | null
  valid_from?: string | null
  valid_until?: string | null
  is_active?: boolean | null
  grant_days?: number | null
  grants_vip?: boolean | null
  marketplace_produto_id?: string | null
  marketplace_educator_id?: string | null
  criado_por_educador?: string | null
}

export type ProdutoParaCupao = {
  id?: string
  educator_id?: string | null
  dono?: string | null
  preco_cents?: number | null
}

export type MotivoRecusa =
  | 'inexistente'
  | 'inactivo'
  | 'ainda_nao_comecou'
  | 'expirado'
  | 'esgotado'
  | 'ja_usado_por_ti'
  | 'fora_do_marketplace'
  | 'outro_produto'
  | 'outro_educador'
  | 'tipo_nao_serve'
  | 'da_direitos_de_pack'
  | 'sem_desconto'
  | 'produto_gratuito'

/** O que se diz à pessoa. Escrito para ela e não para o programador. */
export const TEXTO_RECUSA: Record<MotivoRecusa, string> = {
  inexistente: 'Esse código não existe.',
  inactivo: 'Esse código já não está activo.',
  ainda_nao_comecou: 'Esse código ainda não começou.',
  expirado: 'Esse código já expirou.',
  esgotado: 'Esse código já foi todo usado.',
  ja_usado_por_ti: 'Já usaste esse código.',
  fora_do_marketplace: 'Esse código não serve para produtos do marketplace.',
  outro_produto: 'Esse código é para outro produto.',
  outro_educador: 'Esse código não se aplica a este produto.',
  tipo_nao_serve: 'Esse código dá meses de subscrição, não desconto num produto.',
  da_direitos_de_pack: 'Esse código dá acesso a um pack do site e resgata-se na tua conta, não aqui.',
  sem_desconto: 'Esse código não tem desconto associado.',
  produto_gratuito: 'Este produto já é gratuito.',
}

export type Validacao =
  | { ok: true; pct: number; cupaoId: string }
  | { ok: false; motivo: MotivoRecusa }

/**
 * Este cupão vale para este produto, para esta pessoa, agora?
 *
 * `usosFeitos` e `jaUsadoPorEstaPessoa` vêm de FORA e contam linhas de `coupon_usages`. Não se lê
 * `coupons.used_count`: está partido desde 25/09 (o contador nunca foi incrementado, por causa de
 * uma RPC que não existe) e há rotas vivas que ainda o lêem. Encostar o preço a esse número era
 * herdar um limite que nunca dispara.
 */
export function validarCupao(entrada: {
  cupao: CupaoRegra | null | undefined
  produto: ProdutoParaCupao
  agoraIso: string
  usosFeitos?: number
  jaUsadoPorEstaPessoa?: boolean
}): Validacao {
  const c = entrada.cupao
  if (!c || !c.id) return { ok: false, motivo: 'inexistente' }
  if (c.is_active === false) return { ok: false, motivo: 'inactivo' }

  // Um produto gratuito não leva desconto. Sem isto, o desconto aplicava-se a zero e o Stripe
  // recusava a sessão com um erro que ninguém saberia ler.
  if (Math.max(0, Number(entrada.produto.preco_cents ?? 0)) <= 0) {
    return { ok: false, motivo: 'produto_gratuito' }
  }

  // ── Os que dão direitos, e não desconto ─────────────────────────────────────────────────
  //
  // Isto vem ANTES do âmbito de propósito: se um cupão de parceria fosse por engano marcado como
  // sendo do marketplace, é aqui que ele pára — e não no ramo seguinte, que o deixaria passar.
  if (c.grants_vip === true || Number(c.grant_days ?? 0) > 0 || c.type === 'partnership') {
    return { ok: false, motivo: 'da_direitos_de_pack' }
  }
  if (c.type === 'free_subscription' || c.type === 'free_months') {
    return { ok: false, motivo: 'tipo_nao_serve' }
  }

  /**
   * ── OS CÓDIGOS DE ATRIBUIÇÃO ────────────────────────────────────────────────────────────
   *
   * Não dão desconto nenhum: existem para saber QUEM trouxe a venda (a equipa de agentes mede-se
   * pela receita que traz, e a receita reconhece-se pelo código gravado na compra).
   *
   * Passam ANTES do âmbito e do desconto, e por boas razões:
   *
   *  · o ÂMBITO não se lhes aplica. O âmbito existe para um desconto não escapar do sítio onde foi
   *    pensado; um código que desconta zero não tem de onde escapar, e marcar origem vale em
   *    qualquer produto;
   *  · o ramo do DESCONTO recusa tudo o que seja `<= 0`, e estes são todos 0 por definição. Sem
   *    esta saída, o código era aceite pela tabela e recusado no fim com «sem desconto» — a pior
   *    combinação possível: existe, parece válido, e não funciona.
   *
   * O limite de usos e o prazo ainda se aplicam quando estiverem preenchidos, porque um código de
   * campanha pode ser de atribuição E ter data para acabar.
   */
  if (c.type === 'atribuicao') {
    const agoraA = Date.parse(entrada.agoraIso)
    if (Number.isFinite(agoraA) && c.valid_until) {
      const f = Date.parse(c.valid_until)
      if (!Number.isFinite(f) || f <= agoraA) return { ok: false, motivo: 'expirado' }
    }
    const maxA = Number(c.max_uses ?? 0)
    if (maxA > 0 && Number(entrada.usosFeitos ?? 0) >= maxA) return { ok: false, motivo: 'esgotado' }
    // `pct: 0` é o ponto todo: o cliente paga o preço cheio e a compra fica com o código gravado.
    return { ok: true, pct: 0, cupaoId: c.id }
  }

  if (c.type !== 'discount_pct') return { ok: false, motivo: 'tipo_nao_serve' }

  // ── O âmbito ────────────────────────────────────────────────────────────────────────────
  if (String(c.plan_override ?? '') !== AMBITO_MARKETPLACE) {
    return { ok: false, motivo: 'fora_do_marketplace' }
  }
  if (c.marketplace_produto_id && c.marketplace_produto_id !== entrada.produto.id) {
    return { ok: false, motivo: 'outro_produto' }
  }
  if (c.marketplace_educator_id) {
    // Um produto da casa não tem educador: um cupão preso a um educador nunca lhe serve.
    if (donoValido(entrada.produto.dono) === 'casa') return { ok: false, motivo: 'outro_educador' }
    if (c.marketplace_educator_id !== entrada.produto.educator_id) {
      return { ok: false, motivo: 'outro_educador' }
    }
  }
  // Um cupão criado por um educador SEM âmbito nenhum não se aplica a nada. A base de dados já o
  // impede de existir (check `coupons_educador_tem_ambito`), e aqui fecha-se a porta ao caso de ele
  // ter sido criado antes dessa guarda.
  if (c.criado_por_educador && !c.marketplace_produto_id && !c.marketplace_educator_id) {
    return { ok: false, motivo: 'outro_educador' }
  }

  // ── O prazo ─────────────────────────────────────────────────────────────────────────────
  const agora = Date.parse(entrada.agoraIso)
  if (!Number.isFinite(agora)) return { ok: false, motivo: 'inactivo' }
  if (c.valid_from) {
    const i = Date.parse(c.valid_from)
    if (Number.isFinite(i) && i > agora) return { ok: false, motivo: 'ainda_nao_comecou' }
  }
  if (c.valid_until) {
    const f = Date.parse(c.valid_until)
    // Uma data ilegível FECHA o cupão, como nas campanhas: entre cobrar a menos para sempre e
    // recusar um código, o erro que se corrige com um pedido de desculpa é o segundo.
    if (!Number.isFinite(f) || f <= agora) return { ok: false, motivo: 'expirado' }
  }

  // ── O consumo ───────────────────────────────────────────────────────────────────────────
  if (entrada.jaUsadoPorEstaPessoa) return { ok: false, motivo: 'ja_usado_por_ti' }
  const max = Number(c.max_uses ?? 0)
  if (max > 0 && Number(entrada.usosFeitos ?? 0) >= max) return { ok: false, motivo: 'esgotado' }

  // ── O desconto ──────────────────────────────────────────────────────────────────────────
  const pct = Number(c.discount_value ?? 0)
  if (!Number.isFinite(pct) || pct <= 0) return { ok: false, motivo: 'sem_desconto' }

  // Cortado no máximo, como as campanhas. Um cupão de 100% na tabela não vende a 0 €.
  return { ok: true, pct: Math.min(CUPAO_MAX_PCT, pct), cupaoId: c.id }
}

/**
 * O desconto que vale, entre a campanha e o cupão: o MAIOR dos dois, nunca os dois.
 *
 * Empate fica com a campanha, por ser a que já estava anunciada no preço.
 *
 * O desconto sai SEMPRE da venda — decisão do dono. Não há aqui regime nenhum a escolher, e é por
 * isso que esta função devolve só um número: a base da partilha é o que o cliente pagou, e o
 * educador recebe a percentagem dele sobre isso. A alternativa (a casa suportar) está descartada e
 * a razão está escrita no cabeçalho da migração 154 — com 90% para o educador, a casa tem 10% de
 * margem, e um desconto de 20% suportado por ela dava uma parte da casa NEGATIVA, que o
 * `check (parte_casa_cents >= 0)` recusa. A venda não se gravava e o comprador pagava sem receber.
 */
export function descontoQueVale(entrada: {
  campanhaPct: number
  cupao?: { pct: number } | null
}): { pct: number; veioDoCupao: boolean } {
  const campanha = Math.max(0, Number(entrada.campanhaPct) || 0)
  const cupao = entrada.cupao?.pct ?? 0
  if (cupao > campanha) return { pct: Math.min(CUPAO_MAX_PCT, cupao), veioDoCupao: true }
  return { pct: campanha, veioDoCupao: false }
}

/** O código como se guarda e se compara: sem espaços, maiúsculas. */
export function normalizarCodigo(bruto: string | null | undefined): string {
  return String(bruto ?? '').trim().toUpperCase().slice(0, 64)
}

/**
 * Este educador pode criar um cupão com este âmbito?
 *
 * ── A PONTA AFIADA ────────────────────────────────────────────────────────────────────────
 *
 * Um cupão de 90% no produto de outro educador seria dinheiro tirado a essa pessoa — ela vê a venda
 * no extracto, a 10% do que esperava, e não tem como saber porquê. Por isso um educador só consegue
 * criar cupões presos A ELE ou a um produto DELE, e nunca um cupão global.
 *
 * A casa (admin) pode tudo, incluindo o cupão global.
 */
export function podeCriarCupao(entrada: {
  papel: 'admin' | 'educador'
  educatorId?: string | null
  /** O âmbito pedido. */
  produtoDoEducadorId?: string | null
  marketplaceEducatorId?: string | null
  marketplaceProdutoId?: string | null
}): { pode: boolean; motivo?: string } {
  if (entrada.papel === 'admin') return { pode: true }

  if (!entrada.educatorId) return { pode: false, motivo: 'Sessão de educador necessária.' }

  // Preso a um produto: esse produto tem de ser dele. Quem confirma de quem é o produto é o
  // chamador (que o foi buscar à base de dados) e passa-o em `produtoDoEducadorId`.
  if (entrada.marketplaceProdutoId) {
    if (!entrada.produtoDoEducadorId || entrada.produtoDoEducadorId !== entrada.educatorId) {
      return { pode: false, motivo: 'Esse produto não é teu.' }
    }
    // E o âmbito por educador, se vier, tem de ser ele próprio.
    if (entrada.marketplaceEducatorId && entrada.marketplaceEducatorId !== entrada.educatorId) {
      return { pode: false, motivo: 'Só podes criar códigos para os teus produtos.' }
    }
    return { pode: true }
  }

  // Preso a um educador: tem de ser ele.
  if (entrada.marketplaceEducatorId) {
    return entrada.marketplaceEducatorId === entrada.educatorId
      ? { pode: true }
      : { pode: false, motivo: 'Só podes criar códigos para os teus produtos.' }
  }

  // Sem âmbito nenhum seria um cupão dele a descontar a loja toda.
  return { pode: false, motivo: 'Diz a que produto (ou a que loja tua) o código se aplica.' }
}

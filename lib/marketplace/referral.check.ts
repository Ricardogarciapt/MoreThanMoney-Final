/**
 * Guarda do referral e dos cupões do marketplace.
 *
 *   npx tsx lib/marketplace/referral.check.ts
 *
 * As duas afirmações que este ficheiro existe para prender são as que custam dinheiro a sério:
 *
 *   1. O EDUCADOR NÃO PODE SER REFERRAL DE SI PRÓPRIO. Já recebe 90% pela partilha; somar-lhe a
 *      comissão pagava-lhe duas vezes pela mesma venda, e escalava — bastava pôr o código dele em
 *      todas as compras dos alunos dele.
 *   2. A SOMA DO QUE SAI NUNCA PASSA O QUE ENTROU. Duas contas feitas por sistemas que não se
 *      conhecem (a partilha e a comissão) somam mais de 100% se ninguém verificar.
 *
 * Quase tudo aqui é o caso MAU. Um teste que só prova que um referral legítimo recebe passa com
 * `return pct` no corpo da função.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcularPartilha } from './regras'
import { comissaoDoReferral, contasFecham, referralAceitavel } from './referral'
import {
  CUPAO_MAX_PCT, AMBITO_MARKETPLACE, descontoQueVale, normalizarCodigo, podeCriarCupao, validarCupao,
} from './cupoes'

const RAIZ = join(__dirname, '..', '..')
let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => { if (cond) ok++; else falhas.push(nome) }

const COMPRADOR = 'user-comprador'
const EDUCADOR_PERFIL = 'user-educador'
const OUTRA_PESSOA = 'user-vendedor'

// ══════════════ 1. O EDUCADOR NÃO É REFERRAL DE SI PRÓPRIO ══════════════

{
  // O CASO MAU, dito pelo nome: o educador põe o próprio código numa compra do produto dele.
  const r = referralAceitavel({
    referral: { userId: EDUCADOR_PERFIL, codigo: 'RICARDO', activo: true },
    codigoEscrito: 'RICARDO',
    compradorId: COMPRADOR,
    perfilDoEducadorDoProduto: EDUCADOR_PERFIL,
  })
  assert.ok(
    !r.ok,
    'O EDUCADOR NÃO PODE SER REFERRAL DE SI PRÓPRIO. Já recebe 90% pela partilha — somar a comissão era pagar-lhe duas vezes pela mesma venda.',
  )
  assert.equal(
    r.ok === false ? r.motivo : null,
    'e_o_educador_do_produto',
    'e o motivo tem de ser este, para o checkout poder dizê-lo em vez de deixar a comissão a zero em silêncio',
  )
}

// A MESMA regra no cálculo, e não só no ecrã. Uma regra que só vive no checkout não vale para as
// compras criadas por outro caminho (manual, oferta, importação).
{
  const c = comissaoDoReferral({
    brutoCents: 10000,
    parteCasaCents: 1000,
    pct: 10,
    referralUserId: EDUCADOR_PERFIL,
    perfilDoEducadorDoProduto: EDUCADOR_PERFIL,
  })
  assert.equal(c.valorCents, 0, 'auto-pagamento dá comissão ZERO, aconteça o que acontecer ao caminho que lá chegou')
  sim('e o motivo fica escrito', c.motivoZero === 'auto_pagamento')
}

// ── E o que NÃO se proíbe: ser educador não impede ninguém de ser referral ───────────────
{
  const r = referralAceitavel({
    referral: { userId: OUTRA_PESSOA, codigo: 'JOAO', activo: true },
    codigoEscrito: 'JOAO',
    compradorId: COMPRADOR,
    perfilDoEducadorDoProduto: EDUCADOR_PERFIL,
  })
  sim('um educador que indica o produto de OUTRO recebe normalmente', r.ok)
  const c = comissaoDoReferral({
    brutoCents: 10000, parteCasaCents: 1000, pct: 10,
    referralUserId: OUTRA_PESSOA, perfilDoEducadorDoProduto: EDUCADOR_PERFIL,
  })
  sim('e a comissão dele é calculada', c.valorCents === 1000)
}

// Os outros casos maus do referral.
{
  const eu = referralAceitavel({
    referral: { userId: COMPRADOR, codigo: 'EU', activo: true },
    codigoEscrito: 'EU', compradorId: COMPRADOR,
  })
  sim('ninguém se indica a si mesmo', !eu.ok && eu.motivo === 'e_o_proprio_comprador')

  const inactivo = referralAceitavel({
    referral: { userId: OUTRA_PESSOA, codigo: 'X', activo: false },
    codigoEscrito: 'X', compradorId: COMPRADOR,
  })
  sim('conta inactiva não recebe comissão', !inactivo.ok && inactivo.motivo === 'conta_inactiva')

  // A distinção que evita a conversa de semanas depois: «não escreveu nada» ≠ «escreveu e não existe».
  const errado = referralAceitavel({ referral: null, codigoEscrito: 'NAOEXISTE', compradorId: COMPRADOR })
  assert.equal(errado.ok === false ? errado.motivo : null, 'desconhecido',
    'um código errado TEM de ser dito: em silêncio, quem comprou julga que contou e quem indicou nunca percebe porque não recebeu')
  const vazio = referralAceitavel({ referral: null, codigoEscrito: '', compradorId: COMPRADOR })
  sim('não escrever nada não é um erro', !vazio.ok && vazio.motivo === 'codigo_vazio')

  // A coluna de ponte pode estar vazia (4 dos 5 educadores). Sem ela não há comparação possível.
  const semPonte = referralAceitavel({
    referral: { userId: EDUCADOR_PERFIL, codigo: 'R', activo: true },
    codigoEscrito: 'R', compradorId: COMPRADOR, perfilDoEducadorDoProduto: null,
  })
  sim('sem profile_id do educador, a verificação do checkout não apanha (está documentado)', semPonte.ok)
}

// ══════════════ 2. A SOMA DO QUE SAI NÃO PASSA O QUE ENTROU ══════════════

{
  // Uma venda de 100 €, educador a 80%, casa com 20%.
  const p = calcularPartilha({ brutoCents: 10000, partilhaPct: 80 })
  sim('o educador fica com 80,00 €', p.parteEducadorCents === 8000)
  sim('a casa com 20,00 €', p.parteCasaCents === 2000)

  // O CASO MAU: uma regra de comissão de 25% numa venda em que a casa só tem 20%.
  // A regra viva é 5%, mas o teste tem de provar o TECTO, não o número do dia.
  const c = comissaoDoReferral({
    brutoCents: 10000, parteCasaCents: p.parteCasaCents, pct: 25, referralUserId: OUTRA_PESSOA,
  })
  assert.ok(
    c.valorCents <= p.parteCasaCents,
    'A COMISSÃO NUNCA PODE PASSAR A PARTE DA CASA. A parte do educador está congelada por acordo; o que sobra é o único sítio de onde a comissão pode sair.',
  )
  sim('e fica limitada ao tecto, com o tecto registado', c.limitadaAoTectoCents === 2000 && c.valorCents === 2000)

  const contas = contasFecham({
    brutoCents: 10000,
    parteEducadorCents: p.parteEducadorCents,
    parteCasaCents: p.parteCasaCents,
    comissaoReferralCents: c.valorCents,
  })
  assert.ok(contas.fecham, 'as contas desta venda têm de fechar')

  // E a prova de que o verificador não diz sempre que sim.
  const naoFecha = contasFecham({
    brutoCents: 10000, parteEducadorCents: 9000, parteCasaCents: 1000, comissaoReferralCents: 1500,
  })
  assert.ok(!naoFecha.fecham, 'uma comissão maior do que a parte da casa TEM de ser detectada')
}

// A base da comissão é o que ENTROU, nunca o preço de tabela.
{
  // 100 € de tabela, 20% de desconto: entraram 80.
  const p = calcularPartilha({ brutoCents: 8000, partilhaPct: 90 })
  const c = comissaoDoReferral({ brutoCents: 8000, parteCasaCents: p.parteCasaCents, pct: 5, referralUserId: OUTRA_PESSOA })
  assert.equal(c.baseCents, 8000, 'a comissão calcula-se sobre os 80 € que entraram, não sobre os 100 € de tabela')
  assert.ok(c.valorCents === 400, '5% de 80 € são 4 €')
  // Se fosse sobre a tabela, a casa pagava comissão sobre 20 € que nunca existiram.
  sim('sobre a tabela seria mais do que entrou proporcionalmente', Math.floor((10000 * 5) / 100) > c.valorCents)
}

// Sem referral, sem margem, ou sem regra: zero, e com o motivo escrito.
{
  sim('sem referral não há comissão', comissaoDoReferral({ brutoCents: 10000, parteCasaCents: 1000, pct: 10 }).motivoZero === 'sem_referral')
  sim('sem margem não há comissão', comissaoDoReferral({ brutoCents: 10000, parteCasaCents: 0, pct: 10, referralUserId: OUTRA_PESSOA }).motivoZero === 'sem_margem')
  sim('sem regra não há comissão', comissaoDoReferral({ brutoCents: 10000, parteCasaCents: 1000, pct: 0, referralUserId: OUTRA_PESSOA }).motivoZero === 'sem_regra')
  // Lixo não inventa dinheiro.
  for (const v of [NaN, -5, null as unknown as number]) {
    sim(`pct ${String(v)} não paga`, comissaoDoReferral({ brutoCents: 10000, parteCasaCents: 1000, pct: v, referralUserId: OUTRA_PESSOA }).valorCents === 0)
  }
}

// ══════════════ 3. OS CUPÕES ══════════════

const PRODUTO = { id: 'p1', educator_id: 'edu-A', dono: 'educador', preco_cents: 10000 }
const AGORA = '2026-09-15T00:00:00.000Z'
const BOM = {
  id: 'c1', code: 'MKT20', type: 'discount_pct', discount_value: 20,
  plan_override: AMBITO_MARKETPLACE, is_active: true,
}

sim('um cupão de marketplace válido passa', validarCupao({ cupao: BOM, produto: PRODUTO, agoraIso: AGORA }).ok)

// ── Os que dão DIREITOS e não desconto ──────────────────────────────────────────────────
//
// 3 das 5 linhas de parceria da tabela dão VIP. Um código desses num curso de 40 € vendia o pack do
// site inteiro por 40 €.
{
  for (const mau of [
    { ...BOM, type: 'partnership' },
    { ...BOM, grants_vip: true },
    { ...BOM, grant_days: 60 },
  ]) {
    const v = validarCupao({ cupao: mau, produto: PRODUTO, agoraIso: AGORA })
    assert.ok(!v.ok, 'um cupão que dá VIP ou dias de pack NÃO se aplica a um produto avulso')
    assert.equal(v.ok === false ? v.motivo : null, 'da_direitos_de_pack',
      'e recusa-se com motivo NOMEADO, não com um false que o ecrã tem de interpretar')
  }
  for (const tipo of ['free_subscription', 'free_months']) {
    const v = validarCupao({ cupao: { ...BOM, type: tipo }, produto: PRODUTO, agoraIso: AGORA })
    sim(`${tipo} não serve num produto`, !v.ok && v.motivo === 'tipo_nao_serve')
  }
}

// ── O âmbito: o que impede um educador de descontar o produto de outro ──────────────────
{
  const doOutro = { ...BOM, marketplace_produto_id: 'p-outro' }
  assert.ok(!validarCupao({ cupao: doOutro, produto: PRODUTO, agoraIso: AGORA }).ok,
    'um cupão preso a outro produto não desconta este')

  const doOutroEducador = { ...BOM, marketplace_educator_id: 'edu-B' }
  assert.ok(!validarCupao({ cupao: doOutroEducador, produto: PRODUTO, agoraIso: AGORA }).ok,
    'UM CUPÃO DE UM EDUCADOR NÃO DESCONTA O PRODUTO DE OUTRO — seria dinheiro tirado a essa pessoa')

  sim('preso ao educador certo, aplica-se',
    validarCupao({ cupao: { ...BOM, marketplace_educator_id: 'edu-A' }, produto: PRODUTO, agoraIso: AGORA }).ok)

  sim('um cupão de pack do site não vale no marketplace',
    !validarCupao({ cupao: { ...BOM, plan_override: 'premium' }, produto: PRODUTO, agoraIso: AGORA }).ok)

  // Um cupão de educador sem âmbito nenhum seria um cupão dele a descontar a loja toda.
  sim('cupão de educador sem âmbito não se aplica a nada',
    !validarCupao({ cupao: { ...BOM, criado_por_educador: 'edu-A' }, produto: PRODUTO, agoraIso: AGORA }).ok)

  // Um cupão preso a um educador nunca serve num produto da casa (que não tem educador).
  sim('cupão de educador não desconta um produto da casa',
    !validarCupao({
      cupao: { ...BOM, marketplace_educator_id: 'edu-A' },
      produto: { ...PRODUTO, dono: 'casa', educator_id: null }, agoraIso: AGORA,
    }).ok)
}

// ── Prazos e consumo ────────────────────────────────────────────────────────────────────
{
  sim('antes de começar não vale', !validarCupao({ cupao: { ...BOM, valid_from: '2026-12-01T00:00:00Z' }, produto: PRODUTO, agoraIso: AGORA }).ok)
  sim('depois de acabar não vale', !validarCupao({ cupao: { ...BOM, valid_until: '2026-01-01T00:00:00Z' }, produto: PRODUTO, agoraIso: AGORA }).ok)
  sim('uma data ilegível FECHA o cupão', !validarCupao({ cupao: { ...BOM, valid_until: 'logo se vê' }, produto: PRODUTO, agoraIso: AGORA }).ok)
  sim('esgotado não vale', !validarCupao({ cupao: { ...BOM, max_uses: 5 }, produto: PRODUTO, agoraIso: AGORA, usosFeitos: 5 }).ok)
  sim('já usado por mim não vale', !validarCupao({ cupao: BOM, produto: PRODUTO, agoraIso: AGORA, jaUsadoPorEstaPessoa: true }).ok)
  sim('inactivo não vale', !validarCupao({ cupao: { ...BOM, is_active: false }, produto: PRODUTO, agoraIso: AGORA }).ok)
  sim('produto gratuito não leva desconto', !validarCupao({ cupao: BOM, produto: { ...PRODUTO, preco_cents: 0 }, agoraIso: AGORA }).ok)
  sim('um código inexistente recusa-se', !validarCupao({ cupao: null, produto: PRODUTO, agoraIso: AGORA }).ok)
}

// ── O tecto do desconto ─────────────────────────────────────────────────────────────────
{
  const enorme = validarCupao({ cupao: { ...BOM, discount_value: 100 }, produto: PRODUTO, agoraIso: AGORA })
  assert.ok(enorme.ok && enorme.pct === CUPAO_MAX_PCT,
    'um cupão de 100% é cortado no máximo: a 0 € o Stripe recusa a sessão, e uma oferta faz-se com uma compra de fonte "oferta"')
}

// ── Campanha e cupão NÃO se somam ───────────────────────────────────────────────────────
{
  const d = descontoQueVale({ campanhaPct: 20, cupao: { pct: 30 } })
  assert.equal(d.pct, 30, 'vale o MAIOR, nunca a soma — 20 + 30 não são 50')
  sim('e sabe-se que veio do cupão', d.veioDoCupao)
  sim('quando a campanha é maior, é ela que vale', descontoQueVale({ campanhaPct: 40, cupao: { pct: 10 } }).pct === 40)
  sim('empate fica com a campanha, que era a anunciada', !descontoQueVale({ campanhaPct: 20, cupao: { pct: 20 } }).veioDoCupao)
  sim('sem cupão vale a campanha', descontoQueVale({ campanhaPct: 15 }).pct === 15)
}

// ── Quem pode criar cupões ──────────────────────────────────────────────────────────────
{
  assert.ok(
    !podeCriarCupao({ papel: 'educador', educatorId: 'edu-A', marketplaceEducatorId: 'edu-B' }).pode,
    'UM EDUCADOR NÃO CRIA CUPÕES PARA A LOJA DE OUTRO — um cupão de 90% no produto alheio é roubo',
  )
  assert.ok(
    !podeCriarCupao({ papel: 'educador', educatorId: 'edu-A', marketplaceProdutoId: 'p1', produtoDoEducadorId: 'edu-B' }).pode,
    'nem para um produto que não é dele',
  )
  assert.ok(
    !podeCriarCupao({ papel: 'educador', educatorId: 'edu-A' }).pode,
    'nem um cupão global sem âmbito nenhum',
  )
  sim('mas cria para a loja dele', podeCriarCupao({ papel: 'educador', educatorId: 'edu-A', marketplaceEducatorId: 'edu-A' }).pode)
  sim('e para um produto dele', podeCriarCupao({ papel: 'educador', educatorId: 'edu-A', marketplaceProdutoId: 'p1', produtoDoEducadorId: 'edu-A' }).pode)
  sim('o admin pode tudo', podeCriarCupao({ papel: 'admin' }).pode)
  sim('sem sessão não cria nada', !podeCriarCupao({ papel: 'educador' }).pode)
}

sim('o código normaliza para maiúsculas e sem espaços', normalizarCodigo('  mkt20 ') === 'MKT20')

// ══════════════ 4. O CAMINHO ESTÁ LIGADO ══════════════
//
// As regras acima são inúteis se o ramo do marketplace no webhook continuar a sair sem registar a
// venda. Esta varredura é a mesma ideia do `atribuicao.check.ts`, que fatia o webhook para provar
// que o ramo do registo chama o livro.

{
  const COMPRA = readFileSync(join(RAIZ, 'lib/marketplace/compra.ts'), 'utf8')
  assert.ok(
    /registarVendaDoMarketplace\(/.test(COMPRA),
    'a entrega da compra TEM de registar a venda no livro da equipa — sem isso, uma venda do marketplace não existe para o livro e não paga comissão a ninguém, em silêncio',
  )
  sim('e reconfirma a identidade de quem indicou', /referralAceitavel\(/.test(COMPRA))
  sim('e regista o uso do cupão só depois de pago', /coupon_usages/.test(COMPRA))

  const VENDA = readFileSync(join(RAIZ, 'lib/marketplace/venda-equipa.ts'), 'utf8')
  assert.ok(
    /tectoComissaoCents:/.test(VENDA),
    'a venda do marketplace TEM de levar o tecto: 90% já estão prometidos ao educador, e sem tecto uma regra de 15% fazia a casa dever 105% da venda',
  )
  sim('usa o livro da equipa e não uma tabela própria', /registarVendaConfirmada\(/.test(VENDA))

  const CHECKOUT = readFileSync(join(RAIZ, 'app/api/marketplace/checkout/route.ts'), 'utf8')
  assert.ok(
    /validarReferralParaCompra\(/.test(CHECKOUT) && /referral_/.test(CHECKOUT),
    'o checkout TEM de validar o referral ANTES de cobrar e recusar com motivo — um código inválido não pode desaparecer em silêncio',
  )
  sim('e valida o cupão antes de cobrar', /validarCupao\(/.test(CHECKOUT))
  // O contador partido não pode voltar a mandar no limite.
  //
  // Os comentários são retirados antes de procurar — é o idioma do `atribuicao.check.ts`. Sem isso,
  // a própria nota que explica porque é que `used_count` não se usa fazia a guarda falhar, e a
  // saída fácil dessa falha seria apagar a explicação.
  const checkoutSemComentarios = CHECKOUT
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.ok(
    !/used_count/.test(checkoutSemComentarios),
    'o checkout NÃO pode gatilhar em coupons.used_count: está partido desde 25/09 e um limite que nunca dispara não é um limite',
  )

  const LIVRO = readFileSync(join(RAIZ, 'lib/vendas/livro.ts'), 'utf8')
  sim('o livro conhece o tecto', /tectoComissaoCents/.test(LIVRO))
  // O tecto tem de ser opcional: se passasse a obrigatório, todas as vendas de pack mudavam de
  // comportamento por causa de uma alteração feita para o marketplace.
  sim('e é opcional, para não mexer nas vendas que já existem', /tectoComissaoCents\?:/.test(LIVRO))
}

// ── Relatório ─────────────────────────────────────────────────────────────────────────────

if (falhas.length) {
  console.error(`❌ ${falhas.length} falha(s):`)
  for (const f of falhas) console.error(`   · ${f}`)
}
assert.equal(falhas.length, 0, `${falhas.length} invariante(s) de referral/cupões partida(s)`)
console.log(`✅ marketplace/referral+cupões: ${ok} verificações passaram`)

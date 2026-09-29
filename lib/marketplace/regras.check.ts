/**
 * Guarda das regras do marketplace.
 *
 *   npx tsx lib/marketplace/regras.check.ts
 *
 * O que está aqui preso é o que custa dinheiro a alguém quando se parte: a partilha prometida em
 * público, o cadeado do conteúdo pago, e a regra da Apple. Nenhuma destas três dá erro quando
 * falha — dá uma venda mal paga, um curso aberto a quem não pagou, ou uma submissão recusada.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  APPLE_COMISSAO_PCT,
  DEFINICOES_PADRAO,
  PARTILHA_MAX_PCT,
  PARTILHA_MIN_PCT,
  PARTILHA_PADRAO_PCT,
  calcularPartilha,
  comissaoAppleCents,
  estadoAoPublicar,
  euros,
  extractoDoEducador,
  partilhaValida,
  podeComprarAqui,
  podePublicar,
  produtoNaVitrine,
  slugDoTitulo,
  temAcessoAoProduto,
  vitrineVisivelNoIos,
  type Definicoes,
} from './regras'

const RAIZ = join(__dirname, '..', '..')

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

const LIGADO: Definicoes = { ligado: true, revisaoObrigatoria: true, iosVitrine: 'ver_sem_comprar' }
const VENDEDOR = { educator_id: 'e1', activo: true, partilha_pct: 95 }
const PRODUTO_BOM = {
  id: 'p1',
  educator_id: 'e1',
  titulo: 'Curso de Cripto do Zero',
  descricao: 'Oito módulos sobre carteiras, custódia e gestão de risco em cripto, do zero.',
  preco_cents: 9900,
  conteudo_url: 'https://youtube.com/playlist?list=abc',
  estado: 'publicado',
  activo: true,
}

// ══════════════ 1. A PARTILHA PROMETIDA EM PÚBLICO ══════════════
//
// A /criadores diz «90–95%». Estes três números são o contrato.

sim('o mínimo prometido é 90', PARTILHA_MIN_PCT === 90)
sim('o máximo prometido é 95', PARTILHA_MAX_PCT === 95)
assert.equal(
  PARTILHA_PADRAO_PCT,
  PARTILHA_MAX_PCT,
  'por omissão aplica-se o extremo que favorece o educador — entre dois números prometidos, um esquecimento não pode decidir contra ele',
)

// Lixo não pode virar uma percentagem melhor nem pior do que a prometida.
for (const v of [null, undefined, NaN, 'muito', {}, -3, 0, 200, 96, 89.9]) {
  const p = partilhaValida(v)
  sim(`partilhaValida(${String(v)}) fica dentro do prometido`, p >= 90 && p <= 95)
}
sim('90 é aceite tal e qual', partilhaValida(90) === 90)
sim('92,5 é aceite tal e qual', partilhaValida(92.5) === 92.5)

// Venda simples no Stripe: 99,00 €, nada para loja nenhuma.
{
  const p = calcularPartilha({ brutoCents: 9900, partilhaPct: 95 })
  assert.equal(p.parteEducadorCents, 9405, '95% de 99,00 € são 94,05 € para o educador')
  assert.equal(p.parteCasaCents, 495, 'à casa sobram os 5% — 4,95 €')
  assert.equal(
    p.parteEducadorCents + p.parteCasaCents,
    p.liquidoCents,
    'as duas partes somam sempre o líquido: um cêntimo a evaporar-se entre colunas é um extracto que não fecha',
  )
}

// ── O caso que paga do bolso da casa ──────────────────────────────────────────────────────
//
// 100 € vendidos na App Store. A Apple leva 15 antes de o dinheiro chegar cá. Se os 95% fossem
// sobre o BRUTO, a casa entregava 95 € tendo recebido 85: prejuízo de 10 € por venda.
{
  const bruto = 10000
  const loja = comissaoAppleCents(bruto)
  assert.equal(loja, 1500, 'o Small Business Program da Apple leva 15%')
  const p = calcularPartilha({ brutoCents: bruto, comissaoLojaCents: loja, partilhaPct: 95 })
  assert.equal(p.liquidoCents, 8500, 'só há 85,00 € para repartir')
  assert.equal(p.parteEducadorCents, 8075, '95% de 85,00 € — não de 100,00 €')
  assert.ok(
    p.parteCasaCents >= 0,
    'a casa nunca pode ficar com uma parte negativa: era estar a pagar para vender o produto de outra pessoa',
  )
  // A regressão que isto trava, dita pelo número:
  const seFosseSobreOBruto = Math.round((bruto * 95) / 100)
  sim('a conta sobre o bruto seria maior do que o dinheiro recebido', seFosseSobreOBruto > 8500)
}

sim('a comissão da Apple está escrita como 15', APPLE_COMISSAO_PCT === 15)

// Somas fechadas para uma bateria de valores estranhos.
for (const bruto of [0, 1, 7, 99, 3500, 999999]) {
  for (const pct of [90, 92.5, 95]) {
    for (const loja of [0, comissaoAppleCents(bruto), bruto * 2]) {
      const p = calcularPartilha({ brutoCents: bruto, comissaoLojaCents: loja, partilhaPct: pct })
      sim(`soma fecha (${bruto}/${pct}/${loja})`, p.parteEducadorCents + p.parteCasaCents === p.liquidoCents)
      sim(`nada é negativo (${bruto}/${pct}/${loja})`, p.parteEducadorCents >= 0 && p.parteCasaCents >= 0 && p.liquidoCents >= 0)
      sim(`a loja nunca leva mais do que o bruto (${bruto}/${loja})`, p.comissaoLojaCents <= p.brutoCents)
    }
  }
}

// Com 1 cêntimo a repartir, o cêntimo é do educador.
{
  const p = calcularPartilha({ brutoCents: 1, partilhaPct: 95 })
  assert.equal(p.parteEducadorCents, 1, 'o cêntimo do arredondamento vai para quem fez o conteúdo')
  assert.equal(p.parteCasaCents, 0, 'e a casa fica com zero, não com menos um')
}

// ══════════════ 2. QUEM PUBLICA ══════════════

sim('com o marketplace desligado ninguém publica', !podePublicar(PRODUTO_BOM, VENDEDOR, DEFINICOES_PADRAO).pode)
sim('um educador não-activado não publica', !podePublicar(PRODUTO_BOM, { activo: false }, LIGADO).pode)
sim('sem linha de vendedor não publica', !podePublicar(PRODUTO_BOM, null, LIGADO).pode)
sim('um produto completo publica', podePublicar(PRODUTO_BOM, VENDEDOR, LIGADO).pode)

// O defeito que custa mais caro: cobrar e não entregar.
for (const conteudo of [null, '', '   ', 'brevemente', 'ftp://algures', 'javascript:alert(1)']) {
  const r = podePublicar({ ...PRODUTO_BOM, conteudo_url: conteudo }, VENDEDOR, LIGADO)
  sim(`sem link a sério não publica (${String(conteudo)})`, !r.pode)
}
assert.ok(
  !podePublicar({ ...PRODUTO_BOM, descricao: 'Curso bom.' }, VENDEDOR, LIGADO).pode,
  'uma descrição de três palavras é o que a pessoa lê antes de gastar dinheiro — não chega',
)
sim('sem título não publica', !podePublicar({ ...PRODUTO_BOM, titulo: '  ' }, VENDEDOR, LIGADO).pode)
sim('preço negativo não publica', !podePublicar({ ...PRODUTO_BOM, preco_cents: -1 }, VENDEDOR, LIGADO).pode)
sim('grátis publica', podePublicar({ ...PRODUTO_BOM, preco_cents: 0 }, VENDEDOR, LIGADO).pode)

// O motivo é para ser lido pelo educador, não pelo programador.
{
  const r = podePublicar({ ...PRODUTO_BOM, conteudo_url: null }, VENDEDOR, LIGADO)
  sim('o motivo vem escrito em português', /link do conteúdo/i.test(r.motivo ?? ''))
  sim('o motivo não expõe nomes de colunas', !/conteudo_url|preco_cents|null/i.test(r.motivo ?? ''))
}

assert.equal(estadoAoPublicar(LIGADO), 'em_revisao', 'com revisão obrigatória o educador não se publica a si próprio')
assert.equal(estadoAoPublicar({ ...LIGADO, revisaoObrigatoria: false }), 'publicado', 'sem revisão vai directo')

// ══════════════ 3. QUEM VÊ ══════════════
//
// Os três interruptores, um de cada vez.

const MEMBRO = { user_type: 'member', member_category: 'premium', is_active: true }
const ADMIN = { user_type: 'admin', is_active: true }

sim('publicado + tudo ligado aparece', produtoNaVitrine(PRODUTO_BOM, VENDEDOR, LIGADO, MEMBRO))
sim('interruptor geral desligado esconde', !produtoNaVitrine(PRODUTO_BOM, VENDEDOR, DEFINICOES_PADRAO, MEMBRO))
sim('educador desligado esconde', !produtoNaVitrine(PRODUTO_BOM, { activo: false }, LIGADO, MEMBRO))
sim('produto desligado esconde', !produtoNaVitrine({ ...PRODUTO_BOM, activo: false }, VENDEDOR, LIGADO, MEMBRO))
for (const estado of ['rascunho', 'em_revisao', 'retirado']) {
  sim(`${estado} não aparece na vitrine`, !produtoNaVitrine({ ...PRODUTO_BOM, estado }, VENDEDOR, LIGADO, MEMBRO))
}
assert.ok(
  produtoNaVitrine({ ...PRODUTO_BOM, estado: 'em_revisao' }, VENDEDOR, DEFINICOES_PADRAO, ADMIN),
  'o admin vê o que tem de aprovar — aprovar às cegas não é aprovar',
)

// ══════════════ 4. A REGRA DA APPLE ══════════════
//
// É aqui que uma submissão cai. Na app iOS não há caminho de compra NENHUM — nem checkout, nem
// link para fora.

{
  const base = { def: LIGADO, produto: PRODUTO_BOM, vendedor: VENDEDOR }
  assert.ok(podeComprarAqui({ ...base, iosNativo: false }).pode, 'na web compra-se')
  const ios = podeComprarAqui({ ...base, iosNativo: true })
  assert.equal(ios.pode, false, 'na app iOS não há caminho de compra — Guideline 3.1.1')
  assert.equal(ios.motivo, 'ios_iap_required', 'e o motivo é o que o servidor devolve, para o ecrã e a rota dizerem o mesmo')

  sim('já comprado não volta a oferecer compra', !podeComprarAqui({ ...base, iosNativo: false, jaComprou: true }).pode)
  sim('marketplace desligado não vende', !podeComprarAqui({ ...base, def: DEFINICOES_PADRAO, iosNativo: false }).pode)
  sim('vendedor suspenso não vende', !podeComprarAqui({ ...base, vendedor: { activo: false }, iosNativo: false }).pode)
  sim('produto em rascunho não vende', !podeComprarAqui({ ...base, produto: { ...PRODUTO_BOM, estado: 'rascunho' }, iosNativo: false }).pode)
}

sim('por omissão a vitrine aparece no iOS sem comprar', vitrineVisivelNoIos(DEFINICOES_PADRAO))
sim('o dono pode escondê-la de todo', !vitrineVisivelNoIos({ ...LIGADO, iosVitrine: 'esconder' }))

// A terceira opção não existe, e não pode passar a existir por distracção.
{
  const FONTE = readFileSync(join(RAIZ, 'lib/marketplace/regras.ts'), 'utf8')
  sim(
    'as regras não conhecem nenhum modo que abra pagamento externo no iOS',
    !/checkout_externo|stripe_no_ios|ios_stripe/i.test(FONTE),
  )
}

// A rota de checkout tem de ter o travão do servidor. Esconder o botão não chega: o pedido
// chega à mesma se alguém o fizer à mão, e foi assim que o iPad em modo secretária abriu
// checkout Stripe dentro da app (ver lib/is-native-request.ts).
{
  const ROTA = readFileSync(join(RAIZ, 'app/api/marketplace/checkout/route.ts'), 'utf8')
  assert.ok(
    /isIosAppRequest\(/.test(ROTA) && /IOS_IAP_REQUIRED/.test(ROTA),
    'a rota de checkout do marketplace tem de recusar pedidos da app iOS no SERVIDOR',
  )
}

// ══════════════ 5. QUEM ABRE O QUE COMPROU ══════════════

const AGORA = '2026-09-29T12:00:00.000Z'
const COMPRA = { produto_id: 'p1', estado: 'paga', acesso_expira_em: null as string | null }

assert.ok(temAcessoAoProduto([COMPRA], 'p1', AGORA, MEMBRO), 'quem comprou, abre')
assert.ok(!temAcessoAoProduto([COMPRA], 'p2', AGORA, MEMBRO), 'comprar um não abre o outro')
assert.ok(!temAcessoAoProduto([], 'p1', AGORA, MEMBRO), 'quem não comprou, não abre')
assert.ok(!temAcessoAoProduto(null, 'p1', AGORA, MEMBRO), 'sem compras nenhumas, não abre')

assert.ok(
  !temAcessoAoProduto([{ ...COMPRA, estado: 'reembolsada' }], 'p1', AGORA, MEMBRO),
  'um reembolso que não tira o acesso é um desconto de 100%',
)
sim('anulada não abre', !temAcessoAoProduto([{ ...COMPRA, estado: 'anulada' }], 'p1', AGORA, MEMBRO))

// Mentoria com prazo.
sim(
  'dentro do prazo, abre',
  temAcessoAoProduto([{ ...COMPRA, acesso_expira_em: '2026-12-01T00:00:00.000Z' }], 'p1', AGORA, MEMBRO),
)
sim(
  'passado o prazo, fecha',
  !temAcessoAoProduto([{ ...COMPRA, acesso_expira_em: '2026-01-01T00:00:00.000Z' }], 'p1', AGORA, MEMBRO),
)
sim(
  'uma data ilegível não abre a porta',
  !temAcessoAoProduto([{ ...COMPRA, acesso_expira_em: 'qualquer coisa' }], 'p1', AGORA, MEMBRO),
)

// Conta suspensa por falta de pagamento não abre nada — é a alavanca `is_active` da casa.
assert.ok(
  !temAcessoAoProduto([COMPRA], 'p1', AGORA, { ...MEMBRO, is_active: false }),
  'is_active=false fecha tudo, incluindo o que a pessoa comprou enquanto estava activa',
)
sim('sem perfil nenhum, não abre', !temAcessoAoProduto([COMPRA], 'p1', AGORA, null))
sim('o admin abre para poder diagnosticar', temAcessoAoProduto([], 'p1', AGORA, ADMIN))

// ══════════════ 6. O EXTRACTO DO EDUCADOR ══════════════

{
  const linhas = [
    { estado: 'paga', bruto_cents: 9900, parte_educador_cents: 9405 },
    { estado: 'paga', bruto_cents: 4900, parte_educador_cents: 4655 },
    { estado: 'reembolsada', bruto_cents: 9900, parte_educador_cents: 9405 },
    { estado: 'anulada', bruto_cents: 1000, parte_educador_cents: 950 },
  ]
  const e = extractoDoEducador(linhas)
  assert.equal(e.vendas, 2, 'as devolvidas não contam como vendas')
  assert.equal(
    e.aReceberCents,
    14060,
    'prometer ao educador dinheiro de uma venda devolvida é pior do que nunca lho ter mostrado',
  )
  sim('o bruto também ignora as devolvidas', e.brutoCents === 14800)
  const vazio = extractoDoEducador([])
  sim('sem vendas, zeros e não erro', vazio.vendas === 0 && vazio.aReceberCents === 0)
  sim('null não rebenta o extracto', extractoDoEducador(null).vendas === 0)
}

// ══════════════ 7. FORMATO E SLUG ══════════════

sim('cêntimos viram euros', /94/.test(euros(9405)) && /€/.test(euros(9405)))
sim('zero mostra-se', /0/.test(euros(0)))
sim('null não rebenta', typeof euros(null) === 'string')

assert.equal(slugDoTitulo('Curso de Criptomoedas — Nível 1'), 'curso-de-criptomoedas-nivel-1', 'acentos e travessões saem do endereço')
sim('slug não começa nem acaba em traço', !/^-|-$/.test(slugDoTitulo('  !!! Olá !!!  ')))
sim('slug tem tecto', slugDoTitulo('a'.repeat(200)).length <= 60)
sim('título vazio dá slug vazio e não rebenta', slugDoTitulo('') === '')

// ══════════════ 8. O ESQUEMA FECHADO ══════════════
//
// A regra da casa depois dos incidentes das tabelas abertas: nenhuma tabela nova nasce legível
// pela chave `anon`, que está no bundle do browser.

{
  const SQL = readFileSync(join(RAIZ, 'supabase/migrations/151_marketplace_educadores.sql'), 'utf8')
  for (const t of ['marketplace_educadores', 'marketplace_produtos', 'marketplace_compras', 'marketplace_payouts']) {
    sim(`${t} tem RLS ligada`, new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(SQL))
    sim(`${t} é revogada a anon`, new RegExp(`revoke all on public\\.${t}\\s+from anon`).test(SQL))
  }
  sim('nenhuma política diz using (true)', !/using\s*\(\s*true\s*\)/i.test(SQL))
  assert.ok(
    /"ligado":\s*false/.test(SQL),
    'o marketplace nasce desligado: um menu que leva a uma montra vazia ensina quem lá entra que o menu mente',
  )
  sim('o interruptor por educador nasce desligado', /activo boolean not null default false/.test(SQL))
  sim('a partilha está presa entre 90 e 100 no próprio esquema', /partilha_pct >= 90/.test(SQL))
  sim('as compras têm chave de idempotência única', /unique index[\s\S]*marketplace_compras_referencia/.test(SQL))
}

// ── Relatório ─────────────────────────────────────────────────────────────────────────────

if (falhas.length) {
  console.error(`❌ ${falhas.length} falha(s):`)
  for (const f of falhas) console.error(`   · ${f}`)
}
assert.equal(falhas.length, 0, `${falhas.length} invariante(s) do marketplace partida(s)`)
console.log(`✅ marketplace: ${ok} verificações passaram`)

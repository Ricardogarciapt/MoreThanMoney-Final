/**
 * Guarda dos DIREITOS: comprar no marketplace não é ficar membro da casa.
 *
 *   npx tsx lib/marketplace/direitos.check.ts
 *
 * O que está preso aqui não dá erro quando parte. Dá um comprador de um curso de 40 € com pack de
 * Membro pago sem nunca o ter pagado, ou um Premium sem acesso porque cancelou a mentoria de um
 * educador. As duas coisas são silenciosas, e as duas custam dinheiro.
 *
 * Testa-se o caso MAU, e não só o bom: metade destas verificações existe para confirmar que o
 * webhook NÃO escreve, e uma guarda que só testa o caminho feliz não teria apanhado nada disto.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FONTE_MARKETPLACE,
  faturaEhDoMarketplace,
  metadataDizMarketplace,
  planoDaSubscricao,
  subscricaoEhDoMarketplace,
} from './subscricao-stripe'
import { baseDoUsername, emailNormalizado, emailServeParaComprar } from './comprador'
import { compradorSemPack, ehCompradorDoMarketplace } from './comprador-marca'
import { isRegisteredMember } from '@/lib/member-access'
import { determinePostLoginRedirect } from '@/lib/role-redirect'

const RAIZ = join(__dirname, '..', '..')

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// O catálogo da casa é lido do ambiente na hora — por isso pode ser montado aqui.
process.env.STRIPE_PRICE_PREMIUM_MONTHLY = 'price_premium_mensal'
process.env.STRIPE_PRICE_APP_MEMBER_MONTHLY = 'price_membro_mensal'

const PRECO_MENTORIA = 'price_mentoria_do_educador'
const doMarketplace = (p: string) => p === PRECO_MENTORIA

const subComPreco = (priceId: string, metadata: unknown = {}, metadataDoPreco: unknown = {}) => ({
  id: 'sub_1',
  metadata,
  items: { data: [{ price: { id: priceId, metadata: metadataDoPreco } }] },
})

// ══════════════ 1. RECONHECER UMA SUBSCRIÇÃO DE MARKETPLACE ══════════════

sim('a metadata da subscrição basta', subscricaoEhDoMarketplace(subComPreco('price_desconhecido', { source: FONTE_MARKETPLACE }), () => false))
sim('a metadata do preço basta', subscricaoEhDoMarketplace(subComPreco('price_desconhecido', {}, { source: FONTE_MARKETPLACE }), () => false))
sim('o preço de um produto da montra basta', subscricaoEhDoMarketplace(subComPreco(PRECO_MENTORIA), doMarketplace))
sim('um plano da casa NÃO é marketplace', !subscricaoEhDoMarketplace(subComPreco('price_premium_mensal'), doMarketplace))
sim('um preço desconhecido, por si, não é marketplace', !subscricaoEhDoMarketplace(subComPreco('price_desconhecido'), doMarketplace))
sim('uma subscrição sem itens não é marketplace', !subscricaoEhDoMarketplace({ id: 's', items: { data: [] } }, doMarketplace))
sim('nada não é marketplace', !subscricaoEhDoMarketplace(null, doMarketplace))

// Mista: um item do marketplace e um plano da casa. Continua a ser do plano principal — negar o
// Premium a quem o paga é o pior dos dois erros, e o preço desconhecido está fechado à parte.
sim(
  'uma subscrição mista continua a ser do plano principal',
  !subscricaoEhDoMarketplace(
    { id: 's', items: { data: [{ price: { id: PRECO_MENTORIA } }, { price: { id: 'price_premium_mensal' } }] } },
    doMarketplace,
  ),
)

sim('o discriminador é o mesmo que a sessão já usava', FONTE_MARKETPLACE === 'marketplace_product')
sim('metadataDizMarketplace ignora outras fontes', !metadataDizMarketplace({ source: 'mtmfunded_program' }))
sim('e ignora metadata vazia', !metadataDizMarketplace(null))

// ══════════════ 2. RECONHECER UMA FATURA DE MARKETPLACE ══════════════

sim(
  'a fatura pela metadata da subscrição',
  faturaEhDoMarketplace({ id: 'in_1', subscription_details: { metadata: { source: FONTE_MARKETPLACE } }, lines: { data: [] } }, () => false),
)
sim(
  'a fatura pelo preço da linha (forma antiga)',
  faturaEhDoMarketplace({ id: 'in_1', lines: { data: [{ price: { id: PRECO_MENTORIA } }] } }, doMarketplace),
)
sim(
  'a fatura pelo preço da linha (forma nova: pricing.price_details)',
  faturaEhDoMarketplace({ id: 'in_1', lines: { data: [{ pricing: { price_details: { price: PRECO_MENTORIA } } }] } }, doMarketplace),
)
sim(
  'uma fatura do plano da casa NÃO é marketplace',
  !faturaEhDoMarketplace({ id: 'in_1', lines: { data: [{ price: { id: 'price_premium_mensal' } }] } }, doMarketplace),
)
sim('uma fatura sem linhas não é marketplace', !faturaEhDoMarketplace({ id: 'in_1', lines: { data: [] } }, doMarketplace))

// ══════════════ 3. O RECURSO QUE DAVA MEMBRO DE GRAÇA ══════════════
//
// Era `getPlanIdFromPriceId(priceId) || metadata.plan || 'app_member_monthly'`. Um preço fora do
// catálogo virava «Membro mensal» e escrevia member_category/subscription_plan no perfil.

sim('o catálogo da casa resolve o plano', planoDaSubscricao({ priceId: 'price_premium_mensal' }) === 'premium_monthly')
sim('a metadata do preço resolve o plano (é assim que o pack de fundador nasce sem deploy)', planoDaSubscricao({ priceId: 'price_novo', metadataDoPreco: { plan: 'founder_premium_scanners' } }) === 'founder_premium_scanners')
sim('a metadata da subscrição também serve', planoDaSubscricao({ priceId: 'price_novo', metadataDaSubscricao: { plan: 'elite_annual' } }) === 'elite_annual')
sim('o catálogo ganha à metadata', planoDaSubscricao({ priceId: 'price_premium_mensal', metadataDoPreco: { plan: 'app_member_monthly' } }) === 'premium_monthly')

assert.equal(
  planoDaSubscricao({ priceId: PRECO_MENTORIA }),
  null,
  'um preço fora do catálogo e sem metadata.plan TEM de dar null — adivinhar «app_member_monthly» dava pack de Membro pago a quem comprou a mentoria de um educador',
)
sim('sem preço e sem metadata também dá null', planoDaSubscricao({}) === null)
sim('metadata.plan vazia não conta', planoDaSubscricao({ priceId: 'px', metadataDoPreco: { plan: '   ' } }) === null)

// ══════════════ 4. O WEBHOOK SAI ANTES DE ESCREVER DIREITOS ══════════════

{
  const WEBHOOK = semComentarios(readFileSync(join(RAIZ, 'app/api/stripe/webhook/route.ts'), 'utf8'))

  assert.ok(
    !/getPlanIdFromPriceId\(priceId\)\s*\|\|[\s\S]{0,80}'app_member_monthly'/.test(WEBHOOK),
    'o recurso «app_member_monthly» para um preço desconhecido TEM de estar fora do tratador de subscrições',
  )
  sim('o plano vem de planoDaSubscricao', /planoDaSubscricao\(/.test(WEBHOOK))

  // A guarda tem de estar nos QUATRO tratadores que escrevem no perfil a partir de eventos de
  // subscrição/fatura. Faltar num deles é um caminho aberto, e foi assim que este defeito existiu.
  const nMarcasSub = (WEBHOOK.match(/ehSubscricaoDeMarketplace\(/g) ?? []).length
  const nMarcasFat = (WEBHOOK.match(/ehFaturaDeMarketplace\(/g) ?? []).length
  sim('a guarda está no created/updated E no deleted', nMarcasSub >= 2)
  sim('a guarda está no payment_succeeded E no payment_failed', nMarcasFat >= 2)

  // A ORDEM: dentro de cada tratador, a guarda vem antes da escrita. Verifica-se por tratador,
  // cortando o ficheiro nas assinaturas — um `indexOf` global passaria com a guarda no sítio errado.
  const corpo = (nome: string) => {
    const i = WEBHOOK.indexOf(`async function ${nome}(`)
    assert.ok(i >= 0, `tratador ${nome} não encontrado`)
    const resto = WEBHOOK.slice(i + 1)
    const fim = resto.indexOf('\nasync function ')
    return fim < 0 ? resto : resto.slice(0, fim)
  }

  for (const [nome, guarda, escrita] of [
    ['handleSubscriptionUpdate', 'ehSubscricaoDeMarketplace(', 'member_category:'],
    ['handleSubscriptionCanceled', 'ehSubscricaoDeMarketplace(', 'is_active: false'],
    ['handlePaymentSucceeded', 'ehFaturaDeMarketplace(', 'is_active: true'],
    ['handlePaymentFailed', 'ehFaturaDeMarketplace(', 'payment_failed_count: failCount'],
  ] as const) {
    const c = corpo(nome)
    const g = c.indexOf(guarda)
    const e = c.indexOf(escrita)
    sim(`${nome} reconhece o marketplace`, g >= 0)
    sim(`${nome} sai ANTES de escrever no perfil`, g >= 0 && e >= 0 && g < e)
  }
}

// ══════════════ 5. A CONTA DO COMPRADOR NASCE SEM DIREITOS ══════════════

{
  const COMPRADOR = semComentarios(readFileSync(join(RAIZ, 'lib/marketplace/comprador.ts'), 'utf8'))

  for (const campo of [
    'member_category',
    'subscription_plan',
    'subscription_status',
    'subscription_expires_at',
    'subscription_platform',
    'subscription_billing_cycle',
    'stripe_subscription_id',
  ]) {
    assert.ok(
      !new RegExp(`${campo}\\s*:`).test(COMPRADOR),
      `a conta do comprador NÃO pode escrever ${campo} — um comprador de um curso é um comprador, não um membro`,
    )
  }

  // A marca NÃO pode voltar ao `user_type`: `profiles_user_type_check` só aceita
  // ('member','admin','pending','guest','presentation','inactive','vip','tournament'), e um valor
  // novo ali fazia o insert falhar — a compra do visitante era recusada e a funcionalidade nascia
  // morta até alguém aplicar uma migração. Ver `comprador-marca.ts`.
  assert.ok(
    !/user_type:\s*'comprador'/.test(COMPRADOR),
    'a marca de comprador não pode viver no user_type: o CHECK da coluna não aceita valores novos',
  )
  sim('o user_type usado existe no CHECK da coluna', /user_type:\s*'member'/.test(COMPRADOR))
  sim('a conta do comprador fica marcada em profile_data', /marketplace:\s*\{\s*comprador:\s*true/.test(COMPRADOR))
  sim('e marcada como pendente até o pagamento entrar', /pendente_pagamento:\s*true/.test(COMPRADOR))
  sim('nunca cria uma segunda conta para o mesmo email', /ilike\('email'/.test(COMPRADOR))
  // O convite NÃO pode sair na criação: senão a rota vira uma forma de mandar emails nossos a
  // qualquer endereço que alguém escreva.
  const criacao = COMPRADOR.slice(
    COMPRADOR.indexOf('export async function contaDoComprador'),
    COMPRADOR.indexOf('export async function compraEntregue'),
  )
  assert.ok(
    !/sendPasswordRecoveryEmail|generatePasswordRecoveryLink/.test(criacao),
    'o email de acesso NÃO pode sair na criação da conta — só depois de o pagamento entrar',
  )
  sim('o convite sai na entrega da compra', /generatePasswordRecoveryLink/.test(COMPRADOR.slice(COMPRADOR.indexOf('export async function compraEntregue'))))

  const COMPRA = semComentarios(readFileSync(join(RAIZ, 'lib/marketplace/compra.ts'), 'utf8'))
  sim('a entrega da compra chama o convite', /compraEntregue\(/.test(COMPRA))
}

// ══════════════ 6. O EMAIL E O NOME DE UTILIZADOR ══════════════

sim('email com maiúsculas e espaços normaliza', emailNormalizado('  Ana@Mail.COM ') === 'ana@mail.com')
sim('um email simples serve', emailServeParaComprar('ana@mail.com'))
sim('um email com + serve (é válido e é comum)', emailServeParaComprar('ana+curso@mail.com'))
sim('sem arroba não serve', !emailServeParaComprar('ana.mail.com'))
sim('sem domínio não serve', !emailServeParaComprar('ana@mail'))
sim('vazio não serve', !emailServeParaComprar('   '))
sim('o username sai do email', baseDoUsername('Ana.Silva@mail.com') === 'ana.silva')
sim('caracteres que a coluna não aceita caem', /^[a-z0-9._-]+$/.test(baseDoUsername('añá!!@mail.com')))
sim('um local part curto não faz um username inválido', baseDoUsername('a@mail.com').length >= 3)

// ══════════════ 7. O CHECKOUT ACEITA VISITANTE — E COTA-O COMO VISITANTE ══════════════

{
  const ROTA = readFileSync(join(RAIZ, 'app/api/marketplace/checkout/route.ts'), 'utf8')
  const limpo = semComentarios(ROTA)

  assert.ok(
    !/if \(!sessao\) return NextResponse\.json\(\{ error: 'Autenticação necessária' \}/.test(limpo),
    'o checkout do marketplace não pode recusar um visitante: comprar não exige login',
  )
  sim('o visitante identifica-se pelo email', /emailServeParaComprar\(/.test(limpo) && /contaDoComprador\(/.test(limpo))
  sim('sem email utilizável, recusa antes de cobrar', /code: 'email_necessario'/.test(limpo))
  // O PREÇO: um visitante é cotado com perfil nulo. Sem isto, escrever o email de um Premium dava o
  // desconto de campanha reservado a membros.
  sim('o visitante é cotado sem perfil', /perfil: null/.test(limpo))
  sim('o preço continua a sair da mesma função da montra', /precoEfectivo\(produto, agora, quem\.perfil\)/.test(limpo))
  // O travão da Apple continua a ser a PRIMEIRA coisa, antes de identificar quem quer que seja.
  const posIos = limpo.indexOf('isIosAppRequest(')
  sim('o travão do iOS continua antes de tudo', posIos >= 0 && posIos < limpo.indexOf('contaDoComprador('))
  // A metadata do marketplace tem de viajar TAMBÉM na subscrição: é isso que fecha o defeito na raiz
  // para os produtos recorrentes criados de agora em diante.
  sim('a subscrição leva o discriminador', /subscription_data:\s*\{\s*metadata:\s*\{\s*source:\s*'marketplace_product'/.test(limpo))
}

// ══════════════ 8. UM COMPRADOR ENTRA NA CONTA, SEM PACK ══════════════

const COMPRADOR_PERFIL = {
  user_type: 'member',
  is_active: true,
  profile_data: { marketplace: { comprador: true, pendente_pagamento: false } },
}

sim('a marca lê-se', ehCompradorDoMarketplace(COMPRADOR_PERFIL))
sim('um perfil sem marca não é comprador', !ehCompradorDoMarketplace({ profile_data: {} }))
sim('profile_data lixo não rebenta', !ehCompradorDoMarketplace({ profile_data: 'texto' } as never))
sim('comprador sem pack é comprador', compradorSemPack(COMPRADOR_PERFIL))
sim('o comprador é uma conta reconhecida', isRegisteredMember(COMPRADOR_PERFIL))
sim('mas suspenso não entra', !isRegisteredMember({ ...COMPRADOR_PERFIL, is_active: false }))
sim('o destino dele é a biblioteca', determinePostLoginRedirect(COMPRADOR_PERFIL) === '/marketplace/biblioteca')

// E sem a marca, um perfil igual continua a não ser membro: é a prova de que a marca é o que muda a
// resposta, e não o `user_type: 'member'` que o comprador partilha com um membro a sério.
sim('sem marca e sem plano não há pack', !isRegisteredMember({ user_type: 'member', is_active: true }))

/**
 * O CASO QUE A MARCA SOZINHA DEIXAVA PASSAR.
 *
 * A marca fica no perfil para sempre. Se as portas lessem só a marca, um comprador que depois pagasse
 * um Premium continuava a entrar em tudo mesmo com a subscrição expirada — uma compra de 40 € a
 * servir de chave permanente ao que se deixou de pagar.
 */
const EX_PREMIUM_QUE_COMPROU_UM_CURSO = {
  ...COMPRADOR_PERFIL,
  member_category: 'premium',
  subscription_plan: 'premium' as const,
  subscription_status: 'canceled',
}
assert.ok(
  !compradorSemPack(EX_PREMIUM_QUE_COMPROU_UM_CURSO),
  'com pack — activo ou expirado — a marca de comprador deixa de mandar, e as regras normais do pack decidem',
)
// E ao contrário: tirando o pack ao mesmo perfil, volta a ser um comprador.
sim('sem pack, volta a ser comprador', compradorSemPack(COMPRADOR_PERFIL))

// ── Relatório ─────────────────────────────────────────────────────────────────────────────

if (falhas.length) {
  console.error(`❌ ${falhas.length} falha(s):`)
  for (const f of falhas) console.error(`   · ${f}`)
}
assert.equal(falhas.length, 0, `${falhas.length} invariante(s) dos direitos partida(s)`)
console.log(`✅ marketplace/direitos: ${ok} verificações passaram`)

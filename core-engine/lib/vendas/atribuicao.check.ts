/**
 * GUARDA da atribuição: A QUEM PERTENCE ESTE PAGAMENTO.
 *
 * O que isto prende é o defeito que custou dinheiro a pessoas: a 26/09 havia 97 negócios no
 * pipeline, 0 com `comprador_id`, e as duas portas do dinheiro só sabiam procurar por essa coluna.
 * Nenhum pagamento encontrava a equipa que o tinha trabalhado. As três provas de identidade
 * (comprador já ligado, id do perfil na chave de origem, email único) ficam presas aqui, e com elas
 * a regra que importa mais do que todas: COM DOIS CANDIDATOS NÃO SE ESCOLHE.
 *
 * E prende também que as duas portas continuam a usar o MESMO resolvedor. Quando tinham caminhos
 * diferentes podiam responder diferente sobre o mesmo euro — e aí ou pagava duas vezes (tabela de
 * papéis mais binário) ou não pagava a ninguém.
 *
 *   npx tsx lib/vendas/atribuicao.check.ts
 */
import { readFileSync } from 'node:fs'
import { emailComparavel, escolherNegocio, idDePerfilNaChaveOrigem, type NegocioCandidato } from './atribuicao'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

const UUID_A = '8a3df358-9460-4fb1-9eee-d4eee571f6fe'
const UUID_B = '5ddb6c08-e58c-4979-86f7-683d79e0a102'

const candidato = (extra: Partial<NegocioCandidato> = {}): NegocioCandidato => ({
  id: 'n-1',
  estado: 'lead',
  comprador_id: null,
  email: null,
  chave_origem: null,
  atualizado_em: '2026-09-01T00:00:00Z',
  ...extra,
})

// ── O id do perfil escondido na chave de origem ──
// Não é heurística: quem escreveu a chave tinha o uuid na mão. Mas um `perfil:` com lixo atrás não
// é ligação nenhuma, e aceitá-lo era atribuir uma venda a um negócio ao acaso.
teste('lê o uuid de perfil:<uuid>', idDePerfilNaChaveOrigem(`perfil:${UUID_A}`) === UUID_A)
teste('lê maiúsculas como minúsculas', idDePerfilNaChaveOrigem(`perfil:${UUID_A.toUpperCase()}`) === UUID_A)
teste('recusa perfil: sem uuid', idDePerfilNaChaveOrigem('perfil:12345') === null)
teste('recusa uuid truncado', idDePerfilNaChaveOrigem('perfil:8a3df358-9460-4fb1-9eee') === null)
teste('ignora outras origens', idDePerfilNaChaveOrigem('telegram:999000222') === null)
teste('ignora chave de IB', idDePerfilNaChaveOrigem('ib:hantec:x@y.pt') === null)
teste('aguenta nulo', idDePerfilNaChaveOrigem(null) === null)

// ── O email compara-se sem maiúsculas e sem espaços, e NADA MAIS ──
// Normalizar à maneira do Gmail (tirar pontos, cortar no `+`) faria dois emails diferentes parecerem
// a mesma pessoa — e é exactamente aí que uma comissão vai para a mão errada.
teste('email sem maiúsculas e sem espaços', emailComparavel('  Rui@MTM.PT ') === 'rui@mtm.pt')
teste('email vazio é nulo', emailComparavel('   ') === null)
teste('não corta no +alias', emailComparavel('rui+mtm@gmail.com') === 'rui+mtm@gmail.com')
teste('não tira pontos', emailComparavel('r.u.i@gmail.com') === 'r.u.i@gmail.com')

// ── As três provas, por ordem de força ──
{
  const r = escolherNegocio([candidato({ id: 'n-lig', comprador_id: UUID_A })], UUID_A, 'rui@mtm.pt')
  teste('comprador já ligado ganha', r.negocioId === 'n-lig' && r.via === 'comprador')
}
{
  const r = escolherNegocio([candidato({ id: 'n-chave', chave_origem: `perfil:${UUID_A}` })], UUID_A, null)
  teste('chave de origem serve quando não há ligação', r.negocioId === 'n-chave' && r.via === 'chave_perfil')
}
{
  const r = escolherNegocio([candidato({ id: 'n-mail', email: 'Rui@MTM.pt' })], UUID_A, 'rui@mtm.pt')
  teste('email fecha o buraco do lead trabalhado antes do registo', r.negocioId === 'n-mail' && r.via === 'email')
}
{
  // A ordem importa: uma ligação feita à mão manda sobre uma descoberta por email.
  const r = escolherNegocio(
    [candidato({ id: 'n-mail', email: 'rui@mtm.pt' }), candidato({ id: 'n-lig', comprador_id: UUID_A })],
    UUID_A,
    'rui@mtm.pt',
  )
  teste('a ligação explícita manda sobre o email', r.negocioId === 'n-lig' && r.via === 'comprador')
}
{
  const r = escolherNegocio(
    [candidato({ id: 'n-mail', email: 'rui@mtm.pt' }), candidato({ id: 'n-chave', chave_origem: `perfil:${UUID_A}` })],
    UUID_A,
    'rui@mtm.pt',
  )
  teste('a chave de origem manda sobre o email', r.negocioId === 'n-chave' && r.via === 'chave_perfil')
}

// ── COM DOIS CANDIDATOS NÃO SE ESCOLHE ──
// Esta é a regra que protege as pessoas: atribuir ao palpite paga a uma e tira à outra, e isso não
// se desfaz com um deploy. Fica marcado `ambiguo` e vai a uma pessoa.
{
  const r = escolherNegocio(
    [candidato({ id: 'n-1', email: 'rui@mtm.pt' }), candidato({ id: 'n-2', email: 'RUI@mtm.pt' })],
    UUID_A,
    'rui@mtm.pt',
  )
  teste('dois negócios com o mesmo email não se decidem', r.negocioId === null && r.ambiguo)
  teste('e a ambiguidade diz-se em palavras', /decidido por uma pessoa/.test(r.motivo))
}
{
  // Mas o mesmo negócio visto por dois caminhos não é ambiguidade nenhuma: é a mesma linha.
  const mesmo = candidato({ id: 'n-1', email: 'rui@mtm.pt' })
  const r = escolherNegocio([mesmo, { ...mesmo }], UUID_A, 'rui@mtm.pt')
  teste('a mesma linha duas vezes não é ambígua', r.negocioId === 'n-1' && !r.ambiguo)
}

// ── Um negócio perdido não paga a ninguém ──
// Quem desistiu da pessoa não a trouxe de volta quando ela comprou por outro caminho.
{
  const r = escolherNegocio([candidato({ estado: 'perdido', comprador_id: UUID_A })], UUID_A, 'rui@mtm.pt')
  teste('negócio perdido não conta', r.negocioId === null && !r.ambiguo)
}
{
  // E um perdido não pode fazer um vivo parecer ambíguo — senão bastava um lead morto para travar
  // o pagamento de uma venda legítima.
  const r = escolherNegocio(
    [candidato({ id: 'n-morto', estado: 'perdido', email: 'rui@mtm.pt' }), candidato({ id: 'n-vivo', email: 'rui@mtm.pt' })],
    UUID_A,
    'rui@mtm.pt',
  )
  teste('um perdido não torna o vivo ambíguo', r.negocioId === 'n-vivo' && !r.ambiguo)
}

// ── Não se atribui a quem não se conhece ──
teste('sem comprador e sem email não há negócio', escolherNegocio([candidato({ email: 'x@y.pt' })], null, null).negocioId === null)
teste('email de outra pessoa não serve', escolherNegocio([candidato({ email: 'outro@y.pt' })], UUID_A, 'rui@mtm.pt').negocioId === null)
teste('chave de outro perfil não serve', escolherNegocio([candidato({ chave_origem: `perfil:${UUID_B}` })], UUID_A, null).negocioId === null)
teste('sem candidatos nenhuns', escolherNegocio([], UUID_A, 'rui@mtm.pt').negocioId === null)

// ── Entre iguais, o mais recentemente trabalhado ──
{
  const r = escolherNegocio(
    [
      candidato({ id: 'n-velho', comprador_id: UUID_A, atualizado_em: '2026-01-01T00:00:00Z' }),
      candidato({ id: 'n-novo', comprador_id: UUID_A, atualizado_em: '2026-09-25T00:00:00Z' }),
    ],
    UUID_A,
    null,
  )
  teste('fica o negócio mais recente', r.negocioId === 'n-novo')
}

// ── AS DUAS PORTAS DO DINHEIRO USAM O MESMO RESOLVEDOR ──
// Se uma delas voltar a procurar por `comprador_id` à mão, volta o desacerto que fazia o mesmo euro
// pagar duas vezes ou nenhuma. Por isso verifica-se no código, não na intenção.
// O que se proíbe é procurar o NEGÓCIO por `comprador_id` à mão. Contar os pagamentos de um
// comprador em `vendas_vendas` por essa coluna é outra coisa e continua certo — por isso o padrão
// tem de olhar para a tabela e não só para a coluna.
for (const porta of ['lib/vendas/livro.ts', 'lib/vendas/exclusividade.ts']) {
  const limpo = readFileSync(porta, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  teste(`${porta} usa o resolvedor único`, /resolverNegocioDoComprador\(/.test(limpo))
  teste(
    `${porta} não procura o negócio por comprador_id à mão`,
    !/from\(\s*'vendas_negocios'\s*\)[\s\S]{0,400}?\.eq\(\s*'comprador_id'/.test(limpo),
  )
}

// ── A INGESTÃO GRAVA O COMPRADOR ──
// Foi aqui que tudo começou: criava-se o negócio a partir de um perfil, com o uuid na mão, e não se
// gravava. Deixar de gravar outra vez é deixar de pagar outra vez.
{
  const src = readFileSync('lib/backoffice-dia-ingestao.ts', 'utf8')
  const limpo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  teste('a ingestão grava comprador_id quando o lead nasce de um perfil', /comprador_id:\s*String\(p\.id\)/.test(limpo))
}

// ── O REGISTO-E-PAGAMENTO NO MESMO CHECKOUT TAMBÉM É UMA VENDA ──
// Este caminho do webhook do Stripe saía com um `return` antes de registar a venda, e é o caminho
// principal de aquisição: quem a equipa traz de fora não tem conta antes de pagar. Perdia
// exactamente as vendas novas — as que pagam a percentagem do primeiro pagamento.
{
  const src = readFileSync('app/api/stripe/webhook/route.ts', 'utf8')
  const inicio = src.indexOf("pending_registration === 'true'")
  const fimDoRamo = src.indexOf('scanner_guest_checkout')
  const ramo = inicio > 0 && fimDoRamo > inicio ? src.slice(inicio, fimDoRamo) : ''
  teste('o ramo do registo pago registra a venda', /registarVendaDaEquipa\(/.test(ramo))
  teste('e leva o email do checkout, que pode ser a única identidade', /emailComprador:/.test(ramo))
}

// ── A APPLE ENTRA NO LIVRO ──
// Nenhum caminho da Apple escrevia em `vendas_vendas`: quem vendia pela app não pagava a quem a
// trabalhou. E a rota que NÃO verifica a assinatura continua de fora, de propósito.
{
  for (const porta of ['app/api/apple/iap/webhook/route.ts', 'app/api/apple/iap/validate/route.ts']) {
    const limpo = readFileSync(porta, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    teste(`${porta} registra a venda no livro`, /registarVendaConfirmada\(/.test(limpo))
    teste(`${porta} registra-a como fonte apple`, /fonte:\s*'apple'/.test(limpo))
  }
  const asn = readFileSync('app/api/subscriptions/apple-server-notifications/route.ts', 'utf8')
  teste(
    'a rota da Apple sem verificação de assinatura NÃO cria comissões',
    !/registarVendaConfirmada\(/.test(asn.replace(/\/\*[\s\S]*?\*\//g, '')),
  )
}

if (falhas.length) {
  console.error(`vendas/atribuicao: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('vendas/atribuicao: três provas de identidade, ambiguidade não se decide, e as duas portas procuram igual ✓')

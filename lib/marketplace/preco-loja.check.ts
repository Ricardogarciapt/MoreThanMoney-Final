/**
 * Guarda do preço que se actualiza sozinho (produtos de terceiros: Ledger, Solana Seeker).
 *
 *   npx tsx lib/marketplace/preco-loja.check.ts
 *
 * O que se prende aqui: o parser lê o preço certo do HTML REAL das lojas (fixtures gravadas a
 * 06/10/2026), uma leitura falhada não mexe no preço, uma variação absurda é recusada, o cron nunca
 * escreve estado nem link, e o link Ledger leva sempre o código de afiliado do dono.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COLUNAS_QUE_O_CRON_ESCREVE,
  LEDGER_AFILIADO_R,
  VARIACAO_MAXIMA,
  decidirActualizacao,
  fontePrecoLedger,
  lerPrecoDoHtml,
  linkAfiliadoLedger,
  linkLedgerTemAfiliado,
} from './preco-loja'
import { SUBCATEGORIAS_PRODUTO } from './regras'

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}
const fixture = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')
const AGORA = '2026-10-06T22:00:00.000Z'

// ══════════════ 1. O PARSER, COM O HTML REAL ══════════════
{
  const nx = lerPrecoDoHtml(fixture('ledger-nano-x.html'), 'https://shop.ledger.com/products/ledger-nano-x/onyx-black?country=PT')
  sim('Nano X: 99 €', nx?.cents === 9900 && nx?.moeda === 'eur' && nx?.fonte === 'jsonld')

  // A página do Flex tem SETE variantes (seis a 249 e a Bonk Edition a 259): escolhe-se a do caminho.
  const flex = lerPrecoDoHtml(fixture('ledger-flex.html'), 'https://shop.ledger.com/products/ledger-flex/graphite?country=PT')
  sim('Flex Graphite: 249 €', flex?.cents === 24900 && flex?.moeda === 'eur')
  const bonk = lerPrecoDoHtml(fixture('ledger-flex.html'), 'https://shop.ledger.com/products/ledger-flex/bonk-edition?country=PT')
  sim('Flex Bonk Edition: a variante certa (259 €), não a primeira', bonk?.cents === 25900)
  sim('variante que não existe na página: não lê a de outra cor',
    lerPrecoDoHtml(fixture('ledger-flex.html'), 'https://shop.ledger.com/products/ledger-flex/cor-inventada') === null)

  const sk = lerPrecoDoHtml(fixture('solana-seeker.html'), 'https://store.solanamobile.com')
  sim('Seeker: 250 com 500 riscado, sem moeda na página', sk?.cents === 25000 && sk?.baseCents === 50000 && sk?.moeda === null && sk?.fonte === 'next-preco')

  sim('HTML sem preço: null', lerPrecoDoHtml('<html><head><title>Erro</title></head></html>', 'https://shop.ledger.com/products/x') === null)
  sim('preço 0 no JSON-LD: null',
    lerPrecoDoHtml('<script type="application/ld+json">{"@type":"Product","offers":{"price":"0","priceCurrency":"EUR"}}</script>', 'https://x.test/p') === null)
  sim('meta product:price:amount também serve',
    lerPrecoDoHtml('<meta property="product:price:amount" content="12.50"><meta property="product:price:currency" content="EUR">', 'https://x.test/p')?.cents === 1250)
}

// ══════════════ 2. FALHA DE LEITURA NÃO MEXE NO PREÇO ══════════════
{
  const actual = { preco_cents: 9900, moeda: 'eur', preco_base_cents: null }
  const d = decidirActualizacao(actual, null, AGORA, 'HTTP 503')
  sim('falha: não actualiza', !d.actualiza)
  sim('falha: o patch não leva preço nem moeda', !('preco_cents' in d.patch) && !('moeda' in d.patch) && !('preco_base_cents' in d.patch))
  sim('falha: regista o erro e a hora', String(d.patch.preco_erro).includes('HTTP 503') && d.patch.preco_erro_em === AGORA)

  const zero = decidirActualizacao(actual, { cents: 0, moeda: 'eur', baseCents: null, fonte: 'jsonld' }, AGORA)
  sim('preço 0: recusado', !zero.actualiza && !('preco_cents' in zero.patch))

  const moeda = decidirActualizacao(actual, { cents: 9900, moeda: 'usd', baseCents: null, fonte: 'jsonld' }, AGORA)
  sim('moeda diferente (geolocalização trocada): recusado', !moeda.actualiza && !('preco_cents' in moeda.patch))
}

// ══════════════ 3. VARIAÇÃO ABSURDA É RECUSADA ══════════════
{
  const actual = { preco_cents: 10000, moeda: 'eur' }
  const lido = (cents: number) => ({ cents, moeda: 'eur', baseCents: null, fonte: 'jsonld' as const })
  sim('limite é 60%', VARIACAO_MAXIMA === 0.6)
  sim('+61%: recusado', !decidirActualizacao(actual, lido(16100), AGORA).actualiza)
  sim('−61%: recusado', !decidirActualizacao(actual, lido(3900), AGORA).actualiza)
  sim('×100 (cêntimos lidos como euros): recusado', !decidirActualizacao(actual, lido(1000000), AGORA).actualiza)
  const meia = decidirActualizacao(actual, lido(5000), AGORA)
  sim('−50% (campanha a sério): aceite', meia.actualiza && meia.patch.preco_cents === 5000)
  const igual = decidirActualizacao(actual, lido(10000), AGORA)
  sim('igual: aceite e limpa o erro antigo', igual.actualiza && igual.patch.preco_erro === null && igual.patch.preco_lido_em === AGORA)
  const sk = decidirActualizacao({ preco_cents: 25000, moeda: 'usd' }, { cents: 25000, moeda: null, baseCents: 50000, fonte: 'next-preco' }, AGORA)
  sim('sem moeda na página: fica a do produto (usd) e guarda o «antes»', sk.actualiza && sk.patch.moeda === 'usd' && sk.patch.preco_base_cents === 50000)
}

// ══════════════ 4. O CRON NUNCA MEXE NO ESTADO NEM NO LINK ══════════════
{
  const proibidas = ['estado', 'activo', 'checkout_externo_url', 'publicado_em', 'tipo', 'subcategoria']
  sim('a lista de colunas do cron não tem nenhuma proibida', proibidas.every((c) => !(COLUNAS_QUE_O_CRON_ESCREVE as readonly string[]).includes(c)))
  const casos = [
    decidirActualizacao({ preco_cents: 9900, moeda: 'eur' }, { cents: 9900, moeda: 'eur', baseCents: null, fonte: 'jsonld' }, AGORA),
    decidirActualizacao({ preco_cents: 9900, moeda: 'eur' }, null, AGORA),
  ]
  sim('nenhum patch sai das colunas do cron', casos.every((d) =>
    Object.keys(d.patch).every((k) => (COLUNAS_QUE_O_CRON_ESCREVE as readonly string[]).includes(k))))

  const rota = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'cron', 'marketplace-precos', 'route.ts'), 'utf8')
  sim('a rota do cron escreve só o patch decidido', /\.update\(d\.patch\)/.test(rota) && !/checkout_externo_url\s*:/.test(rota) && !/estado\s*:/.test(rota))
  sim('a rota do cron está protegida por CRON_SECRET', /isCronAuthorized/.test(rota))
  const vercel = readFileSync(join(__dirname, '..', '..', 'vercel.json'), 'utf8')
  sim('o cron está no vercel.json', vercel.includes('/api/cron/marketplace-precos'))
}

// ══════════════ 5. O LINK DE AFILIADO LEVA SEMPRE r=0de5eaac7911 ══════════════
{
  sim('o código é o do dono', LEDGER_AFILIADO_R === '0de5eaac7911')
  const l = linkAfiliadoLedger('https://shop.ledger.com/products/ledger-nano-x/onyx-black')
  sim('link limpo ganha r e tracker', l === 'https://shop.ledger.com/products/ledger-nano-x/onyx-black?r=0de5eaac7911&tracker=mtm-marketplace')
  const outro = linkAfiliadoLedger('https://shop.ledger.com/products/ledger-flex/graphite?r=outrapessoa&country=PT')
  sim('um r de outra pessoa é substituído', new URL(outro).searchParams.getAll('r').join() === LEDGER_AFILIADO_R && !outro.includes('country='))
  sim('linkLedgerTemAfiliado reconhece o bom', linkLedgerTemAfiliado(l))
  sim('linkLedgerTemAfiliado recusa sem r', !linkLedgerTemAfiliado('https://shop.ledger.com/products/ledger-flex/graphite'))
  sim('linkLedgerTemAfiliado recusa r de outro', !linkLedgerTemAfiliado('https://shop.ledger.com/products/ledger-flex/graphite?r=abc'))
  let rebentou = false
  try { linkAfiliadoLedger('https://ledger.com.phishing.test/products/x') } catch { rebentou = true }
  sim('só a shop.ledger.com recebe o código', rebentou)
  // A fonte do preço NÃO é o link: vai sem r (não conta cliques do cron) e em EUR.
  const fonte = fontePrecoLedger(l)
  sim('fonte do preço: EUR e sem o código de afiliado', fonte.endsWith('?country=PT') && !fonte.includes('r='))

  // Os links gravados (SQL dos produtos) levam o código — lido do ficheiro de dados da migração.
  const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '194_marketplace_produtos_ledger.sql'), 'utf8')
  const links = sql.match(/https:\/\/shop\.ledger\.com\/products\/[^'\s]+\?r=[^'\s]+/g) ?? []
  sim('há links Ledger no SQL', links.length >= 5)
  sim('todos os links Ledger do SQL levam r=0de5eaac7911', links.every((x) => linkLedgerTemAfiliado(x)))
}

// ══════════════ 6. SUBCATEGORIAS ══════════════
{
  sim('«Tech Crypto» existe', SUBCATEGORIAS_PRODUTO.includes('Tech Crypto'))
  const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '193_marketplace_subcategoria_e_preco_da_loja.sql'), 'utf8')
  sim('o SQL aceita subcategorias até 40 caracteres e todas cabem', /between 1 and 40/.test(sql) && SUBCATEGORIAS_PRODUTO.every((s) => s.length <= 40))
}

if (falhas.length) {
  console.error(`✗ ${falhas.length} falha(s):\n  - ${falhas.join('\n  - ')}`)
  process.exit(1)
}
console.log(`✓ preço da loja: ${ok} verificações`)

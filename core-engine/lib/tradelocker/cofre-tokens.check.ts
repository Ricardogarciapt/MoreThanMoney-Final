/**
 * GUARDA do cofre das fichas TradeLocker.
 *
 * 25/09: o Ricardo foi expulso da sua própria corretora porque, sem memória entre execuções, cada
 * passagem do cron fazia um LOGIN COMPLETO e a TradeLocker só admite uma sessão por utilizador.
 * As três regras abaixo são as que não podem cair.
 *
 *   npx tsx lib/tradelocker/cofre-tokens.check.ts
 */
import { readFileSync } from 'node:fs'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

const cliente = readFileSync('lib/tradelocker/client.ts', 'utf8')
const cofre = readFileSync('lib/tradelocker/cofre-tokens.ts', 'utf8')
const ligacao = readFileSync('lib/tradelocker/ligacao.ts', 'utf8')
const contas = readFileSync('lib/webtrader/contas.ts', 'utf8')

// 1. Guardar depois de RENOVAR, não só depois do login. A TradeLocker pode devolver um refreshToken
//    novo e queimar o anterior: sem isto a execução seguinte pegava num refresh gasto e ia de novo
//    ao login completo — que é precisamente o que se está a evitar.
const trechoRefresh = cliente.slice(cliente.indexOf('const novo = await refrescar'), cliente.indexOf('const tokens = await autenticar'))
teste('guarda a ficha depois de renovar', /cofre\?\./.test(trechoRefresh))
teste('guarda a ficha depois do login completo', /autenticar[\s\S]{0,200}cofre\?\./.test(cliente))

// 2. SEMEAR antes de usar. Um cofre que só escreve e nunca lê não poupa um único login.
teste('a sessão das contas do site semeia do cofre', /semearDoCofre\(/.test(ligacao))
teste('a sessão das contas da app semeia do cofre', /semearDoCofre\(/.test(contas))

// 3. O cofre NUNCA trava uma sessão: sem tabela, com a chave trocada ou com a linha adulterada,
//    volta-se ao comportamento de antes em vez de deixar o trader sem corretora.
teste('tolera a tabela não existir', /semTabela/.test(cofre))
teste('linha ilegível não rebenta', /decifrar\([\s\S]{0,120}if \(!claro\) return/.test(cofre))
teste('escrever no cofre nunca atrasa o pedido', /void guardarTokens/.test(cofre))
// 4. O email não fica em claro numa tabela cuja única função é guardar fichas.
teste('a chave da linha é um digest, não o email', /createHash\('sha256'\)/.test(cofre))

if (falhas.length) {
  console.error(`cofre-tokens: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('cofre-tokens: guarda ao renovar e ao autenticar, semeia antes de usar, e nunca trava a sessão ✓')

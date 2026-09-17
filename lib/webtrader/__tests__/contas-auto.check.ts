/**
 * WebTrader × contas da app MTM Auto: TradeLocker do MTM Auto, chave MetaApi da equipa, MTM Funded
 * ligada com investor, MT4 no seletor, e a passagem de sessão da app (/webtrader/app).
 * Correr: npx tsx lib/webtrader/__tests__/contas-auto.check.ts
 */
import assert from 'node:assert/strict'
import { chaveContaTL, chaveMetaApiDaConta, fundedLigadasAlheias, modoFundedPelaLigacao, tradeLockerAutoListavel } from '../contas-auto-regras'
import { lerRefConta, refTexto } from '../corretoras/regras'
import { montarSeletor } from '../seletor'
import { criarLimitadorEmissoes, decidirPassagem, destinoDaEntrada, payloadJwt, tokenRecente, IDADE_MAX_TOKEN_S } from '../sessao-app'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const U = '11111111-2222-3333-4444-555555555555'
const V = '99999999-8888-7777-6666-555555555555'

// ── 1. TradeLocker ligada no MTM Auto ────────────────────────────────────────────────────────
caso('ref tradelocker:auto:<uuid> lida e reescrita; origens desconhecidas recusadas', () => {
  assert.deepEqual(lerRefConta('tradelocker', `tradelocker:auto:${U}`), { plataforma: 'tradelocker', origem: 'auto', id: U })
  assert.equal(refTexto(lerRefConta('tradelocker', `tradelocker:auto:${U}`)!), `tradelocker:auto:${U}`)
  assert.equal(lerRefConta('tradelocker', `tradelocker:auto:123`), null)
  assert.equal(lerRefConta('tradelocker', `tradelocker:wt:${U}`), null)
  // MT5 continua sem aceitar origens de TradeLocker
  assert.equal(lerRefConta('mt5', `mt5:sessao:123`), null)
})
caso('só entra TradeLocker do MTM Auto com conta escolhida (id + nº)', () => {
  assert.equal(tradeLockerAutoListavel({ plataforma: 'tradelocker', tl_account_id: '7', tl_acc_num: '1' }), true)
  assert.equal(tradeLockerAutoListavel({ plataforma: 'TradeLocker', tl_account_id: '7', tl_acc_num: '1' }), true)
  assert.equal(tradeLockerAutoListavel({ plataforma: 'tradelocker', tl_account_id: '7', tl_acc_num: null }), false)
  assert.equal(tradeLockerAutoListavel({ plataforma: 'mt5', tl_account_id: '7', tl_acc_num: '1' }), false)
})
caso('mesma conta TradeLocker no site e no MTM Auto → mesma chave (aparece uma vez)', () => {
  assert.equal(chaveContaTL('LIVE', 7), chaveContaTL('live', '7'))
  assert.notEqual(chaveContaTL('live', 7), chaveContaTL('demo', 7))
})

// ── 2. Chave MetaApi ─────────────────────────────────────────────────────────────────────────
caso('conta auto: de equipa com chave → chave da equipa; sem chave → casa', () => {
  assert.deepEqual(chaveMetaApiDaConta({ origem: 'auto', contaId: U, tenantId: 'T', tokenEquipa: 'eq', tokenCasa: 'casa' }), { chave: 'equipa:T', token: 'eq' })
  assert.deepEqual(chaveMetaApiDaConta({ origem: 'auto', contaId: U, tenantId: 'T', tokenEquipa: null, tokenCasa: 'casa' }), { chave: 'casa', token: 'casa' })
  assert.deepEqual(chaveMetaApiDaConta({ origem: 'auto', contaId: U, tenantId: null, tokenEquipa: null, tokenCasa: 'casa' }), { chave: 'casa', token: 'casa' })
})
caso('contas site:/wt: usam SEMPRE a casa, mesmo que venha uma chave de equipa', () => {
  for (const origem of ['site', 'wt'] as const) {
    assert.deepEqual(chaveMetaApiDaConta({ origem, contaId: U, tenantId: 'T', tokenEquipa: 'eq', tokenCasa: 'casa' }), { chave: 'casa', token: 'casa' })
  }
  assert.equal(chaveMetaApiDaConta({ origem: 'site', contaId: U, tenantId: null, tokenEquipa: null, tokenCasa: null }), null)
})

// ── 3. MTM Funded ligada com investor ────────────────────────────────────────────────────────
caso('dona → master; ligada sem ser dona → investor (mesmo sem marca de leitura); nada → sem acesso', () => {
  assert.equal(modoFundedPelaLigacao({ accountId: U, donoId: 'eu', userId: 'eu', ligacoes: [] }), 'master')
  assert.equal(modoFundedPelaLigacao({ accountId: U, donoId: 'outro', userId: 'eu', ligacoes: [{ funded_account_id: U, funded_somente_leitura: true }] }), 'investor')
  assert.equal(modoFundedPelaLigacao({ accountId: U, donoId: 'outro', userId: 'eu', ligacoes: [{ funded_account_id: U, funded_somente_leitura: false }] }), 'investor')
  assert.equal(modoFundedPelaLigacao({ accountId: U, donoId: 'outro', userId: 'eu', ligacoes: [{ funded_account_id: V }] }), null)
  assert.equal(modoFundedPelaLigacao({ accountId: U, donoId: null, userId: 'eu', ligacoes: [] }), null)
})
caso('lista de alheias: sem as próprias e sem repetidos', () => {
  assert.deepEqual(fundedLigadasAlheias([{ funded_account_id: U }, { funded_account_id: U }, { funded_account_id: V }, { funded_account_id: null }], [V]), [U])
})
caso('seletor: funded investor marcada só leitura; MT4 com etiqueta MT4', () => {
  const e = montarSeletor({
    funded: [
      { id: U, mt5_login: '77000001', etiqueta: 'F1', estadoCurto: 'Active', sim_saldo: 1, sim_equity: 1 },
      { id: V, mt5_login: '77000002', etiqueta: 'F2', estadoCurto: 'Active', sim_saldo: 1, sim_equity: 1, modo: 'investor' },
    ],
    reais: [
      { ref: `mt5:auto:${U}`, plataforma: 'mt5', rotulo: null, etiquetaDoDono: null, login: '1', servidor: 's', demo: false, real: true, bloqueada: null, origem: 'ligador', versao: 'mt4' },
      { ref: `mt5:site:${V}`, plataforma: 'mt5', rotulo: null, etiquetaDoDono: null, login: '2', servidor: 's', demo: false, real: true, bloqueada: null, origem: 'ligador' },
      { ref: `tradelocker:auto:${U}`, plataforma: 'tradelocker', rotulo: null, etiquetaDoDono: null, login: '3', servidor: 'x', demo: true, real: true, bloqueada: null, origem: 'ligador' },
    ],
  })
  assert.equal(e.find((x) => x.id === U)!.modo, 'master')
  const inv = e.find((x) => x.id === V)!
  assert.equal(inv.modo, 'investor')
  assert.match(inv.estadoCurto, /só leitura/)
  assert.equal(e.find((x) => x.id === `mt5:auto:${U}`)!.etiqueta, 'MT4')
  assert.equal(e.find((x) => x.id === `mt5:site:${V}`)!.etiqueta, 'MT5')
  assert.equal(e.find((x) => x.id === `tradelocker:auto:${U}`)!.etiqueta, 'TradeLocker')
})

// ── 4. Passagem de sessão da app ─────────────────────────────────────────────────────────────
const jwt = (p: Record<string, unknown>) => `x.${Buffer.from(JSON.stringify(p)).toString('base64url')}.y`
caso('payload do JWT lido; lixo dá null', () => {
  assert.deepEqual(payloadJwt(jwt({ iat: 5, sub: 'a' })), { iat: 5, sub: 'a' })
  assert.equal(payloadJwt('abc'), null)
  assert.equal(payloadJwt('a.%%%.c'), null)
})
caso('token só serve se foi emitido há ≤ 10 min (60 s de folga para relógios adiantados)', () => {
  const agora = 1_800_000_000_000
  const s = agora / 1000
  assert.equal(tokenRecente({ iat: s - 30 }, agora), true)
  assert.equal(tokenRecente({ iat: s - IDADE_MAX_TOKEN_S }, agora), true)
  assert.equal(tokenRecente({ iat: s - IDADE_MAX_TOKEN_S - 1 }, agora), false)
  assert.equal(tokenRecente({ iat: s + 30 }, agora), true)
  assert.equal(tokenRecente({ iat: s + 600 }, agora), false)
  assert.equal(tokenRecente({}, agora), false)
  assert.equal(tokenRecente(null, agora), false)
})
caso('limitador: 6 por janela por utilizador, e a janela liberta', () => {
  const l = criarLimitadorEmissoes(6, 1000)
  for (let i = 0; i < 6; i++) assert.equal(l.permitir('a', 0), true)
  assert.equal(l.permitir('a', 10), false)
  assert.equal(l.permitir('b', 10), true)
  assert.equal(l.permitir('a', 1001), true)
})
caso('decisão da página: sair / manter / trocar', () => {
  assert.equal(decidirPassagem({ tokenApp: null, userIdApp: 'a', userIdAtual: 'a' }), 'sair')
  assert.equal(decidirPassagem({ tokenApp: 't', userIdApp: null, userIdAtual: 'a' }), 'sair')
  assert.equal(decidirPassagem({ tokenApp: 't', userIdApp: 'a', userIdAtual: 'a' }), 'manter')
  assert.equal(decidirPassagem({ tokenApp: 't', userIdApp: 'a', userIdAtual: 'b' }), 'trocar')
  assert.equal(decidirPassagem({ tokenApp: 't', userIdApp: 'a', userIdAtual: null }), 'trocar')
})
caso('destino: /webtrader com a query da entrada, nunca outro caminho', () => {
  assert.equal(destinoDaEntrada(''), '/webtrader')
  assert.equal(destinoDaEntrada('?'), '/webtrader')
  assert.equal(destinoDaEntrada('?symbol=XAUUSD&dir=buy'), '/webtrader?symbol=XAUUSD&dir=buy')
  assert.equal(destinoDaEntrada('symbol=X'), '/webtrader?symbol=X')
  assert.ok(destinoDaEntrada('?//evil.com').startsWith('/webtrader?'))
})

console.log(`\ncontas-auto: ${n} casos ok`)

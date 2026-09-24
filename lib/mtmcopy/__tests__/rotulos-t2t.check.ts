/**
 * O NOME DE UMA FONTE T2T é o mesmo em todo o lado.
 *
 * Havia dois mapas — um no painel do admin, outro na rota que a app lê — e não diziam o mesmo:
 * `ideias-e-sinais` era «Ideias e Sinais» para o admin e «Ideias Forex Swings» para o cliente, e o
 * mapa da app nem conhecia `premium-ideas`, `sinais-goldkiller` e `sensei-scanner` (nesses o
 * cliente via o slug cru). Agora é uma tabela só, alinhada com `chat_channels.name`.
 *
 *   npx tsx lib/mtmcopy/__tests__/rotulos-t2t.check.ts
 */
import assert from 'node:assert/strict'
import { ROTULOS_CANAIS_T2T, rotuloCanalT2T, T2T_SIGNAL_CHANNELS } from '../tap-to-trade-channels'

let ok = 0
const caso = (nome: string, f: () => void) => { f(); ok++; console.log(`  ok  ${nome}`) }

/** Os canais que o admin pode ligar/desligar à mão (app/api/admin/mtmcopy/t2t-controls). */
const EXTRAS_DO_ADMIN = ['aurum-flow', 'premium-ideas', 'sinais-scanner-mtm', 'trade-ideas-setup', 'ideias-e-sinais', 'sinais-goldkiller', 'sensei-scanner']

caso('todo o canal que o admin liga tem nome — nenhum cai no slug cru', () => {
  const semNome = EXTRAS_DO_ADMIN.filter((c) => rotuloCanalT2T(c) === c)
  assert.deepEqual(semNome, [], `sem nome: ${semNome.join(', ')}`)
})

caso('todo o canal de sinais T2T tem nome', () => {
  const semNome = T2T_SIGNAL_CHANNELS.filter((c) => rotuloCanalT2T(c) === c && c !== 'trade-ideas')
  assert.deepEqual(semNome, [], `sem nome: ${semNome.join(', ')}`)
})

caso('os nomes são os de chat_channels.name (24/09) — o que a pessoa lê a seguir', () => {
  // Fotografia da base. Se o canal for renomeado, o nome vivo passa por `rotuloCanalT2T(slug, nome)`
  // e esta tabela é só a rede de segurança — mas continuar a divergir é como isto começou.
  assert.equal(ROTULOS_CANAIS_T2T['ideias-e-sinais'], 'Ideias e Sinais')
  assert.equal(ROTULOS_CANAIS_T2T['premium-ideas'], 'MTM Auto Premium')
  assert.equal(ROTULOS_CANAIS_T2T['sensei-scanner'], 'MTM Auto Sensei')
  assert.equal(ROTULOS_CANAIS_T2T['sinais-goldkiller'], 'Sinais Scanner Gold Killer')
  assert.equal(ROTULOS_CANAIS_T2T['sinais-scanner-mtm'], 'MTM Auto Edge/Wolf/King')
  assert.equal(ROTULOS_CANAIS_T2T['aurum-flow'], 'MTM Auto Aurum Flow & Perpétuos')
  assert.equal(ROTULOS_CANAIS_T2T['trade-ideas-setup'], 'Ideias de Forex')
})

caso('os perpétuos e o Aurum Flow dizem o mesmo (foram fundidos a 18/09)', () => {
  assert.equal(rotuloCanalT2T('cripto-perps'), rotuloCanalT2T('aurum-flow'))
})

caso('o nome vivo do canal ganha ao canónico; sem nenhum, fica o slug', () => {
  assert.equal(rotuloCanalT2T('aurum-flow', 'Outro nome'), 'Outro nome')
  assert.equal(rotuloCanalT2T('aurum-flow', '   '), 'MTM Auto Aurum Flow & Perpétuos')
  assert.equal(rotuloCanalT2T('canal-que-nao-existe'), 'canal-que-nao-existe')
})

console.log(`\n${ok} verificações OK`)

import assert from 'node:assert/strict'
import { ETIQUETA_MAX, etiquetaDaLinha, nomeMostrado, normalizarEtiqueta, tabelaDaEtiqueta } from '../etiqueta'

/**
 * A etiqueta de conta (113): corte a 40, trim, vazio → null, sem `<`/`>`.
 * Correr: npx tsx lib/contas/__tests__/etiqueta.check.ts
 */

// ── o caso normal ─────────────────────────────────────────────────────────────────────────────
assert.equal(normalizarEtiqueta('Conta grande'), 'Conta grande')
assert.equal(normalizarEtiqueta('Teste Sensei'), 'Teste Sensei')
assert.equal(normalizarEtiqueta('Conta nº 2 — PU Prime'), 'Conta nº 2 — PU Prime', 'acentos e sinais ficam')

// ── trim e espaços repetidos ──────────────────────────────────────────────────────────────────
assert.equal(normalizarEtiqueta('   Conta grande   '), 'Conta grande')
assert.equal(normalizarEtiqueta('Conta    grande'), 'Conta grande', 'espaços repetidos viram um')
assert.equal(normalizarEtiqueta('Conta\tgrande\nmesmo'), 'Conta grande mesmo', 'tabs e linhas novas viram espaço')
assert.equal(normalizarEtiqueta(' Conta grande '), 'Conta grande', 'espaços invisíveis do copy-paste')

// ── vazio → null (é opcional: apagar a etiqueta é legítimo) ───────────────────────────────────
assert.equal(normalizarEtiqueta(''), null)
assert.equal(normalizarEtiqueta('    '), null)
assert.equal(normalizarEtiqueta('\n\t  '), null)
assert.equal(normalizarEtiqueta(null), null)
assert.equal(normalizarEtiqueta(undefined), null)
assert.equal(normalizarEtiqueta(123), null, 'não-texto não rebenta')
assert.equal(normalizarEtiqueta({ etiqueta: 'x' }), null)
assert.equal(normalizarEtiqueta(['x']), null)
assert.equal(normalizarEtiqueta(true), null)

// ── sem HTML: `<` e `>` saem, o resto do texto fica ───────────────────────────────────────────
assert.equal(normalizarEtiqueta('<b>Conta</b>'), 'bConta/b', 'os sinais saem, não se guarda marcação')
assert.equal(normalizarEtiqueta('<script>alert(1)</script>'), 'scriptalert(1)/script')
assert.equal(normalizarEtiqueta('<img src=x onerror=y>'), 'img src=x onerror=y')
assert.equal(normalizarEtiqueta('<<<>>>'), null, 'só sinais → vazio → null')
assert.equal(normalizarEtiqueta('a < b'), 'a b', 'o sinal sai e os espaços colapsam')

// ── corte a 40 ────────────────────────────────────────────────────────────────────────────────
assert.equal(ETIQUETA_MAX, 40)
assert.equal(normalizarEtiqueta('a'.repeat(41)), 'a'.repeat(40))
assert.equal(normalizarEtiqueta('a'.repeat(4000))?.length, 40)
const quarenta = 'Conta de auditoria da casa em PU Prime!!'
assert.equal(quarenta.length, 40)
assert.equal(normalizarEtiqueta(quarenta), quarenta, '40 exactos passam inteiros')
// 39 caracteres + espaço + mais texto: o corte a 40 cai EM CIMA do espaço, que não fica na ponta.
assert.equal(
  normalizarEtiqueta(`${'c'.repeat(39)} fora`),
  'c'.repeat(39),
  'o corte não deixa espaço na ponta',
)
// O corte a meio de uma palavra é aceite (o limite é de caracteres, não de palavras).
assert.equal(normalizarEtiqueta(`${quarenta}xyz`), quarenta)
// O corte é feito DEPOIS de limpar: espaços à direita não gastam caracteres.
assert.equal(normalizarEtiqueta(`   ${'b'.repeat(40)}   `), 'b'.repeat(40))

// ── já normalizada: segunda passagem não muda nada (idempotente) ──────────────────────────────
for (const v of ['Conta grande', 'a'.repeat(40), 'Conta nº 2 — PU Prime']) {
  assert.equal(normalizarEtiqueta(normalizarEtiqueta(v)), normalizarEtiqueta(v), `idempotente em ${v}`)
}

// ── etiquetaDaLinha: a coluna pode ainda não existir (113 por aplicar) ────────────────────────
assert.equal(etiquetaDaLinha({ etiqueta: ' Conta grande ' }), 'Conta grande')
assert.equal(etiquetaDaLinha({}), null, 'linha sem a coluna → null, nunca undefined')
assert.equal(etiquetaDaLinha({ etiqueta: null }), null)
assert.equal(etiquetaDaLinha(null), null)
assert.equal(etiquetaDaLinha(undefined), null)
assert.equal(etiquetaDaLinha({ etiqueta: 'x'.repeat(99) })?.length, 40, 'lê-se cortada, mesmo se a base tiver mais')

// ── nomeMostrado: sem etiqueta mostra-se o nome de sempre (não partir nada) ───────────────────
assert.equal(nomeMostrado('Conta grande', 'MT5'), 'Conta grande')
assert.equal(nomeMostrado(null, 'MT5'), 'MT5')
assert.equal(nomeMostrado(undefined, 'TradeLocker'), 'TradeLocker')
assert.equal(nomeMostrado('', 'F1'), 'F1')
assert.equal(nomeMostrado('   ', 'F1'), 'F1', 'etiqueta só com espaços = sem etiqueta')
assert.equal(nomeMostrado(' Conta ', 'MT5'), 'Conta')

// ── tabelaDaEtiqueta: a referência do seletor → onde gravar ──────────────────────────────────
const U = '11111111-2222-3333-4444-555555555555'
assert.deepEqual(tabelaDaEtiqueta(`mtmfunded:${U}`), { tabela: 'mtm_trading_accounts', id: U })
assert.deepEqual(tabelaDaEtiqueta(`mt5:site:${U}`), { tabela: 'mtmcopy_connections', id: U })
assert.deepEqual(tabelaDaEtiqueta(`tradelocker:site:${U}`), { tabela: 'mtmcopy_connections', id: U })
assert.deepEqual(tabelaDaEtiqueta(`mt5:auto:${U}`), { tabela: 'mtmauto_accounts', id: U })
assert.deepEqual(tabelaDaEtiqueta(`tradelocker:auto:${U}`), { tabela: 'mtmauto_accounts', id: U })
assert.deepEqual(tabelaDaEtiqueta(`mt5:wt:${U}`), { tabela: 'webtrader_contas_mt5', id: U })
assert.deepEqual(tabelaDaEtiqueta(`MT5:SITE:${U.toUpperCase()}`), null, 'a plataforma e a origem são exactas')
assert.deepEqual(tabelaDaEtiqueta(`mt5:site:${U.toUpperCase()}`), { tabela: 'mtmcopy_connections', id: U.toUpperCase() }, 'o UUID pode vir em maiúsculas')

// Sessão TradeLocker do separador: não há linha na base onde gravar.
assert.equal(tabelaDaEtiqueta('tradelocker:sessao:123456'), null)
assert.equal(tabelaDaEtiqueta(`tradelocker:wt:${U}`), null, 'a conta do WebTrader é sempre MT5')
// Nada de refs inventadas nem de injecção pelo nome da tabela.
for (const mau of [
  null, undefined, '', 'mtmfunded', `mtmfunded:${U}:x`, 'mtmfunded:nao-uuid', `outra:site:${U}`,
  `mt5:outra:${U}`, 'mt5:site:', 'mt5:site:1', `mt5:site:${U};drop table`, `profiles:site:${U}`,
  42, {}, [`mt5:site:${U}`], `mt5:site:${U} `,
]) {
  assert.equal(tabelaDaEtiqueta(mau as unknown), null, `devia recusar ${JSON.stringify(mau)}`)
}

console.log('  ok  etiqueta de conta (113): corte a 40, trim, vazio→null, sem <>, ref→tabela')

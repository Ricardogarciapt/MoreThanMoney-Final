/**
 * GUARDA DAS CARTEIRAS DO DONO — os quatro casos maus que erravam em silêncio.
 *
 * As duas contas de portefólio (173) são capital real do dono com a carteira em
 * `portefolio_movimentos`, não em `funded_positions`. Quatro decisões sobre elas davam a resposta
 * errada sem nunca falhar:
 *
 *  1. «de onde vem a equity?» — o detalhe CALCULAVA-A (saldo + flutuante das posições abertas).
 *     Sem posições na tabela, o flutuante dava 0 e a equity saía igual ao saldo: a conta Cripto,
 *     2 632 $ ABAIXO do contribuído, aparecia como se estivesse a zero. É o caso mau nº 1 aqui.
 *  2. «o histórico» — somava zero tendo 2 139 linhas na base, porque lia a tabela errada.
 *  3. «esta conta é minha?» — `minhas = total − mestres` fazia com que uma conta mestre nunca
 *     pudesse ser minha, e o capital do dono desaparecia de «As minhas».
 *  4. «que crachá leva?» — dizia «Funded», o nome de um programa de avaliação, numa conta de
 *     dinheiro verdadeiro.
 *
 *   npx tsx lib/mtmfunded/portefolio.check.ts
 */
import assert from 'node:assert/strict'
import {
  carteiraDoPortefolio, diarioDoPortefolio, ehContaPortefolio, estadoDePortefolio,
  historicoDoPortefolio, resumoDoPortefolio, semanaDe, tipoDoMovimento,
  type MovimentoPortefolio,
} from './portefolio'
import { ehContaDaCasa, ehContaMestre, ehContaMinha, ehContaPortefolioDaCasa } from './contas-da-casa'
import { contarPorTipo, filtrarEntradas, temDoisTipos } from '../webtrader/filtro-contas'
import { pastilhaDaConta } from '../webtrader/seletor'
import { estadoDaConta } from './simulado/matematica'

let falhas = 0
function teste(nome: string, f: () => void) {
  try {
    f()
    console.log(`  ok  ${nome}`)
  } catch (e) {
    falhas++
    console.error(`  ✗   ${nome}\n      ${(e as Error).message}`)
  }
}

/** A conta Cripto como a base a tem (01/10/2026). */
const CRIPTO = {
  id: 'c4d32cde-c583-4e84-8a26-b83f9dd4ee08',
  mt5_login: 'PORTF-CRIPTO',
  tipo: 'provider',
  estado: 'ativa',
  motor: 'sim',
  conta_casa: true,
  conta_real_casa: true,
  conta_portefolio: true,
  saldo_inicial: 1_000,
  sim_saldo: 7_230,
  sim_equity: 4_598,
}

// ── 1. DE ONDE VEM A EQUITY ─────────────────────────────────────────────────────────────────
teste('CASO MAU: tabela de posições vazia → flutuante 0 → equity = saldo, e a perda desaparece', () => {
  // Exactamente o que o detalhe fazia: estado da conta sobre ZERO posições abertas.
  const calculado = estadoDaConta(7_230, 100, [], {}, {})
  assert.equal(calculado.flutuante, 0, 'sem posições, o flutuante é zero')
  assert.equal(calculado.equity, 7_230, 'e a equity sai igual ao saldo')
  assert.equal(
    calculado.equity - 7_230, 0,
    'o ecrã apresentava a conta como se estivesse a zero — e ela está 2 632 $ abaixo',
  )

  // A correcção: a equity é LIDA do valor de mercado gravado (a mesma fonte do seletor).
  const lido = estadoDePortefolio(7_230, 4_598)
  assert.ok(lido, 'com valor de mercado gravado há estado de carteira')
  assert.equal(lido!.equity, 4_598, 'a equity é o valor de mercado, não o saldo')
  assert.equal(lido!.flutuante, -2_632, 'e o flutuante diz a perda que estava escondida')
  assert.notEqual(lido!.equity, calculado.equity, 'os dois ecrãs deixam de divergir')
})

teste('a conta ETF (a que ganha) também não é o saldo — e o sinal é o contrário', () => {
  const etf = estadoDePortefolio(7_700, 10_743)
  assert.equal(etf!.equity, 10_743)
  assert.equal(etf!.flutuante, 3_043)
  // Uma carteira à vista não tem margem: dizer zero é melhor do que mostrar a de outra conta.
  assert.equal(etf!.margem, 0)
  assert.equal(etf!.margemLivre, 10_743)
  assert.equal(etf!.nivelMargemPct, null)
})

teste('sem valor de mercado gravado devolve `null` — quem chama mantém o do motor', () => {
  assert.equal(estadoDePortefolio(7_230, null), null)
  assert.equal(estadoDePortefolio(7_230, undefined), null)
  assert.equal(estadoDePortefolio(7_230, 0), null, 'zero não é um valor de mercado: é a ausência dele')
  assert.equal(estadoDePortefolio(7_230, Number.NaN), null)
})

// ── 2. O HISTÓRICO QUE SOMAVA ZERO ──────────────────────────────────────────────────────────
/** 2 139 movimentos: 2 126 compras semanais + as 13 vendas da limpeza de 01/10/2026. */
function movimentosCripto(): MovimentoPortefolio[] {
  const out: MovimentoPortefolio[] = []
  // 2 126 compras: 18 activos ao longo de ~118 sextas, 2,65 $ cada (soma 5 632,30 $ como na base).
  for (let i = 0; i < 2_126; i++) {
    const semana = Math.floor(i / 18)
    const dia = new Date(Date.UTC(2024, 2, 8))
    dia.setUTCDate(dia.getUTCDate() + semana * 7)
    out.push({
      id: `c${i}`,
      symbol: `A${i % 18}USDT`,
      tipo: 'compra',
      data: dia.toISOString().slice(0, 10),
      unidades: 10,
      preco: 0.265,
      valor: 2.65,
    })
  }
  for (let i = 0; i < 13; i++) {
    out.push({
      id: `v${i}`,
      symbol: `A${i}USDT`,
      tipo: 'venda',
      data: '2026-10-01',
      unidades: 10 * Math.ceil(2_126 / 18),
      preco: 0.2,
      valor: 194.86,
      motivo: 'Limpeza 01/10/2026 — abaixo do stop desde Março de 2024',
    })
  }
  return out
}

teste('CASO MAU: 2 139 movimentos na base e o histórico a somar zero', () => {
  const movs = movimentosCripto()
  assert.equal(movs.length, 2_139, 'são 2 139 linhas, como na base')

  // O que o ecrã fazia: ler `funded_positions`, que nestas contas está vazia.
  const comoAntes = historicoDoPortefolio([])
  assert.equal(comoAntes.length, 0, 'a tabela errada dá uma lista vazia')
  assert.equal(comoAntes.reduce((s, m) => s + m.valor, 0), 0, 'e um histórico que soma ZERO')

  // A ler os movimentos: nada se perde e nada se inventa.
  const h = historicoDoPortefolio(movs)
  assert.equal(h.length, 2_139)
  assert.ok(h[0].data >= h[h.length - 1].data, 'do mais recente para o mais antigo')
  assert.equal(h[0].data, '2026-10-01', 'a limpeza é o que está no topo')
  // O sinal em caixa: a compra tira dinheiro, a venda põe.
  assert.ok(h.every((m) => (m.tipo === 'compra' ? m.caixa < 0 : m.caixa > 0)))
  assert.equal(
    Math.round(h.filter((m) => m.tipo === 'compra').reduce((s, m) => s + m.valor, 0) * 100) / 100,
    5_633.9,
  )
})

teste('um movimento de tipo desconhecido não se adivinha — fica de fora de tudo', () => {
  assert.equal(tipoDoMovimento({ tipo: 'compra' }), 'compra')
  assert.equal(tipoDoMovimento({ tipo: ' VENDA ' }), 'venda')
  assert.equal(tipoDoMovimento({ tipo: 'dividendo' }), null)
  assert.equal(tipoDoMovimento({}), null)
  const movs: MovimentoPortefolio[] = [
    { symbol: 'X', tipo: 'compra', data: '2024-03-08', unidades: 1, preco: 10, valor: 10 },
    { symbol: 'X', tipo: 'split', data: '2024-03-15', unidades: 1, preco: 10, valor: 999 },
  ]
  assert.equal(historicoDoPortefolio(movs).length, 1)
  assert.equal(resumoDoPortefolio(movs, [], { contribuido: 10, valorDeMercado: 12 }).comprado, 10,
    'os 999 de um tipo que ninguém definiu não entram na soma')
})

teste('a carteira soma compras menos vendas, com preço médio das COMPRAS', () => {
  const c = carteiraDoPortefolio([
    { symbol: 'BTCUSDT', tipo: 'compra', data: '2024-03-08', unidades: 2, preco: 50, valor: 100 },
    { symbol: 'BTCUSDT', tipo: 'compra', data: '2024-03-15', unidades: 1, preco: 200, valor: 200 },
    { symbol: 'ADAUSDT', tipo: 'compra', data: '2024-03-08', unidades: 10, preco: 1, valor: 10 },
    { symbol: 'ADAUSDT', tipo: 'venda', data: '2026-10-01', unidades: 10, preco: 0.5, valor: 5 },
  ])
  const btc = c.find((l) => l.symbol === 'BTCUSDT')!
  assert.equal(btc.unidades, 3)
  assert.equal(btc.comprado, 300)
  assert.equal(btc.reforcos, 2)
  assert.equal(btc.precoMedio, 100, '300 $ por 3 unidades — não a média de 50 e 200')
  assert.equal(btc.primeira, '2024-03-08')
  assert.equal(btc.ultima, '2024-03-15')
  assert.equal(btc.fechada, false)

  const ada = c.find((l) => l.symbol === 'ADAUSDT')!
  assert.equal(ada.unidades, 0)
  assert.equal(ada.fechada, true, 'vendida toda — sai de «em carteira» e vai para «fechados»')
  assert.equal(ada.investido, 5, '10 postos menos 5 recebidos')
  assert.equal(c[0].symbol, 'BTCUSDT', 'o maior investimento primeiro')
})

teste('o resumo mede contra o CONTRIBUÍDO e devolve `null` sem valor gravado', () => {
  const movs = movimentosCripto()
  const r = resumoDoPortefolio(movs, [{ data: '2026-09-25', contribuido: 7_230.25, valor: 4_829.11 }], {
    contribuido: 7_230,
    valorDeMercado: 4_598,
  })
  assert.equal(r.compras, 2_126)
  assert.equal(r.vendas, 13)
  assert.equal(r.movimentos, 2_139)
  assert.equal(r.contribuido, 7_230)
  assert.equal(r.valor, 4_598)
  assert.equal(r.resultado, -2_632, 'a perda aparece, em dinheiro')
  assert.equal(r.resultadoPct, -36.4, 'e em percentagem, igual à base')
  assert.equal(r.de, '2024-03-08')
  assert.equal(r.ate, '2026-10-01')
  assert.ok(r.semanasComReforco > 100, 'o DCA conta-se, não se escreve à mão')
  assert.equal(r.activos, 18)
  assert.equal(r.activosFechados, 13)
  assert.equal(r.activosAbertos, 5)
  assert.equal(r.picoValor?.valor, 4_829.11)

  const sem = resumoDoPortefolio(movs, [], { contribuido: 7_230, valorDeMercado: null })
  assert.equal(sem.valor, null)
  assert.equal(sem.resultado, null)
  assert.equal(sem.resultadoPct, null, 'sem valor gravado não há percentagem — e não há zero')
})

teste('o diário agrupa por DIA e não repete as 2 139 linhas', () => {
  const dias = diarioDoPortefolio(movimentosCripto())
  assert.ok(dias.length > 100 && dias.length < 200, `são ${dias.length} dias, não 2 139 linhas`)
  assert.equal(dias[0].data, '2026-10-01', 'o mais recente primeiro')
  assert.equal(dias[0].vendas, 13)
  assert.equal(dias[0].compras, 0)
  assert.ok(dias[0].motivos[0].includes('Limpeza'), 'o motivo declarado na venda não se perde')
  assert.equal(semanaDe('2024-03-08'), '2024-W10')
  // 29/12/2025 é segunda-feira da semana ISO 1 de 2026: a regra da quinta-feira trata disso.
  assert.equal(semanaDe('2025-12-29'), '2026-W01')
})

// ── 3. «ESTA CONTA É MINHA?» ────────────────────────────────────────────────────────────────
teste('CASO MAU: uma conta que é mestre deixava de poder ser minha', () => {
  // A conta Cripto é as DUAS coisas, e as duas respostas são verdadeiras.
  assert.equal(ehContaMestre(CRIPTO), true, 'é mestre: tipo = provider')
  assert.equal(ehContaDaCasa(CRIPTO), true, 'é da casa')
  assert.equal(ehContaPortefolioDaCasa(CRIPTO), true)
  assert.equal(ehContaMinha(CRIPTO), true, 'E é minha: é capital do dono')

  const entradas = [
    { id: 'desafio', mestre: false, minha: true },
    { id: 'mestre-wolf', mestre: true, minha: false },
    { id: 'cripto', mestre: true, minha: true },
  ]
  // A regra antiga: `minhas = total − mestres` e `Boolean(mestre) === querMestres`.
  const minhasAntigas = entradas.length - entradas.filter((e) => e.mestre).length
  assert.equal(minhasAntigas, 1, 'a contagem antiga via UMA conta minha')
  const filtroAntigo = entradas.filter((e) => Boolean(e.mestre) === false)
  assert.ok(!filtroAntigo.some((e) => e.id === 'cripto'), 'e a carteira do dono não estava lá')

  // A regra nova: cada botão pergunta pelo SEU lado.
  const c = contarPorTipo(entradas)
  assert.equal(c.minhas, 2, 'a carteira passa a contar em «As minhas»')
  assert.equal(c.mestres, 2, 'e continua a contar em «Mestres»')
  assert.equal(c.todas, 3)

  const minhas = filtrarEntradas(entradas, 'minhas').map((e) => e.id)
  assert.deepEqual(minhas, ['desafio', 'cripto'], 'aparece em «As minhas»')
  const mestres = filtrarEntradas(entradas, 'mestres').map((e) => e.id)
  assert.deepEqual(mestres, ['mestre-wolf', 'cripto'], 'E continua nas «Mestres»')
  assert.equal(filtrarEntradas(entradas, 'todas').length, 3)
})

teste('sem `minha` nada muda — «o contrário de mestre» continua a ser a omissão', () => {
  const antigas = [{ id: 'a', mestre: false }, { id: 'b', mestre: true }]
  assert.equal(temDoisTipos(antigas), true)
  assert.deepEqual(contarPorTipo(antigas), { minhas: 1, mestres: 1, todas: 2 })
  assert.deepEqual(filtrarEntradas(antigas, 'minhas').map((e) => e.id), ['a'])
  assert.deepEqual(filtrarEntradas(antigas, 'mestres').map((e) => e.id), ['b'])
})

teste('a conta ESCOLHIDA nunca sai da lista, com ou sem `minha`', () => {
  const entradas = [{ id: 'a', mestre: false, minha: true }, { id: 'b', mestre: true, minha: false }]
  assert.deepEqual(filtrarEntradas(entradas, 'minhas', 'b').map((e) => e.id), ['a', 'b'])
})

teste('quem só tem contas próprias não vê filtro nenhum', () => {
  const soMinhas = [{ id: 'a', mestre: false, minha: true }, { id: 'b', mestre: false, minha: true }]
  assert.equal(temDoisTipos(soMinhas), false)
  assert.equal(filtrarEntradas(soMinhas, 'mestres').length, 2, 'e um filtro guardado não lhe esconde nada')
})

// ── 4. «QUE CRACHÁ LEVA?» ───────────────────────────────────────────────────────────────────
teste('CASO MAU: uma conta de capital real rotulada «Funded» (nome de uma avaliação)', () => {
  // Antes: mestre ⇒ «Funded», sempre.
  assert.equal(pastilhaDaConta({ etiqueta: 'F1', mestre: true, segue: null }), 'Funded')
  // Agora, com a marca de conta real da casa:
  assert.equal(
    pastilhaDaConta({ etiqueta: 'F1', mestre: true, segue: null, contaRealDaCasa: true }),
    'Real',
    'as carteiras do dono dizem «Real»',
  )
  assert.equal(
    pastilhaDaConta({ etiqueta: 'Funded', mestre: false, segue: 'MTM Auto Sensei', contaRealDaCasa: true }),
    'Real · Sensei',
    'e o nome da estratégia continua a seguir-se',
  )
  // As contas MTM Funded financiadas DE VERDADE não têm a marca — e não mudam de crachá.
  assert.equal(pastilhaDaConta({ etiqueta: 'Funded', mestre: false, segue: null }), 'Funded')
  assert.equal(pastilhaDaConta({ etiqueta: 'F2', mestre: false, segue: null }), 'F2')
  assert.equal(pastilhaDaConta({ etiqueta: 'Torneio', mestre: false, segue: null }), 'Torneio')
  assert.equal(pastilhaDaConta({ etiqueta: 'F1', mestre: true, segue: 'MTM Auto Wolf' }), 'Funded · Wolf')
})

teste('`conta_portefolio` só é verdade quando a base o diz', () => {
  assert.equal(ehContaPortefolio(CRIPTO), true)
  assert.equal(ehContaPortefolio({ ...CRIPTO, conta_portefolio: false }), false)
  // Sem a 173 aplicada a coluna não existe: nada é carteira, e tudo se comporta como antes.
  const { conta_portefolio: _, ...semColuna } = CRIPTO
  assert.equal(ehContaPortefolio(semColuna), false)
  assert.equal(ehContaPortefolio(null), false)
  // Uma conta real da casa que NEGOCEIA a sério (a de T2T, as espelho) não é carteira.
  assert.equal(ehContaPortefolio({ conta_real_casa: true, conta_casa: true }), false)
})

if (falhas) {
  console.error(`\ncarteiras do dono: ${falhas} falha(s).`)
  process.exit(1)
}
console.log('\ncarteiras do dono OK — equity lida, histórico dos movimentos, minha+mestre, crachá Real')

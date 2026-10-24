/**
 * PREMIUM EM DUAS CAMADAS (24/10, decisão do dono).
 *
 * Correr: npx tsx lib/mestres/__tests__/premium-camadas.check.ts
 *
 *   1. metade no 1.º valor da zona, metade no meio; preço já para lá do meio → uma entrada só;
 *   2. o lote parte-se no passo do símbolo e soma sempre o lote cheio; quem opera com o lote mínimo
 *      não dobra o risco (fica só a 1.ª camada com o lote inteiro);
 *   3. a camada por abrir cai quando a outra está aberta e o preço chegou ao TP1;
 *   4. chaves: a 2.ª camada guarda a chave de sempre, a 1.ª leva «:c1».
 */
import assert from 'node:assert/strict'
import { camadasParaAnular, chaveDaCamada, entradasPremium, loteDaCamada, PREMIUM_ENTRADA_PADRAO } from '../premium'

const AGORA = new Date('2026-10-20T07:15:00Z')
const CFG = PREMIUM_ENTRADA_PADRAO
assert.equal(CFG.modo, 'camadas')

// 1. Sinal real de 20/10: VENDA «Zona 4131 – 4137», SL 4142, TP1 4126, preço a 4129,2.
{
  const c = entradasPremium({ direcao: 'sell', zona: [4131, 4137], sl: 4142, tp1: 4126, preco: { bid: 4129.2, ask: 4129.5 }, cfg: CFG, agora: AGORA })
  assert.equal(c.length, 2)
  assert.deepEqual(c.map((x) => [x.camada, x.fracao, x.entrada.tipo, x.entrada.tipo === 'limite' ? x.entrada.preco : null]), [
    [1, 0.5, 'limite', 4131],
    [2, 0.5, 'limite', 4134],
  ])
}
// COMPRA «Zona 4022 – 4017» com o preço entre o 1.º valor e o meio: 1.ª a mercado, 2.ª no meio.
{
  const c = entradasPremium({ direcao: 'buy', zona: [4017, 4022], sl: 4012, tp1: 4027, preco: { bid: 4020.6, ask: 4020.9 }, cfg: CFG, agora: AGORA })
  assert.deepEqual(c.map((x) => x.entrada.tipo), ['mercado', 'limite'])
}
// Preço já melhor do que o meio → uma entrada só, lote inteiro.
{
  const c = entradasPremium({ direcao: 'buy', zona: [4017, 4022], sl: 4012, tp1: 4027, preco: { bid: 4018.2, ask: 4018.5 }, cfg: CFG, agora: AGORA })
  assert.equal(c.length, 1)
  assert.equal(c[0]!.fracao, 1)
  assert.equal(c[0]!.entrada.tipo, 'mercado')
}
// Modo 'zona' (o de 07/10) continua a dar uma entrada no meio.
{
  const c = entradasPremium({ direcao: 'sell', zona: [4131, 4137], sl: 4142, tp1: 4126, preco: null, cfg: { ...CFG, modo: 'zona' }, agora: AGORA })
  assert.equal(c.length, 1)
  assert.equal(c[0]!.entrada.tipo === 'limite' ? c[0]!.entrada.preco : null, 4134)
}

// 2. Lotes.
const S = { volume_min: 0.01, volume_step: 0.01 }
assert.equal(loteDaCamada(0.52, { camada: 1, fracao: 0.5 }, S), 0.26)
assert.equal(loteDaCamada(0.52, { camada: 2, fracao: 0.5 }, S), 0.26)
assert.equal(loteDaCamada(0.05, { camada: 1, fracao: 0.5 }, S), 0.03)
assert.equal(loteDaCamada(0.05, { camada: 2, fracao: 0.5 }, S), 0.02)
assert.equal(loteDaCamada(0.01, { camada: 1, fracao: 0.5 }, S), 0.01, 'lote mínimo: a 1.ª leva tudo')
assert.equal(loteDaCamada(0.01, { camada: 2, fracao: 0.5 }, S), null, 'lote mínimo: sem 2.ª camada')
assert.equal(loteDaCamada(0.02, { camada: 2, fracao: 0.5 }, S, 0.02), null, 'lote_minimo da conta 0,02: não parte')
assert.equal(loteDaCamada(0.3, { camada: 2, fracao: 1 }, S), 0.3)

// 3. Anular ao TP1.
{
  const pendentes = [{ id: 'o1', base: 'sinal:premium-ouro:msg:tg:1' }, { id: 'o2', base: 'sinal:premium-ouro:msg:tg:2' }]
  const abertas = [
    { base: 'sinal:premium-ouro:msg:tg:1', direcao: 'sell' as const, tp1: 4126 },
    { base: 'sinal:premium-ouro:msg:tg:2', direcao: 'buy' as const, tp1: 4027 },
  ]
  const ids = camadasParaAnular({
    pendentes, abertas,
    preco: (b) => (b.endsWith(':1') ? { bid: 4125.8, ask: 4126.0 } : { bid: 4024, ask: 4024.3 }),
  })
  assert.deepEqual(ids, ['o1'], 'só o sinal 1 chegou ao TP1')
  assert.deepEqual(camadasParaAnular({ pendentes, abertas: [], preco: () => ({ bid: 1, ask: 1 }) }), [], 'sem camada aberta não se anula')
}

// 4. Chaves.
assert.equal(chaveDaCamada('premium-ouro:msg:tg:9', 1, 2), 'premium-ouro:msg:tg:9:c1')
assert.equal(chaveDaCamada('premium-ouro:msg:tg:9', 2, 2), 'premium-ouro:msg:tg:9')
assert.equal(chaveDaCamada('premium-ouro:msg:tg:9', 2, 1), 'premium-ouro:msg:tg:9')

console.log('premium-camadas: tudo certo')

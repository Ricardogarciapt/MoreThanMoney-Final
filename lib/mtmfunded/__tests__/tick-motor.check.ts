/**
 * O TICK SÍNCRONO DO MOTOR — a escolha entre o retrato e o tick, e o endpoint que o serve.
 *
 * O que aqui se prova é sobretudo o que NÃO pode acontecer: o caminho rápido nunca pode entregar
 * um preço pior do que o que já havia, nem rejuvenescer um carimbo. Um atalho que mente sobre a
 * idade é exactamente o defeito que custou 6 das 7 entradas da mestre do Sensei (21-24/09).
 *
 * Correr: npx tsx lib/mtmfunded/__tests__/tick-motor.check.ts
 */
import assert from 'node:assert/strict'
import { maisFresco, type LinhaRetrato, type TickDoMotor } from '../precos/tick-motor'
import { iniciarWsPrecos } from '../../../services/funded-motor/ws-precos'
import { precoDePreenchimento } from '../precos/preenchimento'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const casoAsync = async (nome: string, f: () => Promise<void>) => { await f(); n++; console.log(`  ok  ${nome}`) }

const AGORA = 1_700_000_000_000
const retrato = (em: number, bid = 100, ask = 100.2): LinhaRetrato => ({ bid, ask, em, emMercado: null })
const tick = (em: number, bid = 100, ask = 100.2, emMercado: number | null = null): TickDoMotor =>
  ({ symbol: 'X', bid, ask, em, emMercado, fonte: 'conector', idadeMs: 0 })

// ── a escolha ────────────────────────────────────────────────────────────────

function escolha() {
  caso('sem tick do motor fica o retrato (é o comportamento de sempre)', () => {
    const r = maisFresco(retrato(AGORA - 4000), null)
    assert.equal(r?.de, 'base')
    assert.equal(r?.escolha.em, AGORA - 4000)
  })

  caso('sem retrato nem tick, não há preço — e não se inventa nenhum', () => {
    assert.equal(maisFresco(null, null), null)
  })

  caso('o tick do motor ganha quando é MAIS FRESCO', () => {
    const r = maisFresco(retrato(AGORA - 4000, 100, 100.2), tick(AGORA - 90, 101, 101.2))
    assert.equal(r?.de, 'motor')
    assert.equal(r?.escolha.bid, 101)
    assert.equal(r?.escolha.em, AGORA - 90)
  })

  caso('um tick do motor MAIS VELHO do que o retrato é ignorado', () => {
    // Acontece de verdade: a linha da base pode ter sido escrita por um símbolo «rápido» há 200 ms
    // enquanto o que o motor tem em memória para ele é de um tick anterior.
    const r = maisFresco(retrato(AGORA - 200, 100, 100.2), tick(AGORA - 3000, 99, 99.2))
    assert.equal(r?.de, 'base')
    assert.equal(r?.escolha.bid, 100, 'o preço pior/velho do motor não pode substituir o bom')
  })

  caso('empate no carimbo fica com o retrato (sem dúvida, não se mexe)', () => {
    const r = maisFresco(retrato(AGORA, 100, 100.2), tick(AGORA, 55, 55.2))
    assert.equal(r?.de, 'base')
    assert.equal(r?.escolha.bid, 100)
  })

  caso('símbolo que só o motor tem entra (o retrato pode nem ter linha)', () => {
    // Medido a 24/09: o SPX500 não tinha sequer linha em `funded_precos`.
    const r = maisFresco(null, tick(AGORA - 50, 5000, 5000.5))
    assert.equal(r?.de, 'motor')
    assert.equal(r?.escolha.bid, 5000)
  })

  caso('a hora de MERCADO do tick viaja com ele — é ela que prova frescura', () => {
    const r = maisFresco(retrato(AGORA - 4000), tick(AGORA - 100, 100, 100.2, AGORA - 120))
    assert.equal(r?.escolha.emMercado, AGORA - 120)
  })

  caso('a guarda do preenchimento continua a mandar sobre o tick escolhido', () => {
    // Um tick fresquíssimo mas com referência longe do mercado NÃO abre: quem decide é a regra,
    // não o caminho rápido.
    const r = maisFresco(null, tick(AGORA - 50, 100, 100.2))!
    const fill = precoDePreenchimento({
      direcao: 'buy', digits: 2, agora: AGORA,
      tick: { bid: r.escolha.bid, ask: r.escolha.ask, em: r.escolha.em, emMercado: r.escolha.emMercado },
      referencia: { preco: 140 },
    })
    assert.equal(fill.ok, false)
    assert.equal(fill.ok === false && fill.motivo, 'divergencia')
  })

  caso('tick fresco + referência pior → abre pelo PIOR dos dois, como antes', () => {
    const r = maisFresco(null, tick(AGORA - 50, 100, 100.2))!
    const fill = precoDePreenchimento({
      direcao: 'buy', digits: 2, agora: AGORA,
      tick: { bid: r.escolha.bid, ask: r.escolha.ask, em: r.escolha.em, emMercado: r.escolha.emMercado },
      referencia: { preco: 100.2 },
    })
    assert.ok(fill.ok)
    assert.equal(fill.ok && fill.regra, 'pior-dos-dois')
  })
}

// ── o endpoint do motor ──────────────────────────────────────────────────────

const PORTA = 8799
const SEGREDO = 'segredo-de-teste'

async function endpoint() {
  const pedidos: string[] = []
  const ws = iniciarWsPrecos({ porta: PORTA, log: () => undefined, segredo: SEGREDO, pedir: (s) => pedidos.push(s) })
  assert.ok(ws)
  const base = `http://127.0.0.1:${PORTA}/precos/tick`
  const pedir = (q: string, segredo: string | null = SEGREDO) =>
    fetch(`${base}?${q}`, { headers: segredo ? { 'x-caption-secret': segredo } : {} })

  try {
    await casoAsync('sem segredo não se responde', async () => {
      assert.equal((await pedir('symbols=XAUUSD', null)).status, 401)
      assert.equal((await pedir('symbols=XAUUSD', 'errado')).status, 401)
    })

    await casoAsync('rota desconhecida = 404 (o /precos continua a ser o WS)', async () => {
      assert.equal((await fetch(`http://127.0.0.1:${PORTA}/outra`)).status, 404)
    })

    await casoAsync('sem símbolos = 400', async () => {
      assert.equal((await pedir('symbols=')).status, 400)
    })

    await casoAsync('símbolo fresco responde no instante, com em e em_mercado', async () => {
      const agora = Date.now()
      ws!.publicar('XAUUSD', 4377.4, 4377.8, agora, agora - 20, 'conector')
      const t0 = Date.now()
      const r = await (await pedir('symbols=XAUUSD&esperaMs=700')).json()
      assert.ok(Date.now() - t0 < 200, 'não pode esperar por um tick que já tem')
      assert.equal(r.ok, true)
      assert.equal(r.precos.length, 1)
      assert.equal(r.precos[0].b, 4377.4)
      assert.equal(r.precos[0].t, agora)
      assert.equal(r.precos[0].m, agora - 20)
      assert.equal(r.precos[0].f, 'conector')
      assert.deepEqual(r.faltam, [])
    })

    await casoAsync('símbolo velho ESPERA e entrega o tick que chegar', async () => {
      const velho = Date.now() - 30_000
      ws!.publicar('EURUSD', 1.1, 1.1001, velho, velho, 'conector')
      const t0 = Date.now()
      const p = pedir('symbols=EURUSD&esperaMs=1500&idadeMaxMs=1000')
      // o tick novo chega a meio da espera
      await new Promise((r) => setTimeout(r, 120))
      const novo = Date.now()
      ws!.publicar('EURUSD', 1.2, 1.2001, novo, novo, 'conector')
      const r = await (await p).json()
      const demorou = Date.now() - t0
      assert.ok(demorou < 1000, `devia acordar ao tick, demorou ${demorou} ms`)
      assert.equal(r.precos[0].b, 1.2)
      assert.deepEqual(r.faltam, [])
    })

    await casoAsync('não chegando tick, devolve a IDADE VERDADEIRA — nunca re-carimba', async () => {
      const velho = Date.now() - 40_000
      ws!.publicar('USOIL', 60, 60.03, velho, velho, 'conector')
      const r = await (await pedir('symbols=USOIL&esperaMs=250&idadeMaxMs=1000')).json()
      assert.equal(r.precos[0].t, velho, 'o carimbo tem de ser o do tick velho')
      assert.ok(r.precos[0].idadeMs >= 40_000, 'a idade tem de ser a real')
      assert.deepEqual(r.faltam, ['USOIL'], 'e tem de dizer que ficou por servir')
      // com esta idade, a regra do preenchimento recusa — que é o que se quer
      const fill = precoDePreenchimento({
        direcao: 'buy', digits: 2,
        tick: { bid: r.precos[0].b, ask: r.precos[0].a, em: r.precos[0].t, emMercado: r.precos[0].m },
      })
      assert.equal(fill.ok, false)
      assert.equal(fill.ok === false && fill.motivo, 'velho')
    })

    await casoAsync('símbolo que o motor não segue é PEDIDO, e a espera é limitada', async () => {
      const t0 = Date.now()
      const r = await (await pedir('symbols=NZDCAD&esperaMs=300')).json()
      const demorou = Date.now() - t0
      assert.ok(pedidos.includes('NZDCAD'), 'o motor tem de passar a segui-lo')
      assert.ok(demorou >= 250 && demorou < 1500, `espera fora do prazo: ${demorou} ms`)
      assert.deepEqual(r.precos, [], 'sem tick não se devolve preço nenhum')
      assert.deepEqual(r.faltam, ['NZDCAD'])
    })

    await casoAsync('esperaMs é limitado — um pedido não segura o socket à vontade', async () => {
      const t0 = Date.now()
      await pedir('symbols=NADA&esperaMs=999999')
      assert.ok(Date.now() - t0 < 4000, 'o tecto de 2 s tem de valer')
    })
  } finally {
    ws!.parar()
  }
}

async function main() {
  console.log('tick do motor — a escolha entre retrato e tick')
  escolha()
  console.log('tick do motor — o endpoint /precos/tick')
  await endpoint()
  console.log(`\n${n} casos — todos certos`)
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })

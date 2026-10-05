/**
 * VELAS SEM METAAPI, TIMEFRAMES M1…MN E GRÁFICO SEM CICLO PERMANENTE — a guarda da F5 (05/10).
 *
 *  1. Derivação: H2 de H1, M30 de M15… alinhados à época; CASO MAU: W1 alinhado à época começaria
 *     à QUINTA (dia 0 Unix) — aqui tem de começar à segunda; MN no dia 1, com meses de 28–31 dias.
 *  2. A MetaApi não entra nas velas: com METAAPI_TOKEN mas sem MOTOR_PRECOS_METAAPI=1, desligada;
 *     e no código as referências são pedidas ANTES dela (já não há corrida em paralelo).
 *  3. A rota aceita os 16 timeframes e tem `s-maxage` para todos.
 *  4. O gráfico deixou o `requestAnimationFrame` permanente e o `setInterval` de 300 ms.
 *
 *   npx tsx lib/webtrader/__tests__/timeframes-velas.check.ts
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  DERIVACAO, TIMEFRAMES_GRAFICO, TF_SEG_GRAFICO, agregarNoTimeframe, inicioCalendario, inicioDaVela, tfValido,
} from '../timeframes'

let n = 0
const teste = async (nome: string, f: () => void | Promise<void>) => { await f(); n++; console.log(`  ok  ${nome}`) }
const raiz = path.resolve(__dirname, '..', '..', '..')
const ler = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8')
const utc = (a: number, m: number, d: number, h = 0) => Math.floor(Date.UTC(a, m - 1, d, h) / 1000)

async function main() {
  console.log('\nTIMEFRAMES E VELAS\n')

  await teste('16 timeframes; os derivados apontam para um nativo', () => {
    assert.deepEqual([...TIMEFRAMES_GRAFICO], ['M1', 'M2', 'M3', 'M5', 'M10', 'M15', 'M30', 'H1', 'H2', 'H4', 'H6', 'H8', 'H12', 'D1', 'W1', 'MN'])
    for (const [tf, d] of Object.entries(DERIVACAO)) {
      assert.ok(['M1', 'M5', 'M15', 'H1', 'D1'].includes(d.de), `${tf} deriva de um nativo`)
      if (!d.calendario) assert.equal(TF_SEG_GRAFICO[tf as 'M2'] % TF_SEG_GRAFICO[d.de as 'M1'], 0, `${tf} é múltiplo de ${d.de}`)
    }
    assert.equal(tfValido('H12'), true)
    assert.equal(tfValido('H3'), false)
  })

  await teste('H2 a partir de H1: buckets pela época, OHLC certo', () => {
    const h1 = [0, 1, 2, 3].map((i) => ({ t: utc(2026, 10, 5, 8 + i), o: 10 + i, h: 20 + i, l: 5 - i, c: 11 + i, v: 1 }))
    const h2 = agregarNoTimeframe(h1, 'H2')
    assert.equal(h2.length, 2)
    assert.deepEqual(h2[0], { t: utc(2026, 10, 5, 8), o: 10, h: 21, l: 4, c: 12, v: 2 })
    assert.deepEqual(h2[1], { t: utc(2026, 10, 5, 10), o: 12, h: 23, l: 2, c: 14, v: 2 })
  })

  await teste('caso mau: W1 começa à SEGUNDA, não à quinta da época', () => {
    // 05/10/2026 é segunda; 08/10 quinta; 11/10 domingo.
    assert.equal(inicioCalendario(utc(2026, 10, 8, 15), 'semana'), utc(2026, 10, 5))
    assert.equal(inicioCalendario(utc(2026, 10, 11, 23), 'semana'), utc(2026, 10, 5))
    assert.equal(inicioCalendario(utc(2026, 10, 12, 0), 'semana'), utc(2026, 10, 12))
    const epoca = Math.floor(utc(2026, 10, 8) / 604800) * 604800
    assert.notEqual(epoca, utc(2026, 10, 5), 'a época sozinha daria a quinta — é este o defeito evitado')
    const d1 = [5, 6, 7, 8, 9, 12].map((d) => ({ t: utc(2026, 10, d), o: d, h: d + 1, l: d - 1, c: d, v: 1 }))
    const w1 = agregarNoTimeframe(d1, 'W1')
    assert.deepEqual(w1.map((v) => v.t), [utc(2026, 10, 5), utc(2026, 10, 12)])
    assert.equal(w1[0].c, 9)
  })

  await teste('MN no dia 1, meses de tamanhos diferentes', () => {
    assert.equal(inicioDaVela(utc(2026, 2, 28, 22), 'MN'), utc(2026, 2, 1))
    assert.equal(inicioDaVela(utc(2026, 3, 1), 'MN'), utc(2026, 3, 1))
    assert.equal(inicioDaVela(utc(2026, 12, 31, 23), 'MN'), utc(2026, 12, 1))
    assert.equal(inicioDaVela(utc(2026, 10, 5, 9) + 125, 'M2'), utc(2026, 10, 5, 9) + 120)
  })

  await teste('a MetaApi não entra nas velas sem MOTOR_PRECOS_METAAPI=1', async () => {
    process.env.METAAPI_TOKEN = 'token-de-teste'
    delete process.env.MOTOR_PRECOS_METAAPI
    const { metaApiNasVelas } = await import('../../mtmfunded/simulado/velas')
    assert.equal(metaApiNasVelas(), false)
    process.env.MOTOR_PRECOS_METAAPI = '1'
    assert.equal(metaApiNasVelas(), true)
    delete process.env.MOTOR_PRECOS_METAAPI
    const src = ler('lib/mtmfunded/simulado/velas.ts')
    const corpo = src.slice(src.indexOf('const trabalho = (async ()'))
    const iReserva = corpo.indexOf('await velasDeReserva(')
    const iMeta = corpo.indexOf('await velasMetaApiComPrazo(')
    assert.ok(iReserva > 0 && iMeta > iReserva, 'as referências vêm primeiro, a MetaApi só depois e só se vazias')
    assert.match(corpo.slice(iReserva, iMeta), /if \(reserva\.velas\.length\) return reserva/)
    assert.doesNotMatch(src, /FOLGA_APOS_RESERVA_MS|VELAS_METAAPI/, 'acabou a corrida em paralelo e a chave antiga')
  })

  await teste('a rota aceita os 16 e tem s-maxage para todos', () => {
    const rota = ler('app/api/mtmfunded/simulado/velas/route.ts')
    assert.match(rota, /!tfValido\(tf\)/)
    const bloco = rota.slice(rota.indexOf('const S_MAXAGE'), rota.indexOf('}', rota.indexOf('const S_MAXAGE')))
    for (const tf of TIMEFRAMES_GRAFICO) assert.match(bloco, new RegExp(`\\b${tf}: \\d+`), `s-maxage de ${tf}`)
  })

  await teste('o gráfico mede as linhas por evento, sem ciclo permanente', () => {
    const g = ler('components/funded/grafico-leve.tsx')
    assert.doesNotMatch(g, /raf = requestAnimationFrame\(passo\)/, 'sem rAF que se reagenda a si próprio')
    assert.doesNotMatch(g, /setInterval\(/, 'sem setInterval')
    assert.match(g, /subscribeVisibleLogicalRangeChange\(agendarCoordenadas\)/)
    assert.match(g, /subscribeSizeChange\(agendarCoordenadas\)/)
    assert.match(g, /subscribeCrosshairMove\(agendarCoordenadas\)/)
    assert.match(g, /inicioDaVela\(Math\.floor\(new Date\(preco\.em\)\.getTime\(\) \/ 1000\), tf\)/, 'vela viva de W1/MN pelo calendário')
    const tipos = ler('components/funded/grafico-tipos.ts')
    for (const tf of TIMEFRAMES_GRAFICO) assert.match(tipos, new RegExp(`chave: "${tf}"`), `selector com ${tf}`)
  })

  console.log(`\n${n} testes ok\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })

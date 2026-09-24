/**
 * O GATE DA APPLE CONTRA O CATÁLOGO INTEIRO — os 1026 símbolos de `funded_symbols`.
 *
 * Porque existe (24/09): até 23/09 só dois símbolos de cripto tinham preço ao vivo, e o gate
 * (`ehSimboloCripto`) era uma lista de tickers por extenso — BTC, ETH, SOL, DOGE. Nessa noite o
 * motor passou a cotar 54 dos 59, incluindo os cruzados (BTCJPY, XRPJPY, ETHXAU) e as abreviaturas
 * de três letras da PU Prime (ALGUSD, ATMUSD, LNKUSD, SANUSD). Medido nesse dia: **32 dos 59
 * passavam o gate** e apareciam na app iOS — na lista de símbolos, na pesquisa, nas classes e no
 * gráfico —, exactamente o que a Guideline 3.1.5(iii) já tinha rejeitado duas vezes.
 *
 * As duas metades do teste valem o mesmo: nenhuma cripto passa, e nenhum símbolo que NÃO é cripto
 * é bloqueado por engano (um falso positivo tira ouro ou forex a quem tem direito a eles).
 *
 * A fotografia do catálogo está aqui à mão de propósito: um símbolo novo no catálogo que este
 * teste não conheça é um símbolo que ninguém confirmou que o gate apanha.
 *
 *   npx tsx lib/__tests__/cripto-catalogo.check.ts
 */
import assert from 'node:assert/strict'
import { ehSimboloCripto, registarSimbolosCripto } from '../ios-sem-cripto'

/** `select symbol from funded_symbols where ativo and classe = 'cripto'` — 24/09/2026. */
const CRIPTO = 'ADAJPY,ADAUSD,ALGUSD,ATMUSD,AVAUSD,BATUSD,BCHJPY,BCHUSD,BNBUSD,BTCBCH,BTCETH,BTCEUR,BTCJPY,BTCLTC,BTCUSD,BTCXAU,CROUSD,CRVUSD,DOGUSD,DOTUSD,EOSUSD,ETCUSD,ETHBCH,ETHEUR,ETHJPY,ETHLTC,ETHUSD,ETHXAU,FILUSD,GRTUSD,HYPEUSD,INCUSD,IOTUSD,LNKUSD,LRCUSD,LTCJPY,LTCUSD,NEOUSD,NERUSD,NXPCUSD,OKBUSD,SANUSD,SHBUSD,SKYUSD,SOLJPY,SOLUSD,SUSUSD,TRUMPUSD,TRXUSD,UNIUSD,USDTJPY,WLDUSD,WLFIUSD,XLMJPY,XLMUSD,XRPJPY,XRPUSD,XTZUSD,ZECUSD'.split(',')

/** As outras classes, menos as acções (essas vão numa amostra, abaixo). */
const FOREX = 'AUDCAD,AUDCHF,AUDJPY,AUDNZD,AUDSGD,AUDUSD,CADCHF,CADJPY,CHFJPY,EURAUD,EURCAD,EURCHF,EURCZK,EURDKK,EURGBP,EURHUF,EURJPY,EURNZD,EURSGD,EURUSD,GBPAUD,GBPCAD,GBPCHF,GBPJPY,GBPNZD,GBPSGD,GBPUSD,NZDCAD,NZDCHF,NZDJPY,NZDSGD,NZDUSD,SGDJPY,USDBRL,USDCAD,USDCHF,USDCLP,USDCOP,USDCZK,USDDKK,USDHUF,USDIDR,USDILS,USDINR,USDJPY,USDKRW,USDMXN,USDNOK,USDSEK,USDSGD,USDTHB,USDTWD,USDZAR'.split(',')
const METAL = 'GAUUSD,XAGUSD,XAUEUR,XAUJPY,XAUUSD,XPDUSD,XPTUSD'.split(',')
const INDICE = 'BVSPX,CHINA50,CHINA50FT,CHINAH,DJ30FT,ES35,EU50,FRA40,FRA40FT,GER40,GER40FT,HK50,HK50FT,HKTECH,JPN225,JPN225FT,NAS100,NAS100FT,NETH25,SGP20,SP500FT,SPI200,SWI20,TWINDEX,UK100,UK100FT,US2000,US30,US500,USDX,VIX'.split(',')
const ENERGIA = 'CL-OIL,GAS,GASOIL,NG,UKOIL,UKOUSDFT,USOIL,WHEAT'.split(',')
const COMMODITY = 'COCOA,COFFEE,COPPER,COTTON,OJ,SOYBEAN,SUGAR'.split(',')
const OBRIGACAO = 'EUB10Y,EUB2Y,EUB30Y,EUB5Y,EURIBOR3M,LONGGILT,USNOTE10Y'.split(',')
/** ETF: sem os de bitcoin, que estão à parte. */
const ETF = 'DBC,DRAM,DRAMUSD,DXYZ,EEM,EFA,EWJ,EWJUSD,EWT,EWTUSD,EWY,EWYUSD,EWZ,EWZUSD,FDN,FOTO,FXI,GDX,GDXJ,GLD,ICLN,IGV,INDA,IWM,IWMUSD,IYW,MCHI,NASA,OIH,QCLN,QQQ,QQQUSD,SMH,SOXL,SOXLUSD,SOXX,SPY,SPYUSD,TAN,TLT,TQQQ,UNG,URNMUSD,USL,USO,UVXYUSD,VCX,VGT,XLEUSD,XLF,XLK,XOP,BNO,GOEX'.split(',')
/**
 * Acções com as letras que mais se parecem com as abreviaturas de cripto do catálogo (ALG/ATM/
 * AVA/SAN/NEO/DOG/LNK/OKB/EOS/BAT/CRV/GRT/SKY/INC/IOT). São estas que um gate largo demais apanha.
 */
const ACOES = 'A,AA,AALG,AAPL,AAPLUSD,ADBEUSD,ALB,ALGN,AMD,AMT,AMZNUSD,ASMLUSD,AVGO,AVGOUSD,BAC,BRKBUSD,CRM,CRWD,CRWDUSD,DOCN,DOCU,EOG,GOOGLUSD,IBM,IBMUSD,IONQ,IOVA,METAUSD,MSFTUSD,NEMD,NET,NFLXUSD,NVDAUSD,NXPI,OKE,OKLO,OKTA,ORCLUSD,PLTRUSD,QCOMUSD,SKHY,SNDKUSD,SPCXUSD,TSLAUSD,TSMUSD,UBERUSD,WDCUSD,WMTUSD,ZMUSD'.split(',')

let ok = 0
const caso = (nome: string, f: () => void) => { f(); ok++; console.log(`  ok  ${nome}`) }

caso('nenhum dos 59 símbolos de cripto do catálogo passa o gate', () => {
  const passam = CRIPTO.filter((s) => !ehSimboloCripto(s))
  assert.deepEqual(passam, [], `passam o gate: ${passam.join(', ')}`)
  assert.equal(CRIPTO.length, 59)
})

caso('os cruzados (JPY, EUR, XAU e cripto-cripto) também não passam', () => {
  // Foi aqui que estava o pior buraco: a cotação não era em dólares e o gate não olhava.
  for (const s of ['XRPJPY', 'ADAJPY', 'SOLJPY', 'LTCJPY', 'XLMJPY', 'BCHJPY', 'USDTJPY',
    'BTCEUR', 'ETHEUR', 'BTCXAU', 'ETHXAU', 'BTCETH', 'BTCBCH', 'BTCLTC', 'ETHBCH', 'ETHLTC']) {
    assert.equal(ehSimboloCripto(s), true, s)
  }
})

caso('as abreviaturas de três letras da PU Prime não passam', () => {
  for (const s of ['ALGUSD', 'ATMUSD', 'AVAUSD', 'DOGUSD', 'LNKUSD', 'NERUSD', 'SANUSD',
    'SHBUSD', 'SUSUSD', 'SKYUSD', 'INCUSD', 'IOTUSD', 'NXPCUSD', 'TRUMPUSD', 'WLFIUSD']) {
    assert.equal(ehSimboloCripto(s), true, s)
  }
})

caso('nenhum símbolo que NÃO é cripto é bloqueado por engano', () => {
  const grupos: Array<[string, string[]]> = [
    ['forex', FOREX], ['metal', METAL], ['índice', INDICE], ['energia', ENERGIA],
    ['commodity', COMMODITY], ['obrigação', OBRIGACAO], ['etf', ETF], ['acção', ACOES],
  ]
  for (const [nome, lista] of grupos) {
    const bloqueados = lista.filter((s) => ehSimboloCripto(s))
    assert.deepEqual(bloqueados, [], `${nome} bloqueado por engano: ${bloqueados.join(', ')}`)
  }
})

caso('o ouro e os pares de dólar continuam a passar (o erro mais caro seria este)', () => {
  for (const s of ['XAUUSD', 'XAUEUR', 'XAUJPY', 'XAGUSD', 'GAUUSD', 'EURUSD', 'USDJPY',
    'USDTRY', 'USDCAD', 'USDCHF', 'US30', 'NAS100']) {
    assert.equal(ehSimboloCripto(s), false, s)
  }
})

caso('os ETF de bitcoin: o que o gate faz hoje, escrito para se poder decidir', () => {
  /**
   * O catálogo tem seis ETF de exposição a bitcoin (classe `etf`, não `cripto`): IBIT, ARKB,
   * BITB, BITO, BTCO e BKCH. São títulos regulados, não câmbio de criptomoedas, e a gate não os
   * trata como cripto — excepto BTCO, que começa por «BTC» e cai na regra dos prefixos.
   *
   * ESTÁ POR DECIDIR se devem sumir na app iOS. Não é uma decisão de código: escondê-los tira
   * produtos legítimos a quem tem direito a eles, e mostrá-los põe a palavra «bitcoin» à frente
   * de um revisor que já rejeitou a app duas vezes. Fica fixado o comportamento de hoje para a
   * mudança, quando vier, ser vista.
   */
  assert.equal(ehSimboloCripto('BTCO'), true, 'BTCO cai na regra do prefixo BTC')
  for (const s of ['IBIT', 'ARKB', 'BITB', 'BITO', 'BKCH']) {
    assert.equal(ehSimboloCripto(s), false, s)
  }
})

caso('o catálogo manda sobre o palpite: um símbolo novo fica bloqueado assim que é visto', () => {
  const novo = 'ZZZUSD'
  assert.equal(ehSimboloCripto(novo), false)
  registarSimbolosCripto([{ symbol: 'ZZZUSD', classe: 'cripto' }, { symbol: 'ZZZ2USD', classe: 'forex' }])
  assert.equal(ehSimboloCripto(novo), true)
  assert.equal(ehSimboloCripto('zzzusd'), true, 'maiúsculas não contam')
  assert.equal(ehSimboloCripto('ZZZ2USD'), false, 'o que o catálogo diz não ser cripto fica de fora')
})

console.log(`\n${ok} verificações OK`)

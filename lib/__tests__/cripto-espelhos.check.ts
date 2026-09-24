/**
 * AS TRÊS CÓPIAS DA REGRA DO CRIPTO DIZEM O MESMO?
 *
 * A mesma decisão de conformidade (Apple 3.1.5(iii): cripto fora da app iOS) está escrita em três
 * sítios, em duas linguagens e em três repositórios sem código partilhado:
 *
 *   · site      `lib/ios-sem-cripto.ts::ehSimboloCripto`   — a canónica;
 *   · MTM Auto  `lib/ios-sem-cripto.ts::ehSimboloCripto`   — repo mtm-auto;
 *   · iOS       `MTMCripto.ehCripto` em `MTMModels.swift`  — repo da app nativa.
 *
 * ── Porque existe (24/09) ───────────────────────────────────────────────────────────────────
 * Nesse dia corrigiu-se a regra do site: dos 59 símbolos de cripto do catálogo, 32 passavam o
 * gate. O nativo não foi corrigido e ficou o dia inteiro a deixar passar **34** — LTCUSD, TRXUSD,
 * ZECUSD, XLMUSD, UNIUSD, BCHUSD, ALGUSD, ATMUSD, LNKUSD, SANUSD, SHBUSD, TRUMPUSD, OKBUSD… E o
 * nativo é o lado que conta: a folha de aceitar um sinal T2T (`MTMT2TAccept`) é UIKit, não há
 * página web a apanhar o que lá escapa.
 *
 * Nada falhou porque nada comparava as cópias. Isto compara.
 *
 * ── Como ────────────────────────────────────────────────────────────────────────────────────
 * Em CI os repositórios irmãos não existem. Por isso há dois níveis:
 *
 *   1. SEMPRE — os dados partilhados (moedas, cotações, bolsas) estão pregados aqui. Mudar a
 *      regra do site faz este teste falhar, e a mensagem diz quais os outros dois ficheiros a
 *      actualizar. É o alarme que faltava.
 *   2. QUANDO OS IRMÃOS ESTÃO NO DISCO — lê-se-lhes a fonte e confirma-se que têm exactamente as
 *      mesmas listas. É a verificação a sério, e corre na máquina de quem está a mexer.
 *
 * Nota: o site tem ainda o `registarSimbolosCripto` (o catálogo vivo a semear o gate), que os
 * espelhos não têm. É uma rede a MAIS do lado da web, não uma divergência de regra — por isso
 * este teste compara a regra estática, que é a que os três partilham.
 *
 *   npx tsx lib/__tests__/cripto-espelhos.check.ts
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ehSimboloCripto } from '../ios-sem-cripto'
import { CRIPTO, NAO_CRIPTO, TODOS } from './catalogo-simbolos'

const RAIZ = join(__dirname, '..', '..')

/**
 * Onde vivem os espelhos. NÃO se resolvem a partir daqui: este repositório trabalha-se em
 * worktrees (`/tmp/wt-…`), e um caminho relativo à raiz apontava para fora do disco e fazia o
 * teste saltar em silêncio — uma guarda que salta é pior do que nenhuma, porque dá verde.
 * Resolvem-se a partir da home, com escape por variável de ambiente para quem os tenha noutro
 * sítio (uma máquina de CI não os tem, e aí o salto é legítimo e vem escrito).
 */
const ESPELHO_MTMAUTO = process.env.MTM_AUTO_DIR
  ? join(process.env.MTM_AUTO_DIR, 'lib', 'ios-sem-cripto.ts')
  : join(homedir(), 'Projetos', 'mtm-auto', 'lib', 'ios-sem-cripto.ts')
const ESPELHO_IOS = process.env.MTM_IOS_DIR
  ? join(process.env.MTM_IOS_DIR, 'ios', 'App', 'App', 'MTMModels.swift')
  : join(homedir(), 'Developer', 'MTMApps', 'iOS-78', 'ios', 'App', 'App', 'MTMModels.swift')

/**
 * Os dados partilhados, pregados. Se mexeres na regra do site, mexe aqui E nos dois espelhos.
 * Foi assim que se apanhou a divergência de 24/09.
 */
const MOEDAS = [
  'ADA', 'ALG', 'ATM', 'AVA', 'BAT', 'BCH', 'BNB', 'BTC', 'CRO', 'CRV', 'DOG', 'DOT', 'EOS',
  'ETC', 'ETH', 'FIL', 'GRT', 'HYPE', 'INC', 'IOT', 'LNK', 'LRC', 'LTC', 'NEO', 'NER', 'NXPC',
  'OKB', 'SAN', 'SHB', 'SKY', 'SOL', 'SUS', 'TRUMP', 'TRX', 'UNI', 'USDT', 'WLD', 'WLFI',
  'XLM', 'XRP', 'XTZ', 'ZEC',
  'DOGE', 'AVAX', 'LINK', 'MATIC', 'SUI', 'APT', 'ARB', 'OP', 'TON', 'NEAR', 'INJ', 'SEI',
  'TIA', 'ATOM', 'AAVE', 'PEPE', 'WIF', 'BONK', 'SHIB', 'FTM', 'RNDR', 'TAO', 'XMR', 'KAS',
  'JUP', 'IMX', 'HBAR', 'VET', 'ICP', 'POL', 'ALGO', 'SAND', 'SUSHI',
]
const COTACOES = ['USDT', 'USDC', 'USD', 'EUR', 'JPY', 'XAU', 'BTC', 'ETH', 'BCH', 'LTC']
const BOLSAS = [
  'BINANCE', 'BYBIT', 'COINBASE', 'KRAKEN', 'BITSTAMP', 'BITFINEX', 'OKX', 'KUCOIN', 'BITGET',
  'MEXC', 'GATEIO', 'CRYPTO', 'CRYPTOCAP', 'HTX', 'HUOBI', 'POLONIEX', 'GEMINI', 'DERIBIT',
  'PHEMEX', 'BINGX',
]

const AVISO = 'Se a regra mudou de propósito, actualiza as TRÊS: lib/ios-sem-cripto.ts (aqui), o mesmo ficheiro no repo mtm-auto, e MTMCripto em MTMModels.swift (app iOS) — e esta lista.'

let falhas = 0
const caso = (nome: string, f: () => void) => {
  try { f(); console.log(`  ok  ${nome}`) } catch (e) {
    falhas++
    console.error(`  ✗   ${nome}\n      ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Palavras em MAIÚSCULAS dentro de um literal de lista/conjunto, sem os comentários. */
function listaDe(fonte: string, marca: RegExp): string[] {
  const m = marca.exec(fonte)
  assert.ok(m, `não encontrei ${marca} no ficheiro`)
  const corpo = m![1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  return [...corpo.matchAll(/["']([A-Z0-9.]+)["']/g)].map((x) => x[1])
}

// ── 1. O site não mudou sem avisar ───────────────────────────────────────────────────────────

caso('as listas do site são as que estão pregadas aqui', () => {
  const fonte = readFileSync(join(RAIZ, 'lib', 'ios-sem-cripto.ts'), 'utf8')
  assert.deepEqual([...new Set(listaDe(fonte, /const BASES = new Set\(\[([\s\S]*?)\]\)/))], [...new Set(MOEDAS)], `as moedas do site mudaram. ${AVISO}`)
  const cot = /const COTACOES = \/\(([A-Z|]+)\)\$\//.exec(fonte)
  assert.deepEqual(cot?.[1].split('|'), COTACOES, `as cotações do site mudaram. ${AVISO}`)
  const bol = /const BOLSAS_CRIPTO = \/\^\(([A-Z|]+)\)/.exec(fonte)
  assert.deepEqual(bol?.[1].split('|'), BOLSAS, `as bolsas do site mudaram. ${AVISO}`)
})

// ── 2. A regra do site sobre o catálogo (o contrato que os espelhos têm de reproduzir) ───────

caso('a regra do site apanha os 59 de cripto e não apanha mais nada', () => {
  const passam = CRIPTO.filter((s) => !ehSimboloCripto(s))
  assert.deepEqual(passam, [], `cripto a passar o gate: ${passam.join(', ')}`)
  const presos = NAO_CRIPTO.filter((s) => ehSimboloCripto(s))
  assert.deepEqual(presos, [], `bloqueados por engano: ${presos.join(', ')}`)
})

// ── 3. Os espelhos, quando estão no disco ────────────────────────────────────────────────────

caso('espelho MTM Auto: as mesmas listas', () => {
  if (!existsSync(ESPELHO_MTMAUTO)) return console.log('      (saltado: repo mtm-auto não está neste disco)')
  const fonte = readFileSync(ESPELHO_MTMAUTO, 'utf8')
  assert.deepEqual([...new Set(listaDe(fonte, /const BASES = new Set\(\[([\s\S]*?)\]\)/))], [...new Set(MOEDAS)], `moedas divergentes no mtm-auto. ${AVISO}`)
})

caso('espelho iOS nativo: as mesmas listas', () => {
  if (!existsSync(ESPELHO_IOS)) return console.log('      (saltado: repo da app iOS não está neste disco)')
  const fonte = readFileSync(ESPELHO_IOS, 'utf8')
  assert.deepEqual(
    [...new Set(listaDe(fonte, /static let moedasCripto: Set<String> = \[([\s\S]*?)\n    \]/))],
    [...new Set(MOEDAS)],
    `moedas divergentes no MTMModels.swift. ${AVISO}`,
  )
  assert.deepEqual(listaDe(fonte, /private static let cotacoes = \[([\s\S]*?)\]/), COTACOES, `cotações divergentes no MTMModels.swift. ${AVISO}`)
  assert.deepEqual(listaDe(fonte, /private static let bolsasCripto: Set<String> = \[([\s\S]*?)\n    \]/), BOLSAS, `bolsas divergentes no MTMModels.swift. ${AVISO}`)
  // A regra antiga (sufixo USDT + 11 prefixos por extenso) deixava passar 34 dos 59.
  assert.ok(
    !/for moeda in \["BTC", "ETH", "SOL", "XRP", "BNB", "LINK", "ADA", "DOGE", "AVAX", "MATIC", "DOT"\]/.test(fonte),
    'MTMModels.swift voltou à regra antiga dos 11 prefixos — 34 dos 59 símbolos de cripto do catálogo passam',
  )
})

caso('o catálogo inteiro tem veredicto nos três (tabela partilhada)', () => {
  // A tabela que os três correm é a mesma; o site corre-a aqui, e os espelhos correm-na com as
  // listas que os testes acima já confirmaram ser iguais.
  assert.equal(TODOS.length, new Set(TODOS).size)
  assert.ok(TODOS.length >= 270, `o catálogo encolheu (${TODOS.length}) — confirma a fotografia em catalogo-simbolos.ts`)
})

if (falhas) {
  console.error(`\nespelhos do cripto: ${falhas} falha(s)`)
  process.exit(1)
}
console.log(`\nespelhos do cripto OK — ${MOEDAS.length} moedas iguais nos três, ${TODOS.length} símbolos do catálogo com o veredicto certo`)

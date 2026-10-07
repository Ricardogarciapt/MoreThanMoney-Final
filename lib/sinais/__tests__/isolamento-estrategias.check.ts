/**
 * ISOLAMENTO POR ESTRATÉGIA (07/10/2026) — as quatro garantias do modelo
 * (docs/sinais-isolamento-estrategias.md), em casos puros e guardas estáticas sobre o código.
 *
 *  A. um seguimento da estratégia A nunca toca na entrada da B — nem com o mesmo ticker e preço;
 *  B. uma ideia de um scanner nunca é activada por outro;
 *  C. dois sinais simultâneos do mesmo ticker em estratégias diferentes ficam separados até ao fecho;
 *  D. a mestre de A só recebe sinais de A.
 *
 *   npx tsx lib/sinais/__tests__/isolamento-estrategias.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x'

import {
  alvoLegadoDaEstrategia,
  chaveDaTrade,
  entradaOriginal,
  ESTRATEGIA_DA_CHAVE,
  fonteDaMestreParaEstrategia,
  FONTE_DA_MESTRE,
  ligarSeguimento,
  resolverEstrategiaDoAlerta,
  type EntradaComIdentidade,
} from '../identidade'
import { posicaoMestreDoAceite, type PosicaoMestreCandidata } from '../../mestres/t2t'

const raiz = join(__dirname, '..', '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8')
let n = 0
const caso = (nome: string, f: () => void | Promise<void>) => Promise.resolve(f()).then(() => { n++ }, (e) => { console.error(`✗ ${nome}`); throw e })

// Payloads REAIS (tradingview_signals, 07/10): a venda do Sensei das 08:00 e o seu TP4; uma compra
// do MTM Scanner no mesmo par.
const senseiEntrada = { sl: 4138.58, tf: '15', tp1: 4123.96, tp2: 4118.11, tp3: 4109.34, tp4: 4097.64, entry: 4132.73, state: 'ENTRY', action: 'SELL', ticker: 'XAUUSD', strategy: 'MTM Sensei X' }
const senseiTp4 = { be: 4132.73, sl: 4132.73, tf: '15', tp1: 4123.96, tp2: 4118.11, tp3: 4109.34, tp4: 4097.64, entry: 4132.73, price: 4095.91, state: 'TP4', action: 'SELL', ticker: 'XAUUSD', strategy: 'MTM Sensei X' }

async function main() {
  // ── identidade do alerta ─────────────────────────────────────────────────────────────────────
  await caso('?strategy= manda sobre o nome', () => {
    assert.equal(resolverEstrategiaDoAlerta({ forcada: 'sensei', alertName: 'MTMScanner' }).estrategia, 'sensei')
    assert.equal(resolverEstrategiaDoAlerta({ forcada: 'goldkiller' }).estrategia, 'Goldkiller')
    assert.equal(resolverEstrategiaDoAlerta({ forcada: 'aurum' }).estrategia, 'aurum-flow')
    assert.equal(resolverEstrategiaDoAlerta({ forcada: 'inventada' }).estrategia, null)
  })
  await caso('os 5 nomes em uso resolvem-se sem ambiguidade', () => {
    assert.equal(resolverEstrategiaDoAlerta({ alertName: 'MTM Sensei X' }).estrategia, 'sensei')
    assert.equal(resolverEstrategiaDoAlerta({ alertName: 'MTMScanner' }).estrategia, 'mtm-scanner')
    assert.equal(resolverEstrategiaDoAlerta({ alertName: 'GoldKiller' }).estrategia, 'Goldkiller')
    assert.equal(resolverEstrategiaDoAlerta({ alertName: 'MTM Perps Aurum Flow' }).estrategia, 'aurum-flow', 'o «MTM Perps» faz parte do nome da Aurum')
    assert.equal(resolverEstrategiaDoAlerta({ alertName: 'MTM Perps' }).estrategia, 'mtm-perps')
  })
  await caso('nome que serve a duas estratégias = ambíguo, nunca «a primeira»', () => {
    const r = resolverEstrategiaDoAlerta({ alertName: 'GoldKiller x Sensei' })
    assert.equal(r.estrategia, null)
    assert.match(String(r.motivo), /ambíguo/)
    assert.equal(resolverEstrategiaDoAlerta({ alertName: 'XAUUSD alerta' }).estrategia, null, 'sem nome conhecido não vai ao Sensei por omissão')
  })

  // ── chave da trade ───────────────────────────────────────────────────────────────────────────
  await caso('a entrada e o TP4 do Sensei têm a MESMA chave (a fonte repete os seus campos)', () => {
    const a = chaveDaTrade({ estrategia: 'sensei', ticker: 'XAUUSD', payload: senseiEntrada })
    const b = chaveDaTrade({ estrategia: 'sensei', ticker: 'XAUUSD', payload: senseiTp4 })
    assert.ok(a)
    assert.equal(a, b)
    assert.equal(a, 'sensei|XAUUSD|sell|4132.73|15|4123.96', 'a mesma forma que a migração 199 preencheu')
  })
  await caso('id explícito da fonte ganha à impressão digital', () => {
    assert.equal(chaveDaTrade({ estrategia: 'Goldkiller', ticker: 'XAUUSD', payload: { trade_id: 'gk-77', entry: 1, action: 'buy' } }), 'Goldkiller|id:gk-77')
  })
  await caso('sem estratégia ou sem entrada não há chave', () => {
    assert.equal(chaveDaTrade({ estrategia: null, ticker: 'XAUUSD', payload: senseiEntrada }), null)
    assert.equal(chaveDaTrade({ estrategia: 'Goldkiller', ticker: 'XAUUSD', payload: { event: 'tp_hit', action: 'buy' } }), null)
  })

  // ── A. o seguimento de A nunca toca na entrada de B ──────────────────────────────────────────
  await caso('A. mesmo ticker, mesmo preço, mesma direcção, outra estratégia → não liga', () => {
    const chaveSensei = chaveDaTrade({ estrategia: 'sensei', ticker: 'XAUUSD', payload: senseiTp4 })
    // A entrada do GoldKiller com EXACTAMENTE os mesmos números (o pior caso possível).
    const chaveGk = chaveDaTrade({ estrategia: 'Goldkiller', ticker: 'XAUUSD', payload: senseiEntrada })
    const entradas: EntradaComIdentidade[] = [{ id: 'gk-1', estrategia: 'Goldkiller', chave_trade: chaveGk }]
    const r = ligarSeguimento(entradas, { estrategia: 'sensei', chave: chaveSensei })
    assert.equal(r.ok, false)
    assert.equal(r.ligacao, 'sem_entrada')
    // Mesmo que a consulta «esqueça» o filtro da estratégia e traga a chave alheia, a decisão filtra.
    const forjada: EntradaComIdentidade[] = [{ id: 'gk-2', estrategia: 'Goldkiller', chave_trade: chaveSensei }]
    assert.equal(ligarSeguimento(forjada, { estrategia: 'sensei', chave: chaveSensei }).ok, false)
  })
  await caso('A. seguimento sem chave ou sem estratégia não toca em nada', () => {
    const e: EntradaComIdentidade[] = [{ id: 'x', estrategia: 'Goldkiller', chave_trade: 'Goldkiller|XAUUSD|buy|1||' }]
    assert.equal(ligarSeguimento(e, { estrategia: 'Goldkiller', chave: null }).ligacao, 'sem_chave')
    assert.equal(ligarSeguimento(e, { estrategia: null, chave: 'Goldkiller|XAUUSD|buy|1||' }).ligacao, 'sem_estrategia')
  })
  await caso('A. duas entradas da mesma estratégia com a mesma chave → ambíguo, nada executa', () => {
    const k = 'sensei|XAUUSD|sell|4132.73|15|4123.96'
    const r = ligarSeguimento([{ id: 'a', estrategia: 'sensei', chave_trade: k }, { id: 'b', estrategia: 'sensei', chave_trade: k }], { estrategia: 'sensei', chave: k })
    assert.equal(r.ligacao, 'ambigua')
    // … salvo quando a segunda é um REENVIO já ligado à primeira (entrada_id preenchido).
    const r2 = ligarSeguimento([{ id: 'a', estrategia: 'sensei', chave_trade: k }, { id: 'b', estrategia: 'sensei', chave_trade: k, entrada_id: 'a' }], { estrategia: 'sensei', chave: k })
    assert.equal(r2.ok && r2.entradaId, 'a')
    assert.equal(entradaOriginal([{ id: 'a', estrategia: 'sensei', chave_trade: k }], { id: 'b', estrategia: 'sensei', chave: k }), 'a')
    assert.equal(entradaOriginal([{ id: 'a', estrategia: 'mtm-scanner', chave_trade: k }], { id: 'b', estrategia: 'sensei', chave: k }), null)
  })

  // ── C. dois sinais simultâneos, mesmo ticker, estratégias diferentes, até ao fecho ────────────
  await caso('C. Sensei e MTM Scanner no XAUUSD ao mesmo tempo: cada seguimento vai à sua entrada', () => {
    const scannerPayload = { sl: 4130, tp1: 4145, entry: 4137.3, action: 'buy', ticker: 'XAUUSD', timeframe: '15' }
    const kS = chaveDaTrade({ estrategia: 'sensei', ticker: 'XAUUSD', payload: senseiEntrada })!
    const kM = chaveDaTrade({ estrategia: 'mtm-scanner', ticker: 'XAUUSD', payload: scannerPayload })!
    const abertas: EntradaComIdentidade[] = [
      { id: 'scanner-0745', estrategia: 'mtm-scanner', chave_trade: kM }, // a mais RECENTE do ticker
      { id: 'sensei-0800', estrategia: 'sensei', chave_trade: kS },
    ]
    for (const estado of ['TP1', 'BE', 'TP2', 'TP3', 'TP4']) {
      const k = chaveDaTrade({ estrategia: 'sensei', ticker: 'XAUUSD', payload: { ...senseiTp4, state: estado } })
      const r = ligarSeguimento(abertas, { estrategia: 'sensei', chave: k })
      assert.equal(r.ok && r.entradaId, 'sensei-0800', `${estado} do Sensei vai à venda do Sensei`)
    }
    const fechoScanner = ligarSeguimento(abertas, { estrategia: 'mtm-scanner', chave: chaveDaTrade({ estrategia: 'mtm-scanner', ticker: 'XAUUSD', payload: { ...scannerPayload, event: 'exit' } }) })
    assert.equal(fechoScanner.ok && fechoScanner.entradaId, 'scanner-0745', 'o fecho do Scanner vai à compra do Scanner')
  })

  // ── D. a mestre de A só recebe A ─────────────────────────────────────────────────────────────
  await caso('D. cada estratégia → a fonte da SUA mestre; sem estratégia → nenhuma', async () => {
    const { ESTRATEGIA_DO_WEBHOOK } = await import('../../mestres/servidor/sinal-mestre')
    for (const [estrategia, fonte] of Object.entries(FONTE_DA_MESTRE)) {
      assert.equal(ESTRATEGIA_DO_WEBHOOK[fonte]?.slug, estrategia, `a fonte ${fonte} abre na mestre de ${estrategia} e de mais nenhuma`)
    }
    assert.equal(fonteDaMestreParaEstrategia(null), null)
    assert.equal(fonteDaMestreParaEstrategia('mtm-perps'), null, 'o MTM Perps não tem mestre — e não herda a da Aurum')
    assert.equal(fonteDaMestreParaEstrategia('premium-ouro'), null, 'o Premium não entra pelo webhook TradingView')
    for (const chave of Object.keys(ESTRATEGIA_DA_CHAVE)) void chave
  })
  await caso('D. executor legado: só Sensei e GoldKiller, cada um o seu', () => {
    assert.equal(alvoLegadoDaEstrategia('sensei', 'gold_btc'), 'sensei')
    assert.equal(alvoLegadoDaEstrategia('Goldkiller', 'gold_btc'), 'goldkiller')
    assert.equal(alvoLegadoDaEstrategia('mtm-scanner', 'gold_btc'), null, 'ouro do scanner nunca na conta do Sensei')
    assert.equal(alvoLegadoDaEstrategia(null, 'gold_btc'), null, 'ouro sem estratégia nunca na conta do Sensei')
    assert.equal(alvoLegadoDaEstrategia('aurum-flow', 'gold_btc'), null)
  })
  await caso('D. T2T: a posição da mestre por id; várias candidatas sem id = ambíguo', () => {
    const agora = '2026-10-07T11:57:00Z'
    const c = (id: string, preco: number): PosicaoMestreCandidata => ({ id, symbol: 'XAUUSD', direcao: 'sell', preco_entrada: preco, aberta_em: '2026-10-07T11:56:55Z', estado: 'aberta' })
    const duas = [c('camada-1', 4117), c('camada-2', 4120)]
    const sinal = { symbol: 'XAUUSD', direcao: 'sell' as const, entrada: 4120, mensagemEm: agora, pip: 0.1 }
    assert.equal(posicaoMestreDoAceite(duas, sinal, 'camada-1').pos?.id, 'camada-1', 'a ponte do sinal manda')
    const amb = posicaoMestreDoAceite(duas, sinal, null)
    assert.equal(amb.pos, null)
    assert.match(String(amb.motivo), /ambíguo/)
    assert.equal(posicaoMestreDoAceite([c('so', 4120)], sinal, null).pos?.id, 'so')
  })

  // ── guardas estáticas: o código usa isto (para ninguém voltar ao ticker) ──────────────────────
  const rota = ler('app/api/webhooks/tradingview/route.ts')
  await caso('webhook: identidade gravada, ligação por chave, mestre pela estratégia', () => {
    assert.match(rota, /resolverEstrategiaDoAlerta\(/)
    assert.match(rota, /estrategia, chave_trade: chaveTrade/, 'tradingview_signals leva estratégia e chave')
    assert.match(rota, /ligarSeguimento\(/)
    assert.match(rota, /fonte: fonteMestre/, 'a mestre principal recebe a fonte da ESTRATÉGIA')
    assert.ok(!/const execTarget = isGoldKiller \? "goldkiller"/.test(rota), 'acabou o «tudo o resto vai ao Sensei»')
    assert.match(rota, /scanner: estrategia === "mtm-scanner" \? scannerKey : null/, 'a mestre do scanner só recebe o scanner')
    assert.match(rota, /isAurumFlow && estrategia === "aurum-flow"/, 'a mestre da Aurum só recebe a Aurum')
    assert.ok(!/findActiveSenseiIdeaForFollowup/.test(rota), 'o seguimento não procura ideia pelo ticker')
    assert.match(rota, /entradaChatMessageId,/, 'o fecho T2T vai pela mensagem da entrada')
    assert.ok(!/from\("mtmcopy_signal_tracking"\)\s*\.select\("exits_done"\)\s*\.eq\("symbol"/.test(rota), 'o BE redundante já não lê o último do símbolo')
  })
  await caso('B. ideias: toda a leitura/escrita filtra pela estratégia', () => {
    const ideias = ler('lib/mtmcopy/sensei-ideas.ts')
    const corpo = (nome: string) => ideias.slice(ideias.indexOf(`export async function ${nome}`), ideias.indexOf('\n}\n', ideias.indexOf(`export async function ${nome}`)))
    for (const f of ['saveSenseiTradeIdea', 'findPendingSenseiIdea', 'ideiaDaEntrada', 'createActivatedSenseiIdea']) {
      assert.match(corpo(f), /estrategia/, `${f} usa a estratégia`)
    }
    assert.match(corpo('saveSenseiTradeIdea'), /\.eq\('estrategia', estrategia\)[\s\S]*status: 'expired'|status: 'expired'[\s\S]*\.eq\('estrategia', estrategia\)/, 'uma ideia nova só expira as da mesma estratégia')
    assert.match(corpo('findPendingSenseiIdea'), /\.eq\('estrategia', estrategia\)/, 'a activação só funde ideias da mesma estratégia')
    assert.ok(!/findActiveSenseiIdeaForFollowup/.test(ideias), 'a procura pelo ticker + «mais recente» saiu')
  })
  await caso('B. activação: com uma ideia de outro scanner na base, a consulta não a devolve', async () => {
    const { findPendingSenseiIdea } = await import('../../mtmcopy/sensei-ideas')
    // Base falsa: uma ideia pendente do GoldKiller no XAUUSD. A consulta do Sensei tem de a excluir.
    const linhas = [{ id: 'gk', estrategia: 'Goldkiller', symbol: 'XAUUSD', status: 'pending', timeframe: '15' }]
    const filtros: Array<[string, unknown]> = []
    const q: Record<string, unknown> = {}
    Object.assign(q, {
      select: () => q, order: () => q, limit: () => q,
      eq: (c: string, v: unknown) => { filtros.push([c, v]); return q },
      then: (res: (v: unknown) => void) => res({ data: linhas.filter((l) => filtros.every(([c, v]) => (l as Record<string, unknown>)[c] === v)), error: null }),
    })
    const db = { from: () => q } as never
    assert.equal(await findPendingSenseiIdea(db, 'XAUUSD', '15', 'sensei'), null, 'a ideia do GoldKiller não é do Sensei')
    filtros.length = 0
    assert.equal(await findPendingSenseiIdea(db, 'XAUUSD', '15', null), null, 'sem estratégia não procura')
  })
  await caso('T2T: fecho dos seguidores pelo id da posição', () => {
    const t2t = ler('lib/mtmcopy/t2t-lifecycle.ts')
    assert.match(t2t, /select\('id, connection_id, broker_position_id'\)/)
    assert.match(t2t, /closeFollowerOrder\(accId, symbol, pendingOnly, brokerId\)/)
    assert.match(t2t, /ambíguo: sem id da posição/)
  })

  console.log(`isolamento-estrategias: ${n} casos OK`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * MOTOR EM SOMBRA = MONITOR — tick a tick, o motor (avaliarItem em sombra, estado virtual +
 * sobreposições) pretende EXACTAMENTE as ordens que o monitor ORIGINAL (git 8a81044) envia, pela
 * mesma ordem, nos mesmos cenários. E o registo da sombra: fusão de intenções, casamento com o que o
 * monitor fez (latência e divergência em pips/pontos), fechos da corretora, ressincronização.
 *
 *   npx tsx lib/gestao-real/__tests__/sombra.check.ts
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { RAIZ, empacotar, fonteDoGit, type Registo } from './harness'
import { FALSOS_SITE } from './falsos-site'
import * as P from './cenarios-premium'
import * as T from './cenarios-t2t'
import { avaliarItem, pipDoItem, type ContextoAvaliacao, type ItemGestao, type Sobreposicao } from '../avaliar'
import { configPremiumDoAmbiente, type LinhaPremium, type PosicaoGestao } from '../premium'
import { configT2TDoAmbiente, type LinhaT2T } from '../t2t'
import { configMtmAutoDoAmbiente, gerirAlvosEProtecao } from '../mtmauto'
import { RegistoSombra, diferencasPosicoes, percentil, regraDaNota, type Intencao } from '../sombra'
import { t2tUsaTrailing } from '../../mtmcopy/t2t-source'

const pasta = path.join(RAIZ, 'lib/mtmcopy')
type Chamada = { a: string; sl?: number | null; tp?: number | null; vol?: number | null; x?: string }

function contextoCaptura(intencoes: Intencao[], sobre = new Map<string, Sobreposicao>()): ContextoAvaliacao {
  return {
    modo: 'sombra',
    cfg: { premium: { ...configPremiumDoAmbiente({}), trailingTempoReal: false }, t2t: configT2TDoAmbiente({}), mtmauto: configMtmAutoDoAmbiente({}) },
    registo: { decidir: (i: Intencao) => intencoes.push(i), live: () => undefined } as unknown as RegistoSombra,
    sobreposicoes: sobre,
    posicoesDe: () => null,
    subscritores: [],
    trailingTempoReal: false,
  }
}

const doMonitor = (log: Registo[]): Chamada[] =>
  log.flatMap((x): Chamada[] => {
    if (x.k === 'modify') return [{ a: 'sl', sl: (x.sl as number) ?? null, tp: (x.tp as number) ?? null }]
    if (x.k === 'close') return [{ a: 'fecho', vol: (x.vol as number) ?? null }]
    if (x.k === 'mirror') return [{ a: 'espelho', x: JSON.stringify(x.action) }]
    if (x.k === 'announce' && x.event === 'target_final') return [{ a: 'encerrar' }]
    return []
  })
const daSombra = (is: Intencao[]): Chamada[] =>
  is.map((i) => i.acao === 'sl' ? { a: 'sl', sl: i.sl ?? null, tp: i.tp ?? null }
    : i.acao === 'fecho' ? { a: 'fecho', vol: i.volume ?? null }
      : i.acao === 'espelho' ? { a: 'espelho', x: i.detalhe ?? '' }
        : { a: 'encerrar' })

async function premium() {
  const original = await empacotar<{ runPremiumPriceMonitor: () => Promise<unknown> }>({ codigo: fonteDoGit('lib/mtmcopy/premium-price-monitor.ts'), pasta, falsos: FALSOS_SITE })
  for (const c of P.cenarios.slice(0, 5)) {
    // Monitor original, com a corretora falsa a aplicar as ordens dele.
    const w = P.novoMundo(c)
    ;(globalThis as { __P?: unknown }).__P = w
    const porPasso: Chamada[][] = []
    for (const passo of c.passos) {
      for (const l of Object.values(w.contas)) for (const p of l) { const s = Object.keys(passo.preco).find((k) => String(p.symbol).startsWith(k)); if (s) p.currentPrice = passo.preco[s] }
      const antes = w.log.length
      await original.runPremiumPriceMonitor()
      porPasso.push(doMonitor(w.log.slice(antes)))
    }
    // Motor em sombra: posições REAIS intactas (ninguém as mexe), decisões pela sobreposição.
    const contas = JSON.parse(JSON.stringify(c.posicoes)) as Record<string, PosicaoGestao[]>
    const itens: ItemGestao[] = c.linhas.map((l) => ({ tipo: 'premium', conta: String(l.account_id), ref: String(l.id), linha: JSON.parse(JSON.stringify(l)) as LinhaPremium, espelhar: l.account_id === P.MESTRE }))
    const sobre = new Map<string, Sobreposicao>()
    for (const [i, passo] of c.passos.entries()) {
      const intencoes: Intencao[] = []
      const ctx = contextoCaptura(intencoes, sobre)
      for (const item of itens) {
        const posicoes = contas[item.conta]!.map((p) => ({ ...p, currentPrice: passo.preco[Object.keys(passo.preco).find((k) => p.symbol.startsWith(k))!] }))
        await avaliarItem(item, { conta: item.conta, posicoes, precoMedio: () => null, agora: 1_000 * i }, ctx)
      }
      assert.deepEqual(daSombra(intencoes), porPasso[i], `${c.nome} · passo ${i}`)
    }
    console.log(`ok  sombra = monitor · Premium · ${c.nome}`)
  }
}

async function t2t() {
  const original = await empacotar<{ runT2TPriceMonitor: () => Promise<unknown> }>({ codigo: fonteDoGit('lib/mtmcopy/t2t-price-monitor.ts'), pasta, falsos: FALSOS_SITE })
  for (const c of [T.cenarios[0]!, T.cenarios[2]!]) {
    const w = T.novoMundo(c)
    ;(globalThis as { __P?: unknown }).__P = w
    const porPasso: Chamada[][] = []
    for (const passo of c.passos) {
      w.precos = { ...passo.precos }
      const antes = w.log.length
      await original.runT2TPriceMonitor()
      porPasso.push(doMonitor(w.log.slice(antes)))
    }
    const linhas = c.linhas() as unknown as Array<LinhaT2T & { symbol: string }>
    const contas = JSON.parse(JSON.stringify(c.posicoes)) as Record<string, PosicaoGestao[]>
    const itens: ItemGestao[] = linhas.map((l) => ({ tipo: 't2t', conta: T.ACC, ref: l.id, linha: l, estado: { exitsDone: 0, beDone: false, trailing: false, announced: false }, podeTrailing: t2tUsaTrailing(l.channel_key, l.raw_message) }))
    const sobre = new Map<string, Sobreposicao>()
    for (const [i, passo] of c.passos.entries()) {
      const intencoes: Intencao[] = []
      for (const item of itens) {
        const precoMedio = (s: string) => passo.precos[Object.keys(passo.precos).find((k) => s.startsWith(k)) ?? ''] ?? null
        await avaliarItem(item, { conta: T.ACC, posicoes: contas[T.ACC]!, precoMedio, agora: 1_000 * i }, contextoCaptura(intencoes, sobre))
      }
      assert.deepEqual(daSombra(intencoes), porPasso[i], `${c.nome} · passo ${i}`)
    }
    console.log(`ok  sombra = monitor · T2T · ${c.nome}`)
  }
}

async function mtmauto() {
  // Referência: o motor do MTM Auto (gerirAlvosEProtecao) com uma corretora que aplica as ordens e a
  // execução gravada a cada passagem — o que o cron faz. Sombra: posição intacta + sobreposição.
  const precos = [2001, 2004.3, 2005.2, 2007.5, 2006, 2010.1, 2013, 2015.4]
  const exec0 = { id: 'e1', user_id: 'u1', lote: 0.1, sl: 1990, saidas_feitas: 0, trailing_sl: null as number | null, pico_pips: 0, broker_position_id: 'p1', espelhado_pct: 0 }
  const sinal = { symbol: 'XAUUSD', direction: 'buy' as const, tps: [2005, 2010, 2015] }
  const opcoes = { beAtivo: true, trailingAtivo: true, saidasPct: [50, 30, 20] }
  const cfg = configMtmAutoDoAmbiente({})
  const ref: Chamada[][] = []
  const corretora: PosicaoGestao = { id: 'p1', symbol: 'XAUUSD.s', type: 'POSITION_TYPE_BUY', openPrice: 2000.2, volume: 0.1, stopLoss: 1990, takeProfit: 2015 }
  let execRef = { ...exec0 }
  let aberta = true
  for (const p of precos) {
    const ch: Chamada[] = []
    if (aberta && (execRef as { estado?: string }).estado !== 'closed') {
      const { patch } = await gerirAlvosEProtecao({
        execucao: execRef, sinal, posicao: { ...corretora, currentPrice: p }, opcoes, cfg,
        ops: {
          fechar: async (_id, v) => { ch.push({ a: 'fecho', vol: v ?? null }); if (v == null) aberta = false; else corretora.volume = Math.round(((corretora.volume ?? 0) - v) * 100) / 100; return { stringCode: 'TRADE_RETCODE_DONE' } },
          modificar: async (_id, sl, tp) => { ch.push({ a: 'sl', sl: sl ?? null, tp: tp ?? null }); if (sl) corretora.stopLoss = sl; return { stringCode: 'TRADE_RETCODE_DONE' } },
          esquecer: () => undefined, avisar: async () => undefined,
        },
      })
      const { updated_at: _u, ...resto } = patch
      void _u
      execRef = { ...execRef, ...resto }
    }
    ref.push(ch)
  }
  const item: ItemGestao = { tipo: 'mtmauto', conta: 'a1', ref: 'e1', execucao: { ...exec0 }, sinal, opcoes, contaEducador: null }
  const real: PosicaoGestao = { id: 'p1', symbol: 'XAUUSD.s', type: 'POSITION_TYPE_BUY', openPrice: 2000.2, volume: 0.1, stopLoss: 1990, takeProfit: 2015 }
  const sobre = new Map<string, Sobreposicao>()
  for (const [i, p] of precos.entries()) {
    const intencoes: Intencao[] = []
    await avaliarItem(item, { conta: 'a1', posicoes: [{ ...real, currentPrice: p }], precoMedio: () => null, agora: i * 1000 }, contextoCaptura(intencoes, sobre))
    assert.deepEqual(daSombra(intencoes), ref[i], `MTM Auto · passo ${i}`)
    if (intencoes.length) assert.ok(intencoes.every((x) => /^(be|trailing|alvo\d_parcial|alvo_final)$/.test(x.regra)), JSON.stringify(intencoes.map((x) => x.regra)))
  }
  assert.equal(item.terminado, true, 'alvo final termina o item')
  console.log('ok  sombra = motor · MTM Auto · alvos 50/30/20 + BE + trailing')
}

function registo() {
  const pip = (s: string) => pipDoItem('premium', s)
  const r = new RegistoSombra({ janelaMs: 5_000, esperaMs: 120_000 }, pip)
  const base: Omit<Intencao, 'sl' | 'tickEm' | 'regra' | 'acao'> = { conta: 'M', tipo: 'premium', ref: 'r1', posicao: 'p1', simbolo: 'XAUUSD.s', lado: 'buy', preco: 2005 }

  // Trailing: três intenções em 4 s fundem-se numa (fica a última).
  r.decidir({ ...base, regra: 'trailing_pos_tp1', acao: 'sl', sl: 2001.0, tickEm: 10_000 }, 10_000)
  r.decidir({ ...base, regra: 'trailing_pos_tp1', acao: 'sl', sl: 2001.8, tickEm: 12_000 }, 12_000)
  r.decidir({ ...base, regra: 'trailing_pos_tp1', acao: 'sl', sl: 2002.4, tickEm: 14_000 }, 14_000)
  assert.equal(r.emEspera, 1)
  // O monitor move o SL 900 ms depois, 0,3 abaixo → casada, latência 900 ms, divergência 3 pips.
  r.observar({ conta: 'M', posicao: 'p1', simbolo: 'XAUUSD.s', tipo: 'sl', de: 2000.5, para: 2002.1, em: 14_900 }, 14_900)
  let out = r.recolher(15_000)
  assert.equal(out.length, 1)
  assert.equal(out[0]!.estado, 'casada')
  assert.equal(out[0]!.latencia_ms, 900)
  assert.equal(out[0]!.divergencia_pips, 3)
  assert.equal(out[0]!.sl, 2002.4)

  // Monitor MAIS RÁPIDO que o motor: a observação chega antes → latência negativa.
  r.observar({ conta: 'M', posicao: 'p1', simbolo: 'XAUUSD.s', tipo: 'volume', de: 0.1, para: 0.03, em: 20_000 }, 20_000)
  r.decidir({ ...base, regra: 'exit1_parcial', acao: 'fecho', volume: 0.07, tickEm: 20_400 }, 20_400)
  out = r.recolher(21_000)
  assert.equal(out[0]!.estado, 'casada')
  assert.equal(out[0]!.latencia_ms, -400)
  assert.equal(out[0]!.divergencia_volume, 0)

  // Intenção sem resposta do monitor em 2 min → sem_monitor. Observação sem intenção → monitor_sem_sombra.
  r.decidir({ ...base, regra: 'tranca_lucro', acao: 'sl', sl: 2000.8, tickEm: 30_000 }, 30_000)
  r.observar({ conta: 'M', posicao: 'p9', simbolo: 'XAUUSD.s', tipo: 'sl', de: 1990, para: 1995, em: 31_000 }, 31_000)
  assert.equal(r.recolher(100_000).length, 0)
  out = r.recolher(160_000)
  assert.deepEqual(out.map((x) => x.estado).sort(), ['monitor_sem_sombra', 'sem_monitor'])

  // Posição fechada pela corretora (SL/TP) sem intenção de fecho → uma linha posicao_fechada.
  r.observar({ conta: 'M', posicao: 'p1', simbolo: 'XAUUSD.s', tipo: 'fechada', de: 0.03, para: 0, em: 200_000 }, 200_000)
  out = r.recolher(200_001)
  assert.equal(out[0]!.estado, 'posicao_fechada')

  // Espelho sai logo; live sai com o resultado.
  r.decidir({ ...base, regra: 'espelho_subscritores', acao: 'espelho', tickEm: 1, detalhe: '{}' }, 1)
  r.live({ ...base, regra: 'be_cedo', acao: 'sl', sl: 2000.8, tickEm: 2 }, 2, false, 'TRADE_RETCODE_INVALID_STOPS')
  out = r.recolher(3)
  assert.deepEqual(out.map((x) => `${x.estado}/${x.modo}`), ['espelho/sombra', 'live_falhou/live'])

  // Cripto em PONTOS: 12 pontos de diferença no BTC são 12, não 120 000.
  const b = new RegistoSombra(undefined, pip)
  b.decidir({ ...base, simbolo: 'BTCUSD', regra: 'perfil_trailing', acao: 'sl', sl: 60_100, tickEm: 0 }, 0)
  b.observar({ conta: 'M', posicao: 'p1', simbolo: 'BTCUSD', tipo: 'sl', de: 59_500, para: 60_088, em: 800 }, 800)
  assert.equal(b.recolher(1000)[0]!.divergencia_pips, 12)
  assert.equal(pipDoItem('premium', 'EURUSD'), 0.0001)
  assert.equal(pipDoItem('premium', 'KASUSD'), 1)
  assert.equal(pipDoItem('mtmauto', 'KASUSD'), 0.0001, 'o MTM Auto mede KAS como forex (regra dele, preservada)')

  // Rótulos das regras pelas notas dos monitores.
  assert.equal(regraDaNota('XAUUSD: Exit 2 → fecha 15% (0.02)', 'fecho'), 'exit2_parcial')
  assert.equal(regraDaNota('XAUUSD: Exit 3 → fecha tudo (0.01)', 'fecho'), 'exit3_total')
  assert.equal(regraDaNota('XAUUSD: BE (+5p) + trailing + TP runner (2015) após Exit 1', 'sl'), 'be_trailing_exit1')
  assert.equal(regraDaNota('XAUUSD: Exit 1 subs → 1 escalaram, 1 seguraram', 'espelho'), 'espelho_subscritores')
  assert.equal(regraDaNota('early_be XAUUSD', 'sl'), 'be_cedo')
  assert.equal(percentil([5, 1, 9, 3], 50), 3)
  console.log('ok  registo da sombra: fusão, casamento, latência ±, sem_monitor, monitor_sem_sombra, fechos, pontos')
}

function ressincronizacao() {
  const p = (sl: number, vol = 0.1) => ({ id: 'p1', symbol: 'XAUUSD.s', volume: vol, stopLoss: sl, takeProfit: 2015 })
  // Linha de base: nada.
  let v = diferencasPosicoes('M', null, [p(1990)], 0)
  assert.equal(v.observacoes.length, 0)
  // SL e volume mudam.
  v = diferencasPosicoes('M', v.vista, [p(2000.5, 0.03)], 1)
  assert.deepEqual(v.observacoes.map((o) => o.tipo), ['sl', 'volume'])
  // Dessincroniza: o chamador deita a vista fora (null) e NÃO avalia; o terminal volta vazio a meio da
  // ressincronização — sem vista não há «fechada» falsa.
  const aMeio = diferencasPosicoes('M', null, [], 2)
  assert.equal(aMeio.observacoes.length, 0)
  // Sincronizado outra vez: nova linha de base com a posição (o SL mexeu durante a queda) → nada.
  const base = diferencasPosicoes('M', null, [p(2003)], 3)
  assert.equal(base.observacoes.length, 0)
  // A partir daqui volta a ver: desaparece → fechada.
  assert.deepEqual(diferencasPosicoes('M', base.vista, [], 4).observacoes.map((o) => o.tipo), ['fechada'])
  console.log('ok  ressincronização: linha de base sem observações falsas')
}

async function main() {
  await premium()
  await t2t()
  await mtmauto()
  registo()
  ressincronizacao()
  console.log('sombra: todos certos')
}

main().catch((e) => { console.error(e); process.exit(1) })

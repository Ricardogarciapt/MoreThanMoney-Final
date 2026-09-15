/**
 * As contas da cópia MTM Funded → conta do aluno: lote, SL/TP por distância, parciais, símbolo,
 * quem pode copiar e quando se recusa abrir. Números à mão.
 *
 *   npx tsx lib/mtmfunded/__tests__/copia.check.ts
 */
import type { MetaApiSymbolSpecification } from '../../mtmcopy/metaapi'
import {
  volumeDestino, stopsPorDistancia, pctParcial, planoParcial, simboloDestino, simboloPermitido, clientIdDaCopia,
} from '../copia/dimensionar'
import { podeCopiarFunded, destinoPermitido, motivoParaNaoAbrir, classificarDemo, type ContextoAbertura } from '../copia/elegibilidade'
import { SEM_DIREITOS, type MotivoCopia } from '../../entitlements'
import { validarConfig } from '../copia/config'
import { colapsarModificacoes, proximaTentativa, erroIncerto, type EventoCopia } from '../copia/processar'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${JSON.stringify(b)}\n   obtido:   ${JSON.stringify(a)}`)
}

const FX: MetaApiSymbolSpecification = { point: 0.00001, digits: 5, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, stopsLevel: 0 }
const IDX: MetaApiSymbolSpecification = { point: 0.1, digits: 1, minVolume: 0.1, maxVolume: 50, volumeStep: 0.1 }

// ── lote ─────────────────────────────────────────────────────────────────────
{
  const base = { valor: null, saldoOrigem: 100_000, equityDestino: 5_000, loteMax: null, spec: FX }
  const r = volumeDestino({ ...base, modo: 'proporcional_saldo', volumeOrigem: 1 })
  eq('proporcional: 1 lote em 100k → 0,05 numa conta de 5k', r.ok && r.volume, 0.05)
  const r2 = volumeDestino({ ...base, modo: 'proporcional_saldo', volumeOrigem: 1.37, equityDestino: 10_000 })
  eq('proporcional arredonda ao step', r2.ok && r2.volume, 0.14)
  const r3 = volumeDestino({ ...base, modo: 'proporcional_saldo', volumeOrigem: 0.1 })
  eq('proporcional: 0,005 = metade do mínimo → sobe a 0,01', r3.ok && r3.volume, 0.01)
  const r4 = volumeDestino({ ...base, modo: 'proporcional_saldo', volumeOrigem: 0.05 })
  eq('proporcional: 0,0025 < metade do mínimo → recusa', r4.ok, false)
  const r5 = volumeDestino({ ...base, modo: 'proporcional_saldo', volumeOrigem: 1, equityDestino: null })
  eq('proporcional sem equity → recusa', r5.ok, false)
  eq('multiplicador ×2', (volumeDestino({ ...base, modo: 'multiplicador', valor: 2, volumeOrigem: 0.3 }) as { volume: number }).volume, 0.6)
  eq('fixo', (volumeDestino({ ...base, modo: 'fixo', valor: 0.25, volumeOrigem: 3 }) as { volume: number }).volume, 0.25)
  eq('lote máximo corta', (volumeDestino({ ...base, modo: 'multiplicador', valor: 1, volumeOrigem: 5, loteMax: 0.5 }) as { volume: number }).volume, 0.5)
  eq('lote máximo abaixo do mínimo da corretora → recusa', volumeDestino({ ...base, spec: IDX, modo: 'fixo', valor: 1, volumeOrigem: 1, loteMax: 0.05 }).ok, false)
  eq('índice: step 0,1', (volumeDestino({ ...base, spec: IDX, modo: 'multiplicador', valor: 1, volumeOrigem: 0.26 }) as { volume: number }).volume, 0.3)
  // risco 1% de 10 000 = 100; SL a 20 pips EURUSD (0.0020), tick 0.00001 vale 1 USD/lote → 200 pontos × 1 = 200 por lote → 0,5
  const rr = volumeDestino({ ...base, modo: 'risco_pct', valor: 1, volumeOrigem: 1, equityDestino: 10_000, distanciaSl: 0.002, tickSize: 0.00001, tickValue: 1 })
  eq('risco 1% com SL de 20 pips', rr.ok && rr.volume, 0.5)
  eq('risco % sem SL → recusa', volumeDestino({ ...base, modo: 'risco_pct', valor: 1, volumeOrigem: 1, distanciaSl: null }).ok, false)
}

// ── SL/TP por distância ──────────────────────────────────────────────────────
{
  const s = stopsPorDistancia({ direcao: 'buy', entradaOrigem: 2400, slOrigem: 2390, tpOrigem: 2430, precoDestino: 2401.5, digits: 2, copiarSl: true, copiarTp: true })
  eq('buy: distâncias a partir do fill', s, { sl: 2391.5, tp: 2431.5 })
  const v = stopsPorDistancia({ direcao: 'sell', entradaOrigem: 1.1, slOrigem: 1.102, tpOrigem: 1.095, precoDestino: 1.10012, digits: 5, copiarSl: true, copiarTp: false })
  eq('sell: SL acima, TP desligado', v, { sl: 1.10212, tp: null })
  const e = stopsPorDistancia({ direcao: 'buy', entradaOrigem: 2400, slOrigem: 2410, tpOrigem: null, precoDestino: 2400, digits: 2, copiarSl: true, copiarTp: true })
  eq('SL do lado errado (já em lucro, BE+) não se copia como distância negativa', e, { sl: null, tp: null })
}

// ── parciais ─────────────────────────────────────────────────────────────────
{
  eq('pct: fecha 0,4 de 1,0 (fica 0,6)', pctParcial(0.4, 0.6), 0.4)
  eq('pct: segundo parcial 0,3 dos 0,6', pctParcial(0.3, 0.3), 0.5)
  const p1 = planoParcial({ destVolumeOrigem: 0.5, fechadoPctAntes: 0, pct: 0.4, volumeAbertoDestino: 0.5, spec: FX })
  eq('parcial 40% de 0,5 → fecha 0,2', p1, { tipo: 'parcial', volume: 0.2, fechadoPct: 0.4 })
  const p2 = planoParcial({ destVolumeOrigem: 0.5, fechadoPctAntes: 0.4, pct: 0.5, volumeAbertoDestino: 0.3, spec: FX })
  eq('acumula a multiplicar: 40% e 50% = 70% fechado → fecha 0,15', p2, { tipo: 'parcial', volume: 0.15, fechadoPct: 0.7 })
  const p3 = planoParcial({ destVolumeOrigem: 1, fechadoPctAntes: 0, pct: 0.03, volumeAbertoDestino: 1, spec: FX })
  eq('abaixo de 5% → nada, mas acumula', p3.tipo === 'nada' && Number(p3.fechadoPct.toFixed(4)), 0.03)
  const p4 = planoParcial({ destVolumeOrigem: 1, fechadoPctAntes: 0.03, pct: 0.03, volumeAbertoDestino: 1, spec: FX })
  eq('o parcial seguinte apanha o saltado (5,91%)', p4.tipo === 'parcial' && p4.volume, 0.06)
  const p5 = planoParcial({ destVolumeOrigem: 0.02, fechadoPctAntes: 0, pct: 0.8, volumeAbertoDestino: 0.02, spec: FX })
  eq('resto abaixo do mínimo → fecho total', p5.tipo, 'total')
  const p5b = planoParcial({ destVolumeOrigem: 0.02, fechadoPctAntes: 0, pct: 0.6, volumeAbertoDestino: 0.02, spec: FX })
  eq('0,02 a 60% → fecha 0,01 e fica o mínimo', p5b, { tipo: 'parcial', volume: 0.01, fechadoPct: 0.6 })
  const p5c = planoParcial({ destVolumeOrigem: 1, fechadoPctAntes: 0, pct: 0.5, volumeAbertoDestino: 0.2, spec: IDX })
  eq('índice com 0,2 aberto e alvo 0,5 → nada (já está abaixo do alvo)', p5c.tipo, 'nada')
  const p6 = planoParcial({ destVolumeOrigem: 0.5, fechadoPctAntes: 0.5, pct: 1, volumeAbertoDestino: 0.25, spec: FX })
  eq('pct 1 → total', p6.tipo, 'total')
}

// ── símbolos ─────────────────────────────────────────────────────────────────
{
  eq('XAUUSD → XAUUSD.r', simboloDestino('XAUUSD', ['EURUSD.r', 'XAUUSD.r']), 'XAUUSD.r')
  eq('US30 nunca casa com US3000', simboloDestino('US30', ['US3000', 'DJ30']), 'DJ30')
  eq('sem par → null', simboloDestino('GBPJPY', ['EURUSD']), null)
  eq('lista vazia = todos', simboloPermitido('BTCUSD', []), true)
  eq('lista filtra', simboloPermitido('BTCUSD', ['XAUUSD', 'eurusd']), false)
  eq('lista ignora maiúsculas', simboloPermitido('EURUSD', ['eurusd']), true)
  eq('clientId cabe', clientIdDaCopia('a1b2c3d4-0000-0000-0000-000000000000', 'ffeeddcc-1111-1111-1111-111111111111'), 'MTMF_a1b2c3d4_ffeeddcc')
}

// ── elegibilidade ────────────────────────────────────────────────────────────
{
  // Fase 1: basta o direito ao MTM Auto (copiaAutomatica) — Premium e VIP também entram.
  const matriz: Array<[MotivoCopia, boolean, boolean]> = [
    ['admin', true, true], ['mtmcopy', false, true], ['mtmauto', false, true],
    ['vip', false, true], ['premium', false, true], ['nenhum', false, false],
  ]
  for (const [motivo, admin, esperado] of matriz) {
    eq(`copia com motivo ${motivo}`, podeCopiarFunded({ ...SEM_DIREITOS, motivoCopia: motivo, admin, copiaAutomatica: motivo !== 'nenhum' }), esperado)
  }
  eq('sem direito ao MTM Auto não copia', podeCopiarFunded({ ...SEM_DIREITOS, motivoCopia: 'premium', copiaAutomatica: false }), false)
  const demo = { tipo: 'mtmauto' as const, demo: true, ligado: true, metaapiAccountId: 'x' }
  eq('demo ligada: ok', destinoPermitido(demo, false, false).ok, true)
  eq('real: bloqueada para aluno', destinoPermitido({ ...demo, demo: false }, false, false).ok, false)
  eq('desconhecida conta como real', destinoPermitido({ ...demo, demo: null }, false, false).ok, false)
  eq('real: admin pode', destinoPermitido({ ...demo, demo: false }, true, false).ok, true)
  eq('real: com o interruptor dos reais', destinoPermitido({ ...demo, demo: false }, false, true).ok, true)
  eq('desligada: não', destinoPermitido({ ...demo, ligado: false }, true, true).ok, false)
  eq('tradelocker: fase 2', destinoPermitido({ ...demo, tipo: 'tradelocker' }, true, true).ok, false)
  eq('demo pela coluna', classificarDemo(true, 'PUPrime-Live'), true)
  eq('demo pelo servidor', classificarDemo(null, 'VTMarkets-Demo'), true)
  eq('real pelo servidor', classificarDemo(null, 'PUPrime-Live 6'), false)
  eq('sem sinal → desconhecido', classificarDemo(null, 'ICMarketsSC-MT5-2'), null)
}

// ── recusar abrir ────────────────────────────────────────────────────────────
{
  const bom: ContextoAbertura = {
    interruptorGlobal: true, contaEstado: 'ativa', copierAtivo: true, direitoOk: true, destinoLigado: true,
    simboloPermitido: true, copiasAbertas: 0, maxPosicoes: 3, perdaDiariaPct: 1, perdaDiariaMax: 5, destinoProibido: null,
  }
  eq('tudo bem → abre', motivoParaNaoAbrir(bom), null)
  eq('interruptor global', motivoParaNaoAbrir({ ...bom, interruptorGlobal: false })?.includes('interruptor'), true)
  eq('conta quebrada', motivoParaNaoAbrir({ ...bom, contaEstado: 'quebrada' })?.includes('quebrada'), true)
  eq('pausada', motivoParaNaoAbrir({ ...bom, copierAtivo: false }), 'cópia em pausa')
  eq('sem direito', motivoParaNaoAbrir({ ...bom, direitoOk: false })?.includes('MTM Copy'), true)
  eq('destino desligado', motivoParaNaoAbrir({ ...bom, destinoLigado: false }), 'destino desligado')
  eq('real proibido', motivoParaNaoAbrir({ ...bom, destinoProibido: 'real' }), 'real')
  eq('símbolo fora', motivoParaNaoAbrir({ ...bom, simboloPermitido: false })?.includes('símbolo'), true)
  eq('max posições', motivoParaNaoAbrir({ ...bom, copiasAbertas: 3 })?.includes('máximo'), true)
  eq('perda diária', motivoParaNaoAbrir({ ...bom, perdaDiariaPct: 5.2 })?.includes('perda diária'), true)
  eq('sem limites definidos → abre', motivoParaNaoAbrir({ ...bom, maxPosicoes: null, perdaDiariaMax: null, copiasAbertas: 99, perdaDiariaPct: 50 }), null)
}

// ── fila ─────────────────────────────────────────────────────────────────────
{
  const ev = (id: number, tipo: EventoCopia['tipo'], pos = 'p1'): EventoCopia => ({ id, tipo, position_id: pos, account_id: 'a', payload: {}, chave: `${tipo}:${id}`, criado_em: '', tentativas: 0 })
  const r = colapsarModificacoes([ev(1, 'open'), ev(2, 'modify'), ev(3, 'modify'), ev(4, 'modify'), ev(5, 'partial'), ev(6, 'modify'), ev(7, 'modify', 'p2')])
  eq('rajada de modify: fica a última de cada sequência', r.aProcessar.map((e) => e.id), [1, 4, 5, 6, 7])
  eq('saltados', r.saltados.map((e) => e.id), [2, 3])
  eq('retry 1', proximaTentativa(0), { desistir: false, emMs: 1000 })
  eq('retry 4 = 2 min', proximaTentativa(3), { desistir: false, emMs: 120000 })
  eq('depois desiste', proximaTentativa(4), { desistir: true })
  eq('timeout é incerto', erroIncerto('MetaApi RPC connect timeout (55000ms)'), true)
  eq('volume inválido é certo', erroIncerto('Invalid volume'), false)
}

// ── configuração vinda do ecrã ───────────────────────────────────────────────
{
  const c = validarConfig({ modoLote: 'proporcional_saldo', loteMax: '0.5', perdaDiariaMax: 3, simbolos: ['xauusd', 'XAUUSD', ' eurusd', 'rm -rf'] })
  eq('config válida normaliza símbolos', c.ok && c.config, { modo_lote: 'proporcional_saldo', lote_max: 0.5, perda_diaria_max: 3, simbolos: ['XAUUSD', 'EURUSD'] })
  eq('risco % acima de 10 → recusa', validarConfig({ modoLote: 'risco_pct', valor: 15 }).ok, false)
  eq('multiplicador sem valor → recusa', validarConfig({ modoLote: 'multiplicador' }).ok, false)
  eq('perda diária é %', validarConfig({ perdaDiariaMax: 250 }).ok, false)
  eq('lote máximo negativo → recusa', validarConfig({ loteMax: -1 }).ok, false)
  eq('PATCH só com um campo não traz os outros', validarConfig({ copiarTp: false }), { ok: true, config: { copiar_tp: false } })
}

console.log(mau ? `\n${mau} errado(s), ${ok} certo(s)` : `todos certos (${ok})`)
if (mau) process.exit(1)

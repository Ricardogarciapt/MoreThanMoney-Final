/**
 * RECONSTITUIÇÃO — a lógica de replicação sobre velas M1 inventadas (fixtures), sem base nem rede.
 * Cobre o que o relatório promete: o stop ganha ao alvo na mesma vela, a vela da entrada não fecha
 * a posição, o break-even e o trailing apertam, o fecho da fonte manda, as marcas do crachá e o
 * «não duplicar».
 *
 *   npx tsx lib/mtmfunded/__tests__/reconstituicao.check.ts
 */
import {
  ehErro, ehReconstituida, comentarioReconstituido, jaExiste, replicarSinal, ticksDaVela,
  velaDoInstante, PREFIXO_REF, type PosicaoExistente, type SinalParaReplay, type Vela,
} from '../reconstituicao'
import { CONFIG_PADRAO, type ConfigSinais } from '../estrategias-sinais/calculo'
import type { Simbolo } from '../simulado/matematica'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${JSON.stringify(b)}\n   obtido:   ${JSON.stringify(a)}`)
}
const sim = (nome: string, v: boolean) => eq(nome, v, true)

// Ouro sem spread nem comissão: os números do teste ficam legíveis.
const XAU: Simbolo = {
  symbol: 'XAUUSD', classe: 'metal', moeda_lucro: 'USD', digits: 2, contract_size: 100, pip_size: 0.1,
  spread_pontos: 0, comissao_lote: 0, volume_min: 0.01, volume_step: 0.01, volume_max: 20, alavancagem_max: 100,
}
const CFG: ConfigSinais = { ...CONFIG_PADRAO, saidasPct: [] }

const T0 = Date.parse('2026-09-15T10:00:00Z')
const minuto = (i: number) => T0 + i * 60_000
/** vela `i` minutos depois de T0 */
const v = (i: number, o: number, h: number, l: number, c: number): Vela => ({ t: Math.floor(minuto(i) / 1000), o, h, l, c })

const sinalBase: SinalParaReplay = {
  id: 's1', referencia: 'tg:abcd1234', symbol: 'XAUUSD', direcao: 'sell',
  entrada: 4300, sl: 4310, tps: [4290, 4280, 4270], entradaEm: minuto(0), fechoDaFonteEm: null,
}
const correr = (velas: Vela[], sinal = sinalBase, cfg = CFG, ate = minuto(60)) =>
  replicarSinal({ sinal, simbolo: XAU, saldo: 1000, cfg, velas, ate })

// ── 1. marcas (o crachá da interface) ────────────────────────────────────────
{
  eq('comentário', comentarioReconstituido('MTM Auto Premium', 'tg:e071159a'), 'RECONST · MTM Auto Premium · tg:e071159a')
  sim('reconhece pelo ideia_ref', ehReconstituida({ ideia_ref: 'recon:sensei:abc' }))
  sim('reconhece pela chave da ponte', ehReconstituida({ chave: `${PREFIXO_REF}Goldkiller:abc` }))
  sim('reconhece pelo comentário', ehReconstituida({ comentario: 'RECONST · MTM Auto Wolf · tg:1' }))
  eq('uma posição real não é reconstituída', [
    ehReconstituida({ ideia_ref: 'espelho:Goldkiller:9181834', comentario: 'MTM Auto GoldKiller' }),
    ehReconstituida({ ideia_ref: 'sinal:mtm-auto-wolf:msg:14720', comentario: 'MTM Auto Wolf' }),
    ehReconstituida(null),
  ], [false, false, false])
}

// ── 2. velas e ordem dos ticks ───────────────────────────────────────────────
{
  const velas = [v(0, 4300, 4302, 4298, 4300), v(1, 4300, 4301, 4299, 4300)]
  eq('vela do instante', velaDoInstante(velas, minuto(0) + 30)?.t, velas[0].t)
  eq('instante antes da primeira vela', velaDoInstante(velas, minuto(0) - 120), null)
  eq('buraco de mais de 10 min não serve', velaDoInstante(velas, minuto(30)), null)
  eq('venda: o adverso (máximo) primeiro', ticksDaVela(velas[0], 'sell'), [4302, 4298, 4300])
  eq('compra: o adverso (mínimo) primeiro', ticksDaVela(velas[0], 'buy'), [4298, 4302, 4300])
}

// ── 3. a vela da entrada não fecha a posição ─────────────────────────────────
{
  // A vela da entrada já bate no stop (4310), mas a posição nasce nela: só conta a partir da seguinte.
  const r = correr([v(0, 4300, 4315, 4295, 4300), v(1, 4300, 4301, 4299, 4300)])
  sim('replicou', !ehErro(r))
  if (!ehErro(r)) {
    eq('entrada = fecho da vela do minuto do entry_hit', r.precoEntrada, 4300)
    eq('lote de 0,01 numa conta de 1 000 USD', r.volume, 0.01)
    eq('a vela da entrada não fecha a posição', r.fecho, null)
  }
}

// ── 4. o stop ganha ao alvo na mesma vela ────────────────────────────────────
{
  // Vela que toca 4310 (stop) e 4270 (alvo final): numa venda o adverso (máximo) é avaliado primeiro.
  const r = correr([v(0, 4300, 4301, 4299, 4300), v(1, 4300, 4312, 4268, 4270)])
  if (!ehErro(r)) {
    eq('fecha no stop, não no alvo', [r.fecho?.motivo, r.fecho?.preco], ['sl', 4310])
    eq('P&L do stop (0,01 × 100 × −10)', r.fecho?.pnl, -10)
    eq('pips do stop (ouro: pip 0,1)', r.pips, -100)
  }
}

// ── 5. alvo final quando o stop não é tocado ─────────────────────────────────
{
  const r = correr([v(0, 4300, 4301, 4299, 4300), v(1, 4299, 4300, 4269, 4270)])
  if (!ehErro(r)) {
    eq('fecha no alvo final', [r.fecho?.motivo, r.fecho?.preco], ['tp', 4270])
    eq('P&L do alvo', r.fecho?.pnl, 30)
    eq('pips do alvo', r.pips, 300)
  }
}

// ── 6. break-even: o stop passa para a entrada (com o offset) ────────────────
{
  const velas = [v(0, 4300, 4301, 4299, 4300), v(1, 4295, 4296, 4289, 4292), v(2, 4292, 4306, 4292, 4305)]
  // Sem parciais possíveis (0,01), gestaoDoSinal põe be_gatilho = distância ao TP1 (10) e offset 0,2.
  // Com o trailing desligado vê-se o BE sozinho: a vela 1 chega a 4289 (dispara), a vela 2 fecha lá.
  const soBe = correr(velas, sinalBase, { ...CFG, trailingFracaoDoRisco: 0 })
  if (!ehErro(soBe)) {
    eq('gestão: break-even à distância do TP1', [soBe.gestao.be_gatilho, soBe.gestao.be_offset, soBe.gestao.trailing_distancia], [10, 0.2, undefined])
    eq('fecha no break-even e não no stop original', [soBe.fecho?.motivo, soBe.fecho?.preco], ['sl', 4299.8])
    sim('o break-even dá lucro, não prejuízo', (soBe.fecho?.pnl ?? 0) > 0)
  }
  // Com o trailing ligado (o defeito) ele aperta ainda mais: 4289 + 5 = 4294 no mesmo tick.
  const comTrailing = correr(velas)
  if (!ehErro(comTrailing)) eq('o trailing aperta o break-even no mesmo tick', [comTrailing.fecho?.motivo, comTrailing.fecho?.preco], ['sl', 4294])
}

// ── 7. trailing: 50% do risco, arranca à distância do TP1 ───────────────────
{
  const r = correr([v(0, 4300, 4301, 4299, 4300), v(1, 4295, 4295, 4280, 4280), v(2, 4280, 4292, 4280, 4291)])
  if (!ehErro(r)) {
    eq('trailing a 50% do risco (10 → 5)', r.gestao.trailing_distancia, 5)
    eq('trailing arranca à distância do TP1', r.gestao.trailing_ativacao, 10)
    // A 4280 o trailing põe o stop em 4285; a vela 2 sobe a 4292 e apanha-o.
    eq('fecha no trailing', [r.fecho?.motivo, r.fecho?.preco], ['sl', 4285])
    eq('P&L do trailing (+15 de preço)', r.fecho?.pnl, 15)
  }
}

// ── 8. fecho da fonte (o canal fechou o sinal à mão) ─────────────────────────
{
  const sinal = { ...sinalBase, fechoDaFonteEm: minuto(2) }
  const r = correr([v(0, 4300, 4301, 4299, 4300), v(1, 4300, 4301, 4299, 4300), v(2, 4300, 4301, 4296, 4297)], sinal)
  if (!ehErro(r)) {
    eq('fecha ao fecho da vela do minuto em que a fonte fechou', [r.fecho?.motivo, r.fecho?.preco, r.fecho?.em], ['estrategia', 4297, minuto(2)])
  }
  const semSeguir = correr([v(0, 4300, 4301, 4299, 4300), v(1, 4300, 4301, 4299, 4300), v(2, 4300, 4301, 4296, 4297)], sinal, { ...CFG, seguirFechosDaFonte: false })
  if (!ehErro(semSeguir)) sim('sem seguirFechosDaFonte a posição fica aberta', semSeguir.fecho == null)
}

// ── 9. parciais numa conta grande (10 000 USD → 0,10 lotes) ─────────────────
{
  const r = replicarSinal({
    sinal: sinalBase, simbolo: XAU, saldo: 10_000, cfg: CONFIG_PADRAO,
    velas: [v(0, 4300, 4301, 4299, 4300), v(1, 4295, 4295, 4289, 4290), v(2, 4290, 4291, 4279, 4280)],
    ate: minuto(60),
  })
  if (!ehErro(r)) {
    eq('lote de 0,10', r.volume, 0.1)
    eq('duas parciais (50% no TP1, 25% no TP2)', r.parciais.map((x) => [x.volume, x.preco]), [[0.05, 4290], [0.02, 4280]])
    sim('as parciais somam P&L positivo', r.parciais.reduce((a, x) => a + x.pnl, 0) > 0)
  }
}

// ── 10. recusas: nunca se inventa um preço ──────────────────────────────────
{
  const r = correr([v(10, 4300, 4301, 4299, 4300)])
  eq('sem vela no minuto da entrada, recusa', ehErro(r) ? r.erro : 'replicou', 'sem vela M1 no minuto da entrada')
}

// ── 11. não duplicar, com as regras do motor ────────────────────────────────
{
  const real: PosicaoExistente = {
    chave: 'espelho:Goldkiller:9181834', impressao: null, symbol: 'XAUUSD', direcao: 'sell',
    entrada: 4300, fonte: 'MTM Auto GoldKiller', abertaEm: minuto(-5), fechadaEm: minuto(20),
  }
  const novo = { chave: 'recon:Goldkiller:abc', impressao: 'XAUUSD:sell:4300:2026-09-15T10', symbol: 'XAUUSD', direcao: 'sell' as const, entrada: 4300, entradaEm: minuto(0) }
  eq('uma posição real VIVA do mesmo trade bloqueia', jaExiste(novo, [real])?.motivo, 'mesmo_trade')
  eq('a mesma chave bloqueia sempre', jaExiste({ ...novo, chave: real.chave }, [real])?.motivo, 'mesma_chave')
  eq('direcção contrária não bloqueia', jaExiste({ ...novo, direcao: 'buy' }, [real]), null)
  eq('já FECHADA quando o sinal entra: não bloqueia', jaExiste({ ...novo, entradaEm: minuto(25) }, [real]), null)
  eq('ainda por abrir quando o sinal entra: não bloqueia', jaExiste({ ...novo, entradaEm: minuto(-10) }, [real]), null)
  // 4300 → 4298 são 20 pips no ouro, acima da tolerância de 15: é outro trade.
  eq('entrada a mais de 15 pips é outro trade', jaExiste({ ...novo, entrada: 4298, impressao: 'XAUUSD:sell:4298:2026-09-15T10' }, [real]), null)
  eq('permitirDuplicado deixa passar o mesmo trade', jaExiste(novo, [real], true), null)
}

// ── 12. perfil «zona»: BE por pips fixos + trailing curto salvam o que o TP1 nunca arma ─────
{
  // O TP1 está a 100 pips (4300 → 4290) e o stop a 100 (4310). A reacção dá 50 pips e volta:
  // com a gestão ancorada no TP1 isto vai ao stop; com BE aos 25 pips fecha em lucro.
  const velas = [
    v(0, 4300, 4300, 4300, 4300),
    v(1, 4300, 4300, 4295, 4296), // 50 pips a favor (venda): arma BE e trailing
    v(2, 4296, 4312, 4296, 4311), // volta e passa o stop original
  ]
  const pedido = { sinal: sinalBase, simbolo: XAU, saldo: 1000, velas, ate: minuto(10) }

  const semPerfil = replicarSinal({ ...pedido, cfg: CFG })
  sim('sem perfil de zona a reacção devolve-se ao stop', !ehErro(semPerfil) && semPerfil.fecho?.motivo === 'sl' && (semPerfil.pips ?? 0) < 0)

  const zona: ConfigSinais = { ...CFG, beGatilhoPips: 25, beOffsetPips: 2, trailingInicioPips: 30, trailingDistanciaPips: 15 }
  const comPerfil = replicarSinal({ ...pedido, cfg: zona })
  sim('com BE aos 25 pips e trailing a 15 a mesma vela fecha em LUCRO', !ehErro(comPerfil) && (comPerfil.pips ?? 0) > 0)
  sim('o trailing seguiu o preço (o stop final ficou melhor que a entrada)', !ehErro(comPerfil) && (comPerfil.slFinal ?? 9999) < comPerfil.precoEntrada)
  // beGatilhoPips manda sobre o BE ancorado no TP1 — não se somam nem se anulam.
  sim('beGatilhoPips manda sobre beNoTp1', !ehErro(comPerfil) && comPerfil.gestao.be_gatilho === 2.5)
}

console.log(`\nreconstituição: ${ok} ok, ${mau} falharam`)
if (mau) process.exit(1)

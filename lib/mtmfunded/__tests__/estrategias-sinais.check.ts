/**
 * Estratégias por sinais (MTM Auto Edge/King/Wolf) e conta «Todos os sinais»: parser das mensagens
 * REAIS do canal PrimeVerse (formatos de 15/09, números alterados), encaminhamento por trader,
 * gestão (trailing stop + trailing profit) num percurso de preços, lote, duplicados, rotas em
 * sombra, plano das contas do dono e equidade da casa.
 *
 *   npx tsx lib/mtmfunded/__tests__/estrategias-sinais.check.ts
 */
import {
  CONFIG_PADRAO, ESTRATEGIAS_PRIMEVERSE, accaoDoSeguimento, chaveDoSinal, classificarMensagemPrimeverse, comentarioDaFonte,
  configDoProvider, decidirDuplicado, estrategiaDoTrader, gestaoDoSinal, impressaoDoTrade, loteParaConta, niveisAncorados,
  traderDoConteudo, type PonteAberta,
} from '../estrategias-sinais/calculo'
import { planoContasCasa, planoContasDoDono, ligacaoT2T, contaMtmAuto, ESTRATEGIAS_DO_DONO } from '../estrategias-sinais/contas'
import { planearRotasSombra } from '../estrategias-sinais/rotas'
import { decidirGestao, validarGestao, type Gestao } from '../simulado/avancadas'
import type { Simbolo } from '../simulado/matematica'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${JSON.stringify(b)}\n   obtido:   ${JSON.stringify(a)}`)
}
const sim = (nome: string, v: boolean) => eq(nome, v, true)

const XAU: Simbolo = { symbol: 'XAUUSD', classe: 'metal', digits: 2, contract_size: 100, pip_size: 0.1, spread_pontos: 18, comissao_lote: 0, volume_min: 0.01, volume_step: 0.01, volume_max: 20, alavancagem_max: 100 }
const US30: Simbolo = { ...XAU, symbol: 'US30', classe: 'indice', contract_size: 1, pip_size: 1, digits: 2 }
const BTC: Simbolo = { ...XAU, symbol: 'BTCUSD', classe: 'cripto', contract_size: 1, pip_size: 1 }
const ZW = '\u200b'

// ── 1. parser: formatos reais (anonimizados) ─────────────────────────────────
{
  const setup = `🔔 NEW SIGNAL ALERT by fxedge\n\n\n📊 Pair: XAUUSD\n🔴 Type: SELL\n💰 Entry: 4418.00\n\n🎯 Take Profits:\n   TP1: 4415.00 (+30.0 pips)\n   TP2: 4412.00 (+60.0 pips)\n   TP3: 4409.00 (+90.0 pips)\n\n🛑 Stop Loss: 4428.00 (-100.0 pips)`
  eq('setup fxedge', classificarMensagemPrimeverse(setup), { tipo: 'setup', trader: 'fxedge', symbol: 'XAUUSD', direction: 'sell', orderType: 'market', entry: 4418, sl: 4428, tps: [4415, 4412, 4409], style: null })
  const zona = `🔔 NEW SIGNAL ALERT by g_wolf\n\n\n📊 Pair: XAUUSD\n🟢 Type: BUY\n💰 Entry: 4383.00 - 4385.00\n\n🎯 Take Profits:\n   TP1: 4387.00 (+30.0 pips)\n   TP2: 4394.00 (+100.0 pips)\n\n🛑 Stop Loss: 4376.00`
  const z = classificarMensagemPrimeverse(zona)!
  eq('setup com zona: entrada e entry2', [z.trader, z.entry, z.entry2, z.direction], ['g_wolf', 4383, 4385, 'buy'])
  const king = `🔔 NEW SIGNAL ALERT by kingfkg\n\n\n📊 Pair: XAUUSD\n🟢 Type: BUY (Buy Limit)\n⏱️ Style: Intraday\n💰 Entry: 4384.00 - 4382.00\n\n🎯 Take Profits:\n   TP1: 4388.00 (+50.0 pips)`
  const k = classificarMensagemPrimeverse(king)!
  eq('setup king: limit + estilo', [k.orderType, k.style, k.sl], ['limit', 'Intraday', null])

  eq('entry hit', classificarMensagemPrimeverse(`🟢 ENTRY HIT | XAU${ZW}USD 🔴${ZW}`), { tipo: 'entry_hit', symbol: 'XAUUSD', direction: 'sell' })
  eq('tp hit com zero-width', classificarMensagemPrimeverse(`✅ TP2 HIT +6${ZW}0 pips ✅✅ 🔥🔥`), { tipo: 'tp_hit', nivel: 2, pips: 60 })
  eq('tp hit sem pips', classificarMensagemPrimeverse('✅ TP3 HIT ✅✅ 🔥🔥🔥'), { tipo: 'tp_hit', nivel: 3 })
  eq('sl hit', classificarMensagemPrimeverse('❌ SL HIT -100 pips'), { tipo: 'sl_hit', pips: -100 })
  eq('sl → be', classificarMensagemPrimeverse('🛡️ SL → BE | XAUUSD 🔴 | @ 4357.00 | fxedge'), { tipo: 'sl_be', preco: 4357, symbol: 'XAUUSD', direction: 'sell' })
  eq('breakeven', classificarMensagemPrimeverse('🛡️ BREAKEVEN | XAUUSD 🔴 | TP1, TP2 secured | fxedge')?.tipo, 'breakeven')
  eq('trade closed', classificarMensagemPrimeverse('✅ TRADE CLOSED | US30 🟢 | TP2 secured | +150.0 pips | fxedge'), { tipo: 'trade_closed', nivel: 2, pips: 150, symbol: 'US30', direction: 'buy' })
  eq('provider exited', classificarMensagemPrimeverse('🔔 CLOSED | XAUUSD 🔴\nProvider exited - consider closing or moving to BE'), { tipo: 'provider_closed', symbol: 'XAUUSD', direction: 'sell' })
  eq('cancelled', classificarMensagemPrimeverse('🚫 CANCELLED | BTCUSD 🔴 | entry missed'), { tipo: 'cancelled', symbol: 'BTCUSD', direction: 'sell' })
  eq('texto qualquer', classificarMensagemPrimeverse('bom dia traders'), null)

  eq('acções', ['cancelled', 'trade_closed', 'provider_closed', 'sl_be', 'breakeven', 'tp_hit', 'sl_hit', 'close', 'cancel'].map((t) => accaoDoSeguimento(t as never)),
    ['cancelar', 'fechar', 'fechar', 'break_even', 'break_even', 'nada', 'nada', 'fechar', 'cancelar'])
}

// ── 2. encaminhamento por trader ─────────────────────────────────────────────
{
  eq('fxedge → edge', estrategiaDoTrader('fxedge')?.slug, 'mtm-auto-edge')
  eq('kingfkg e apelido kingfkge → king', [estrategiaDoTrader('kingfkg')?.slug, estrategiaDoTrader('KingFKGE')?.slug], ['mtm-auto-king', 'mtm-auto-king'])
  eq('g_wolf e gwolf → wolf', [estrategiaDoTrader('g_wolf')?.slug, estrategiaDoTrader('gwolf')?.slug], ['mtm-auto-wolf', 'mtm-auto-wolf'])
  eq('outros traders ficam de fora', [estrategiaDoTrader('cbumcalls'), estrategiaDoTrader('zata'), estrategiaDoTrader('')], [null, null, null])
  eq('trader do conteúdo do chat', traderDoConteudo('🔴 XAUUSD SELL\n🎯 Entrada: 4295\n\n📡 PrimeVerse · g_wolf'), 'g_wolf')
  eq('comentários da fonte', [
    comentarioDaFonte({ sourceKey: 'primeverse', trader: 'fxedge' }), comentarioDaFonte({ sourceKey: 'premium' }),
    comentarioDaFonte({ sourceKey: 'sensei' }), comentarioDaFonte({ sourceKey: 'mtmscanner' }), comentarioDaFonte({ sourceKey: 'goldkiller' }),
    comentarioDaFonte({ sourceKey: null, channelSlug: 'cripto-perps' }), comentarioDaFonte({ sourceKey: null, channelSlug: 'ideias-e-sinais' }),
  ], ['PrimeVerse fxedge', 'Premium', 'Scanner Sensei', 'Scanner MTM', 'GoldKiller', 'Perps', 'MTM Alertas'])
  sim('comentário ≤ 31', ESTRATEGIAS_PRIMEVERSE.every((e) => e.comentario.length <= 31))
}

// ── 3. configuração, lote e níveis ───────────────────────────────────────────
{
  const cfg = configDoProvider({ saidas_pct: [40, 30], trailing_distancia_pips: 25, trailing_arranca_pips: 35, sinais_config: { lotePor1000: 0.02, beOffsetPips: 1, seguirFechosDaFonte: false } })
  eq('config do provider', [cfg.saidasPct, cfg.trailingDistanciaPips, cfg.trailingInicioPips, cfg.lotePor1000, cfg.beOffsetPips, cfg.seguirFechosDaFonte], [[40, 30], 25, 35, 0.02, 1, false])
  eq('config vazia = padrão', configDoProvider(null), CONFIG_PADRAO)
  eq('lote: casa 10K → 0,10 · seguidora 1K → 0,01 · 500 → mínimo', [loteParaConta(10_000, CONFIG_PADRAO, XAU), loteParaConta(1_000, CONFIG_PADRAO, XAU), loteParaConta(500, CONFIG_PADRAO, XAU)], [0.1, 0.01, 0.01])
  eq('lote: 2 537 USD → 0,02 (arredonda para baixo)', loteParaConta(2537, CONFIG_PADRAO, XAU), 0.02)

  // ENTRY HIT a 4418.40 num setup de venda a 4418 → níveis deslocam +0.40
  const n = niveisAncorados({ direcao: 'sell', entrada: 4418, sl: 4428, tps: [4415, 4412, 4409] }, 4418.4, 2)
  eq('níveis ancorados ao nosso preço', n, { sl: 4428.4, tps: [4415.4, 4412.4, 4409.4] })
  // preço já passou o TP1 → o TP1 cai
  eq('alvos já passados saem', niveisAncorados({ direcao: 'buy', entrada: null, sl: 4370, tps: [4380, 4390] }, 4385, 2), { sl: 4370, tps: [4390] })
  eq('stop do lado errado sai', niveisAncorados({ direcao: 'buy', entrada: null, sl: 4390, tps: [4400] }, 4385, 2).sl, null)
}

// ── 4. gestão num percurso de preços (trailing stop + trailing profit) ───────
{
  // Casa 10K: 0,10 lote, venda XAU a 4418.00, SL 4428, TP1 4415 / TP2 4412 / TP3 4409
  const { gestao, tpFinal, parciais } = gestaoDoSinal({ simbolo: XAU, direcao: 'sell', precoExecucao: 4418, volume: 0.1, sl: 4428, tps: [4415, 4412, 4409], cfg: CONFIG_PADRAO })
  eq('parciais 50/25 nos TP1/TP2, TP3 é o TP final', [parciais, gestao.tps?.map((t) => [t.preco, t.pct]), tpFinal], [2, [[4415, 50], [4412, 25]], 4409])
  eq('BE no TP1 com +2 pips; trailing a 50% do risco (5,00) depois de 3,00 de lucro', [gestao.be_no_tp1, gestao.be_offset, gestao.trailing_distancia, gestao.trailing_ativacao], [true, 0.2, 5, 3])
  const v = validarGestao(XAU, 'sell', 4418, 0.1, 4428, tpFinal, gestao)
  sim('a gestão passa a validação do ticket (072)', v.ok)
  let pos = { id: 'p', symbol: 'XAUUSD', direcao: 'sell' as const, volume: 0.1, preco_entrada: 4418, sl: 4428 as number | null, tp: tpFinal, gestao: (v as { gestao: Gestao }).gestao }
  const passos: string[] = []
  const tick = (mid: number) => {
    const p = { symbol: 'XAUUSD', bid: mid, ask: mid + 0.18 }
    const d = decidirGestao(pos, XAU, p, {})
    for (const x of d.parciais) passos.push(`TP${x.indice + 1} ${x.volume}@${x.preco}`)
    if (d.novoSl != null) passos.push(`${d.motivoSl} ${d.novoSl}`)
    pos = { ...pos, volume: d.volumeRestante, sl: d.novoSl ?? pos.sl, gestao: { ...pos.gestao, tps: d.tps, be_feito: d.beFeito } }
  }
  // ask é o preço de fecho de uma venda: mid 4416.00 → ask 4416.18 (sem lucro suficiente)
  for (const mid of [4416.5, 4414.8, 4413.0, 4411.8, 4410.0, 4408.0, 4411.0]) tick(mid)
  // TP1 toca (ask 4414,98) → 50% fora e BE a entrada−2 pips; o trailing (5,00) só aperta quando fica abaixo do BE
  eq('percurso: TP1 → BE+2 → TP2 → trailing aperta a cada novo mínimo → recuo não mexe', passos, [
    'TP1 0.05@4415', 'break_even 4417.8', 'TP2 0.02@4412', 'trailing 4416.98', 'trailing 4415.18', 'trailing 4413.18',
  ])
  sim('o SL só desce numa venda (só aperta)', (() => {
    const sls = passos.filter((x) => /^(break_even|trailing) /.test(x)).map((x) => Number(x.split(' ')[1]))
    return sls.every((s, i) => i === 0 || s < sls[i - 1])
  })())
  sim('TP2 feito a 25% (0,02 lote arredondado para baixo) e restante a correr', passos.includes('TP2 0.02@4412') && pos.volume === 0.03)
  sim('no fim o trailing está abaixo de 4413,20 (preço mínimo 4408 + 5)', pos.sl != null && pos.sl <= 4413.2)

  // Seguidora 1K (0,01): sem parciais → BE ao atingir a distância do TP1, trailing igual
  const s1 = gestaoDoSinal({ simbolo: XAU, direcao: 'sell', precoExecucao: 4418, volume: 0.01, sl: 4428, tps: [4415, 4412, 4409], cfg: CONFIG_PADRAO })
  eq('0,01: sem parciais, BE por gatilho 3,00 e offset 0,20', [s1.parciais, s1.gestao.tps, s1.gestao.be_gatilho, s1.gestao.be_offset, s1.gestao.trailing_distancia], [0, undefined, 3, 0.2, 5])
  sim('0,01 passa a validação', validarGestao(XAU, 'sell', 4418, 0.01, 4428, s1.tpFinal, s1.gestao).ok)

  // Índices e cripto em PONTOS (trade-outcome): 25 «pips» de trailing em US30 = 25 pontos
  // ── parciais ancoradas na FRACÇÃO DO RISCO (aditivo: nulo por defeito) ────
  {
    const cfgR = { ...CONFIG_PADRAO, saidasFracaoDoRisco: [{ r: 1, pct: 50 }, { r: 2, pct: 25 }] }
    // venda a 4418 com SL 4428 → risco 10,00. 1R = 4408,00 · 2R = 4398,00. TP final = 4409 (o
    // último alvo do trader), por isso a parcial de 1R fica ALÉM dele e nenhuma se grava.
    const curto = gestaoDoSinal({ simbolo: XAU, direcao: 'sell', precoExecucao: 4418, volume: 0.1, sl: 4428, tps: [4415, 4412, 4409], cfg: cfgR })
    eq('parciais em R além do TP final não se gravam', [curto.parciais, curto.gestao.tps], [0, undefined])
    // com alvos largos (TP final 4390) já cabem as duas, e o BE fica à distância do TP1 (3,00)
    const largo = gestaoDoSinal({ simbolo: XAU, direcao: 'sell', precoExecucao: 4418, volume: 0.1, sl: 4428, tps: [4415, 4400, 4390], cfg: cfgR })
    eq('parciais a 1R e 2R, pelo NOSSO risco e não pelos alvos do trader', largo.gestao.tps?.map((t) => [t.preco, t.pct]), [[4408, 50], [4398, 25]])
    eq('o BE não migra para a 1.ª parcial: fica no gatilho da distância ao TP1', [largo.gestao.be_no_tp1, largo.gestao.be_gatilho, largo.gestao.be_offset], [undefined, 3, 0.2])
    sim('passa a validação do ticket', validarGestao(XAU, 'sell', 4418, 0.1, 4428, largo.tpFinal, largo.gestao).ok)
    // sem stop não há régua: volta às saídas pelos alvos do trader
    const semSl = gestaoDoSinal({ simbolo: XAU, direcao: 'sell', precoExecucao: 4418, volume: 0.1, sl: null, tps: [4415, 4400, 4390], cfg: cfgR })
    eq('sem SL não há fracção do risco: as parciais voltam aos alvos do trader', semSl.gestao.tps?.map((t) => t.preco), [4415, 4400])
    // e o botão é opt-in: o que não o tem não muda de comportamento
    eq('config padrão continua a ignorar as parciais em R', CONFIG_PADRAO.saidasFracaoDoRisco, null)
    eq('lê-se do jsonb, ordenado e no máximo 3', configDoProvider({ sinais_config: { saidasFracaoDoRisco: [{ r: 2, pct: 25 }, { r: 1, pct: 50 }, { r: 0, pct: 10 }, { r: 3, pct: 10 }, { r: 4, pct: 5 }] } }).saidasFracaoDoRisco, [{ r: 1, pct: 50 }, { r: 2, pct: 25 }, { r: 3, pct: 10 }])
  }

  const ind = gestaoDoSinal({ simbolo: US30, direcao: 'buy', precoExecucao: 52020, volume: 0.1, sl: 51920, tps: [52050, 52120], cfg: { ...CONFIG_PADRAO, trailingDistanciaPips: 25, trailingInicioPips: 40 } })
  eq('US30 em pontos', [ind.gestao.trailing_distancia, ind.gestao.trailing_ativacao, ind.gestao.be_offset], [25, 40, 2])
  const btc = gestaoDoSinal({ simbolo: BTC, direcao: 'buy', precoExecucao: 60000, volume: 0.1, sl: 59500, tps: [60300, 61000], cfg: { ...CONFIG_PADRAO, trailingDistanciaPips: 200 } })
  eq('BTC em pontos (não ×10 000)', btc.gestao.trailing_distancia, 200)
}

// ── 5. chaves e duplicados ───────────────────────────────────────────────────
{
  const hora = '2026-09-15T14'
  const semId = chaveDoSinal({ fonte: 'mtm-auto-edge', symbol: 'XAUUSD', direcao: 'sell', entrada: 4287, sl: 4297, hora })
  eq('chave sem id: níveis + hora (o reenvio do relay cai na mesma)', semId, chaveDoSinal({ fonte: 'mtm-auto-edge', symbol: 'xauusd', direcao: 'sell', entrada: 4287.0, sl: 4297, hora }))
  eq('chave com id do setup', chaveDoSinal({ fonte: 'mtm-auto-edge', msgId: 14668, symbol: 'XAUUSD', direcao: 'sell', entrada: 1, sl: 1 }), 'mtm-auto-edge:msg:14668')
  eq('impressão: entrada no balde de 10 pips', [impressaoDoTrade({ symbol: 'XAUUSD', direcao: 'sell', entrada: 4287.2, hora }), impressaoDoTrade({ symbol: 'XAUUSD', direcao: 'sell', entrada: 4286.9, hora })], ['XAUUSD:sell:4287:2026-09-15T14', 'XAUUSD:sell:4287:2026-09-15T14'])

  const agora = Date.parse('2026-09-15T14:30:00Z')
  const aberta: PonteAberta = { chave: 'chat:aaa', impressao: 'XAUUSD:sell:4287:2026-09-15T14', symbol: 'XAUUSD', direcao: 'sell', entrada: 4287, fonte: 'Premium', criadaEm: agora - 5 * 60_000 }
  eq('mesma chave → não abre', decidirDuplicado({ chave: 'chat:aaa', impressao: null, symbol: 'XAUUSD', direcao: 'sell', entrada: 4287, agora }, [aberta]), { abrir: false, motivo: 'mesma_chave', chaveOriginal: 'chat:aaa', fonteOriginal: 'Premium' })
  eq('mesmo trade por outra fonte (Premium chat + estratégia) → abre uma vez', decidirDuplicado({ chave: 'chat:bbb', impressao: 'XAUUSD:sell:4287:2026-09-15T14', symbol: 'XAUUSD', direcao: 'sell', entrada: 4287.5, agora }, [aberta]), { abrir: false, motivo: 'mesmo_trade', chaveOriginal: 'chat:aaa', fonteOriginal: 'Premium' })
  eq('mesmo trade na hora seguinte, dentro de 15 pips e 30 min → não abre', decidirDuplicado({ chave: 'chat:ccc', impressao: 'XAUUSD:sell:4288:2026-09-15T15', symbol: 'XAUUSD', direcao: 'sell', entrada: 4288, agora }, [aberta]).abrir, false)
  eq('direcção contrária abre', decidirDuplicado({ chave: 'chat:ddd', impressao: 'XAUUSD:buy:4287:2026-09-15T14', symbol: 'XAUUSD', direcao: 'buy', entrada: 4287, agora }, [aberta]).abrir, true)
  eq('entrada 3 $ longe (30 pips) abre', decidirDuplicado({ chave: 'chat:eee', impressao: 'XAUUSD:sell:4290:2026-09-15T14', symbol: 'XAUUSD', direcao: 'sell', entrada: 4290, agora }, [aberta]).abrir, true)
  eq('configurado para permitir duplicado → abre', decidirDuplicado({ chave: 'chat:bbb', impressao: 'XAUUSD:sell:4287:2026-09-15T14', symbol: 'XAUUSD', direcao: 'sell', entrada: 4287, agora }, [aberta], true).abrir, true)
  eq('permitir duplicado NÃO deixa a mesma chave abrir duas vezes', decidirDuplicado({ chave: 'chat:aaa', impressao: null, symbol: 'XAUUSD', direcao: 'sell', entrada: 4287, agora }, [aberta], true).abrir, false)
  eq('passada a janela e noutra hora → abre', decidirDuplicado({ chave: 'chat:fff', impressao: 'XAUUSD:sell:4287:2026-09-15T15', symbol: 'XAUUSD', direcao: 'sell', entrada: 4287, agora: agora + 40 * 60_000 }, [aberta]).abrir, true)
}

// ── 6. rotas de cópia em sombra ──────────────────────────────────────────────
{
  const r = planearRotasSombra({
    providerId: '11111111-1111-1111-1111-111111111111', slug: 'mtm-auto-edge', nome: 'MTM Auto Edge', contaMestreId: 'AAAAAAAA-0000-0000-0000-000000000000',
    subscritores: [
      { userId: 'u1', mtmautoAccountId: '22222222-2222-2222-2222-222222222222', plataforma: 'mt5', login: '34744071', servidor: 'PUPrime-Live 6' },
      { userId: 'u2', mtmautoAccountId: '33333333-3333-3333-3333-333333333333', plataforma: 'tradelocker', tlEnv: 'live', tlAccountId: '998877' },
      { userId: 'u3', mtmautoAccountId: '44444444-4444-4444-4444-444444444444', plataforma: 'mtmfunded' },
      { userId: 'u1', mtmautoAccountId: '55555555-5555-5555-5555-555555555555', plataforma: 'mt5', login: '34744071', servidor: 'puprime-live 6' },
    ],
  })
  eq('rotas: 2 reais, mtmfunded e repetida ignoradas', [r.rotas.length, r.ignorados.map((i) => i.motivo.split(' ')[0])], [2, ['plataforma', 'conta']])
  eq('rota: sempre sombra, origem prov:, chave física da mestre', [r.rotas[0].modo, r.rotas[0].ativa, r.rotas[0].origem_ref.startsWith('prov:'), r.rotas[0].origem_chave, r.rotas[0].destino_chave, r.rotas[1].destino_chave],
    ['shadow', false, true, 'mtmfunded:aaaaaaaa-0000-0000-0000-000000000000', 'mt:34744071@puprime-live 6', 'tl:live:998877'])
}

// ── 7. contas do dono e da casa (o que o dry-run mostra) ─────────────────────
{
  const vazio = planoContasDoDono([])
  eq('dono sem contas: 7 estratégias + Todos os sinais', vazio.criar.map((c) => c.slug ?? 'todos'), [...ESTRATEGIAS_DO_DONO.map((e) => e.slug), 'todos'])
  sim('todas 1 000 USD, sem regras, da casa, T2T e ligadas nas apps', vazio.criar.every((c) => c.saldo === 1000 && c.colunas.sem_regras === true && c.colunas.conta_casa === true && c.colunas.aceita_t2t === true && c.ligarNasApps))
  eq('só a «Todos os sinais» recolhe todos e não subscreve', vazio.criar.filter((c) => c.colunas.recolhe_todos_sinais).map((c) => [c.papel, c.subscrever]), [['todos_os_sinais', false]])
  const parcial = planoContasDoDono([
    { id: 'x1', tipo: 'financiada', segue_estrategia: 'goldkiller', provider_slug: null },
    { id: 'x2', tipo: 'financiada', segue_estrategia: null, provider_slug: null, recolhe_todos_sinais: true },
    { id: 'x3', tipo: 'provider', segue_estrategia: 'mtm-auto-edge', provider_slug: 'mtm-auto-edge' },
  ])
  eq('idempotente: GoldKiller (maiúsculas) e Todos já existem; mestre da casa não conta', [parcial.jaExistem.map((j) => j.id), parcial.criar.length], [['x1', 'x2'], 6])
  const t2t = ligacaoT2T('u', { id: 'f1', mt5_login: '77123456', saldo_inicial: 1000 }, 'MTM Funded · MTM Auto Edge')
  eq('ligação T2T cumpre a 074 (mtmfunded, funded_account_id, sem MetaApi, sem login MT5)', [t2t.mt5_platform, t2t.funded_account_id, t2t.metaapi_account_id, t2t.mt5_login, t2t.mt5_login_last4, t2t.t2t_enabled], ['mtmfunded', 'f1', null, null, '3456', true])
  const auto = contaMtmAuto('u', { id: 'f1', mt5_login: '77123456' }, 'MTM Funded · MTM Auto Edge')
  eq('conta MTM Auto cumpre a 074', [auto.plataforma, auto.funded_account_id, auto.metaapi_account_id], ['mtmfunded', 'f1', null])
  sim('nenhuma linha leva password', !JSON.stringify([t2t, auto, vazio]).match(/password|cifrada/i))
  eq('casa: só as que não têm mestre, 10 000 USD tipo provider', planoContasCasa({ 'mtm-auto-edge': 'abc', 'mtm-auto-king': null }).map((c) => [c.slug, c.saldo, c.tipo]), [['mtm-auto-king', 10000, 'provider'], ['mtm-auto-wolf', 10000, 'provider']])
}

// ── 8. equidade da casa ──────────────────────────────────────────────────────
void (async () => {
  const { agregarEquidadeCasa } = await import('../../equidade-casa')
  const a = agregarEquidadeCasa([
    { id: '1', tipo: 'provider', estrategia: 'mtm-auto-edge', saldo_inicial: 10000, sim_saldo: 10100, sim_equity: 10050 },
    { id: '2', tipo: 'financiada', estrategia: 'mtm-auto-edge', saldo_inicial: 1000, sim_saldo: 1010, sim_equity: 1020 },
    { id: '3', tipo: 'financiada', estrategia: null, saldo_inicial: 1000, sim_saldo: 990, sim_equity: null, recolhe_todos_sinais: true },
  ])
  eq('equidade total', [a.total.contas, a.total.saldo, a.total.equity, a.total.flutuante, a.total.resultadoPct], [3, 12100, 12060, -40, 0.5])
  eq('por estratégia', a.porEstrategia.map((g) => [g.chave, g.contas, g.flutuante, g.contribuicao]), [['mtm-auto-edge', 2, -40, 1107], ['todos-os-sinais', 1, 0, 99]])

  console.log(`\nestratégias por sinais: ${ok} ok, ${mau} falharam`)
  if (mau) process.exit(1)
})()

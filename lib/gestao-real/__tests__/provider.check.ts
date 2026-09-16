/**
 * GESTÃO DAS CONTAS PROVIDER (contas mestre das estratégias) — as decisões, a resolução da conta e
 * o travão das escritas da sombra.
 *
 *   npx tsx lib/gestao-real/__tests__/provider.check.ts
 *
 * Os números são os que o dono pôs em `mtmauto_providers.sinais_config` a 16/09: premium-ouro
 * (perfil zona) BE aos 25 pips com +2 de offset, trailing a arrancar aos 30 a 15 de distância com
 * passo de 3; sensei 35/2/40/20/4.
 */
import assert from 'node:assert/strict'
import { avaliarItem, type ContextoAvaliacao, type ItemProvider, type Sobreposicao } from '../avaliar'
import {
  configProviderDaLinha,
  decidirProvider,
  estrategiasGeridas,
  temGestaoProvider,
  ESTADO_PROVIDER_NOVO,
  type EstadoProvider,
  type PosicaoProvider,
} from '../provider'
import { RegistoSombra, type Intencao } from '../sombra'
import {
  escolherContaDaEstrategia,
  SLUGS_QUE_NAO_EXECUTAM,
  SLUG_MTM_SCANNER,
  type LinhaContaProvider,
} from '../../mtmcopy/contas-provider-estrategia'

// Linhas reais (só as colunas que a gestão lê).
const LINHA_PREMIUM = {
  id: 'p-premium', slug: 'premium-ouro', ativo: true, apagado_em: null,
  be_gatilho: null, trailing_arranca_pips: null, trailing_distancia_pips: null, trailing_passo_pips: null, saidas_pct: null,
  sinais_config: { perfil: 'zona', beOffsetPips: 2, beGatilhoPips: 25, trailingPassoPips: 3, trailingInicioPips: 30, trailingDistanciaPips: 15 },
}
const LINHA_SENSEI = {
  id: 'p-sensei', slug: 'sensei', ativo: true, apagado_em: null,
  be_gatilho: 1, trailing_arranca_pips: '40', trailing_distancia_pips: null, trailing_passo_pips: null, saidas_pct: null,
  sinais_config: { perfil: 'zona', amostraFina: true, beOffsetPips: 2, beGatilhoPips: 35, trailingPassoPips: 4, trailingInicioPips: 40, trailingDistanciaPips: 20 },
}
/** Estratégia sem gestão nenhuma (nem jsonb nem colunas). */
const LINHA_SEM_CONFIG = { id: 'p-x', slug: 'sem-config', ativo: true, apagado_em: null, sinais_config: {} }

function ouro(extra: Partial<PosicaoProvider> = {}): PosicaoProvider {
  return { id: 'pos1', symbol: 'XAUUSD', type: 'POSITION_TYPE_BUY', openPrice: 4000, volume: 0.1, stopLoss: 3990, ...extra }
}

// ── 1. configuração lida da estratégia ───────────────────────────────────────
{
  const p = configProviderDaLinha('premium-ouro', LINHA_PREMIUM)
  assert.equal(p.perfil, 'zona')
  assert.deepEqual(
    [p.beGatilhoPips, p.beOffsetPips, p.trailingInicioPips, p.trailingDistanciaPips, p.trailingPassoPips],
    [25, 2, 30, 15, 3],
  )
  const s = configProviderDaLinha('sensei', LINHA_SENSEI)
  assert.deepEqual(
    [s.beGatilhoPips, s.beOffsetPips, s.trailingInicioPips, s.trailingDistanciaPips, s.trailingPassoPips],
    [35, 2, 40, 20, 4],
  )
  // A coluna `be_gatilho` (que no sensei vale 1, «BE no TP nº 1») NUNCA vira pips.
  assert.notEqual(s.beGatilhoPips, 1)
  // As colunas antigas continuam a servir de recurso quando o jsonb não diz nada.
  const legado = configProviderDaLinha('goldkiller', {
    slug: 'Goldkiller', trailing_arranca_pips: '40', trailing_passo_pips: '20', saidas_pct: [50, 30], sinais_config: {},
  })
  assert.deepEqual([legado.trailingInicioPips, legado.trailingPassoPips, legado.saidasPct], [40, 20, [50, 30]])
  assert.equal(legado.beGatilhoPips, null)
  assert.equal(temGestaoProvider(configProviderDaLinha('sem-config', LINHA_SEM_CONFIG)), false)
  console.log('ok  configuração: sinais_config manda, colunas antigas de recurso, be_gatilho fora')
}

// ── 2. o perfil «zona» sobre uma posição real (compra de ouro) ───────────────
{
  const cfg = configProviderDaLinha('premium-ouro', LINHA_PREMIUM, 0)
  let e: EstadoProvider = { ...ESTADO_PROVIDER_NOVO }
  const passo = (preco: number, sl?: number) => {
    const d = decidirProvider(ouro({ currentPrice: preco, ...(sl != null ? { stopLoss: sl } : {}) }), cfg, e, 1_000)
    e = d.estado
    return d
  }
  assert.equal(passo(4002.0).sl, null, '20 pips: ainda não há BE')
  const be = passo(4002.5)
  assert.deepEqual([be.motivo, be.sl], ['be', 4000.2], 'BE aos 25 pips = entrada + 2 pips (0,2 no ouro)')
  assert.equal(passo(4002.6).sl, null, 'BE acontece uma vez só e o trailing ainda não arrancou')
  const t1 = passo(4003.0)
  assert.deepEqual([t1.motivo, t1.sl], ['trailing', 4001.5], 'trailing arranca aos 30, a 15 pips do preço')
  assert.equal(passo(4003.1).sl, null, 'passo de 3 pips: 1 pip não chega para mexer o stop')
  assert.equal(passo(4003.2).sl, null, '2 pips também não')
  const t2 = passo(4003.3)
  assert.deepEqual([t2.motivo, t2.sl], ['trailing', 4001.8], 'aos 3 pips o stop anda')
  assert.equal(passo(4002.0).sl, null, 'o trailing nunca afrouxa')
  console.log('ok  premium-ouro: BE 25/+2, trailing 30 @15 passo 3, só aperta')
}

// ── 3. o mesmo numa venda, com os números do Sensei ─────────────────────────
{
  const cfg = configProviderDaLinha('sensei', LINHA_SENSEI, 0)
  let e: EstadoProvider = { ...ESTADO_PROVIDER_NOVO }
  const pos = (preco: number): PosicaoProvider =>
    ({ id: 'v1', symbol: 'XAUUSD', type: 'POSITION_TYPE_SELL', openPrice: 4000, volume: 0.1, stopLoss: 4010, currentPrice: preco })
  const passo = (preco: number) => { const d = decidirProvider(pos(preco), cfg, e, 1_000); e = d.estado; return d }
  assert.equal(passo(3996.9).sl, null, 'venda a 31 pips: ainda não')
  const be = passo(3996.5)
  assert.deepEqual([be.motivo, be.sl], ['be', 3999.8], 'venda: BE aos 35 pips = entrada − 2 pips')
  const t = passo(3996.0)
  assert.deepEqual([t.motivo, t.sl], ['trailing', 3998.0], 'venda: trailing aos 40, 20 pips ACIMA do preço')
  assert.equal(passo(3995.7).sl, null, 'passo de 4 pips')
  assert.equal(passo(3995.6).motivo, 'trailing')
  console.log('ok  sensei: BE 35/+2, trailing 40 @20 passo 4, numa venda')
}

// ── 4. sem configuração, sem decisão ─────────────────────────────────────────
{
  const cfg = configProviderDaLinha('sem-config', LINHA_SEM_CONFIG)
  for (const preco of [4001, 4005, 4050, 3950]) {
    const d = decidirProvider(ouro({ currentPrice: preco }), cfg, { ...ESTADO_PROVIDER_NOVO }, 1_000)
    assert.equal(d.sl, null, `sem gestão configurada não se mexe em nada (preço ${preco})`)
  }
  // Nem com um trailing por fracção do risco: só o que a estratégia pediu em pips arma o motor.
  const soFraccao = configProviderDaLinha('x', { sinais_config: { trailingFracaoDoRisco: 0.5 } })
  assert.equal(temGestaoProvider(soFraccao), false)
  assert.equal(decidirProvider(ouro({ currentPrice: 4100 }), soFraccao, { ...ESTADO_PROVIDER_NOVO }, 1_000).sl, null)
  // E sem preço (conta ligada mas ainda sem tick) também não.
  const p = configProviderDaLinha('premium-ouro', LINHA_PREMIUM)
  assert.equal(decidirProvider(ouro(), p, { ...ESTADO_PROVIDER_NOVO }, 1_000).sl, null, 'sem preço não se decide')
  console.log('ok  sem gestão configurada (ou sem preço): zero decisões')
}

// ── 5. resolução da conta mestre ─────────────────────────────────────────────
{
  const linhas: LinhaContaProvider[] = [
    { id: '1', provider_slug: 'premium-ouro', metaapi_account_id: 'a21178c2', tipo: 'provider', estado: 'ativa', motor: 'mt5', mt5_login: '19036', servidor: 'TTM', created_at: '2026-09-15' },
    { id: '2', provider_slug: 'sensei', metaapi_account_id: '78066d2d', tipo: 'provider', estado: 'ativa', motor: 'mt5', mt5_login: '19037', servidor: 'TTM', created_at: '2026-09-15' },
    { id: '3', provider_slug: SLUG_MTM_SCANNER, metaapi_account_id: '6bda9af4', tipo: 'provider', estado: 'ativa', motor: 'mt5', mt5_login: '19042', servidor: 'TTM', created_at: '2026-09-15' },
  ]
  const premium = escolherContaDaEstrategia('premium-ouro', linhas, 'a21178c2')
  assert.equal(premium?.accountId, 'a21178c2')
  assert.equal(premium?.origem, 'conta_vps')
  // O provider a apontar para outro lado: ganha a conta do VPS, mas fica dito.
  const divergente = escolherContaDaEstrategia('sensei', linhas, 'outra-conta')
  assert.equal(divergente?.accountId, '78066d2d')
  assert.match(String(divergente?.divergencia), /não é a conta provider viva/)

  const contas = [
    { slug: 'premium-ouro', accountId: 'a21178c2', divergencia: null },
    { slug: 'sensei', accountId: '78066d2d', divergencia: 'o provider aponta para outro lado' },
    { slug: 'sem-config', accountId: 'zzz', divergencia: null },
    { slug: 'desligada', accountId: 'yyy', divergencia: null },
    { slug: SLUG_MTM_SCANNER, accountId: '6bda9af4', divergencia: null },
  ]
  const porSlug = new Map<string, Record<string, unknown>>([
    ['premium-ouro', LINHA_PREMIUM],
    ['sensei', LINHA_SENSEI],
    ['sem-config', LINHA_SEM_CONFIG],
    ['desligada', { ...LINHA_PREMIUM, slug: 'desligada', ativo: false }],
  ])
  const r = estrategiasGeridas(contas, porSlug, { naoExecutam: SLUGS_QUE_NAO_EXECUTAM })
  assert.deepEqual(r.geridas.map((g) => g.slug), ['premium-ouro', 'sensei'])
  assert.deepEqual(r.observar, [], 'o MTM Scanner não é ligado por omissão')
  assert.ok(r.notas.some((n) => /desligada: estratégia desligada/.test(n)))
  assert.ok(r.notas.some((n) => /sem-config: sem gestão configurada/.test(n)))
  assert.ok(r.notas.some((n) => /sensei: o provider aponta/.test(n)))

  // O Scanner nunca é GERIDO; com a opção ligada é só ligado para ver.
  const obs = estrategiasGeridas(contas, porSlug, { naoExecutam: SLUGS_QUE_NAO_EXECUTAM, observarQuemNaoExecuta: true })
  assert.deepEqual(obs.observar, ['6bda9af4'])
  assert.equal(obs.geridas.some((g) => g.slug === SLUG_MTM_SCANNER), false)
  console.log('ok  contas mestre: da base, divergência reportada, Scanner nunca gerido')
}

// ── 6. a sombra: uma linha por decisão, não por tick ─────────────────────────
void (async () => {
  const intencoes: Intencao[] = []
  const sobreposicoes = new Map<string, Sobreposicao>()
  const registo = new RegistoSombra({ janelaMs: 5_000, esperaMs: 120_000 })
  const item: ItemProvider = {
    tipo: 'provider', conta: 'a21178c2', ref: 'premium-ouro',
    cfg: configProviderDaLinha('premium-ouro', LINHA_PREMIUM, 250),
    estados: new Map<string, EstadoProvider>(),
  }
  // Registo REAL, com um espelho das intenções: mede-se o que o motor decide E o que chega à base.
  const espiao = {
    decidir: (i: Intencao, agora: number) => { intencoes.push(i); registo.decidir(i, agora) },
    live: () => undefined,
  } as unknown as RegistoSombra
  const ctx: ContextoAvaliacao = {
    modo: 'sombra',
    cfg: null as never, // o tipo provider não usa as configs dos outros monitores
    registo: espiao,
    sobreposicoes,
    posicoesDe: () => null,
    subscritores: [],
    trailingTempoReal: false,
  }

  // 400 ticks a subir 0,05 (meio pip) de cada vez, de 100 em 100 ms: 4000 → 4020 (200 pips).
  let preco = 4000
  let agora = 1_000
  for (let i = 0; i < 400; i++) {
    preco = Math.round((preco + 0.05) * 100) / 100
    agora += 100
    await avaliarItem(item, {
      conta: item.conta,
      posicoes: [{ ...ouro({ currentPrice: preco }) } as never],
      precoMedio: () => preco,
      agora,
    }, ctx)
  }
  // Sem travão seriam ~380 decisões (uma por tick). Com o passo de 3 pips o tecto são os 200 pips
  // de subida a dividir pelo passo (~66) — uma linha por MOVIMENTO, não por tick.
  assert.ok(intencoes.length < 80, `demasiadas linhas de sombra: ${intencoes.length}`)
  assert.ok(intencoes.length > 5, `poucas decisões para 200 pips: ${intencoes.length}`)
  assert.equal(intencoes[0].regra, 'provider_be')
  assert.equal(intencoes[0].ref, 'premium-ouro', 'ref da sombra = slug da estratégia')
  assert.equal(intencoes[0].tipo, 'provider')
  assert.ok(intencoes.slice(1).every((i) => i.regra === 'provider_trailing'))
  assert.ok(intencoes.every((i) => i.acao === 'sl' && i.sl != null))
  // O stop só sobe.
  const sls = intencoes.map((i) => i.sl as number)
  assert.deepEqual(sls, [...sls].sort((a, b) => a - b))
  assert.match(String(intencoes[0].detalhe), /premium-ouro · perfil zona/)

  // O segundo travão: uma rajada de ticks dentro do intervalo mínimo dá UMA decisão, por muito que
  // o preço corra (é o que protege a base quando um símbolo dispara).
  {
    const cfg = configProviderDaLinha('premium-ouro', LINHA_PREMIUM, 1_000)
    let e: EstadoProvider = { ...ESTADO_PROVIDER_NOVO }
    let n = 0
    for (let i = 0; i < 20; i++) {
      const d = decidirProvider(ouro({ currentPrice: 4010 + i }), cfg, e, 5_000 + i * 10)
      e = d.estado
      if (d.sl != null) n++
    }
    assert.equal(n, 1, 'rajada de 20 ticks em 200 ms: uma decisão só')
    // Passado o intervalo, volta a decidir.
    assert.notEqual(decidirProvider(ouro({ currentPrice: 4040 }), cfg, e, 8_000).sl, null)
  }

  // Uma posição já gerida pela linha que a originou não leva decisão do tipo provider.
  const antes = intencoes.length
  await avaliarItem(item, {
    conta: item.conta,
    posicoes: [{ ...ouro({ currentPrice: 4100 }) } as never],
    precoMedio: () => 4100,
    agora: agora + 10_000,
  }, { ...ctx, posicoesGeridas: new Set(['pos1']) })
  assert.equal(intencoes.length, antes, 'posição com dono: o provider não decide')

  // Posição fechada: o estado virtual dela sai da memória.
  await avaliarItem(item, { conta: item.conta, posicoes: [], precoMedio: () => null, agora: agora + 20_000 }, ctx)
  assert.equal(item.estados.size, 0, 'o estado das posições fechadas não fica a acumular')

  // E o que chega mesmo à base: as decisões da MESMA regra na mesma posição dentro da janela de 5 s
  // fundem-se numa linha só. 400 ticks (40 s) → menos linhas ainda do que decisões.
  const linhas = registo.recolher(agora + 300_000)
  assert.ok(linhas.length <= intencoes.length, 'a fusão nunca aumenta as linhas')
  assert.ok(linhas.length <= 20, `demasiadas linhas gravadas: ${linhas.length}`)
  assert.ok(linhas.every((l) => l.tipo === 'provider' && l.ref === 'premium-ouro' && l.modo === 'sombra'))
  // Sem monitor para casar — é o que se espera de posições que ninguém geria.
  assert.ok(linhas.every((l) => l.estado === 'sem_monitor'))

  console.log(`ok  sombra: ${intencoes.length} decisões e ${linhas.length} linhas gravadas em 400 ticks, ref=slug, estado limpo`)
  console.log('provider: todos certos')
})()

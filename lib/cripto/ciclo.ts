/**
 * AGENTE CRIPTO: UMA PASSAGEM do ciclo (vigia `agente-cripto` no mtm-vigias, de minuto a minuto).
 *
 *   gerir abertas → AG-SCANNER (gatilhos em código) → filtro de rug → sub-agentes →
 *   AG-TRADER (IA) → trader de apoio (IA) → GUARDA → posição (papel) ou pedido (real) → sessão
 *
 * O que este processo NUNCA faz: assinar, enviar ordens a um exchange ou mover fundos. No modo real
 * escreve uma posição `pendente` e é o executor da VPS (outro processo, outro utilizador, com as
 * chaves) que a cumpre, depois de voltar a verificar os tectos com os limites DELE.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { chamarIA } from '../ia/chamar'
import { vantagemPorCombo, lerRegua } from '../agentes/trader-disciplina'
import { candidatosMeme, dadosRug, fundingBybit, livroBybit, perpsVolateis, titulosDoAtivo, titulosNoticias, velasBybit, velasPool } from './fontes'
import { guardar, lerLimites, type EstadoConta, type VantagemGatilho } from './guarda'
import { detectarGatilho, pareceresNumericos, retratoDeVelas } from './indicadores'
import { ESTUDOS_SCALP, REGIME_PADRAO, eScalp, gatilhosScalp, type TipoScalp } from './scalp'
import { inicioDaSessao, motivoDeFecho, planoVarredura, pnlUsd, precoComEscorregamento } from './papel'
import { avaliarRug } from './rug'
import { decisaoTrader, parecerApoio, parecerContexto, type ChamarIA } from './subagentes'
import type { Gatilho, Modo, Parecer, PosicaoAberta, Retrato, Vela } from './tipos'

export const CHAVE_CONFIG = 'agente_cripto'

export interface ConfigCripto {
  ligado: boolean
  modo: Modo
  /**
   * Com `modo: 'real'`, os mercados que vão MESMO a real; os outros continuam em papel (o
   * laboratório não pára). Ex.: ['spot'] = memecoins reais na carteira, perps em papel.
   */
  realMercados: Array<'perp' | 'spot'>
  capitalPapelUsd: number
  perps: string[]
  memecoins: boolean
  horaFechoSessaoUtc: number
  maxGatilhosPorPassagem: number
  /** Mínimo para enviar lucros no fim da sessão. */
  varreduraMinUsd: number
  /** Real: o capital que o dono entregou. Só o que estiver acima disto é lucro. O executor confirma com o seu. */
  capitalBaseRealUsd: number
  limites?: Record<string, unknown>
  /**
   * Scalping com os estudos da casa (scalp.ts) nos perps. Desligado por omissão: o backtest de
   * 30 dias a 1 ano (lib/cripto/scalp-backtest.ts) deu vantagem bruta perto de zero e líquida
   * negativa em todos. Só corre com os perps em PAPEL, para medir; nunca abre real.
   */
  scalp: boolean
  /** Que estudos entram no scalping (omissão: todos). */
  estudosScalp: TipoScalp[]
  /** Além dos `perps`, os N perps mais voláteis do momento entram no scalping (0 = só os fixos). */
  scalpVolateis: number
  /** Velas do scalping, em minutos. */
  scalpTf: 1 | 5
  /** Filtro de alta volatilidade: ATR actual ≥ k × mediana das últimas 200 velas (0 = sem filtro). */
  scalpRegimeK: number
}

export function lerConfig(bruto: unknown): ConfigCripto {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const perps = Array.isArray(b.perps) ? b.perps.map(String).filter((s) => /^[A-Z0-9]{2,20}USDT$/.test(s)) : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
  const n = (x: unknown, d: number) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : d)
  return {
    ligado: b.ligado === true,
    modo: b.modo === 'real' ? 'real' : 'papel',
    realMercados: Array.isArray(b.realMercados)
      ? (['perp', 'spot'] as const).filter((m) => (b.realMercados as unknown[]).includes(m))
      : ['perp', 'spot'],
    capitalPapelUsd: n(b.capitalPapelUsd, 1000),
    perps,
    memecoins: b.memecoins !== false,
    horaFechoSessaoUtc: Math.min(23, Math.floor(n(b.horaFechoSessaoUtc, 0))),
    maxGatilhosPorPassagem: Math.min(5, Math.floor(n(b.maxGatilhosPorPassagem, 2))),
    varreduraMinUsd: n(b.varreduraMinUsd, 10),
    capitalBaseRealUsd: n(b.capitalBaseRealUsd, 0),
    limites: b.limites && typeof b.limites === 'object' ? (b.limites as Record<string, unknown>) : undefined,
    scalp: b.scalp === true,
    estudosScalp: Array.isArray(b.estudosScalp) ? ESTUDOS_SCALP.filter((t) => (b.estudosScalp as unknown[]).includes(t)) : [...ESTUDOS_SCALP],
    scalpVolateis: Math.min(15, Math.floor(n(b.scalpVolateis, 5))),
    scalpTf: Number(b.scalpTf) === 5 ? 5 : 1,
    scalpRegimeK: Math.min(5, n(b.scalpRegimeK, REGIME_PADRAO.k)),
  }
}

/** Mesmo ativo e tipo de gatilho decidido há menos disto: não se volta a gastar IA. */
const ESPERA_MESMO_GATILHO_MS = 30 * 60_000
/** No scalping a janela é curta: o regime de alta volatilidade dura minutos, não meia hora. */
const ESPERA_SCALP_MS = 5 * 60_000

/** O modo em que corre cada mercado nesta passagem. */
export function modoDoMercado(cfg: ConfigCripto, mercado: 'perp' | 'spot'): Modo {
  return cfg.modo === 'real' && cfg.realMercados.includes(mercado) ? 'real' : 'papel'
}

interface LinhaPosicao {
  id: string
  modo: Modo
  ativo: string
  mercado: 'perp' | 'spot'
  id_ativo: string
  lado: 'long' | 'short'
  nocional_usd: number
  entrada: number
  sl: number
  tp: number
  estado: string
  aberta_em: string
  fechar_pedido: string | null
}

async function precoActual(p: { mercado: 'perp' | 'spot'; id_ativo: string }, cacheMeme: Map<string, number>): Promise<number | null> {
  if (p.mercado === 'perp') {
    const v = await velasBybit(p.id_ativo, 3)
    return v.length ? v[v.length - 1].c : null
  }
  return cacheMeme.get(p.id_ativo) ?? null
}

export interface ResultadoPassagem {
  ligado: boolean
  modo?: Modo
  fechadas: number
  gatilhos: number
  aprovadas: number
  erros: string[]
}

export async function correrAgenteCripto(db: SupabaseClient, ia: ChamarIA = chamarIA, agora = new Date()): Promise<ResultadoPassagem> {
  const res: ResultadoPassagem = { ligado: false, fechadas: 0, gatilhos: 0, aprovadas: 0, erros: [] }
  const { data: cfgRow } = await db.from('site_settings').select('value').eq('key', CHAVE_CONFIG).maybeSingle()
  const cfg = lerConfig(cfgRow?.value)
  if (!cfg.ligado) return res
  res.ligado = true
  res.modo = cfg.modo
  const limites = lerLimites(cfg.limites)

  /* ── 1. Posições abertas ── */
  const { data: abertasRaw } = await db
    .from('cripto_posicoes').select('id, modo, ativo, mercado, id_ativo, lado, nocional_usd, entrada, sl, tp, estado, aberta_em, fechar_pedido')
    .in('estado', ['aberta', 'pendente'])
  const abertas = (abertasRaw ?? []) as LinhaPosicao[]

  const memes = cfg.memecoins ? await candidatosMeme(15, agora) : []
  const precoMeme = new Map(memes.map((m) => [m.mint, m.precoUsd]))

  for (const p of abertas.filter((x) => x.estado === 'aberta')) {
    try {
      const preco = await precoActual(p, precoMeme)
      if (preco == null) continue
      const pos = { mercado: p.mercado, lado: p.lado, entrada: Number(p.entrada), nocionalUsd: Number(p.nocional_usd), sl: Number(p.sl), tp: Number(p.tp), abertaEm: p.aberta_em }
      // `fechar_pedido` = alguém carregou em «fechar» no dashboard (papel fecha aqui, real no executor).
      // Cada posição gere-se no modo em que nasceu, mesmo que o dono tenha mudado o modo depois.
      const motivo = (p.modo === 'papel' ? p.fechar_pedido : null) ?? motivoDeFecho(pos, preco, agora)
      if (!motivo) continue
      if (p.modo === 'papel') {
        // No SL conta o pior dos dois (se o preço saltou o stop, sai-se onde o preço está).
        const noSl = p.lado === 'long' ? Math.min(pos.sl, preco) : Math.max(pos.sl, preco)
        const saida = precoComEscorregamento(motivo === 'sl' ? noSl : motivo === 'tp' ? pos.tp : preco, p.mercado, p.lado, false)
        await db.from('cripto_posicoes').update({
          estado: 'fechada', motivo_fecho: motivo, saida, pnl_usd: Math.round(pnlUsd(pos, saida) * 100) / 100, fechada_em: agora.toISOString(),
        }).eq('id', p.id).eq('estado', 'aberta')
        res.fechadas++
      } else if (!p.fechar_pedido) {
        // Real: os perps têm SL/TP no exchange; o tempo e os spots (sem SL nativo) pedem-se ao executor.
        await db.from('cripto_posicoes').update({ fechar_pedido: motivo }).eq('id', p.id)
      }
    } catch (e) {
      res.erros.push(`gerir ${p.ativo}: ${String((e as Error)?.message ?? e).slice(0, 120)}`)
    }
  }

  /* ── 2. Estado da conta (uma por modo em uso: papel e real nunca partilham capital) ── */
  const emUso = new Set<Modo>(['papel'])
  if (cfg.perps.length) emUso.add(modoDoMercado(cfg, 'perp'))
  if (cfg.memecoins) emUso.add(modoDoMercado(cfg, 'spot'))
  const contas = {} as Record<Modo, EstadoConta>
  for (const m of emUso) {
    contas[m] = await estadoConta(db, cfg, m, agora)
    contas[m].abertas = abertas.filter((p) => p.modo === m).map((p) => ({ ativo: p.ativo, mercado: p.mercado, lado: p.lado, nocionalUsd: Number(p.nocional_usd), entrada: Number(p.entrada), sl: Number(p.sl), tp: Number(p.tp) }))
  }
  const fecharSessoes = async () => { for (const m of emUso) await fecharSessaoSePreciso(db, cfg, m, contas[m], agora) }

  /* ── 3. AG-SCANNER: gatilhos em código ── */
  type Candidato = { r: Retrato; g: Gatilho; velas: Vela[]; social: string[]; rugParecer?: Parecer }
  const candidatos: Candidato[] = []
  // Scalping: só com os perps em papel. Universo = perps fixos + os mais voláteis do momento.
  const comScalp = cfg.scalp && modoDoMercado(cfg, 'perp') === 'papel'
  const volateis = comScalp && cfg.scalpVolateis > 0 ? await perpsVolateis(cfg.scalpVolateis) : []
  const regime = cfg.scalpRegimeK > 0 ? { ...REGIME_PADRAO, k: cfg.scalpRegimeK } : null
  for (const symbol of [...new Set([...cfg.perps, ...volateis])]) {
    try {
      const fixo = cfg.perps.includes(symbol)
      const velas = await velasBybit(symbol)
      const [livro, funding] = await Promise.all([livroBybit(symbol), fundingBybit(symbol)])
      const r = retratoDeVelas({ ativo: symbol, mercado: 'perp', id: symbol, velas5m: velas, livro, fundingPct: funding, agora })
      if (!r) continue
      const g = fixo ? detectarGatilho(r, velas) : null
      if (g) candidatos.push({ r, g, velas, social: [] })
      if (comScalp) {
        // 600 velas: a EMA 238 do TrendShot e a janela de 200 do regime precisam de história.
        const vs = await velasBybit(symbol, 600, cfg.scalpTf)
        for (const gs of gatilhosScalp(r, vs, cfg.estudosScalp, regime)) candidatos.push({ r, g: gs, velas, social: [] })
      }
    } catch (e) {
      res.erros.push(`scanner ${symbol}: ${String((e as Error)?.message ?? e).slice(0, 120)}`)
    }
  }
  for (const m of memes) {
    try {
      const velas = await velasPool(m.pool)
      const r = retratoDeVelas({ ativo: m.simbolo, mercado: 'spot', id: m.mint, velas5m: velas, liquidezUsd: m.liquidezUsd, agora })
      if (!r) continue
      // O rug só se consulta quando há gatilho (são 2 pedidos por token).
      const g = detectarGatilho(r, velas)
      if (!g) continue
      const rug = avaliarRug(await dadosRug(m))
      r.rug = rug
      candidatos.push({ r, g, velas, social: m.social, rugParecer: { agente: 'filtro-rug', favor: rug.aprovado ? 0.3 : -1, nota: rug.aprovado ? 'Passou o filtro de scam/rug.' : rug.motivos.join(' '), veto: !rug.aprovado } })
    } catch (e) {
      res.erros.push(`scanner ${m.simbolo}: ${String((e as Error)?.message ?? e).slice(0, 120)}`)
    }
  }
  res.gatilhos = candidatos.length
  if (!candidatos.length) {
    await fecharSessoes()
    return res
  }

  /* ── 4. Vantagem medida (do papel, que é o laboratório) ── */
  const { data: vRaw } = await db.from('cripto_vantagem').select('*').eq('modo', 'papel')
  const regua = lerRegua({ regua: { minAmostra: limites.minAmostra } })
  const mapa = vantagemPorCombo(
    (vRaw ?? []).map((v: Record<string, unknown>) => ({
      estrategia: String(v.gatilho_tipo), symbol: 'CRIPTO', n: Number(v.n), ganhos: Number(v.ganhos), pnl: Number(v.pnl), somaR: Number(v.soma_r), somaR2: Number(v.soma_r2),
    })) as Parameters<typeof vantagemPorCombo>[0],
    regua,
  )
  const vantagemDe = (tipo: string): VantagemGatilho => {
    const v = mapa.get(`${tipo}|CRIPTO`)
    return v ? { n: v.n, aprovada: v.aprovada, porque: v.porque } : { n: 0, aprovada: false, porque: 'Ainda sem trades fechados.' }
  }

  /* ── 5. Sub-agentes + AG-TRADER + apoio + guarda ── */
  const desde = new Date(agora.getTime() - ESPERA_MESMO_GATILHO_MS).toISOString()
  const { data: recentes } = await db.from('cripto_decisoes').select('ativo, gatilho, em').gte('em', desde)
  const jaVisto = new Set(
    (recentes ?? [])
      .filter((d: { gatilho: { tipo?: string }; em: string }) => !eScalp(String(d.gatilho?.tipo)) || agora.getTime() - new Date(d.em).getTime() < ESPERA_SCALP_MS)
      .map((d: { ativo: string; gatilho: { tipo?: string } }) => `${d.ativo}|${d.gatilho?.tipo}`),
  )
  const titulos = await titulosNoticias()

  let usados = 0
  for (const c of candidatos) {
    if (jaVisto.has(`${c.r.ativo}|${c.g.tipo}`)) continue
    if (usados >= cfg.maxGatilhosPorPassagem) break
    const pareceres: Parecer[] = [...pareceresNumericos(c.r, c.g)]
    if (c.rugParecer) pareceres.push(c.rugParecer)

    let decisao = null
    let fornecedor: string | null = null
    // Veto de código já decidido: não se gasta IA com um token que o filtro de rug chumbou.
    if (!pareceres.some((p) => p.veto)) {
      usados++
      pareceres.push(await parecerContexto(ia, c.r, titulosDoAtivo(titulos, c.r.ativo), c.social))
      const iaComFornecedor: ChamarIA = async (p) => {
        const out = await ia(p)
        fornecedor = `${out.fornecedor}/${out.modelo}`
        return out
      }
      if (!pareceres.some((p) => p.veto)) {
        decisao = await decisaoTrader(iaComFornecedor, c.r, c.g, pareceres)
        if (decisao && decisao.action !== 'HOLD' && decisao.action !== 'ERROR') pareceres.push(await parecerApoio(ia, c.r, c.g, decisao, pareceres))
      }
    }

    const modo = modoDoMercado(cfg, c.r.mercado)
    const conta = contas[modo]
    const { ordem, recusas } = guardar({ modo, agora, retrato: c.r, gatilho: c.g, decisao, pareceres, conta, vantagem: vantagemDe(c.g.tipo), limites })
    const { data: dec, error } = await db.from('cripto_decisoes').insert({
      modo, ativo: c.r.ativo, mercado: c.r.mercado, gatilho: c.g, retrato: c.r, pareceres, decisao_ia: decisao, fornecedor_ia: fornecedor, recusas, aprovada: !!ordem,
    }).select('id').single()
    if (error) { res.erros.push(`gravar decisão: ${error.message}`); continue }
    if (!ordem) continue

    const entrada = modo === 'papel' ? precoComEscorregamento(ordem.entrada, ordem.mercado, ordem.lado, true) : ordem.entrada
    const riscoUsd = ordem.nocionalUsd * (Math.abs(ordem.entrada - ordem.sl) / ordem.entrada)
    const { error: ePos } = await db.from('cripto_posicoes').insert({
      decisao_id: dec.id, modo, ativo: ordem.ativo, mercado: ordem.mercado, id_ativo: ordem.id, gatilho_tipo: c.g.tipo, lado: ordem.lado,
      nocional_usd: ordem.nocionalUsd, alavancagem: ordem.alavancagem, entrada, sl: ordem.sl, tp: ordem.tp, risco_usd: Math.round(riscoUsd * 100) / 100,
      slippage_max_pct: ordem.slippageMaxPct, exploracao: ordem.exploracao, estado: modo === 'papel' ? 'aberta' : 'pendente',
    })
    if (ePos) { res.erros.push(`gravar posição: ${ePos.message}`); continue }
    res.aprovadas++
    conta.abertas.push({ ativo: ordem.ativo, mercado: ordem.mercado, lado: ordem.lado, nocionalUsd: ordem.nocionalUsd, entrada, sl: ordem.sl, tp: ordem.tp })
  }

  await fecharSessoes()
  return res
}

/** Capital, pico e PnL de hoje. Papel: base + PnL fechado. Real: o último saldo lido pelo executor. */
async function estadoConta(db: SupabaseClient, cfg: ConfigCripto, modo: Modo, agora: Date): Promise<EstadoConta> {
  const { data: fechadas } = await db.from('cripto_posicoes').select('pnl_usd, fechada_em').eq('modo', modo).eq('estado', 'fechada').order('fechada_em', { ascending: true })
  const hoje = inicioDaSessao(agora, cfg.horaFechoSessaoUtc).getTime()
  let pnlHoje = 0
  let capital = cfg.capitalPapelUsd
  let pico = capital
  if (modo === 'papel') {
    // O lucro "enviado" em papel sai da conta, como sairia no real; senão era enviado todos os dias.
    const { data: env } = await db.from('cripto_sessoes').select('varredura_usd').eq('modo', 'papel').eq('varredura_estado', 'simulada')
    capital -= (env ?? []).reduce((s: number, x: { varredura_usd: number }) => s + (Number(x.varredura_usd) || 0), 0)
    pico = capital
  }
  for (const f of (fechadas ?? []) as { pnl_usd: number; fechada_em: string }[]) {
    capital += Number(f.pnl_usd) || 0
    pico = Math.max(pico, capital)
    if (new Date(f.fechada_em).getTime() >= hoje) pnlHoje += Number(f.pnl_usd) || 0
  }
  if (modo === 'real') {
    const { data: s } = await db.from('cripto_saldos').select('equity_usd, em, detalhe').order('em', { ascending: false }).limit(1).maybeSingle()
    // Sem saldo lido há menos de 10 min, o capital é 0: a guarda recusa tudo.
    const fresco = s && agora.getTime() - new Date(s.em).getTime() < 10 * 60_000
    // Só um mercado em real: conta só a parte desse executor (a AURUM não financia memecoins).
    const partes = (s?.detalhe as { partes?: Record<string, { equity?: number }> } | null)?.partes
    const so = cfg.realMercados.length === 1 ? (cfg.realMercados[0] === 'spot' ? 'solana' : 'bybit') : null
    capital = !fresco ? 0 : so && partes?.[so] ? Number(partes[so].equity) || 0 : Number(s.equity_usd)
    if (so) {
      const { data: hist } = await db.from('cripto_saldos').select('detalhe').order('em', { ascending: false }).limit(3000)
      pico = Math.max(capital, ...(hist ?? []).map((h: { detalhe: { partes?: Record<string, { equity?: number }> } }) => Number(h.detalhe?.partes?.[so]?.equity) || 0))
    } else {
      const { data: picoRow } = await db.from('cripto_saldos').select('equity_usd').order('equity_usd', { ascending: false }).limit(1).maybeSingle()
      pico = Math.max(capital, Number(picoRow?.equity_usd) || 0)
    }
  }
  return { capitalUsd: capital, picoUsd: pico, pnlHojeUsd: pnlHoje, abertas: [] }
}

/**
 * Fecha a sessão anterior uma vez (chave modo+início). Papel: o envio fica `simulada`. Real: fica
 * `pedida`, e o executor da VPS envia para o endereço que só ELE conhece (env da VPS).
 */
async function fecharSessaoSePreciso(db: SupabaseClient, cfg: ConfigCripto, modo: Modo, conta: EstadoConta, agora: Date): Promise<void> {
  const inicioActual = inicioDaSessao(agora, cfg.horaFechoSessaoUtc)
  const inicioAnterior = new Date(inicioActual.getTime() - 24 * 3600_000)
  const { data: ja } = await db.from('cripto_sessoes').select('inicio').eq('modo', modo).eq('inicio', inicioAnterior.toISOString()).maybeSingle()
  if (ja) return
  const { data: fechadas } = await db.from('cripto_posicoes').select('pnl_usd').eq('modo', modo).eq('estado', 'fechada')
    .gte('fechada_em', inicioAnterior.toISOString()).lt('fechada_em', inicioActual.toISOString())
  const pnl = (fechadas ?? []).reduce((s: number, f: { pnl_usd: number }) => s + (Number(f.pnl_usd) || 0), 0)
  const margem = conta.abertas.reduce((s, p) => s + p.nocionalUsd, 0)
  const base = modo === 'papel' ? cfg.capitalPapelUsd : cfg.capitalBaseRealUsd
  const plano = planoVarredura({ capitalBaseUsd: base, equityUsd: conta.capitalUsd, livreUsd: Math.max(0, conta.capitalUsd - margem), minimoUsd: cfg.varreduraMinUsd })
  await db.from('cripto_sessoes').upsert({
    modo: modo, inicio: inicioAnterior.toISOString(), fim: inicioActual.toISOString(), equity_fim_usd: Math.round(conta.capitalUsd * 100) / 100,
    pnl_usd: Math.round(pnl * 100) / 100, trades: (fechadas ?? []).length,
    varredura_estado: plano.enviarUsd > 0 ? (modo === 'papel' ? 'simulada' : 'pedida') : 'nada', varredura_usd: plano.enviarUsd, porque: plano.porque,
  }, { onConflict: 'modo,inicio', ignoreDuplicates: true })
}

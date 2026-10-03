import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { pipSizeForSymbol } from '@/lib/mtmcopy/trade-outcome'
import { chavesDaFonte } from './chaves-de-fonte'
import { medeDesde } from './quarentena'

/**
 * O DESEMPENHO DE CADA ESTRATÉGIA, RECONSTRUÍDO A PARTIR DO PREÇO REAL.
 *
 * ── porque é que isto existe ──────────────────────────────────────────────────
 *
 * O que havia media IDEIAS: cada sinal ganhava um desfecho tudo-ou-nada, alvo ou stop. Uma
 * posição que fechou 75% no primeiro alvo e os restantes 25% no break-even entrava como PERDA, e
 * o lucro já embolsado desaparecia da conta. Era por isso que o Premium aparecia com 19% de
 * acerto — um número que não descreve nada que tenha acontecido.
 *
 * A conta-espelho resolve isto para o futuro: abre todos os sinais a 0,03 lotes e grava cada
 * saída. Mas só começa a valer daqui a semanas, e o passado não se recupera assim.
 *
 * Isto recupera-o. Cada sinal publicado é reposto contra as velas REAIS de 5 minutos da altura,
 * com as regras de saída da estratégia que o produziu: parciais nos alvos, stop à entrada depois
 * do primeiro, trailing a acompanhar. O resultado é a soma de fração×pips de cada saída — que é
 * a mesma aritmética que a conta-espelho faz, aplicada a preços que já aconteceram.
 *
 * ── o que isto É e o que NÃO É ────────────────────────────────────────────────
 *
 * Os PREÇOS são reais. A EXECUÇÃO é reconstruída: não houve ordem nenhuma no mercado, não há
 * spread pago, nem derrapagem, nem uma ordem recusada por o mercado estar fechado. Chamar a isto
 * «executado» seria a mesma espécie de número que foi mandado tirar do site.
 *
 * Por isso cada resultado sai marcado `reconstruido: true`, e quem o mostrar tem de o dizer. Não
 * é uma ressalva de rodapé: é a diferença entre «a estratégia fez isto» e «a estratégia teria
 * feito isto se cada ordem tivesse entrado ao preço pedido».
 *
 * ── as escolhas que enviesam, e para que lado ─────────────────────────────────
 *
 * Dentro de uma vela de 5 minutos não se sabe o que veio primeiro, o máximo ou o mínimo. Sempre
 * que a vela toca no stop E num alvo, conta o STOP. É a leitura pessimista, de propósito: a
 * optimista inventaria ganhos que talvez não tenham existido, e um número inflacionado numa
 * página de vendas é exactamente o que não se quer aqui.
 *
 * Pela mesma razão a entrada TEM de ser tocada. Um sinal cujo preço nunca voltou à entrada não
 * conta como nada — nem ganho nem perda —, tal como no motor a sério.
 */

const MERCADO = 'https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai'

/**
 * Tecto de plausibilidade, o mesmo do `pips-proof`. Acima disto é erro de dados, não uma trade.
 */
function tectoDePips(symbol: string): number {
  const p = pipSizeForSymbol(symbol)
  if (p === 0.1 || p === 0.01) return 3000
  if (p === 0.0001) return 1500
  return 60_000
}

/**
 * O sinal é coerente consigo próprio?
 *
 * Numa compra o stop fica ABAIXO da entrada e os alvos acima; numa venda ao contrário. Parece
 * demasiado óbvio para se verificar, e é exactamente por isso que ninguém verificava.
 *
 * A 31/08 o analisador gravou sinais de compra com o stop 95 pontos ACIMA da entrada — um deles
 * com `sl: 45433` onde devia estar `4433`. Repostos sem esta verificação, o «stop» ficava do lado
 * do lucro: a posição fechava logo na primeira vela com +950 pips, e uma delas, com o stop
 * inalcançável, correu a janela inteira e devolveu +409.950 pips. O Premium aparecia com uma
 * média de +2.395 pips por trade.
 *
 * Estes não são trades boas nem más — não são trades. Ficam de fora e contam-se à parte, porque
 * uma fonte que produz sinais impossíveis é um problema por direito próprio, e escondê-los na
 * média fazia desaparecer os dois factos ao mesmo tempo.
 */
function sinalCoerente(s: { direction: 'buy' | 'sell'; entry: number; sl: number; tps: number[] }): boolean {
  if (!(s.entry > 0) || !(s.sl > 0)) return false
  const alvos = s.tps.filter((t) => Number.isFinite(t) && t > 0)
  if (!alvos.length) return false
  if (s.direction === 'buy') return s.sl < s.entry && alvos.some((t) => t > s.entry)
  return s.sl > s.entry && alvos.some((t) => t < s.entry)
}

/** Quanto tempo um sinal espera pela entrada antes de desistir — o mesmo do motor. */
const HORAS_ATE_DESISTIR = 24
/** Quanto tempo se segue uma posição aberta antes de a dar por encerrada ao último preço. */
const DIAS_MAXIMOS = 10

export interface SaidaReconstruida {
  nivel: number
  fraccao: number
  pips: number
  porque: 'alvo' | 'stop' | 'break-even' | 'trailing' | 'fim-da-janela'
}

export interface TradeReconstruida {
  sinalId: string
  fonte: string
  symbol: string
  direction: 'buy' | 'sell'
  entry: number
  /** Σ fração×pips — o resultado da posição, com os parciais contados. */
  pips: number
  saidas: SaidaReconstruida[]
  abertaEm: string
  fechadaEm: string
}

export interface DesempenhoReconstruido {
  fonte: string
  nome: string
  trades: number
  /** Quantas tiveram mais do que uma saída. É a medida de quanto os parciais mudam a conta. */
  comParciais: number
  acertoPct: number
  pipsTotal: number
  pipsMedia: number
  /** Sinais publicados cuja entrada nunca foi tocada — não contam para nada. */
  semEntrada: number
  /** Sinais impossíveis (stop do lado errado, alvos ao contrário). Não são trades. */
  incoerentes: number
  desde: string | null
  ate: string | null
  reconstruido: true
}

interface Vela {
  t: number
  high: number
  low: number
  close: number
}

/**
 * As velas de um símbolo na janela toda, de uma vez.
 *
 * Buscar por sinal dava um pedido por sinal — novecentos e tal pedidos para reler as mesmas
 * velas dezenas de vezes. Um símbolo tem uma série só, e todos os sinais dele leem-na.
 *
 * ⚠️ A MetaApi pagina para TRÁS. O `startTime` é o instante da vela MAIS RECENTE do lote, e o
 * que volta são as N velas ANTERIORES a ele — não as seguintes. Lido ao contrário, o primeiro
 * pedido devolve velas mais velhas do que o cursor, o cursor nunca avança, e a série acaba na
 * primeira volta: foi assim que a reposição correu inteira sobre quatro dias de Maio e devolveu
 * zero trades, sem erro nenhum pelo caminho.
 */
async function velasDoSimbolo(
  contaId: string,
  symbol: string,
  de: Date,
  ate: Date,
): Promise<Vela[]> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return []

  const todas: Vela[] = []
  let cursor = new Date(ate)

  for (let volta = 0; volta < 80; volta++) {
    const url =
      `${MERCADO}/users/current/accounts/${contaId}/historical-market-data/symbols/` +
      `${encodeURIComponent(symbol)}/timeframes/5m/candles` +
      `?startTime=${cursor.toISOString()}&limit=1000`

    let lote: Array<Record<string, unknown>> = []
    try {
      const r = await fetch(url, { headers: { 'auth-token': token } })
      if (!r.ok) break
      lote = (await r.json()) as Array<Record<string, unknown>>
    } catch {
      break
    }
    if (!lote.length) break

    for (const v of lote) {
      const t = new Date(String(v.time)).getTime()
      if (t < de.getTime() || t > ate.getTime()) continue
      todas.push({ t, high: Number(v.high), low: Number(v.low), close: Number(v.close) })
    }

    // O lote vem por ordem crescente; a vela mais ANTIGA dele é o novo tecto.
    const maisAntiga = new Date(String(lote[0].time)).getTime()
    if (maisAntiga <= de.getTime()) break
    // Sem recuo não há mais histórico: a série do símbolo começa aqui.
    if (!(maisAntiga < cursor.getTime())) break
    cursor = new Date(maisAntiga - 60_000)
  }

  todas.sort((a, b) => a.t - b.t)
  return todas
}

interface Regras {
  saidasPct: number[]
  bePips: number | null
  trailingArranca: number | null
  trailingDistancia: number | null
  /**
   * Stop de DISCIPLINA, em pips da entrada. `null` = usa o stop que veio no sinal.
   *
   * Serve para separar duas perguntas que andam coladas: «a estratégia escolhe bem?» e «a
   * execução cumpriu o que ela pediu?». Um sinal bom com um stop três vezes mais largo do que
   * devia perde dinheiro sem que a escolha da entrada tenha nada a ver com isso.
   *
   * APERTA, nunca alarga: um stop que já era mais curto do que este fica como está. Alargá-lo
   * era inventar uma trade que teria sobrevivido a um movimento que na verdade a matou.
   */
  stopMaximoPips: number | null
}

/**
 * Repõe UM sinal contra as velas, e devolve o que ele teria feito.
 *
 * Devolve `null` quando a entrada nunca foi tocada — que não é o mesmo que uma perda de zero
 * pips, e misturar as duas coisas estragava a taxa de acerto nos dois sentidos.
 */
function reporSinal(
  sinal: {
    id: string
    fonte: string
    symbol: string
    direction: 'buy' | 'sell'
    entry: number
    sl: number
    tps: number[]
    created_at: string
  },
  velas: Vela[],
  regras: Regras,
): TradeReconstruida | null {
  const pip = pipSizeForSymbol(sinal.symbol)
  const compra = sinal.direction === 'buy'
  const inicio = new Date(sinal.created_at).getTime()
  const limiteEntrada = inicio + HORAS_ATE_DESISTIR * 3600_000
  const limiteVida = inicio + DIAS_MAXIMOS * 86_400_000

  const aFavor = (preco: number) => ((compra ? preco - sinal.entry : sinal.entry - preco) / pip)

  let aberta = false
  let abertaEm = ''
  let stop = sinal.sl
  if (regras.stopMaximoPips != null) {
    const tecto = compra
      ? sinal.entry - regras.stopMaximoPips * pip
      : sinal.entry + regras.stopMaximoPips * pip
    stop = compra ? Math.max(sinal.sl, tecto) : Math.min(sinal.sl, tecto)
  }
  let restante = 1
  let nivel = 0
  let picoPips = 0
  const saidas: SaidaReconstruida[] = []

  const alvos = sinal.tps.filter((t) => Number.isFinite(t) && t > 0)
  // A escada normaliza-se ao número de alvos que o sinal REALMENTE tem: um sinal de dois alvos
  // com uma escada de três deixava 10% da posição por fechar para sempre.
  const escada = (() => {
    const base = regras.saidasPct.slice(0, Math.max(alvos.length, 1))
    const soma = base.reduce((a, b) => a + b, 0)
    if (soma <= 0) return base.map(() => 1 / Math.max(base.length, 1))
    return base.map((p) => p / soma)
  })()

  for (const v of velas) {
    if (v.t < inicio) continue
    if (v.t > limiteVida) break

    if (!aberta) {
      if (v.t > limiteEntrada) return null
      // A entrada enche quando o preço a atravessa — qualquer lado serve, é um limite tocado.
      if (v.low <= sinal.entry && sinal.entry <= v.high) {
        aberta = true
        abertaEm = new Date(v.t).toISOString()
      }
      continue
    }

    // ── o stop primeiro, SEMPRE ────────────────────────────────────────────────
    // Dentro da vela não se sabe a ordem dos acontecimentos. Contar o stop antes do alvo é a
    // leitura que nunca inventa um ganho.
    const stopTocado = compra ? v.low <= stop : v.high >= stop
    if (stopTocado) {
      const pips = aFavor(stop)
      saidas.push({
        nivel: nivel + 1,
        fraccao: restante,
        pips,
        porque: pips >= 0 ? (pips > 0 ? 'trailing' : 'break-even') : 'stop',
      })
      restante = 0
      return montar(sinal, saidas, abertaEm, new Date(v.t).toISOString())
    }

    // ── os alvos ───────────────────────────────────────────────────────────────
    while (nivel < alvos.length) {
      const alvo = alvos[nivel]
      const tocado = compra ? v.high >= alvo : v.low <= alvo
      if (!tocado) break
      const fatia = Math.min(escada[nivel] ?? 0, restante)
      if (fatia > 0) {
        saidas.push({ nivel: nivel + 1, fraccao: fatia, pips: aFavor(alvo), porque: 'alvo' })
        restante -= fatia
      }
      nivel++
      // Depois do primeiro alvo o stop vai para a entrada — é o que o motor faz.
      if (nivel === 1 && (regras.bePips == null || regras.bePips >= 0)) stop = sinal.entry
      if (restante <= 0.0001) {
        return montar(sinal, saidas, abertaEm, new Date(v.t).toISOString())
      }
    }

    // ── o trailing ─────────────────────────────────────────────────────────────
    const extremo = compra ? v.high : v.low
    picoPips = Math.max(picoPips, aFavor(extremo))
    if (regras.trailingArranca != null && picoPips >= regras.trailingArranca) {
      const distancia = regras.trailingDistancia ?? regras.trailingArranca
      const novo = compra ? extremo - distancia * pip : extremo + distancia * pip
      // O stop só anda a favor. Um trailing que recua não é um trailing.
      if (compra ? novo > stop : novo < stop) stop = novo
    }
  }

  if (!aberta) return null

  // Chegou ao fim da janela ainda aberta: vale o último preço conhecido.
  const ultima = velas[velas.length - 1]
  if (ultima && restante > 0) {
    saidas.push({ nivel: nivel + 1, fraccao: restante, pips: aFavor(ultima.close), porque: 'fim-da-janela' })
  }
  return montar(sinal, saidas, abertaEm, ultima ? new Date(ultima.t).toISOString() : abertaEm)
}

function montar(
  sinal: { id: string; fonte: string; symbol: string; direction: 'buy' | 'sell'; entry: number },
  saidas: SaidaReconstruida[],
  abertaEm: string,
  fechadaEm: string,
): TradeReconstruida {
  const pips = saidas.reduce((a, s) => a + s.fraccao * s.pips, 0)
  return {
    sinalId: sinal.id,
    fonte: sinal.fonte,
    symbol: sinal.symbol,
    direction: sinal.direction,
    entry: sinal.entry,
    pips: Math.round(pips * 10) / 10,
    saidas,
    abertaEm,
    fechadaEm,
  }
}

export interface ResultadoReconstrucao {
  porFonte: DesempenhoReconstruido[]
  trades: TradeReconstruida[]
  simbolosSemVelas: string[]
  asOf: string
}

/**
 * Repõe TODOS os sinais da janela e devolve o desempenho por fonte.
 *
 * A conta de leitura das velas é uma conta provider qualquer que esteja ligada: as velas são do
 * mercado, não da conta, e pedir por uma conta é só como a MetaApi serve o histórico.
 */
export async function reconstruirDesempenho(opts?: {
  dias?: number
  contaLeituraId?: string
  /** Aperta o stop de todas as estratégias a esta distância da entrada — ver `Regras`. */
  stopMaximoPips?: number
  /** Mede só estas fontes. Serve para experimentar uma sem repor as outras todas. */
  apenasFontes?: string[]
}): Promise<ResultadoReconstrucao> {
  const db = getSupabaseAdmin()
  const dias = opts?.dias ?? 120
  const de = new Date(Date.now() - dias * 86_400_000)

  let contaId = opts?.contaLeituraId
  if (!contaId) {
    const { data } = await db
      .from('mtm_trading_accounts')
      .select('metaapi_account_id')
      .eq('tipo', 'provider')
      .not('metaapi_account_id', 'is', null)
      .limit(1)
    contaId = (data?.[0]?.metaapi_account_id as string) ?? undefined
  }
  if (!contaId) return { porFonte: [], trades: [], simbolosSemVelas: [], asOf: new Date().toISOString() }

  const { data: sinais } = await db
    .from('mtmcopy_signal_tracking')
    .select('id, source_key, symbol, direction, entry, sl, tps, created_at')
    .gte('created_at', de.toISOString())
    .not('entry', 'is', null)
    .not('sl', 'is', null)
    .order('created_at')
    .limit(5000)

  const candidatos = (sinais ?? []).filter(
    (s) =>
      s.symbol &&
      s.source_key &&
      Number(s.entry) > 0 &&
      Number(s.sl) > 0 &&
      (s.tps as number[] | null)?.length &&
      (!opts?.apenasFontes?.length || opts.apenasFontes.includes(String(s.source_key))),
  )

  const incoerentesPorFonte = new Map<string, number>()
  const uteis = candidatos.filter((s) => {
    const ok = sinalCoerente({
      direction: s.direction === 'sell' ? 'sell' : 'buy',
      entry: Number(s.entry),
      sl: Number(s.sl),
      tps: (s.tps as number[]).map(Number),
    })
    if (!ok) {
      const f = String(s.source_key)
      incoerentesPorFonte.set(f, (incoerentesPorFonte.get(f) ?? 0) + 1)
    }
    return ok
  })

  // ── as regras de cada estratégia ────────────────────────────────────────────
  const { data: providers } = await db
    .from('mtmauto_providers')
    .select('slug, nome, fonte_mtm, saidas_pct, be_gatilho, trailing_arranca_pips, trailing_distancia_pips')
  const regrasPorFonte = new Map<string, Regras>()
  const nomePorFonte = new Map<string, string>()
  for (const p of providers ?? []) {
    const regras: Regras = {
      saidasPct: ((p.saidas_pct as number[] | null) ?? [75, 15, 10]).map(Number),
      bePips: p.be_gatilho != null ? Number(p.be_gatilho) : null,
      trailingArranca: p.trailing_arranca_pips != null ? Number(p.trailing_arranca_pips) : null,
      trailingDistancia: p.trailing_distancia_pips != null ? Number(p.trailing_distancia_pips) : null,
      stopMaximoPips: opts?.stopMaximoPips ?? null,
    }
    for (const chave of chavesDaFonte(p.slug as string, p.fonte_mtm as string | null)) {
      regrasPorFonte.set(chave, regras)
      nomePorFonte.set(chave, (p.nome as string) ?? (p.slug as string))
    }
  }
  const REGRAS_OMISSAS: Regras = {
    saidasPct: [75, 15, 10],
    bePips: 1,
    trailingArranca: null,
    trailingDistancia: null,
    stopMaximoPips: opts?.stopMaximoPips ?? null,
  }

  // ── as velas, um símbolo de cada vez ────────────────────────────────────────
  const simbolos = [...new Set(uteis.map((s) => String(s.symbol)))]
  const velasPorSimbolo = new Map<string, Vela[]>()
  const semVelas: string[] = []
  for (const sym of simbolos) {
    const v = await velasDoSimbolo(contaId, sym, de, new Date())
    if (v.length) velasPorSimbolo.set(sym, v)
    else semVelas.push(sym)
  }

  // ── a reposição ─────────────────────────────────────────────────────────────
  const trades: TradeReconstruida[] = []
  const semEntradaPorFonte = new Map<string, number>()

  for (const s of uteis) {
    const velas = velasPorSimbolo.get(String(s.symbol))
    if (!velas) continue
    const fonte = String(s.source_key)
    const t = reporSinal(
      {
        id: String(s.id),
        fonte,
        symbol: String(s.symbol),
        direction: s.direction === 'sell' ? 'sell' : 'buy',
        entry: Number(s.entry),
        sl: Number(s.sl),
        tps: (s.tps as number[]).map(Number),
        created_at: s.created_at as string,
      },
      velas,
      regrasPorFonte.get(fonte) ?? REGRAS_OMISSAS,
    )
    if (!t) {
      semEntradaPorFonte.set(fonte, (semEntradaPorFonte.get(fonte) ?? 0) + 1)
      continue
    }
    // Última rede: um resultado acima do tecto do símbolo é erro de dados que passou às outras
    // verificações, não um ganho. Entra na contagem dos incoerentes, não na média.
    if (Math.abs(t.pips) > tectoDePips(t.symbol)) {
      incoerentesPorFonte.set(fonte, (incoerentesPorFonte.get(fonte) ?? 0) + 1)
      continue
    }
    // Uma estratégia que mudou de conta/mercado não conta o que era antes — ver `MEDE_DESDE`.
    const inicio = medeDesde(fonte)
    if (inicio && t.fechadaEm < inicio) continue
    trades.push(t)
  }

  // ── o somatório ─────────────────────────────────────────────────────────────
  const porFonte = new Map<string, TradeReconstruida[]>()
  for (const t of trades) porFonte.set(t.fonte, [...(porFonte.get(t.fonte) ?? []), t])

  const resultado: DesempenhoReconstruido[] = [...porFonte.entries()].map(([fonte, ts]) => {
    const pipsTotal = ts.reduce((a, t) => a + t.pips, 0)
    const ganhas = ts.filter((t) => t.pips > 0).length
    const datas = ts.map((t) => t.fechadaEm).sort()
    return {
      fonte,
      nome: nomePorFonte.get(fonte) ?? fonte,
      trades: ts.length,
      comParciais: ts.filter((t) => t.saidas.length > 1).length,
      acertoPct: Math.round((ganhas / ts.length) * 1000) / 10,
      pipsTotal: Math.round(pipsTotal * 10) / 10,
      pipsMedia: Math.round((pipsTotal / ts.length) * 10) / 10,
      semEntrada: semEntradaPorFonte.get(fonte) ?? 0,
      incoerentes: incoerentesPorFonte.get(fonte) ?? 0,
      desde: datas[0] ?? null,
      ate: datas[datas.length - 1] ?? null,
      reconstruido: true,
    }
  })
  resultado.sort((a, b) => b.trades - a.trades)

  return { porFonte: resultado, trades, simbolosSemVelas: semVelas, asOf: new Date().toISOString() }
}

/** Onde o resultado fica guardado, para os ecrãs não terem de o recalcular. */
export const CHAVE_RECONSTRUCAO = 'desempenho_reconstruido'

export async function guardarReconstrucao(r: ResultadoReconstrucao): Promise<void> {
  await getSupabaseAdmin()
    .from('site_settings')
    .upsert(
      {
        key: CHAVE_RECONSTRUCAO,
        // As trades individuais não vão para aqui: são milhares de linhas e o que os ecrãs
        // mostram é o somatório. Quem quiser o detalhe volta a correr a reposição.
        value: JSON.stringify({ porFonte: r.porFonte, simbolosSemVelas: r.simbolosSemVelas, asOf: r.asOf }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
}

export async function lerReconstrucao(): Promise<{
  porFonte: DesempenhoReconstruido[]
  asOf: string | null
} | null> {
  const { data } = await getSupabaseAdmin()
    .from('site_settings')
    .select('value')
    .eq('key', CHAVE_RECONSTRUCAO)
    .maybeSingle()
  if (!data?.value) return null
  try {
    const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
    return { porFonte: (v.porFonte ?? []) as DesempenhoReconstruido[], asOf: (v.asOf as string) ?? null }
  } catch {
    return null
  }
}

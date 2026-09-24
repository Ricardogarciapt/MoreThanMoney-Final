/**
 * «TODAS AS CONFIRMAÇÕES» DO MTM SCANNER — a regra, num sítio só.
 *
 * Pedido do dono (24/09): «as entradas de mtm scanner devem ser passadas para a conta que criaste
 * de 10k mas apenas as que tiverem todas as confirmações».
 *
 * O QUE SÃO AS CONFIRMAÇÕES, ao certo. O Pine do scanner (docs/pine/mtm-scanner-v3.5.pine, l. 366)
 * monta sempre o mesmo objecto no alerta, com TRÊS chaves e mais nenhuma:
 *
 *     "confirmations": { "DEMA 15>50": bool, "DEMA 50>238": bool, "Acima POC": bool }
 *
 * Verificado contra os 16 105 alertas do `MTMScanner` dos últimos 60 dias em `tradingview_signals`:
 * 16 105 em 16 105 trazem exactamente estas três chaves. Portanto «todas» = **3 de 3**.
 *
 * O DETALHE QUE MUDA TUDO: as três são condições BULLISH ABSOLUTAS, não «a favor do sinal».
 * Numa venda, `DEMA 15>50 = true` é tendência CONTRA a venda. Os números confirmam-no: nos 60 dias
 * não há uma única compra com 0/3 nem uma única venda com 3/3 — as compras vivem em 1..3 e as
 * vendas em 0..2. Ler «todas as confirmações» ao pé da letra (3 verdadeiras) aceitaria só compras
 * e nunca nenhuma venda; ler «todas a favor» aceita a compra com 3/3 e a venda com 0/3.
 *
 * Por isso este ficheiro conta as duas coisas separadamente — `verdadeiras` (a leitura literal, a
 * mesma que `confirmationsPassed` do webhook devolve) e `aFavor` (alinhadas com a direcção) — e o
 * modo é uma escolha explícita de quem chama, nunca um palpite enterrado no código.
 *
 * Esta é a ÚNICA casa da regra. Quem precisar dela chama daqui.
 */

export type ModoConfirmacoes = 'alinhadas' | 'literal'

/** As três chaves que o Pine v3.5 manda. Documental: a leitura é pelo objecto, não por esta lista. */
export const CHAVES_CONFIRMACOES_SCANNER = ['DEMA 15>50', 'DEMA 50>238', 'Acima POC'] as const

/** Quantas confirmações o alerta traz e como estão. `null` quando o alerta não traz nenhuma. */
export interface LeituraConfirmacoes {
  /** Quantas confirmações o payload declara (3 no Pine v3.5). */
  total: number
  /** Quantas estão a `true` — medida bullish absoluta (igual a `confirmationsPassed`). */
  verdadeiras: number
  /** Quantas estão a favor da direcção do sinal: numa compra as `true`, numa venda as `false`. */
  aFavor: number
}

type Json = Record<string, unknown>

function paraBooleano(v: unknown): boolean {
  return (
    v === true ||
    v === 1 ||
    (typeof v === 'string' && /^(true|1|yes|sim|ok|pass|passed|✅)$/i.test(v.trim()))
  )
}

function direcaoNormalizada(direcao: string | null | undefined): 'buy' | 'sell' | null {
  const d = String(direcao ?? '').trim().toLowerCase()
  if (d === 'buy' || d === 'long' || d === 'compra') return 'buy'
  if (d === 'sell' || d === 'short' || d === 'venda') return 'sell'
  return null
}

/**
 * Lê o bloco `confirmations` do payload do TradingView.
 * Devolve `null` quando o alerta não traz confirmações nenhumas — que é diferente de trazer zero
 * a passar: sem informação não se decide nada, e quem chama é que escolhe o que fazer com isso.
 */
export function lerConfirmacoes(
  raw: Json | null | undefined,
  direcao: string | null | undefined,
): LeituraConfirmacoes | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const src = (raw as Json).confirmations
  let valores: boolean[] | null = null

  if (src && typeof src === 'object' && !Array.isArray(src)) {
    const vals = Object.values(src as Json)
    valores = vals.length ? vals.map(paraBooleano) : null
  } else if (Array.isArray(src)) {
    const arr = src as Array<Json>
    valores = arr.length ? arr.map((c) => paraBooleano(c.passed ?? c.value ?? c.status)) : null
  }

  if (!valores) return null
  const verdadeiras = valores.filter(Boolean).length
  const dir = direcaoNormalizada(direcao)
  // Sem direcção conhecida não se inverte nada: fica a leitura literal.
  const aFavor = dir === 'sell' ? valores.length - verdadeiras : verdadeiras
  return { total: valores.length, verdadeiras, aFavor }
}

export interface ResultadoConfirmacoes {
  /** Passa o filtro «todas as confirmações»? */
  ok: boolean
  /** Porque não, em português, para ir para o registo/sombra. */
  motivo?: string
  leitura: LeituraConfirmacoes | null
}

export interface OpcoesConfirmacoes {
  /**
   * `alinhadas` (por omissão): todas a favor da direcção — compra 3/3 a `true`, venda 3/3 a `false`.
   * `literal`: todas a `true`, seja qual for a direcção — na prática, só compras.
   */
  modo?: ModoConfirmacoes
  /** Quantas confirmações o alerta TEM de trazer para sequer ser considerado (3 no Pine v3.5). */
  minimoTotal?: number
}

/**
 * «Tem todas as confirmações?» — a pergunta do dono, numa função só.
 *
 * Exige que o alerta traga confirmações (sem elas não há como saber) e que TODAS estejam do lado
 * do sinal. Não olha a símbolo, timeframe nem direcção preferida: essas regras já vivem no
 * `passesExecGate`/`passesQualityGate` e continuam a aplicar-se a jusante.
 */
export function temTodasAsConfirmacoes(
  raw: Json | null | undefined,
  direcao: string | null | undefined,
  opcoes: OpcoesConfirmacoes = {},
): ResultadoConfirmacoes {
  const modo = opcoes.modo ?? 'alinhadas'
  const minimoTotal = opcoes.minimoTotal ?? CHAVES_CONFIRMACOES_SCANNER.length
  const leitura = lerConfirmacoes(raw, direcao)

  if (!leitura) return { ok: false, motivo: 'alerta sem confirmações', leitura: null }
  if (leitura.total < minimoTotal) {
    return { ok: false, motivo: `só ${leitura.total} confirmações (esperadas ${minimoTotal})`, leitura }
  }

  const contadas = modo === 'literal' ? leitura.verdadeiras : leitura.aFavor
  if (contadas < leitura.total) {
    const rotulo = modo === 'literal' ? 'verdadeiras' : 'a favor'
    return { ok: false, motivo: `${contadas}/${leitura.total} ${rotulo} — faltam confirmações`, leitura }
  }
  return { ok: true, leitura }
}

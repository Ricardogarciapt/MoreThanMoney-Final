/**
 * AS CONTAS DE PORTEFÓLIO DA CASA — carteira, equity, métricas e diário a partir dos MOVIMENTOS.
 *
 * Duas contas (`PORTF-CRIPTO` e `PORTF-ETF`, migração 173, `conta_portefolio = true`) são capital
 * do dono reconstituído desde 1 de Março de 2024, com reforço semanal às sextas. O que elas fizeram
 * vive em `portefolio_movimentos` (2 139 + 1 215 linhas) e a curva em `portefolio_curva` — NÃO em
 * `funded_positions`, e isso fica como está: `funded_positions.symbol` tem FK para `funded_symbols`
 * e meter SPY/XRPUSDT no catálogo da corretora punha-os na lista de negociáveis do WebTrader e de
 * volta ao motor de preços, que foi deliberadamente podado.
 *
 * ── UM DEFEITO, TRÊS SINTOMAS ───────────────────────────────────────────────────────────────
 * O ecrã da conta lia a tabela errada, e isso aparecia em três sítios:
 *  1. o separador Histórico somava ZERO tendo 2 139 movimentos na base;
 *  2. o «Flutuante» dava 0,00 — não há posições abertas em `funded_positions`;
 *  3. e por consequência a EQUITY saía igual ao saldo. A conta Cripto está 2 632 $ ABAIXO do
 *     contribuído e o detalhe apresentava-a como se estivesse a zero. Mostrar uma perda como se
 *     não existisse é pior do que não mostrar nada.
 *
 * A lista do seletor mostrava o número CERTO (4 598) porque lê `sim_equity` directamente. A
 * divergência entre os dois ecrãs era essa: um LIA a equity gravada, o outro CALCULAVA-A a partir
 * de uma tabela vazia. `estadoDePortefolio` acaba com o cálculo nestas contas.
 *
 * Puro: sem React, sem base, sem imports. Testado em lib/mtmfunded/portefolio.check.ts.
 */

/** A conta é uma CARTEIRA reconstituída? (coluna `conta_portefolio`, migração 173.) */
export function ehContaPortefolio(linha: object | null | undefined): boolean {
  return (linha as { conta_portefolio?: unknown } | null | undefined)?.conta_portefolio === true
}

/** Uma linha de `portefolio_movimentos`, como a base a tem. */
export interface MovimentoPortefolio {
  id?: string
  symbol: string
  tipo: string
  data: string
  unidades: number | string | null
  preco: number | string | null
  valor: number | string | null
  motivo?: string | null
}

/** Um ponto de `portefolio_curva`. */
export interface PontoCurvaPortefolio {
  data: string
  contribuido: number | string | null
  valor: number | string | null
}

const n = (v: unknown, d = 0): number => {
  const x = Number(v)
  return v == null || v === '' || !Number.isFinite(x) ? d : x
}
const r2 = (x: number) => Math.round(x * 100) / 100

/** Compra ou venda. Qualquer outra coisa não se adivinha: não entra nas somas. */
export type TipoMovimento = 'compra' | 'venda'

export function tipoDoMovimento(m: { tipo?: unknown }): TipoMovimento | null {
  const t = String(m?.tipo ?? '').trim().toLowerCase()
  return t === 'compra' || t === 'venda' ? t : null
}

/**
 * A EQUITY E O FLUTUANTE de uma conta de portefólio — lidos, não calculados.
 *
 * `saldo` é o CONTRIBUÍDO (`sim_saldo`) e `valorDeMercado` o valor de hoje (`sim_equity`, escrito
 * pela reconstituição e a mesma fonte que a lista do seletor já lia certo). O flutuante é a
 * diferença: é ele que diz os −2 632 $ da conta Cripto.
 *
 * Devolve `null` quando não há valor de mercado gravado — e aí quem chama MANTÉM o estado do motor
 * em vez de inventar um número. Preferir um `null` a um palpite é a diferença entre um ecrã mudo e
 * um ecrã que mente.
 *
 * Porque não se soma o valor dos movimentos em vez disto: o valor de mercado precisa das cotações
 * de hoje de 27 activos de duas fontes externas, e o motor de preços da casa foi podado para não
 * as conhecer. Os movimentos dizem o que foi COMPRADO e a QUE PREÇO; quanto vale hoje está gravado.
 */
export function estadoDePortefolio(
  saldo: number,
  valorDeMercado: number | null | undefined,
): { flutuante: number; equity: number; margem: number; margemLivre: number; nivelMargemPct: number | null; semPreco: string[] } | null {
  const valor = Number(valorDeMercado)
  if (valorDeMercado == null || !Number.isFinite(valor) || valor <= 0) return null
  const equity = r2(valor)
  return {
    flutuante: r2(equity - r2(saldo)),
    equity,
    // Uma carteira à vista não tem margem nem alavancagem: os campos existem, valem zero, e é
    // melhor dizê-lo do que deixar o ecrã mostrar a margem de outra conta.
    margem: 0,
    margemLivre: equity,
    nivelMargemPct: null,
    semPreco: [],
  }
}

/** Uma posição da carteira: o que está lá dentro hoje, somado dos movimentos. */
export interface LinhaCarteira {
  symbol: string
  /** Unidades compradas menos vendidas. */
  unidades: number
  /** Dinheiro posto (compras) menos devolvido (vendas) — o custo do que ainda lá está. */
  investido: number
  comprado: number
  vendido: number
  /** Preço médio de compra: dinheiro das compras / unidades compradas. `null` sem compras. */
  precoMedio: number | null
  reforcos: number
  primeira: string | null
  ultima: string | null
  /** true = a posição foi toda vendida (a limpeza de 01/10/2026 fechou 13 activos). */
  fechada: boolean
}

/**
 * A CARTEIRA, símbolo a símbolo. Ordenada pelo investido (o maior primeiro): é a ordem pela qual
 * se olha uma carteira, e não a alfabética.
 */
export function carteiraDoPortefolio(movimentos: MovimentoPortefolio[] | null | undefined): LinhaCarteira[] {
  const por = new Map<string, LinhaCarteira & { unidadesCompradas: number }>()
  for (const m of movimentos ?? []) {
    const tipo = tipoDoMovimento(m)
    if (!tipo) continue
    const symbol = String(m.symbol ?? '').trim()
    if (!symbol) continue
    const l = por.get(symbol) ?? {
      symbol, unidades: 0, investido: 0, comprado: 0, vendido: 0, precoMedio: null,
      reforcos: 0, primeira: null, ultima: null, fechada: false, unidadesCompradas: 0,
    }
    const unidades = n(m.unidades)
    const valor = n(m.valor)
    const data = String(m.data ?? '')
    if (tipo === 'compra') {
      l.unidades += unidades
      l.unidadesCompradas += unidades
      l.comprado += valor
      l.reforcos += 1
      if (data && (!l.primeira || data < l.primeira)) l.primeira = data
      if (data && (!l.ultima || data > l.ultima)) l.ultima = data
    } else {
      l.unidades -= unidades
      l.vendido += valor
    }
    por.set(symbol, l)
  }
  return [...por.values()]
    .map(({ unidadesCompradas, ...l }) => ({
      ...l,
      unidades: r2(l.unidades),
      comprado: r2(l.comprado),
      vendido: r2(l.vendido),
      investido: r2(l.comprado - l.vendido),
      precoMedio: unidadesCompradas > 0 ? l.comprado / unidadesCompradas : null,
      // Arredondar as unidades a 2 casas fecharia um XRP de 0,004: a decisão mede-se nas cruas.
      fechada: l.unidades <= 1e-9,
    }))
    .sort((a, b) => b.comprado - a.comprado)
}

/** As MÉTRICAS da conta — tudo saído dos movimentos e da curva, nada estimado. */
export interface ResumoPortefolio {
  /** Dinheiro posto em compras, ao todo. */
  comprado: number
  /** Dinheiro recebido de vendas, ao todo. */
  vendido: number
  /** O que a conta diz ter contribuído (`sim_saldo`). */
  contribuido: number
  /** Valor de mercado gravado (`sim_equity`). `null` = sem valor gravado. */
  valor: number | null
  resultado: number | null
  resultadoPct: number | null
  compras: number
  vendas: number
  movimentos: number
  activos: number
  activosAbertos: number
  activosFechados: number
  /** Primeira e última data com movimento. */
  de: string | null
  ate: string | null
  /** Semanas distintas com reforço — o DCA, contado e não escrito à mão. */
  semanasComReforco: number
  /** O reforço médio por semana com compras. `null` sem semanas. */
  reforcoMedioSemanal: number | null
  /** O pico e o vale da curva (valor de mercado), para o Diário dizer o caminho. */
  picoValor: { data: string; valor: number } | null
  valeValor: { data: string; valor: number } | null
  pontosDeCurva: number
}

/** A semana ISO «2024-W10» de uma data `YYYY-MM-DD`. Agrupa o DCA sem depender do fuso. */
export function semanaDe(data: string): string {
  const [a, m, d] = String(data).split('-').map((x) => Number(x))
  if (!a || !m || !d) return String(data)
  const dt = new Date(Date.UTC(a, m - 1, d))
  // Quinta-feira da mesma semana ISO: é a regra que faz 29/12 e 01/01 caírem no ano certo.
  const dia = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dia)
  const ano = dt.getUTCFullYear()
  const um = Date.UTC(ano, 0, 1)
  const semana = Math.ceil(((dt.getTime() - um) / 86_400_000 + 1) / 7)
  return `${ano}-W${String(semana).padStart(2, '0')}`
}

export function resumoDoPortefolio(
  movimentos: MovimentoPortefolio[] | null | undefined,
  curva: PontoCurvaPortefolio[] | null | undefined,
  conta: { contribuido?: number | null; valorDeMercado?: number | null },
): ResumoPortefolio {
  const movs = movimentos ?? []
  const carteira = carteiraDoPortefolio(movs)
  let comprado = 0
  let vendido = 0
  let compras = 0
  let vendas = 0
  let de: string | null = null
  let ate: string | null = null
  const semanas = new Set<string>()
  for (const m of movs) {
    const tipo = tipoDoMovimento(m)
    if (!tipo) continue
    const valor = n(m.valor)
    const data = String(m.data ?? '')
    if (tipo === 'compra') {
      comprado += valor
      compras += 1
      if (data) semanas.add(semanaDe(data))
    } else {
      vendido += valor
      vendas += 1
    }
    if (data && (!de || data < de)) de = data
    if (data && (!ate || data > ate)) ate = data
  }

  const contribuido = r2(n(conta.contribuido))
  const vm = Number(conta.valorDeMercado)
  const valor = conta.valorDeMercado == null || !Number.isFinite(vm) ? null : r2(vm)

  let pico: { data: string; valor: number } | null = null
  let vale: { data: string; valor: number } | null = null
  for (const p of curva ?? []) {
    const v = n(p.valor)
    const data = String(p.data ?? '')
    if (!data) continue
    if (!pico || v > pico.valor) pico = { data, valor: r2(v) }
    if (!vale || v < vale.valor) vale = { data, valor: r2(v) }
  }

  return {
    comprado: r2(comprado),
    vendido: r2(vendido),
    contribuido,
    valor,
    resultado: valor == null ? null : r2(valor - contribuido),
    resultadoPct: valor == null || contribuido <= 0 ? null : r2((valor / contribuido - 1) * 100),
    compras,
    vendas,
    movimentos: compras + vendas,
    activos: carteira.length,
    activosAbertos: carteira.filter((l) => !l.fechada).length,
    activosFechados: carteira.filter((l) => l.fechada).length,
    de,
    ate,
    semanasComReforco: semanas.size,
    reforcoMedioSemanal: semanas.size > 0 ? r2(comprado / semanas.size) : null,
    picoValor: pico,
    valeValor: vale,
    pontosDeCurva: (curva ?? []).length,
  }
}

/** Um dia do DIÁRIO: o que a carteira fez naquela data, somado. */
export interface DiaPortefolio {
  data: string
  semana: string
  compras: number
  vendas: number
  investido: number
  recebido: number
  simbolos: string[]
  /** Os motivos declarados nas vendas (a limpeza de 01/10/2026 trouxe-os escritos). */
  motivos: string[]
}

/**
 * O DIÁRIO — um dia por linha, do mais recente para o mais antigo.
 *
 * O diário de uma carteira não é o de um trader: não há entradas e saídas com emoção, há um
 * reforço semanal. Por isso agrupa-se por DATA e diz-se o que entrou nela, em vez de listar 2 139
 * linhas que ninguém lê.
 */
export function diarioDoPortefolio(movimentos: MovimentoPortefolio[] | null | undefined): DiaPortefolio[] {
  const por = new Map<string, DiaPortefolio>()
  for (const m of movimentos ?? []) {
    const tipo = tipoDoMovimento(m)
    if (!tipo) continue
    const data = String(m.data ?? '')
    if (!data) continue
    const d = por.get(data) ?? { data, semana: semanaDe(data), compras: 0, vendas: 0, investido: 0, recebido: 0, simbolos: [], motivos: [] }
    const symbol = String(m.symbol ?? '').trim()
    if (symbol && !d.simbolos.includes(symbol)) d.simbolos.push(symbol)
    const motivo = String(m.motivo ?? '').trim()
    if (motivo && !d.motivos.includes(motivo)) d.motivos.push(motivo)
    if (tipo === 'compra') { d.compras += 1; d.investido += n(m.valor) } else { d.vendas += 1; d.recebido += n(m.valor) }
    por.set(data, d)
  }
  return [...por.values()]
    .map((d) => ({ ...d, investido: r2(d.investido), recebido: r2(d.recebido), simbolos: [...d.simbolos].sort() }))
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
}

/**
 * O HISTÓRICO — os movimentos como se mostram: mais recentes primeiro, e o valor com sinal.
 *
 * Uma compra é dinheiro que SAI da conta para dentro do activo (negativo em caixa) e uma venda é
 * dinheiro que entra. O sinal poupa uma coluna e tira a dúvida de quem lê.
 */
export interface LinhaHistoricoPortefolio {
  id: string
  data: string
  symbol: string
  tipo: TipoMovimento
  unidades: number
  preco: number
  valor: number
  /** Negativo nas compras, positivo nas vendas. */
  caixa: number
  motivo: string | null
}

export function historicoDoPortefolio(movimentos: MovimentoPortefolio[] | null | undefined): LinhaHistoricoPortefolio[] {
  const out: LinhaHistoricoPortefolio[] = []
  for (const m of movimentos ?? []) {
    const tipo = tipoDoMovimento(m)
    if (!tipo) continue
    const valor = r2(n(m.valor))
    out.push({
      id: String(m.id ?? `${m.symbol}-${m.data}-${valor}`),
      data: String(m.data ?? ''),
      symbol: String(m.symbol ?? ''),
      tipo,
      unidades: n(m.unidades),
      preco: n(m.preco),
      valor,
      caixa: tipo === 'compra' ? -valor : valor,
      motivo: m.motivo == null || String(m.motivo).trim() === '' ? null : String(m.motivo),
    })
  }
  return out.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.symbol.localeCompare(b.symbol)))
}

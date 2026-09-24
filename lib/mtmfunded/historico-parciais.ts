/**
 * UMA TRADE, E NÃO TRÊS — as saídas parciais do histórico das apps, juntas na posição a que pertencem.
 *
 * O separador de Histórico empilhava uma linha por cada linha de `funded_positions` com
 * `estado='fechada'`. Mas um parcial é uma FILHA: a posição sai a 1/3 no TP1, a 1/3 no TP2 e o
 * resto volta ao breakeven, e isso são três linhas com o mesmo `mae_id`. O ecrã mostrava três
 * trades e dois ganhos onde o Diário, as Estatísticas e o ecrã de Estratégias mostravam uma trade
 * e um ganho. Como os parciais são quase sempre ganhos, o erro só empurrava a taxa de acerto para
 * cima — uma conta com gestão a sério parecia melhor do que era, exactamente no ecrã onde o
 * cliente vai confirmar se o sistema funciona.
 *
 * A convenção é a mesma de `lib/mtmfunded/simulado/estatisticas.ts`, e é dela que este ficheiro é
 * irmão:
 *  · raiz = `mae_id ?? id`; a trade é a raiz mais as filhas;
 *  · o resultado é LÍQUIDO (pnl + swap − comissão) e soma todas as partes — 50 % a +300 e 50 % a
 *    −400 é uma perda de 100, não uma vitória e uma derrota;
 *  · os pips são PESADOS pelo volume de cada saída: sair de 2/3 a +40 e de 1/3 a −10 não é «+15»;
 *  · só conta para a taxa de acerto quando a RAIZ já fechou. Um parcial com o resto aberto já
 *    mexeu no saldo (e por isso entra no dinheiro e na curva) mas ainda não ganhou nem perdeu.
 *
 * IGUAL nos dois repositórios (o separador de Histórico da MTM Auto tem exactamente o mesmo
 * defeito e a mesma correcção) — verificado por `lib/__tests__/paridade-repositorios.check.ts`.
 *
 * Puro de propósito: o teste chama-o com linhas à mão, sem base de dados.
 */

export interface ParteFechada {
  id: string
  mae_id: string | null
  account_id: string
  symbol: string
  direcao: string | null
  volume: number | null
  preco_entrada: number | null
  preco_fecho: number | null
  pnl: number | null
  comissao: number | null
  swap: number | null
  aberta_em: string | null
  fechada_em: string
}

export interface TradeAgrupada {
  raiz: string
  accountId: string
  symbol: string
  direcao: string | null
  /** O fecho MAIS RECENTE das partes: é quando a trade (ou o que dela se realizou) acabou. */
  quando: string
  /** A abertura da raiz, quando é conhecida — é por ela que se mede o viés do preço de entrada. */
  entrada: string | null
  /** Resultado líquido somado de todas as partes. */
  resultado: number
  /** Pips pesados pelo volume, ou `null` quando nenhuma parte tem preço de fecho. */
  pips: number | null
  /** A raiz fechou? Se não, isto é um parcial de uma posição ainda viva. */
  terminada: boolean
  /** Quantas saídas é que esta trade teve. 1 = saiu de uma vez. */
  partes: number
}

const liquidoDe = (p: ParteFechada) =>
  Number(p.pnl ?? 0) + Number(p.swap ?? 0) - Number(p.comissao ?? 0)

/**
 * Agrupa as partes fechadas em trades.
 *
 * @param partes     linhas de `funded_positions` com `estado='fechada'` dentro da janela.
 * @param raizFechada ids de raízes que se sabe estarem fechadas. A raiz de um parcial pode ter
 *   fechado FORA da janela — ou ainda estar aberta — e nesse caso não vem em `partes`. Quem chama
 *   é que sabe ir perguntar; aqui assume-se que o que não está nesta lista **não** fechou, que é o
 *   lado seguro: uma trade a menos na taxa de acerto é melhor do que um ganho que ainda não é um.
 * @param pipSize    o tamanho do pip do símbolo (`pipSizeForSymbol`), injectado para isto ficar puro.
 */
export function agruparParciais(
  partes: ParteFechada[],
  raizFechada: ReadonlySet<string>,
  pipSize: (symbol: string) => number,
): TradeAgrupada[] {
  const porRaiz = new Map<string, ParteFechada[]>()
  for (const p of partes) {
    const raiz = String(p.mae_id ?? p.id)
    porRaiz.set(raiz, [...(porRaiz.get(raiz) ?? []), p])
  }

  const trades: TradeAgrupada[] = []
  for (const [raiz, ps] of porRaiz) {
    // A mãe é quem tem o preço de ENTRADA e a direcção; uma filha herda-os mas pode trazê-los
    // vazios. Sem mãe à vista (fechou fora da janela) usa-se a parte mais antiga, que é a que
    // menos se afasta dela.
    const mae =
      ps.find((p) => String(p.id) === raiz) ??
      [...ps].sort((a, b) => String(a.fechada_em).localeCompare(String(b.fechada_em)))[0]
    const pip = pipSize(String(mae.symbol)) || 1
    const entradaMae = Number(mae.preco_entrada)

    let volume = 0
    let somaPips = 0
    for (const p of ps) {
      if (p.preco_fecho == null || !Number.isFinite(entradaMae)) continue
      // Volume ausente conta como 1: sem ele não há como pesar, e dar peso zero a uma saída era
      // deixá-la fora da conta em silêncio.
      const v = Math.abs(Number(p.volume ?? 0)) || 1
      const d =
        mae.direcao === 'buy'
          ? Number(p.preco_fecho) - entradaMae
          : entradaMae - Number(p.preco_fecho)
      volume += v
      somaPips += (d / pip) * v
    }

    trades.push({
      raiz,
      accountId: String(mae.account_id),
      symbol: String(mae.symbol),
      direcao: mae.direcao ?? null,
      quando: ps.map((p) => String(p.fechada_em)).sort().pop() ?? String(mae.fechada_em),
      entrada: mae.aberta_em ? String(mae.aberta_em) : null,
      resultado: Math.round(ps.reduce((a, p) => a + liquidoDe(p), 0) * 100) / 100,
      pips: volume > 0 ? Math.round((somaPips / volume) * 10) / 10 : null,
      terminada: raizFechada.has(raiz),
      partes: ps.length,
    })
  }
  return trades
}

/**
 * As raízes que `partes` não explica sozinha — as que é preciso ir perguntar à base.
 *
 * Uma raiz que venha no lote (linha sem `mae_id`) já se sabe fechada; as outras podem estar
 * abertas ou ter fechado antes da janela, e não há como saber sem perguntar.
 */
export function raizesPorConfirmar(partes: ParteFechada[]): { conhecidas: Set<string>; emFalta: string[] } {
  const conhecidas = new Set(partes.filter((p) => !p.mae_id).map((p) => String(p.id)))
  const todas = new Set(partes.map((p) => String(p.mae_id ?? p.id)))
  return { conhecidas, emFalta: [...todas].filter((r) => !conhecidas.has(r)) }
}

/** A entrada mais antiga do lote — é por ela que se decide se a ressalva do preço viciado aparece. */
export function entradaMaisAntiga(trades: TradeAgrupada[]): string | null {
  let min: string | null = null
  for (const t of trades) {
    if (t.entrada && (!min || t.entrada < min)) min = t.entrada
  }
  return min
}

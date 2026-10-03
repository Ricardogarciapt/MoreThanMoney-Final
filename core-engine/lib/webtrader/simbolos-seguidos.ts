/**
 * QUE SÍMBOLOS VALE A PENA ALIMENTAR COM PREÇO.
 *
 * ═══ O QUE ESTAVA MEDIDO A 01/10/2026 ══════════════════════════════════════════════════════
 *
 * `funded_precos` tinha 201 símbolos. Destes:
 *   · 46 vivos (tick de menos de cinco minutos) — os que a casa negoceia;
 *   · 155 parados há mais de uma hora, 80 deles há mais de uma semana. O mais antigo de 5 de
 *     Junho, quase quatro meses;
 *   · e apenas 22 símbolos tinham ALGUMA VEZ sido negociados — posição, ordem, espelho ou sinal.
 *
 * Os outros existiam porque alguém podia abrir a página do catálogo. Cada um custa escrita, e foi
 * escrita a mais que já pôs a instância em baixo uma vez (ver `lib/cripto-seguida.ts`).
 *
 * ═══ A REGRA, E O QUE ELA NUNCA PODE FAZER ═════════════════════════════════════════════════
 *
 * Fica quem está VIVO ou quem tem ACTIVIDADE. A segunda metade não é zelo: o GBPAUD tem posições
 * e o preço dele estava parado há dias. Um corte feito só pela frescura — que é o reflexo — tirava
 * o preço a um símbolo com posições abertas, e quem as tem via o gráfico vazio sem perceber porquê.
 *
 * Por isso a actividade GANHA sempre à frescura, e nunca ao contrário.
 */

export interface EntradaDeFeed {
  symbol: string
  /** A hora da última leitura. */
  em?: string | number | Date | null
}

/** Quanto tempo sem tick ainda conta como vivo, para efeitos de PODA (não de ecrã). */
export const VIVO_SEGUNDOS = 15 * 60

function norm(s: unknown): string {
  return String(s ?? '').trim().toUpperCase()
}

export interface Decisao {
  manter: string[]
  remover: string[]
  /** Os que só se salvam por terem actividade. São a prova de que a regra da frescura não bastava. */
  salvosPelaActividade: string[]
}

/**
 * Decide o que fica no feed.
 *
 * `comActividade` são os símbolos com posição, ordem, espelho ou sinal — lidos da base por quem
 * chama. Esta função não vai buscar nada, para o caso mau poder ser provado sem base nenhuma.
 */
export function decidirFeed(
  feed: EntradaDeFeed[],
  comActividade: Iterable<string>,
  agora: Date = new Date(),
): Decisao {
  const activos = new Set([...comActividade].map(norm).filter(Boolean))
  const manter: string[] = []
  const remover: string[] = []
  const salvos: string[] = []

  for (const linha of feed) {
    const s = norm(linha?.symbol)
    if (!s) continue
    const t = linha.em instanceof Date ? linha.em.getTime()
      : typeof linha.em === 'number' ? linha.em
      : Date.parse(String(linha.em ?? ''))
    const vivo = Number.isFinite(t) && (agora.getTime() - t) / 1000 <= VIVO_SEGUNDOS
    const temActividade = activos.has(s)

    if (vivo || temActividade) {
      manter.push(s)
      // Parado MAS negociado: é este o caso que a regra existe para apanhar.
      if (!vivo && temActividade) salvos.push(s)
    } else {
      remover.push(s)
    }
  }
  return { manter, remover, salvosPelaActividade: salvos }
}

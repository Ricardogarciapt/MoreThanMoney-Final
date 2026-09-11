/**
 * O motor de regras das contas de torneio e de desafio.
 *
 * Uma conta morre por três razões, e todas são medidas sobre EQUITY — o flutuante conta.
 * Medir a saldo deixa passar quem está a −40% com a posição aberta e fecha só quando ele
 * decide fechar; é o buraco clássico dos challenges caseiros.
 *
 *   1. PERDA DIÁRIA — a equity cai abaixo de (saldo de fecho do dia anterior − X%).
 *   2. PERDA MÁXIMA — a equity cai abaixo de (saldo inicial − Y%).
 *   3. CONSISTÊNCIA — nenhum dia pode valer mais do que Z% do lucro total. É a regra que
 *      separa um trader de alguém que teve um dia de sorte com o lote todo.
 *
 * Quebrar mata a conta: as métricas CONGELAM no instante da quebra e a conta sai da MetaApi.
 * Congelar não é castigo, é honestidade — a classificação passa a mostrar onde ele estava
 * quando quebrou, e não o que a conta fez a andar à deriva depois disso.
 */

export interface RegrasConta {
  /** Perda diária máxima, em % do saldo de referência do dia. */
  perda_diaria_pct: number
  /** Perda máxima total, em % do saldo inicial. */
  perda_maxima_pct: number
  /** Dias mínimos de negociação para o resultado contar. */
  dias_minimos?: number
  /** Fatia máxima do lucro total que um único dia pode representar (%). 0 = sem regra. */
  consistencia_pct?: number
  /** Máximo de dias que a conta dura. 0 = sem limite. */
  dias_maximos?: number
  /**
   * Lucro que passa a fase, em %. Só existe nos DESAFIOS — um torneio não se «passa», e por
   * isso o motor de regras não o usa para nada: quem o lê é o cron, para saber quando emitir
   * o certificado de conclusão.
   */
  objetivo_pct?: number
}

export interface EstadoConta {
  saldoInicial: number
  equity: number
  /** Saldo de fecho do dia anterior — a âncora da perda diária. */
  saldoReferenciaDia: number
  /** Lucro fechado por dia (YYYY-MM-DD → valor). Para a consistência. */
  lucroPorDia: Record<string, number>
  /** Dias distintos com pelo menos uma trade fechada. */
  diasNegociados: number
  /** Dias decorridos desde o arranque. */
  diasDecorridos?: number
}

export type MotivoQuebra = 'perda_diaria' | 'perda_maxima' | 'tempo_esgotado'

export interface Veredicto {
  quebrou: boolean
  motivo?: MotivoQuebra
  detalhe?: string
  /** Resultado em % sobre o saldo inicial. É por aqui que se ordena a classificação. */
  resultadoPct: number
  /** O resultado conta para a classificação? (dias mínimos e consistência cumpridos) */
  elegivel: boolean
  /** Porque não é elegível, quando não é. */
  naoElegivelPorque?: string
  /** Quanto falta até à perda diária, em moeda da conta. */
  margemDiaria: number
  /** Quanto falta até à perda máxima. */
  margemTotal: number
}

const arred = (n: number) => Math.round(n * 100) / 100

/**
 * Avalia uma conta. Função PURA: não lê nada, não escreve nada — recebe o estado e devolve
 * o veredicto. É o que permite testá-la sem MetaApi e sem base de dados.
 */
export function avaliarConta(regras: RegrasConta, estado: EstadoConta): Veredicto {
  const { saldoInicial, equity, saldoReferenciaDia } = estado

  // Sem saldo inicial não há percentagem que se calcule — e um zero aqui daria divisões
  // por zero e um "resultado" infinito na classificação.
  if (!(saldoInicial > 0)) {
    return {
      quebrou: false, resultadoPct: 0, elegivel: false,
      naoElegivelPorque: 'saldo inicial desconhecido',
      margemDiaria: 0, margemTotal: 0,
    }
  }

  const chaoDiario = saldoReferenciaDia * (1 - regras.perda_diaria_pct / 100)
  const chaoTotal = saldoInicial * (1 - regras.perda_maxima_pct / 100)
  const resultadoPct = arred(((equity - saldoInicial) / saldoInicial) * 100)

  // A ordem importa: a perda MÁXIMA é a mais grave e é a que se reporta quando as duas
  // acontecem no mesmo instante. Dizer "perda diária" a quem rebentou a conta inteira
  // descreve mal o que aconteceu.
  if (equity <= chaoTotal) {
    return {
      quebrou: true, motivo: 'perda_maxima',
      detalhe: `Equity ${arred(equity)} abaixo do mínimo de ${arred(chaoTotal)} (−${regras.perda_maxima_pct}% do saldo inicial).`,
      resultadoPct, elegivel: false, naoElegivelPorque: 'conta quebrada',
      margemDiaria: 0, margemTotal: 0,
    }
  }
  if (equity <= chaoDiario) {
    return {
      quebrou: true, motivo: 'perda_diaria',
      detalhe: `Equity ${arred(equity)} abaixo do mínimo do dia, ${arred(chaoDiario)} (−${regras.perda_diaria_pct}%).`,
      resultadoPct, elegivel: false, naoElegivelPorque: 'conta quebrada',
      margemDiaria: 0, margemTotal: arred(equity - chaoTotal),
    }
  }
  if (regras.dias_maximos && estado.diasDecorridos != null && estado.diasDecorridos > regras.dias_maximos) {
    return {
      quebrou: true, motivo: 'tempo_esgotado',
      detalhe: `Passaram ${estado.diasDecorridos} dias — o limite é ${regras.dias_maximos}.`,
      resultadoPct, elegivel: false, naoElegivelPorque: 'prazo esgotado',
      margemDiaria: arred(equity - chaoDiario), margemTotal: arred(equity - chaoTotal),
    }
  }

  // Viva. Falta saber se o resultado CONTA.
  let elegivel = true
  let porque: string | undefined

  if (regras.dias_minimos && estado.diasNegociados < regras.dias_minimos) {
    elegivel = false
    porque = `faltam ${regras.dias_minimos - estado.diasNegociados} dias de negociação`
  }

  if (elegivel && regras.consistencia_pct && regras.consistencia_pct > 0) {
    const dias = Object.values(estado.lucroPorDia)
    const lucroTotal = dias.reduce((a, x) => a + x, 0)
    // A consistência só se avalia em LUCRO: numa conta em perda, "o melhor dia vale 200%
    // do total" é aritmética sem significado, não um sinal de sorte.
    if (lucroTotal > 0) {
      const melhorDia = Math.max(0, ...dias)
      const fatia = (melhorDia / lucroTotal) * 100
      if (fatia > regras.consistencia_pct) {
        elegivel = false
        porque = `o melhor dia vale ${arred(fatia)}% do lucro (máximo ${regras.consistencia_pct}%)`
      }
    }
  }

  return {
    quebrou: false,
    resultadoPct,
    elegivel,
    naoElegivelPorque: porque,
    margemDiaria: arred(equity - chaoDiario),
    margemTotal: arred(equity - chaoTotal),
  }
}

/**
 * Ordena a classificação.
 *
 * Quem está elegível vem primeiro, por resultado. Os inelegíveis (dias a menos, consistência
 * por cumprir) aparecem a seguir, com o motivo à vista — não se escondem, mas também não
 * ficam à frente de quem cumpriu. Os quebrados vão para o fim, congelados onde pararam.
 * Empate desfaz-se pelo menor drawdown: entre dois com o mesmo lucro, ganha quem arriscou menos.
 */
export interface LinhaClassificacao {
  resultadoPct: number
  elegivel: boolean
  quebrou: boolean
  drawdownPct?: number
}

export function ordenarClassificacao<T extends LinhaClassificacao>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => {
    const grupo = (x: LinhaClassificacao) => (x.quebrou ? 2 : x.elegivel ? 0 : 1)
    if (grupo(a) !== grupo(b)) return grupo(a) - grupo(b)
    if (b.resultadoPct !== a.resultadoPct) return b.resultadoPct - a.resultadoPct
    return (a.drawdownPct ?? 0) - (b.drawdownPct ?? 0)
  })
}

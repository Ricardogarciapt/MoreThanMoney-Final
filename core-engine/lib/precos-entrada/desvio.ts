/**
 * A HORA DA CORRETORA NÃO É A HORA DO MUNDO — e isto mede a diferença sem acreditar em ninguém.
 *
 * ═══ O CASO ══════════════════════════════════════════════════════════════════════════════════
 *
 * 28/09/2026, primeira ligação do terminal do Mac: 5741 ticks recusados por «futuro», zero aceites.
 * O ficheiro do EA dizia, no mesmo instante:
 *
 *     em (hora UTC em que o EA escreveu) 17:43:17     t (time_msc do EURUSD) 20:43:15
 *
 * O `time_msc` do MT5 é a hora do SERVIDOR da corretora, e a do Mac está em GMT+3. A do VPS calha
 * estar à hora de Greenwich e por isso o problema nunca apareceu. Três horas à frente é precisamente
 * o que a guarda do futuro existe para recusar: um carimbo adiantado é a maneira mais simples de um
 * preço velho se fazer passar por novo. A guarda fica; corrige-se a hora ANTES dela.
 *
 * ═══ PORQUE NÃO SE CONFIGURA O DESVIO À MÃO ══════════════════════════════════════════════════
 *
 * Um `+3h` escrito num ficheiro de ambiente está errado no dia em que a corretora muda a hora de
 * verão — e nesse dia ou se perde a reserva (ticks «velhos») ou, pior, se aceita como fresco o que
 * não é. Mede-se, e mede-se a cada leitura.
 *
 * ═══ A PARTE QUE TEM DE ESTAR CERTA ══════════════════════════════════════════════════════════
 *
 * A tentação é `desvio = t mais recente − em`. Está errada, e errada do lado perigoso. Sábado, com a
 * corretora a +3h e o mercado fechado há 6 h: o `t` mais recente é `em + 3h − 6h`, a conta dá −3h, e
 * ao «corrigir» por −3h a cotação do fecho de sexta passa a ter a hora de AGORA. A guarda do futuro
 * deixava passar, a do velho também, e o motor mexia um stop com o preço de sexta. Foi este o
 * caminho que não se seguiu.
 *
 * Mede-se **só nos ticks que MUDARAM entre duas leituras**. Um tick que acabou de mudar foi escrito
 * pelo EA nos últimos milissegundos — a idade dele é conhecida e é ~zero, e então a diferença
 * `t − em` é o desvio e mais nada. Mercado fechado = nenhum tick muda = nenhuma medição nova = a
 * estimativa fica quieta (não decai) e as cotações velhas continuam velhas. O sistema fica cego em
 * vez de ficar enganado, que é a única troca aceitável aqui.
 *
 * Detalhes que importam:
 *  · quantiza-se a 15 minutos (as corretoras usam horas inteiras ou meias): absorve a resolução de
 *    um segundo do `em` e o tempo entre leituras, sem esconder um desvio a sério;
 *  · guarda-se a MEDIANA das últimas medições, não a última: um ficheiro apanhado a meio ou um
 *    símbolo estranho não mexe a estimativa;
 *  · qualquer mudança do desvio (hora de verão) falha para o lado seguro enquanto a mediana não
 *    virar — se a estimativa ficar grande demais os ticks parecem velhos, se ficar pequena demais
 *    parecem do futuro. Nos dois casos são RECUSADOS, e é por isso que as duas guardas existem.
 */

/** As corretoras andam em múltiplos de 15 minutos. Quantizar aqui absorve o ruído da medição. */
export const QUANTUM_MS = 900_000

/** Não há fuso além disto; um valor fora daqui não é um desvio, é um erro ou um ataque. */
export const DESVIO_MAX_MS = 14 * 3_600_000

/** Quantas medições se guardam para a mediana. Ímpar, para a mediana ser um valor medido. */
export const MEDICOES_MAX = 9

/** A âncora (o `em` do EA) tem de bater com o nosso relógio: é a mesma máquina. */
export const ANCORA_TOLERANCIA_MS = 10_000

export function quantizar(ms: number): number {
  return Math.round(ms / QUANTUM_MS) * QUANTUM_MS
}

/** Um desvio declarado é aceitável de se olhar? (múltiplo do quantum e dentro do mundo) */
export function desvioPlausivel(ms: unknown): boolean {
  return typeof ms === 'number' && Number.isFinite(ms) && Math.abs(ms) <= DESVIO_MAX_MS && ms % QUANTUM_MS === 0
}

/**
 * A âncora serve para medir?
 *
 * `em` vem do MESMO relógio que o nosso (`TimeGMT()` na máquina do terminal), por isso tem de bater
 * com ele. Não batendo, o ficheiro está parado (EA morto) ou o campo é lixo — e em nenhum dos casos
 * se mede coisa nenhuma a partir dele.
 */
export function ancoraValida(em: unknown, agora: number, tolerancia = ANCORA_TOLERANCIA_MS): boolean {
  return typeof em === 'number' && Number.isFinite(em) && em > 0 && Math.abs(agora - em) <= tolerancia
}

/**
 * A estimativa viva do desvio da corretora.
 *
 * Só se alimenta de ticks que MUDARAM (ver o cabeçalho). Sem medições não há estimativa — e sem
 * estimativa não se manda nada, que é melhor do que mandar uma suposição.
 */
export class Desvio {
  private medicoes: number[] = []

  /** Um tick que mudou agora, com a âncora da mesma leitura. Devolve se a medição contou. */
  medir(t: number, ancora: number): boolean {
    if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(ancora) || ancora <= 0) return false
    const bruto = t - ancora
    if (Math.abs(bruto) > DESVIO_MAX_MS) return false
    this.medicoes.push(quantizar(bruto))
    if (this.medicoes.length > MEDICOES_MAX) this.medicoes.shift()
    return true
  }

  /** A mediana das medições quantizadas, ou `null` enquanto não houver nenhuma. */
  get valor(): number | null {
    if (!this.medicoes.length) return null
    const ord = [...this.medicoes].sort((a, b) => a - b)
    return ord[Math.floor(ord.length / 2)]
  }

  get quantas(): number {
    return this.medicoes.length
  }
}

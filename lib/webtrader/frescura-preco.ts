/**
 * O PREÇO AINDA SERVE, OU JÁ É HISTÓRIA?
 *
 * ═══ O DEFEITO, MEDIDO A 01/10/2026 ════════════════════════════════════════════════════════
 *
 * `funded_precos` tem 201 símbolos. Só 46 estavam vivos (menos de cinco minutos): os que a casa
 * negoceia mesmo — XAUUSD, EURUSD, BTCUSD, US30, NAS100 e os cruzamentos principais. Os outros
 * 155 estavam parados há mais de uma hora, e 80 deles há MAIS DE UMA SEMANA — o mais antigo de 5
 * de Junho, quase quatro meses.
 *
 * E `precoIndicativo` devolvia-os na mesma. Um gráfico ou um ticket aberto sobre o AAPL mostrava
 * um preço de Junho como se fosse o de agora. Não dava erro nenhum: dava um número plausível,
 * que é pior.
 *
 * ═══ PORQUE É QUE NÃO SE RECUSA O PREÇO VELHO ══════════════════════════════════════════════
 *
 * Porque nem todo o preço velho está errado. Ao sábado, o EURUSD tem legitimamente o preço de
 * sexta-feira à noite — o mercado está fechado, e esse É o último preço. Recusá-lo apagava o
 * gráfico de toda a gente ao fim de semana.
 *
 * Por isso não se esconde: DECLARA-SE. O preço vai com a idade e com a marca de fresco, e o ecrã
 * mostra «há 4 meses» em vez de deixar supor que é de agora. A diferença entre um preço velho
 * mostrado como velho e um preço velho mostrado como actual é a diferença entre informação e
 * engano.
 */

/** Acima disto, o preço deixa de se poder mostrar como se fosse de agora. */
export const FRESCO_SEGUNDOS = 90

/**
 * Acima disto o preço é de outra sessão — não é «atrasado», é de outro dia.
 *
 * Três dias e não um: um feriado à segunda depois de um fim de semana dá 72 horas sem um tick
 * legítimo, e marcar isso como «de outra sessão» assustava sem motivo.
 */
export const SESSAO_ANTERIOR_SEGUNDOS = 3 * 24 * 3600

export type GrauDePreco = 'vivo' | 'atrasado' | 'sessao_anterior' | 'morto'

export interface Frescura {
  grau: GrauDePreco
  idadeSegundos: number
  /** Pode mostrar-se como preço actual, sem ressalva. */
  fresco: boolean
  /** O que o ecrã escreve ao lado do número. Vazio quando está vivo. */
  rotulo: string
}

function humanizar(seg: number): string {
  if (seg < 90) return `${Math.max(0, Math.round(seg))} s`
  const min = Math.round(seg / 60)
  if (min < 90) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h`
  const d = Math.round(h / 24)
  return d < 60 ? `${d} dias` : `${Math.round(d / 30)} meses`
}

/**
 * Classifica um preço pela hora a que foi lido.
 *
 * Uma data que não se lê é tratada como MORTA e não como viva: um `em` ilegível é falta de
 * informação, e falta de informação nunca pode virar «está tudo bem».
 */
export function frescuraDoPreco(em: string | number | Date | null | undefined, agora: Date = new Date()): Frescura {
  const t = em instanceof Date ? em.getTime() : typeof em === 'number' ? em : Date.parse(String(em ?? ''))
  if (!Number.isFinite(t)) {
    return { grau: 'morto', idadeSegundos: Number.POSITIVE_INFINITY, fresco: false, rotulo: 'sem hora de leitura' }
  }
  // Um preço com data no futuro é relógio trocado. Não se promove a vivo por isso.
  const idade = Math.max(0, (agora.getTime() - t) / 1000)
  if (t > agora.getTime() + 60_000) {
    return { grau: 'morto', idadeSegundos: 0, fresco: false, rotulo: 'hora de leitura inválida' }
  }
  if (idade <= FRESCO_SEGUNDOS) return { grau: 'vivo', idadeSegundos: idade, fresco: true, rotulo: '' }
  if (idade <= 3600) return { grau: 'atrasado', idadeSegundos: idade, fresco: false, rotulo: `há ${humanizar(idade)}` }
  if (idade <= SESSAO_ANTERIOR_SEGUNDOS) {
    return { grau: 'sessao_anterior', idadeSegundos: idade, fresco: false, rotulo: `fecho anterior · há ${humanizar(idade)}` }
  }
  return { grau: 'morto', idadeSegundos: idade, fresco: false, rotulo: `sem cotação há ${humanizar(idade)}` }
}

/**
 * Pode abrir-se uma ordem a MERCADO com este preço à frente?
 *
 * Sim mesmo quando o preço está velho — a ordem executa ao preço da CORRETORA, não a este, e um
 * símbolo com o mercado fechado é recusado por ela e não por nós. O que isto decide é se o ecrã
 * pode mostrar o número sem ressalva; é por isso que devolve o motivo e não um simples `false`.
 */
export function avisoParaOTicket(f: Frescura): string | null {
  if (f.fresco) return null
  if (f.grau === 'morto') return 'Este símbolo não tem cotação nossa. O preço mostrado pode não existir.'
  return `Preço ${f.rotulo}. A ordem executa ao preço da corretora.`
}

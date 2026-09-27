/**
 * INATIVIDADE — a conta que ninguém usa há 30 dias quebra e é apagada.
 *
 * ═══ A REGRA, NAS PALAVRAS DO DONO (27/09/2026) ═════════════════════════════════════════════
 *
 *   «no MTM funded, podes colocar regras de inatividade da conta de desafios e funded com
 *    certificado, exclui as reais. a regra de inatividade é de 30 dias»
 *   «o que conta como atividade — uma trade fechada»
 *   «o que acontece aos 30 dias — quebrada e apagada»
 *
 * Três decisões dele, e cada uma fecha uma porta que eu tinha deixado aberta:
 *  · ATIVIDADE é uma TRADE FECHADA. Não é ligar-se à conta, não é abrir uma posição e deixá-la
 *    aberta para o relógio não correr. Quem não fecha nada durante um mês não está a usar a conta;
 *  · o desfecho é QUEBRAR E APAGAR — não é pausar. A conta desaparece;
 *  · as REAIS ficam de fora, sempre.
 *
 * ═══ PORQUE É QUE ISTO EXISTE ═══════════════════════════════════════════════════════════════
 *
 * Cada conta aberta custa dinheiro na MetaApi e ocupa um lugar na fila do agente que as cria — é
 * a mesma razão pela qual só há um desafio de cada vez por pessoa (ver `ofertas.ts`). Uma conta
 * que ninguém negoceia é custo puro, e o custo cresce com cada renovação que gera mais uma.
 *
 * ═══ O QUE ESTE FICHEIRO É ══════════════════════════════════════════════════════════════════
 *
 * Só a DECISÃO, e é pura: recebe os factos de uma conta e diz o que fazer. Não lê a base, não
 * apaga nada, não fala com a MetaApi. Isto é de propósito: uma regra que apaga contas de clientes
 * tem de poder ser lida de uma assentada e testada num `npx tsx` de dois segundos, sem ligar nada.
 *
 *   npx tsx lib/mtmfunded/__tests__/inatividade.check.ts
 */

/** Os dias sem fechar uma trade a partir dos quais a conta cai. Decisão do dono: 30. */
export const DIAS_INATIVIDADE = 30

/** O que fica escrito na conta quando ela cai por aqui. */
export const MOTIVO_INATIVIDADE = `Inatividade: ${DIAS_INATIVIDADE} dias sem fechar uma trade`

export interface ContaParaInatividade {
  id: string
  /** `desafio`, `financiada`, `real`, `provider`, `torneio`… */
  tipo: string
  /** `ativa`, `pedida`, `quebrada`, … */
  estado: string
  /** Conta de dinheiro real da casa. */
  contaRealCasa?: boolean | null
  /** Conta da casa (nossa, não de cliente). */
  contaCasa?: boolean | null
  /** Conta marcada como sem regras de avaliação. */
  semRegras?: boolean | null
  /** Quando a conta foi criada, ISO. */
  criadaEm?: string | null
  /** A última trade FECHADA, ISO. `null` = nunca fechou nenhuma. */
  ultimaTradeFechadaEm?: string | null
  /** Tem certificado emitido? Só decide no caso das financiadas. */
  temCertificado?: boolean | null
}

export type Veredicto =
  | { accao: 'nada'; porque: string }
  | { accao: 'quebrar_e_apagar'; diasParado: number; porque: string }

/** Os estados em que uma conta ainda está viva e portanto pode cair por inatividade. */
const ESTADOS_VIVOS = new Set(['ativa', 'pedida'])

function dias(desde: string | null | undefined, agora: number): number | null {
  const t = Date.parse(String(desde ?? ''))
  if (!Number.isFinite(t)) return null
  return Math.floor((agora - t) / 86_400_000)
}

/**
 * QUE CONTAS ESTA REGRA APANHA — e a lista é fechada de propósito.
 *
 * Só entram os dois tipos que o dono nomeou: `desafio`, e `financiada` COM certificado. Tudo o
 * resto fica de fora, incluindo o que ele não mencionou (`provider`, `torneio`). É deliberado:
 * numa regra que APAGA, o que não foi nomeado não entra. O contrário — apanhar tudo e ir
 * excluindo — faz com que um tipo de conta novo, criado daqui a seis meses por outra razão
 * qualquer, comece a ser apagado sem ninguém ter decidido isso.
 */
export function noAmbito(c: ContaParaInatividade): { dentro: boolean; porque: string } {
  if (!ESTADOS_VIVOS.has(String(c.estado))) return { dentro: false, porque: `estado «${c.estado}»` }

  // As reais ficam de fora, sempre — as duas maneiras de uma conta ser real.
  if (String(c.tipo) === 'real') return { dentro: false, porque: 'conta real' }
  if (c.contaRealCasa === true) return { dentro: false, porque: 'conta real da casa' }

  /**
   * As contas da casa e as «sem regras» também não. Não estão na frase do dono, e são as nossas —
   * as mestras, as de demonstração, as que seguem estratégias. Apagá-las por não fecharem trades
   * partia o sistema por dentro, e ninguém ia procurar a causa numa regra de inatividade.
   */
  if (c.contaCasa === true) return { dentro: false, porque: 'conta da casa' }
  if (c.semRegras === true) return { dentro: false, porque: 'conta sem regras de avaliação' }

  if (String(c.tipo) === 'desafio') return { dentro: true, porque: 'desafio' }
  if (String(c.tipo) === 'financiada') {
    return c.temCertificado === true
      ? { dentro: true, porque: 'financiada com certificado' }
      : { dentro: false, porque: 'financiada sem certificado' }
  }
  return { dentro: false, porque: `tipo «${c.tipo}» fora do âmbito` }
}

/**
 * A DECISÃO.
 *
 * O relógio conta desde a última trade FECHADA. Quando não há nenhuma, conta desde a criação da
 * conta — e isto é a parte com consequências, por isso está escrita à frente e não escondida:
 * uma conta entregue há mais de 30 dias em que a pessoa nunca fechou uma única trade é
 * exactamente o caso que a regra existe para apanhar. Tratá-la como «sem dados, não mexer» era
 * deixar de fora a maioria das contas paradas, que é o problema todo.
 *
 * SEM DATA NENHUMA NÃO SE APAGA. Se nem a criação se consegue ler, devolve-se `nada`: numa regra
 * que apaga contas de clientes, não saber é motivo para parar, nunca para avançar.
 */
export function decidir(c: ContaParaInatividade, agora = Date.now()): Veredicto {
  const ambito = noAmbito(c)
  if (!ambito.dentro) return { accao: 'nada', porque: ambito.porque }

  const desdeTrade = dias(c.ultimaTradeFechadaEm, agora)
  const desdeCriacao = dias(c.criadaEm, agora)
  const parado = desdeTrade ?? desdeCriacao
  if (parado === null) return { accao: 'nada', porque: 'sem data legível — não se apaga por dúvida' }
  if (parado < DIAS_INATIVIDADE) {
    return { accao: 'nada', porque: `parada há ${parado} d (limite ${DIAS_INATIVIDADE})` }
  }

  const origem = desdeTrade !== null ? 'desde a última trade fechada' : 'desde a criação, sem nenhuma trade fechada'
  return {
    accao: 'quebrar_e_apagar',
    diasParado: parado,
    porque: `${parado} dias ${origem}`,
  }
}

/** Passa a lista toda pela decisão e devolve só as que caem. Ordenadas pela mais parada. */
export function contasACair(
  contas: readonly ContaParaInatividade[],
  agora = Date.now(),
): Array<{ conta: ContaParaInatividade; diasParado: number; porque: string }> {
  const caem: Array<{ conta: ContaParaInatividade; diasParado: number; porque: string }> = []
  for (const c of contas) {
    const v = decidir(c, agora)
    if (v.accao === 'quebrar_e_apagar') caem.push({ conta: c, diasParado: v.diasParado, porque: v.porque })
  }
  return caem.sort((a, b) => b.diasParado - a.diasParado)
}

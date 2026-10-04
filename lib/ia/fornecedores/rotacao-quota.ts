/**
 * QUANDO A QUOTA DIÁRIA DE UM MODELO ESTOURA, RODA-SE PARA O MODELO SEGUINTE DA MESMA FAMÍLIA.
 *
 * ═══ O QUE SE MEDIU A 04/10/2026 ══════════════════════════════════════════════════════════
 *
 * O plano grátis do Gemini não tem UMA quota diária: tem 20 pedidos por dia POR MODELO
 * (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, 429 com «retry in 10h»). O
 * `gemini-3.8-flash` esgotou-se a meio de uma prova e, com a MESMA chave, o 3.7, o 3.6, o
 * 3.5-flash-lite, o 3.1-flash-lite e o gemma-4 continuavam a responder. Mas a cadeia tratava o 429
 * como «o Gemini falhou» e passava ao fornecedor seguinte — que são os PAGOS sem crédito. O
 * utilizador via «indisponível» com dezenas de pedidos grátis por usar.
 *
 * ═══ A REGRA: DIÁRIO RODA, POR MINUTO NÃO ═════════════════════════════════════════════════
 *
 *  · Um 429 de quota DIÁRIA (texto com `PerDay`, `per day`, `daily`, `retry in Nh`) é um tecto que
 *    só volta amanhã. Trocar de modelo CURA, porque a quota é por modelo. Roda-se.
 *  · Um 429 de RITMO (`PerMinute`, `per minute`, `retry in Ns`) é um pico de segundos. Se rodasse,
 *    cada pico gastava um pedido da quota diária de TODOS os modelos da lista — e à tarde não havia
 *    nenhum. Não roda: o erro passa ao fornecedor seguinte, como hoje.
 *  · O modelo esgotado fica marcado em memória, por processo, até à hora que o próprio erro diz
 *    (`retry in 10h`; sem hora, assume-se 10 h). Os pedidos seguintes nem o tentam — vão directos
 *    ao próximo. Um processo da Vercel vive minutos, por isso memória chega e nada fica velho.
 *  · Máximo de 3 modelos por pedido. Mais do que isso é a quota do dia a ir-se em cascata num só
 *    pedido quando o problema afinal é outro.
 *
 * Isto COMPÕE com a descoberta (`descoberta.ts`): um 404 de nome morto continua a seguir a
 * sugestão do erro, e o nome morto sai da lista de rotação deste processo.
 */
import { ErroFornecedor } from '../tipos'

/** Texto que denuncia um tecto DIÁRIO (volta amanhã) e não um pico de ritmo. */
const TEXTO_DE_QUOTA_DIARIA = /PerDay|per[\s_-]?day|daily|GenerateRequestsPerDay|retry in\s*\d+(?:\.\d+)?\s*h/i

/** Texto que denuncia um limite POR MINUTO — tem prioridade porque «retry in 36s» é curto. */
const TEXTO_DE_RITMO = /PerMinute|per[\s_-]?minute|RPM\b|retry in\s*\d+(?:\.\d+)?\s*s\b/i

/** Horas por omissão quando o erro não diz quando voltar: o dia do Google reinicia à meia-noite PT. */
export const HORAS_POR_OMISSAO = 10

/**
 * SATURAÇÃO de um modelo — não da chave. A 04/10/2026 o 3.8-flash respondeu «503 high demand» a
 * meio de uma prova enquanto o 3.7 respondia à primeira. Um 5xx assim é do MODELO, e trocar de
 * modelo cura; por isso roda, como a quota diária — mas SEM marcar: é um pico de minutos, não um
 * tecto do dia, e o pedido seguinte volta a tentar o configurado.
 */
const TEXTO_DE_SATURACAO = /high demand|overloaded|temporarily unavailable|try again later|UNAVAILABLE/i
export function ehErroDeSaturacao(err: unknown): err is ErroFornecedor {
  if (!(err instanceof ErroFornecedor)) return false
  if (err.status === 503) return true
  return err.status === 429 && TEXTO_DE_SATURACAO.test(err.message) && !/quota|limit/i.test(err.message)
}

/**
 * É um 429 de quota DIÁRIA? Só então vale a pena rodar de modelo.
 * Um 429 que fale de minutos NÃO é — mesmo que também mencione o dia, porque a espera é curta e
 * rodar gastaria quota de todos.
 */
export function ehErroDeQuotaDiaria(err: unknown): err is ErroFornecedor {
  if (!(err instanceof ErroFornecedor)) return false
  const esgotado = err.status === 429 || /RESOURCE_EXHAUSTED/i.test(err.message)
  if (!esgotado) return false
  if (TEXTO_DE_RITMO.test(err.message) && !/PerDay|GenerateRequestsPerDay/i.test(err.message)) return false
  return TEXTO_DE_QUOTA_DIARIA.test(err.message)
}

/**
 * Quantas horas o erro manda esperar («retry in 10h», «retry in 9h30m», «retry in 2.5h»).
 * Sem hora legível → `HORAS_POR_OMISSAO`. Nunca devolve 0: um modelo esgotado hoje não se tenta já.
 */
export function horasDeEspera(mensagem: string): number {
  const m = /retry in\s*(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m)?/i.exec(mensagem)
  if (!m) return HORAS_POR_OMISSAO
  const horas = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0)
  return horas > 0 ? horas : HORAS_POR_OMISSAO
}

/**
 * As marcas «este modelo está esgotado até às X». Recebe o relógio para a guarda poder fazer o
 * tempo andar sem esperar 10 horas.
 */
export class MarcasDeQuota {
  private readonly ate = new Map<string, number>()
  constructor(private readonly agora: () => number = () => Date.now()) {}

  marcar(modelo: string, horas: number): void {
    this.ate.set(modelo, this.agora() + horas * 3_600_000)
  }

  esgotado(modelo: string): boolean {
    const fim = this.ate.get(modelo)
    if (fim == null) return false
    if (fim <= this.agora()) {
      this.ate.delete(modelo) // a marca expirou: volta a valer a pena tentar
      return false
    }
    return true
  }

  esquecer(): void {
    this.ate.clear()
  }
}

/** Tecto de modelos tentados num só pedido. */
export const MAX_MODELOS_POR_PEDIDO = 3

/**
 * A lista ordenada do que se vai tentar: o preferido primeiro, depois a rotação, sem repetidos,
 * sem os mortos (404 neste processo) e sem os esgotados (quota diária ainda a correr).
 */
export function candidatos(
  preferido: string,
  rotacao: readonly string[],
  mortos: ReadonlySet<string>,
  marcas: MarcasDeQuota,
): string[] {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const m of [preferido, ...rotacao]) {
    if (vistos.has(m) || mortos.has(m) || marcas.esgotado(m)) continue
    vistos.add(m)
    out.push(m)
  }
  return out
}

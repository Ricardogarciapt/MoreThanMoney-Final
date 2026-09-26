/**
 * UMA CONTA UNDEPLOYED NÃO SE TOCA.
 *
 * ═══ O CICLO QUE ISTO PARTE ═════════════════════════════════════════════════════════════════
 *
 * Medido a 26/09/2026, e é um ciclo fechado:
 *
 *   1. as cinco mestras estavam UNDEPLOYED na MetaApi;
 *   2. o motor insistia em ligar-se a elas;
 *   3. a MetaApi respondia `TooManyRequestsError — "trying to access too many unexisting or
 *      undeployed trading accounts"`;
 *   4. isso armava o travão GLOBAL (`account_id = '*'`), renovado a cada hora;
 *   5. com o travão global armado, o motor recusava TODAS as contas — inclusive as que estavam bem.
 *
 * O dano não ficava no motor: o travão vive numa tabela partilhada e o token é o mesmo que entrega
 * as ordens às contas dos clientes. Insistir numa conta desmontada estragava o que funcionava.
 *
 * ═══ A REGRA ════════════════════════════════════════════════════════════════════════════════
 *
 * Antes de abrir streaming, pergunta-se à API de aprovisionamento em que estado está a conta. É um
 * GET simples, uma vez por conta e por janela — não é streaming, não gasta os créditos que a
 * entrega das ordens precisa.
 *
 *  · DEPLOYED    → segue;
 *  · outro estado → não se liga, e volta-se a perguntar daqui a `JANELA_UNDEPLOYED_MS`.
 *
 * A janela é o que torna isto auto-reparável: no momento em que o dono deployar a conta, o motor
 * apanha-a sozinho na verificação seguinte. Não há lista a manter à mão, que é o género de coisa
 * que fica desactualizada e depois esconde exactamente este problema.
 *
 * ═══ FALHAR A PERGUNTA NÃO É UM NÃO ═════════════════════════════════════════════════════════
 *
 * Se o GET falhar (rede, 500, timeout) devolve-se `null` = «não sei», e quem chama DEIXA PASSAR. É
 * a decisão certa porque o caminho antigo — ligar sempre — é o que sempre existiu: uma falha de
 * rede não pode ser motivo para o motor parar de gerir contas que estão boas. O que se corta é a
 * insistência CONHECIDA, não a dúvida.
 */

/** Quanto tempo se acredita num «não está deployada» antes de voltar a perguntar. */
export const JANELA_UNDEPLOYED_MS = 10 * 60_000
/** E num «está deployada». Mais longa: o erro de streaming já avisa se ela cair. */
export const JANELA_DEPLOYADA_MS = 60 * 60_000

export const ESTADO_BOM = 'DEPLOYED'

export interface Sabido {
  /** `true` deployada, `false` não, `null` não se conseguiu saber. */
  deployada: boolean | null
  em: number
}

/** Este saber ainda vale, ou há que voltar a perguntar? */
export function aindaVale(s: Sabido | undefined, agora: number): boolean {
  if (!s) return false
  if (s.deployada === null) return false // não se guarda a dúvida: pergunta-se outra vez
  const janela = s.deployada ? JANELA_DEPLOYADA_MS : JANELA_UNDEPLOYED_MS
  return agora - s.em < janela
}

/** O estado que a API devolveu significa «pode-se ligar»? */
export function estadoPermiteLigar(estado: unknown): boolean {
  return String(estado ?? '').toUpperCase() === ESTADO_BOM
}

export type Buscador = (conta: string) => Promise<{ state?: unknown } | null>

/**
 * O buscador por omissão: a API de aprovisionamento da MetaApi.
 *
 * Um timeout curto de propósito — isto corre no caminho de decidir o âmbito, a cada 15 s. Melhor
 * uma dúvida rápida (que deixa passar) do que segurar o ciclo do escopo à espera da rede.
 */
export function buscadorMetaApi(token: string, timeoutMs = 8_000): Buscador {
  const base = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts'
  return async (conta: string) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const r = await fetch(`${base}/${encodeURIComponent(conta)}`, {
        headers: { 'auth-token': token },
        signal: ctrl.signal,
      })
      if (!r.ok) return null
      return (await r.json()) as { state?: unknown }
    } catch {
      return null
    } finally {
      clearTimeout(t)
    }
  }
}

/**
 * O guarda com memória. `podeLigar(conta)` devolve:
 *  · `true`  — deployada, ou não se sabe (a dúvida deixa passar);
 *  · `false` — sabe-se que não está deployada, e ainda vale.
 */
export class GuardaDeploy {
  private sabido = new Map<string, Sabido>()
  perguntas = 0

  constructor(
    private readonly buscar: Buscador,
    private readonly log?: (...a: unknown[]) => void,
  ) {}

  async podeLigar(conta: string, agora = Date.now()): Promise<boolean> {
    const s = this.sabido.get(conta)
    if (aindaVale(s, agora)) return s!.deployada !== false

    this.perguntas++
    const dados = await this.buscar(conta)
    if (!dados) {
      this.sabido.set(conta, { deployada: null, em: agora })
      return true // a dúvida deixa passar — ver o topo do ficheiro
    }
    const deployada = estadoPermiteLigar(dados.state)
    const antes = this.sabido.get(conta)?.deployada
    this.sabido.set(conta, { deployada, em: agora })
    if (deployada !== antes) {
      this.log?.(`[deploy] ${conta.slice(0, 8)} ${deployada ? 'DEPLOYED — segue' : `${String(dados.state ?? '?')} — não se liga`}`)
    }
    return deployada
  }

  /** Para o pulso: quantas contas se sabem desmontadas agora. */
  resumo(agora = Date.now()): { undeployed: string[]; perguntas: number } {
    const undeployed: string[] = []
    for (const [conta, s] of this.sabido) {
      if (s.deployada === false && aindaVale(s, agora)) undeployed.push(conta.slice(0, 8))
    }
    return { undeployed, perguntas: this.perguntas }
  }
}

/**
 * CHAVES METAAPI POR CONTA — a casa e as equipas (franchisados) nunca se misturam.
 *
 * Uma conta MetaApi só existe dentro da chave com que foi criada. Usar a chave da casa numa conta de
 * uma equipa dá 404 (no melhor caso); usar a de uma equipa numa conta da casa gasta créditos de outra
 * pessoa. Por isso a chave sai da CONTA, nunca do processo:
 *
 *   site: / wt: / funded:              → casa (METAAPI_TOKEN)
 *   auto:<conta> de cliente de equipa   → chave da equipa, se a equipa tiver chave; senão casa
 *                                         (o mesmo que mtm-auto/lib/token-tenant.ts faz ao criar a conta)
 *   prov:<provider>                     → chave da equipa SÓ se `metaapi_chave_equipa=true`
 *                                         (providers antigos foram criados com a da casa)
 *
 * Limites: um erro de limite na chave de uma equipa pausa SÓ essa chave. A pausa da casa continua a
 * ser a partilhada com o motor (a entrega aos subscritores tem prioridade sobre a cópia).
 *
 * Puro e testado (lib/copia-contas/__tests__/copia-equipas.check.ts). Nunca imprimir tokens: só a CHAVE
 * lógica ('casa' | 'equipa:<uuid>') aparece em logs.
 */
import { lerRef } from './regras'

export type ChaveToken = 'casa' | `equipa:${string}`

export interface TokenResolvido {
  chave: ChaveToken
  token: string
}

export interface EntradaToken {
  ref: string
  /** equipa do dono da conta (auto:) ou dona do provider (prov:) */
  tenantId: string | null
  /** mtmauto_tenants.metaapi_token dessa equipa (pode faltar) */
  tokenEquipa: string | null
  /** prov: a conta MetaApi foi criada com a chave da equipa? */
  providerNaChaveEquipa?: boolean
  tokenCasa: string | null
}

export function resolverToken(e: EntradaToken): TokenResolvido | null {
  const r = lerRef(e.ref)
  const equipa = e.tenantId && e.tokenEquipa ? { chave: `equipa:${e.tenantId}` as ChaveToken, token: e.tokenEquipa } : null
  if (r?.origem === 'auto' && equipa) return equipa
  if (r?.origem === 'prov' && e.providerNaChaveEquipa) {
    // Criada na chave da equipa e a equipa já não tem chave: NÃO cai na da casa (seria 404 ou pior).
    return equipa
  }
  return e.tokenCasa ? { chave: 'casa', token: e.tokenCasa } : null
}

/** Uma fonte de streaming por conta MetaApi DENTRO da sua chave. */
export function chaveDaFonteMt(chave: ChaveToken, metaapiAccountId: string): string {
  return `${chave}|${String(metaapiAccountId).toLowerCase()}`
}

/**
 * Registo de clientes MetaApi por chave, com pausa por chave.
 * `criar` recebe o token (o SDK) e é chamado UMA vez por chave; a casa pode delegar numa instância
 * partilhada que já exista no processo.
 */
export class RegistoPorToken<C> {
  private readonly clientes = new Map<ChaveToken, C>()
  private readonly pausas = new Map<ChaveToken, number>()

  constructor(private readonly criar: (t: TokenResolvido) => C) {}

  cliente(t: TokenResolvido): C {
    let c = this.clientes.get(t.chave)
    if (!c) {
      c = this.criar(t)
      this.clientes.set(t.chave, c)
    }
    return c
  }

  pausar(chave: ChaveToken, ateMs: number): void {
    this.pausas.set(chave, Math.max(this.pausas.get(chave) ?? 0, ateMs))
  }

  pausadaAte(chave: ChaveToken, agora = Date.now()): number {
    const a = this.pausas.get(chave) ?? 0
    return a > agora ? a : 0
  }

  get tamanho(): number {
    return this.clientes.size
  }
}

/**
 * Um erro de quota visto na chave de uma EQUIPA não pode chegar ao guarda de quota da casa
 * (lib/mtmcopy/metaapi-quota bloqueia a conta '*' — pararia leituras dos subscritores da MTM).
 * Troca-o por um erro neutro com a mesma mensagem sem as palavras que o guarda reconhece.
 */
export function neutralizarErroDeEquipa(e: unknown, chave: ChaveToken): unknown {
  if (chave === 'casa') return e
  const msg = e instanceof Error ? e.message : String(e)
  const x = e as { status?: unknown; statusCode?: unknown; name?: unknown } | null
  const padrao = /cpu ?credits|too ?many ?requests|TooManyRequests|rate ?limit|429|quota/gi
  const eLimite = new RegExp(padrao.source, 'i').test(`${String(x?.name ?? '')} ${msg}`) || x?.status === 429 || x?.statusCode === 429
  if (!eLimite) return e
  const limpo = new Error(`limite da chave MetaApi da equipa (${chave}): ${msg.replace(padrao, '…')}`.slice(0, 300))
  ;(limpo as Error & { limiteEquipa?: boolean }).limiteEquipa = true
  return limpo
}

export function eLimiteDeEquipa(e: unknown): boolean {
  return Boolean((e as { limiteEquipa?: boolean } | null)?.limiteEquipa)
}

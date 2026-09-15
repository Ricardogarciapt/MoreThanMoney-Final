/**
 * O `last_error` de uma ligação ainda é ATUAL, ou já é histórico?
 *
 * A 2026-09-15 o /admin/mtmcopy?tab=users ficou cheio de «ws:getSymbols API allows … cpu credits»
 * e, à tarde, do estrangulamento «too many unexisting or undeployed accounts». São falhas NOSSAS
 * (da quota do token), não da conta — e o `last_error` fica gravado até alguém o apagar. Quando a
 * conta já executou com sucesso depois disso, mostrar o erro a vermelho diz que está partida quando
 * não está. Aqui decide-se: quota/transitório + sucesso mais recente → «histórico», com a data.
 *
 * Puro (sem base nem MetaApi) — a página cliente pode importar à vontade.
 */
const ERRO_DE_QUOTA = /cpu credits|too ?many ?requests|TooManyRequests|rate ?limit|unexisting or undeployed|quota/i
const SUCESSO = new Set(['executed', 'ok', 'filled', 'open', 'active', 'closed', 'following'])

export interface LogResumo {
  status: string | null
  created_at: string | null
}

export interface EstadoErro {
  /** true = mostrar como histórico (cinzento, com data), não como erro atual. */
  last_error_historico: boolean
  /** Quando o erro terá acontecido (último log de erro, senão updated_at), ISO. */
  last_error_em: string | null
  /** Último sucesso conhecido, ISO. */
  ultimo_sucesso_em: string | null
}

export function ehErroDeQuotaTexto(texto: string | null | undefined): boolean {
  return ERRO_DE_QUOTA.test(String(texto ?? ''))
}

const t = (iso: string | null | undefined) => {
  const n = Date.parse(String(iso ?? ''))
  return Number.isFinite(n) ? n : null
}

/**
 * @param logs  logs da ligação (qualquer ordem)
 * @param updatedAt `updated_at` da ligação (recurso quando não há log de erro)
 */
export function estadoDoUltimoErro(
  lastError: string | null | undefined,
  logs: LogResumo[],
  lastSignalAt?: string | null,
  updatedAt?: string | null,
): EstadoErro {
  let erroEm: number | null = null
  let sucessoEm: number | null = t(lastSignalAt)
  for (const l of logs) {
    const at = t(l.created_at)
    if (at == null) continue
    const st = String(l.status ?? '').toLowerCase()
    if (st === 'error') erroEm = Math.max(erroEm ?? 0, at)
    else if (SUCESSO.has(st)) sucessoEm = Math.max(sucessoEm ?? 0, at)
  }
  const quando = erroEm ?? t(updatedAt)
  const iso = (n: number | null) => (n == null ? null : new Date(n).toISOString())
  const historico =
    Boolean(lastError) &&
    ehErroDeQuotaTexto(lastError) &&
    sucessoEm != null &&
    (quando == null || sucessoEm > quando)
  return { last_error_historico: historico, last_error_em: iso(quando), ultimo_sucesso_em: iso(sucessoEm) }
}

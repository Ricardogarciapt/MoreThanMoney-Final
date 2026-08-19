/**
 * Contas onde as ordens têm de passar por trades MANUAIS: sem comentário e sem magic.
 *
 * Contas financiadas (prop firms) analisam comentário e magic number para detetar
 * copy-trading automático. O magic já vai a 0 (o SDK não o define), falta o comentário:
 * para estas contas a ordem segue sem qualquer texto, como um clique no MT5.
 *
 * Fonte: constante abaixo + env `MTMCOPY_NO_COMMENT_ACCOUNTS` (ids separados por vírgula),
 * para acrescentar contas novas sem alterar código.
 */

/** Ricardo Garcia · Equity Edge (conta financiada, login 540009). */
const DEFAULT_NO_COMMENT_ACCOUNTS = ['1beb4c29-7189-4551-9465-e5533449dd53']

export function noCommentAccountIds(): string[] {
  const fromEnv = (process.env.MTMCOPY_NO_COMMENT_ACCOUNTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set([...DEFAULT_NO_COMMENT_ACCOUNTS, ...fromEnv])]
}

export function isNoCommentAccount(accountId?: string | null): boolean {
  if (!accountId) return false
  return noCommentAccountIds().includes(accountId.trim())
}

/** Comentário a enviar na ordem — `undefined` nas contas que exigem trade manual limpo. */
export function orderCommentFor(
  accountId: string | null | undefined,
  comment: string | null | undefined,
  fallback = 'MTMcopier',
): string | undefined {
  if (isNoCommentAccount(accountId)) return undefined
  return (comment ?? fallback).slice(0, 31)
}

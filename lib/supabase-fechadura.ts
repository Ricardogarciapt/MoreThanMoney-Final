/**
 * A FECHADURA DA AUTH COM TECTO DE ESPERA — para o login nunca mais ficar «A concluir…» para sempre.
 *
 * ═══ O QUE ACONTECEU A 05/10/2026 ═════════════════════════════════════════════════════════
 *
 * O dono fez login no site e ficou no ecrã «A concluir o login…» a rodar; publicou no feed e o
 * post nunca saiu. Nos logs do servidor: nada. Na Auth do Supabase: nada. Noutro browser, com a
 * mesma conta, tudo funcionou. Ou seja, o pedido nem chegava a sair do browser.
 *
 * A causa está no cliente do Supabase: TODA a auth (getSession, refresh, e por arrasto cada
 * pedido ao PostgREST, que vai buscar o token) passa por uma fechadura partilhada entre
 * separadores (`navigator.locks`), e o supabase-js pede-a SEM TECTO DE ESPERA (`acquireTimeout
 * = -1`). Basta UM separador do site ficar a meio de um refresh (adormecido, em segundo plano,
 * um estúdio aberto há horas) para a fechadura ficar presa — e todos os outros separadores
 * esperam para sempre, em silêncio: sem erro, sem log, só um spinner. O Safari é onde isto
 * mais se vê, mas é de qualquer browser com vários separadores do site.
 *
 * ═══ A REGRA ═══════════════════════════════════════════════════════════════════════════════
 *
 *  · Continua-se a usar a fechadura do browser (é o que evita dois separadores a renovar o
 *    mesmo token ao mesmo tempo — ver nota em auth-performance-safari: NÃO trocar por
 *    processLock).
 *  · Mas espera-se no MÁXIMO `TECTO_MS`. Esgotado o tempo, corre-se o pedido SEM fechadura:
 *    o risco de uma renovação concorrente é muito menor do que o custo certo de um site morto.
 *  · Fica um aviso na consola, uma vez, para quem for ver: «fechadura presa, a continuar».
 */
import { navigatorLock, type LockFunc } from "@supabase/auth-js"

/** Quanto tempo se espera pela fechadura antes de seguir sem ela. */
export const TECTO_MS = 8_000

let avisou = false

/** Um erro de fechadura é o único que faz seguir sem ela; qualquer outro passa tal e qual. */
export function ehErroDeFechadura(err: unknown): boolean {
  const nome = (err as { name?: string } | null)?.name ?? ""
  const texto = String((err as { message?: string } | null)?.message ?? "")
  return /LockAcquireTimeout|AbortError/.test(nome) || /lock/i.test(texto) && /timed? ?out|abort/i.test(texto)
}

/** Sem Web Locks (browser antigo, iframe sem permissões): corre-se directo. */
function temFechadura(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as Navigator & { locks?: unknown }).locks
}

export const fechaduraComTecto: LockFunc = async (name, acquireTimeout, fn) => {
  if (!temFechadura()) return await fn()
  // `-1` (o que o supabase-js pede) seria «sem tecto»: é precisamente o que se recusa aqui.
  const tecto = acquireTimeout < 0 ? TECTO_MS : acquireTimeout
  try {
    return await navigatorLock(name, tecto, fn)
  } catch (err) {
    if (!ehErroDeFechadura(err)) throw err
    if (!avisou) {
      avisou = true
      console.warn(`[auth] fechadura «${name}» presa há ${tecto} ms — a continuar sem ela (outro separador não a largou)`)
    }
    return await fn()
  }
}

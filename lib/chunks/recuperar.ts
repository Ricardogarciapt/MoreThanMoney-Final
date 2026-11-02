/**
 * RECUPERAÇÃO DE CHUNKS QUE NÃO CARREGAM («ChunkLoadError: Loading chunk N failed»).
 *
 * Acontece quando o browser tem o HTML/router de um deploy e vai buscar um ficheiro JS que esse
 * deploy já não serve (vários deploys seguidos, separador aberto há horas, cache do Safari com
 * uma resposta que não é JS). O ficheiro novo existe — o que está velho é o que o browser tem.
 * A cura é uma recarga completa da página; sem ela a pessoa fica com o ecrã em branco.
 *
 * Recarrega-se NO MÁXIMO uma vez por minuto (sessionStorage) para nunca entrar em ciclo se a
 * falha for persistente (browser sem suporte à sintaxe, extensão a bloquear o ficheiro).
 *
 * Módulo puro: sem React, sem imports.
 */

const CHAVE = "mtm_chunk_recarga_em"
const INTERVALO_MIN_MS = 60_000

const PADRAO = /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i

/** É um erro de ficheiro JS/CSS do build que não carregou? */
export function ehErroDeChunk(erro: unknown): boolean {
  if (!erro) return false
  const e = erro as { name?: unknown; message?: unknown; reason?: unknown }
  if (e.name === "ChunkLoadError") return true
  const texto = typeof erro === "string" ? erro : String(e.message ?? "")
  if (PADRAO.test(texto)) return true
  // PromiseRejectionEvent: o erro vem em `reason`.
  return e.reason != null && e.reason !== erro && ehErroDeChunk(e.reason)
}

/** Recarrega a página uma vez; devolve true se recarregou, false se recarregou há menos de 1 min. */
export function recarregarUmaVez(): boolean {
  if (typeof window === "undefined") return false
  let ultima = 0
  try { ultima = Number(window.sessionStorage.getItem(CHAVE) || 0) } catch {}
  if (Date.now() - ultima < INTERVALO_MIN_MS) return false
  try { window.sessionStorage.setItem(CHAVE, String(Date.now())) } catch {}
  // `location.reload()` reaproveita o HTML em cache em alguns Safari; pedir o URL de novo força
  // o servidor a devolver o HTML (e os nomes dos ficheiros) do deploy actual.
  try { window.location.replace(window.location.href) } catch { window.location.reload() }
  return true
}

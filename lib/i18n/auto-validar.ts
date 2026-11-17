/**
 * Guardas puras da tradução automática do dicionário (sem rede nem base de dados, testáveis).
 *
 * Um texto de interface traduzido pela IA só entra se mantiver exactamente os mesmos marcadores
 * (`{n}`, `{erro}`…): um `{n}` perdido ou traduzido para `{número}` mostraria a chave crua no ecrã.
 * E nunca pode traduzir nomes de produtos, scanners, educadores ou cursos (ordem do Ricardo).
 */

/** Nomes que ficam sempre como estão — o prompt pede-o e a guarda confirma. */
export const NOMES_FIXOS = [
  "MoreThanMoney",
  "MTM System",
  "MTM Auto",
  "MTM Funded",
  "MTM Copy",
  "MTM",
  "Premium",
  "GoldKiller",
  "Gold Killer",
  "Sensei",
  "DEFY",
  "Aurum",
  "Quantum",
  "Tap to Trade",
  "Tap to Copy",
  "WebTrader",
  "PU Prime",
  "Skool",
  "Trade Ideas",
  "Premium Ideas",
]

function marcadores(texto: string): string[] {
  return (texto.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) ?? []).sort()
}

/** O texto traduzido é aceitável para substituir a chave no ecrã? */
export function traducaoValida(origem: string, traducao: unknown): traducao is string {
  if (typeof traducao !== "string") return false
  const t = traducao.trim()
  if (!t) return false
  // A IA às vezes devolve o texto enorme (explicações) — trava a 3× o tamanho, com folga para línguas longas.
  if (t.length > Math.max(40, origem.length * 3)) return false
  const a = marcadores(origem)
  const b = marcadores(t)
  if (a.length !== b.length || a.some((m, i) => m !== b[i])) return false
  // Os nomes de marca presentes na origem têm de sobreviver tal e qual.
  for (const nome of NOMES_FIXOS) {
    if (origem.includes(nome) && !t.includes(nome)) return false
  }
  return true
}

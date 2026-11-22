/**
 * DE ONDE VEIO A PESSOA QUE ABRIU O WEBTRADER — para lhe dar uma seta de volta.
 *
 * Pedido do Ricardo (22/11/2026): quem entra no WebTrader a partir da MTM Auto (ou de outra app da
 * casa) ficava preso, sem forma de voltar. Guarda-se a origem na sessão do separador:
 *   · casca nativa iOS da MTM Auto (/webtrader/app com a ponte `mtmautoWT`) → pede à casca para voltar
 *     (`{ acao: "voltar" }`) e, se ela não souber, recua no histórico;
 *   · MTM Auto web (token no fragmento) ou `?de=<app>&voltar=<url>` → link para o URL de origem,
 *     só em domínios da casa (nunca um redireccionamento aberto).
 * Puro excepto o sessionStorage (com try/catch: modo privado e afins).
 */
export type OrigemWebtrader = { nome: string; tipo: "casca" | "url"; url?: string | null }

const CHAVE = "webtrader_origem"

const DOMINIOS_CASA = [/(^|\.)morethanmoney\.pt$/i, /^mtm-auto\.vercel\.app$/i, /^primeverse[a-z0-9-]*\.vercel\.app$/i, /^localhost$/i]

/** Só deixa voltar para domínios da casa (https, ou http em localhost). */
export function urlDeVoltaSegura(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (!(u.protocol === "https:" || (u.protocol === "http:" && u.hostname === "localhost"))) return null
    return DOMINIOS_CASA.some((r) => r.test(u.hostname)) ? u.toString() : null
  } catch {
    return null
  }
}

export function nomeDaApp(de: string | null | undefined, url?: string | null): string {
  const d = String(de ?? "").toLowerCase()
  if (d.includes("auto") || (url && /mtm-auto/i.test(url))) return "MTM Auto"
  if (d.includes("prime")) return "PrimeVerse"
  if (d.includes("app")) return "App MTM"
  return "a app"
}

export function guardarOrigem(o: OrigemWebtrader): void {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(o)) } catch { /* sem armazenamento: fica sem seta */ }
}

export function lerOrigem(): OrigemWebtrader | null {
  try {
    const o = JSON.parse(sessionStorage.getItem(CHAVE) || "null") as OrigemWebtrader | null
    if (!o || (o.tipo !== "casca" && o.tipo !== "url")) return null
    if (o.tipo === "url" && !urlDeVoltaSegura(o.url)) return null
    return o
  } catch {
    return null
  }
}

/** Lê `?de=` e `?voltar=` da query (links das outras apps) e guarda a origem. */
export function origemDaQuery(search: string): OrigemWebtrader | null {
  const q = new URLSearchParams(search)
  const de = q.get("de"), voltar = urlDeVoltaSegura(q.get("voltar"))
  if (!de && !voltar) return null
  return { nome: nomeDaApp(de, voltar), tipo: "url", url: voltar }
}

/**
 * O LINK PARA NEGOCIAR NO WEBTRADER a partir de um scanner, alerta ou ideia.
 *
 * Dentro da app-mobile o WebTrader é o sub-separador «Web trader» do separador Scanner
 * (`/app-mobile?tab=scanner&sub=webtrader`) — navegar para lá não recarrega a app. Fora dela
 * (scanner-access, /alertas-mtm, o site) abre a app própria `/webtrader`, que também se instala
 * no ecrã principal. `?tab=funded` continua a funcionar como deep-link antigo.
 *
 * O símbolo vai como vem (OANDA:XAUUSD, XAUUSD.s, BINANCE:BTCUSDT…): quem lê o link resolve-o
 * para o catálogo com `candidatosDeTicker` (lib/mtmfunded/simulado/ordens.ts) — o MESMO mapeamento
 * do webhook do TradingView, para um alerta e um clique darem sempre o mesmo símbolo.
 *
 * Nunca envia ordens: só pré-preenche o ticket. O trader escolhe a conta, o volume e confirma.
 *
 * Módulo PURO (sem imports).
 */

export interface PedidoWebtrader {
  symbol?: string | null
  dir?: "buy" | "sell" | "neutral" | string | null
  sl?: number | string | null
  tp?: number | string | null
  origem?: "scanner" | "ideia_mtm" | "manual"
  ref?: string | number | null
}

export function linkWebtrader(p: PedidoWebtrader, dentroDaApp: boolean): string {
  const q = new URLSearchParams()
  if (dentroDaApp) { q.set("tab", "scanner"); q.set("sub", "webtrader") }
  if (p.symbol) q.set("symbol", String(p.symbol))
  const dir = String(p.dir ?? "").toLowerCase()
  if (dir === "buy" || dir === "sell") q.set("dir", dir)
  const nivel = (v: number | string | null | undefined) => {
    if (v == null || v === "") return null
    const n = Number(String(v).replace(",", "."))
    return Number.isFinite(n) && n > 0 ? String(n) : null
  }
  const sl = nivel(p.sl)
  const tp = nivel(p.tp)
  if (sl) q.set("sl", sl)
  if (tp) q.set("tp", tp)
  if (p.origem) q.set("origem", p.origem)
  if (p.ref != null && p.ref !== "") q.set("ref", String(p.ref))
  return `${dentroDaApp ? "/app-mobile" : "/webtrader"}?${q.toString()}`
}

/** Para quem só tem o caminho actual à mão (`usePathname()`). */
export const estaNaAppMobile = (pathname: string | null | undefined) => Boolean(pathname?.startsWith("/app-mobile"))

/**
 * SCANNERS CANÓNICOS dos alertas MTM — fonte ÚNICA para o site, app-mobile e apps nativas.
 *
 * O campo `strategy` que chega do TradingView traz VARIANTES do mesmo scanner
 * ("MTM Sensei X", "MTM Aurum Flow ORB", "MTM Aurum Flow v8", "MTM Aurum Flow"…). Construir o
 * filtro a partir dessas strings cruas duplicava scanners na lista (era o bug: 3 entradas de
 * Aurum Flow e "Sensei X" em vez de "Sensei"). Aqui normaliza-se tudo para um conjunto fixo.
 *
 * Módulo PURO (sem imports) — pode ser usado no cliente e no servidor.
 */
export type ScannerKey = "sensei" | "goldkiller" | "mtmscanner" | "aurum"

/**
 * Nomes mostrados ao utilizador. "Sensei" (NÃO "Sensei X" — decisão Ricardo 2026-08-19).
 * A `aurum` é SÓ cripto desde 2026-09-29: o rótulo diz-lo, mas a CHAVE e a normalização abaixo
 * continuam a aceitar os nomes antigos ("MTM Aurum Flow ORB/v8/…") para não perder alertas gravados.
 */
export const SCANNER_LABELS: Record<ScannerKey, string> = {
  sensei: "Sensei",
  goldkiller: "GoldKiller",
  mtmscanner: "MTM Scanner",
  aurum: "MTM Aurum Flow Cripto",
}

/** Ordem de apresentação nos filtros. */
export const SCANNER_ORDER: ScannerKey[] = ["sensei", "goldkiller", "mtmscanner", "aurum"]

/**
 * Normaliza o `strategy` cru de um alerta para o scanner canónico.
 * Aurum ANTES de scanner genérico (o nome contém "MTM"); GoldKiller antes do genérico também.
 */
export function scannerKeyFromStrategy(strategy: string | null | undefined): ScannerKey {
  const n = (strategy ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!n) return "mtmscanner"
  if (n.includes("aurum")) return "aurum"                                  // ORB, v8, base
  if (n.includes("sensei")) return "sensei"                                // "MTM Sensei X" → Sensei
  if (n.includes("goldkiller") || (n.includes("gold") && n.includes("kill"))) return "goldkiller"
  return "mtmscanner"
}

/** Rótulo canónico pronto a mostrar (badge do card, filtro, etc.). */
export function scannerLabel(strategy: string | null | undefined): string {
  return SCANNER_LABELS[scannerKeyFromStrategy(strategy)]
}

/** Opções do filtro presentes nos alertas recebidos (sem duplicados, pela ordem canónica). */
export function scannerFilterOptions(
  strategies: (string | null | undefined)[],
): { key: ScannerKey; label: string }[] {
  const present = new Set(strategies.map(scannerKeyFromStrategy))
  return SCANNER_ORDER.filter((k) => present.has(k)).map((k) => ({ key: k, label: SCANNER_LABELS[k] }))
}

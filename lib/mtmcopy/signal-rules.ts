import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

/**
 * Regras de sinal (config-driven, runtime, sem redeploy).
 * Guardadas em site_settings.value (jsonb) na key 'mtmcopy_signal_rules'.
 *
 * Dois gates, alimentados pela análise dos ~4.900 sinais do webhook:
 *  - ALERTA (ruído): o que se publica no Telegram/chat/push. Corta entradas com
 *    poucas confirmações (0–1 conf perdem: −109R) e símbolos-ruído.
 *  - EXECUÇÃO (dinheiro): o que abre nas contas provider. BUY + ≥2 conf + whitelist;
 *    SELL exige mais confirmações (SELL = −307R vs BUY = +244R); XAU só BUY (−78R no SELL).
 */
export interface SignalRules {
  alert_min_confirmations: number
  alert_symbol_blacklist: string[]
  exec_min_confirmations: number
  exec_sell_min_confirmations: number
  exec_symbol_whitelist: string[]
  xau_buy_only: boolean
  /** Se true, execução exige confirmações conhecidas (bloqueia sinais sem info de confirmações). */
  exec_require_confirmations: boolean
  /** Se true, uma ideia/setup validada com preço de entrada coloca ordem LIMIT na conta
   *  provider (o entry_trigger dessa ideia não faz market → evita duplo preenchimento). */
  exec_allow_limit_ideas: boolean
  /** Exclusão de símbolos POR-SCANNER (alerta + execução). Chave = nome do scanner em
   *  minúsculas (match por substring no strategy do payload), valor = símbolos a barrar.
   *  Ex.: { mtmscanner: ["XAUUSD"] } → o MTMScanner não dá nem executa ouro (fica p/ o
   *  GoldKiller/Sensei, que gerem o ouro melhor). Não afeta os outros scanners. */
  scanner_symbol_exclusions: Record<string, string[]>
}

const KEY = "mtmcopy_signal_rules"

export const DEFAULT_SIGNAL_RULES: SignalRules = {
  alert_min_confirmations: 2,
  alert_symbol_blacklist: ["XAGUSD", "NAS100", "EURNZD", "GBPNZD", "AUDUSD", "CHFJPY"],
  exec_min_confirmations: 2,
  exec_sell_min_confirmations: 3,
  exec_symbol_whitelist: [
    "AUDCHF", "USOIL", "EURUSD", "CADCHF", "GBPCAD", "EURCAD", "EURAUD",
    "EURGBP", "GBPJPY", "CADJPY", "GBPUSD", "NZDUSD", "UK100", "SPX500", "US30",
  ],
  xau_buy_only: true,
  exec_require_confirmations: true,
  exec_allow_limit_ideas: true,
  // Ouro sai do MTMScanner (GoldKiller 67% + Sensei 58% já o gerem, com SL/TP dinâmico).
  scanner_symbol_exclusions: { mtmscanner: ["XAUUSD", "XAGUSD"] },
}

export function normalizeSymbol(s: string | null | undefined): string {
  return String(s ?? "").toUpperCase().replace(/^[A-Z]+:/, "").replace(/[^A-Z0-9]/g, "")
}

export async function getSignalRules(): Promise<SignalRules> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle()
    const v = (data?.value ?? {}) as Partial<SignalRules>
    return { ...DEFAULT_SIGNAL_RULES, ...v }
  } catch {
    return DEFAULT_SIGNAL_RULES
  }
}

export async function setSignalRules(patch: Partial<SignalRules>): Promise<SignalRules> {
  const current = await getSignalRules()
  const next: SignalRules = { ...current, ...patch }
  await getSupabaseAdmin()
    .from("site_settings")
    .upsert(
      { key: KEY, value: next, description: "Regras de sinal (ruído + execução) MTM", updated_at: new Date().toISOString() },
      { onConflict: "key" },
    )
  return next
}

/** Símbolo barrado especificamente para este scanner? (ex.: MTMScanner + XAUUSD). */
export function isSymbolExcludedForScanner(
  rules: SignalRules,
  symbol: string | null,
  scanner: string | null | undefined,
): boolean {
  const key = String(scanner ?? "").toLowerCase().trim()
  if (!key) return false
  const s = normalizeSymbol(symbol)
  const list = rules.scanner_symbol_exclusions?.[key] ?? []
  return list.map(normalizeSymbol).includes(s)
}

/** ALERTA: deve publicar-se esta ENTRADA? (follow-ups e GoldKiller passam sempre — tratados pelo chamador.) */
export function passesAlertGate(
  rules: SignalRules,
  symbol: string | null,
  confCount: number | null,
  scanner?: string | null,
): boolean {
  const s = normalizeSymbol(symbol)
  if (isSymbolExcludedForScanner(rules, symbol, scanner)) return false
  if (rules.alert_symbol_blacklist.map(normalizeSymbol).includes(s)) return false
  if (confCount !== null && confCount < rules.alert_min_confirmations) return false
  return true
}

/** EXECUÇÃO: deve abrir trade na conta provider? (GoldKiller passa — tem lógica própria.) */
export function passesExecGate(
  rules: SignalRules,
  symbol: string | null,
  direction: string | null,
  confCount: number | null,
  scanner?: string | null,
): { ok: boolean; reason?: string } {
  const s = normalizeSymbol(symbol)
  const dir = String(direction ?? "").toLowerCase()
  const isXau = s === "XAUUSD"

  if (isSymbolExcludedForScanner(rules, symbol, scanner)) {
    return { ok: false, reason: `${s} excluído para o scanner ${String(scanner).toLowerCase()}` }
  }

  if (isXau && rules.xau_buy_only && dir !== "buy") return { ok: false, reason: "XAU só BUY" }

  const wl = rules.exec_symbol_whitelist.map(normalizeSymbol)
  if (wl.length && !wl.includes(s) && !isXau) return { ok: false, reason: `${s} fora da whitelist de execução` }

  const need = dir === "sell" ? rules.exec_sell_min_confirmations : rules.exec_min_confirmations
  if (confCount === null) {
    if (rules.exec_require_confirmations) return { ok: false, reason: "sem confirmações conhecidas" }
  } else if (confCount < need) {
    return { ok: false, reason: `confirmações ${confCount} < ${need} (${dir || "?"})` }
  }
  return { ok: true }
}

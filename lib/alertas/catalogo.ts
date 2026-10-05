/**
 * O CATÁLOGO DOS ALERTAS MTM — estratégias, classes de activos e timeframes, numa fonte só.
 *
 * ═══ O DEFEITO QUE ISTO CORRIGE, MEDIDO (05/10) ═══════════════════════════════════════════
 *
 * As três superfícies dos alertas (/alertas-mtm, /scanner-access e o separador da app-mobile)
 * tinham cada uma o seu catálogo escrito à mão:
 *
 *  · a app-mobile tinha 4 estratégias fixas, 5 grupos de activos (os do terminal) e 6
 *    timeframes; o desktop tirava as estratégias e os timeframes DO QUE TINHA CHEGADO e tinha
 *    outra taxonomia de classes (Ouro & BTC / Forex / Índices / Cripto Perp / Outros), com o
 *    classificador copiado linha a linha de lib/mtm-alerts/asset-class.
 *  · o painel «ESTRATÉGIAS (6)» mostrava 4 chips: o número era o de VALORES GUARDADOS na
 *    subscrição do utilizador — GOLDENZONE e KILLSHOT entre eles, que nunca foram estratégias
 *    de alerta — e nenhum chip acendia porque a rota guarda em MAIÚSCULAS («SENSEI») e o chip
 *    compara com «Sensei». «ATIVOS (7)» era o mesmo engano: 7 símbolos seleccionados, não 7
 *    categorias.
 *
 * Aqui fica a verdade; as superfícies importam daqui e a guarda `catalogo.check.ts` FALHA se
 * alguma voltar a declarar o seu próprio catálogo.
 *
 * Módulo PURO (só importa módulos puros) — serve cliente, servidor e webhook.
 */
import { SCANNER_LABELS, SCANNER_ORDER, scannerKeyFromStrategy, type ScannerKey } from '@/lib/mtm-alerts/scanners'
import { classifyAssetClass, type AlertAssetClass } from '@/lib/mtm-alerts/asset-class'
import { TERMINAL_ASSETS, type TerminalAssetType } from '@/lib/mtm-terminal-assets'

export type { ScannerKey, AlertAssetClass }

// ── ESTRATÉGIAS ─────────────────────────────────────────────────────────────

export interface EstrategiaDeAlerta {
  chave: ScannerKey
  rotulo: string
  /** O que fica gravado em `user_signal_subscriptions.strategies` — a chave canónica, sempre. */
  valorSubscricao: ScannerKey
}

/**
 * As estratégias que geram alertas por webhook. A ordem é a dos filtros.
 *
 * Nota: estar aqui diz que a estratégia EXISTE no sistema, não que está a disparar hoje — isso
 * mede-se na base (ver o relatório de 05/10: a Aurum Flow está muda desde 22/09).
 */
export const ESTRATEGIAS: readonly EstrategiaDeAlerta[] = SCANNER_ORDER.map((chave) => ({
  chave,
  rotulo: SCANNER_LABELS[chave],
  valorSubscricao: chave,
}))

/**
 * Lê um valor guardado na subscrição e devolve a estratégia canónica — ou `null` se não for
 * nenhuma. É ESTRITO de propósito: `scannerKeyFromStrategy` manda tudo o que não conhece para
 * «mtmscanner» (serve para alertas, que vêm sempre de um scanner), e aqui isso faria de
 * «GOLDENZONE» uma subscrição ao MTM Scanner sem a pessoa saber.
 */
export function chaveDeSubscricao(valor: unknown): ScannerKey | null {
  const n = String(valor ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!n) return null
  if (n === 'sensei' || n === 'mtmsensei' || n === 'senseix' || n === 'mtmsenseix') return 'sensei'
  if (n === 'goldkiller') return 'goldkiller'
  if (n === 'mtmscanner' || n === 'scanner') return 'mtmscanner'
  if (n === 'aurum' || n === 'aurumflow' || n === 'mtmaurumflow' || n === 'mtmaurumflowcripto') return 'aurum'
  return null
}

/** Valores guardados → chaves canónicas, sem repetidos e sem o que já não existe. */
export function normalizarEstrategiasSubscricao(valores: unknown): ScannerKey[] {
  if (!Array.isArray(valores)) return []
  const out: ScannerKey[] = []
  for (const v of valores) {
    const k = chaveDeSubscricao(v)
    if (k && !out.includes(k)) out.push(k)
  }
  return out
}

/** A estratégia canónica de um alerta recebido (a partir do `strategy`/`alert_name` cru). */
export const estrategiaDoAlerta = scannerKeyFromStrategy

/** Este alerta está entre as estratégias subscritas? Lista vazia = todas. */
export function alertaNasEstrategias(strategy: string | null | undefined, subscritas: readonly unknown[]): boolean {
  const chaves = normalizarEstrategiasSubscricao([...subscritas])
  if (chaves.length === 0) return true
  return chaves.includes(estrategiaDoAlerta(strategy))
}

// ── CLASSES DE ACTIVOS ──────────────────────────────────────────────────────

/**
 * As classes pelas quais um ALERTA se filtra (as mesmas que a rota /api/mtm-alerts devolve em
 * `assetClass`). NATURALGAS e USOIL caem em «other» — por isso o rótulo diz «Commodities».
 */
export const CLASSES_DE_ACTIVOS: readonly { chave: AlertAssetClass; rotulo: string }[] = [
  { chave: 'gold_btc', rotulo: 'Ouro & BTC' },
  { chave: 'forex', rotulo: 'Forex' },
  { chave: 'index', rotulo: 'Índices' },
  { chave: 'crypto_perp', rotulo: 'Cripto Perp' },
  { chave: 'other', rotulo: 'Commodities & Outros' },
]

export const classeDoAlerta = classifyAssetClass

/**
 * Os grupos do SELECTOR de activos (o que a pessoa escolhe receber), com os símbolos do
 * terminal. É uma taxonomia diferente da de cima de propósito: a pessoa escolhe «XAUUSD», o
 * alerta chega como «OANDA:XAUUSD» e é a classe que o filtra.
 */
export interface GrupoDeActivos {
  chave: TerminalAssetType
  rotulo: string
  simbolos: string[]
}

const ROTULOS_DOS_GRUPOS: Record<TerminalAssetType, string> = {
  commodity: 'Metais / Commodities',
  index: 'Índices',
  forex: 'Forex',
  crypto: 'Cripto',
  stock: 'Ações',
}
const ORDEM_DOS_GRUPOS: TerminalAssetType[] = ['commodity', 'index', 'forex', 'crypto', 'stock']

export const GRUPOS_DE_ACTIVOS: readonly GrupoDeActivos[] = ORDEM_DOS_GRUPOS.map((chave) => ({
  chave,
  rotulo: ROTULOS_DOS_GRUPOS[chave],
  simbolos: TERMINAL_ASSETS.filter((a) => a.type === chave).map((a) => a.symbol),
}))

/** Quantos símbolos a pessoa pode escolher ao todo (o «de N» do cabeçalho). */
export const TOTAL_DE_ACTIVOS = GRUPOS_DE_ACTIVOS.reduce((n, g) => n + g.simbolos.length, 0)

// ── TIMEFRAMES ──────────────────────────────────────────────────────────────

/** Os timeframes que os scanners emitem (minutos, «D» = diário). A base só viu «15» em 7 dias. */
export const TIMEFRAMES: readonly string[] = ['5', '15', '30', '60', '240', 'D']

// ── CABEÇALHOS ──────────────────────────────────────────────────────────────

/**
 * O texto «X de N» de um cabeçalho de selector. É aqui, e não no JSX, porque foi exactamente
 * este número que enganou: «ESTRATÉGIAS (6)» com 4 chips. Agora diz o que conta e de quanto.
 */
export function cabecalhoDoSelector(nome: string, seleccionados: number, total: number): string {
  return seleccionados === 0 ? `${nome} · todos (${total})` : `${nome} · ${seleccionados} de ${total}`
}

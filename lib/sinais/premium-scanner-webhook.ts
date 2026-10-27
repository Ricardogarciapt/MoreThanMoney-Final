/**
 * Entrada do webhook do MTM Premium Scanner (docs/pine/mtm-premium-scanner.pine).
 *
 * 27/10/2026, pedido do dono: deixa de ser só sombra. Cada alerta do indicador (XAUUSD 15m, «Any
 * alert() function call», «Once Per Bar Close») segue o caminho do Trendshot:
 *   · registo em `tradingview_signals` como `entry` → MTM Alerts (gatilho notify_signal_subscribers);
 *   · gráfico do sinal em `chart_image_url` (o que as MTM Alerts mostram);
 *   · mestre SIM 10K «MTM Auto Premium II» pelo `encaminharSinalParaMestre` (fonte `premiumscanner`),
 *     por ordem limite no meio da zona válida 1 h (4 velas de 15m, como a EA).
 * Sem canal no chat nem grupo Telegram (decisão do dono, 27/10: «não cries já um canal do chat»).
 *
 * Os níveis vêm todos do Pine (entry = meio da zona, sl, tp1..tp4). Alerta incompleto não publica.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { normalizeSymbol } from '@/lib/mtmcopy/signal-parser'
import { urlDoGraficoDoSinal } from '@/lib/sinais/grafico-publicar'
import { encaminharSinalParaMestre } from '@/lib/mestres/servidor/sinal-mestre'

type Json = Record<string, unknown>

export const ESTRATEGIA_PREMIUM_SCANNER = 'premium-scanner'
export const NOME_PREMIUM_SCANNER = 'MTM Auto Premium II'

/** Janela em que o mesmo par na mesma direcção é o mesmo alerta (o TradingView repete-se). */
const JANELA_DUPLICADO_MS = 10 * 60_000
/** Validade da ordem limite na mestre: 4 velas de 15m, como `InpValidade` da EA. */
const VALIDADE_LIMITE_MS = 60 * 60_000

/** `?strategy=premiumscanner` no URL, ou `"strategy":"PremiumScanner"` no JSON do alerta. */
export function eAlertaPremiumScanner(strategy: string | null | undefined, payload: Json): boolean {
  const norm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const s = norm(strategy)
  if (s) return s === 'premiumscanner'
  return norm(payload.strategy) === 'premiumscanner'
}

function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

export async function processarPremiumScanner(payload: Json): Promise<{ ok: boolean; [k: string]: unknown }> {
  const supabase = getSupabaseAdmin()
  const tickerBruto = String(payload.ticker ?? payload.symbol ?? '')
  const simbolo = normalizeSymbol(tickerBruto.split(':').pop() ?? '')
  const acao = String(payload.action ?? '').toLowerCase()
  const direcao = acao === 'buy' || acao === 'sell' ? acao : null
  const timeframe = String(payload.timeframe ?? '') || null
  const entrada = numero(payload.entry)
  const sl = numero(payload.sl)
  const tps = ['tp1', 'tp2', 'tp3', 'tp4'].map((k) => numero(payload[k])).filter((t): t is number => t != null)

  const { data: log, error: erroLog } = await supabase
    .from('tradingview_signals')
    .insert({
      source: 'tradingview',
      ticker: simbolo || tickerBruto || null,
      timeframe,
      action: direcao,
      price: entrada,
      sl,
      tp: tps[0] ?? null,
      alert_name: 'MTM Premium Scanner',
      raw_payload: payload,
      estrategia: ESTRATEGIA_PREMIUM_SCANNER,
      signal_kind: 'entry',
      ligacao: 'origem',
    })
    .select('id')
    .single()
  if (erroLog) {
    console.error('[premium-scanner] registo falhou:', erroLog.message)
    return { ok: false, error: erroLog.message }
  }
  const logId = (log?.id as string | undefined) ?? null
  const falha = async (motivo: string) => {
    if (logId) await supabase.from('tradingview_signals').update({ ai_error: `premium-scanner: ${motivo}`, trade_status: 'filtered' }).eq('id', logId)
    return { ok: true, skipped: motivo }
  }

  if (!simbolo || !direcao || !entrada || !sl || tps.length < 3) return falha('alerta incompleto (ticker, action, entry, sl, tp1..tp3)')

  const desde = new Date(Date.now() - JANELA_DUPLICADO_MS).toISOString()
  const { data: recentes } = await supabase
    .from('tradingview_signals')
    .select('id')
    .eq('estrategia', ESTRATEGIA_PREMIUM_SCANNER)
    .eq('action', direcao)
    .not('processed_at', 'is', null)
    .neq('id', logId ?? '')
    .ilike('ticker', `%${simbolo.slice(0, 6)}%`)
    .gte('received_at', desde)
    .limit(1)
  if (recentes?.length) return falha('duplicado (mesmo par e direcção há <10 min)')

  if (logId) {
    await supabase
      .from('tradingview_signals')
      .update({ chart_image_url: urlDoGraficoDoSinal(logId), chat_status: 'skipped', telegram_status: 'skipped', processed_at: new Date().toISOString() })
      .eq('id', logId)
  }

  // Mestre: o alerta já está registado; uma falha aqui fica escrita e não parte o webhook.
  let mestre: string | null = null
  try {
    const m = await encaminharSinalParaMestre({
      fonte: 'premiumscanner',
      symbol: simbolo,
      direcao,
      entrada,
      sl,
      tps,
      externalRef: String(logId ?? ''),
      limite: { preco: entrada, expiraEm: new Date(Date.now() + VALIDADE_LIMITE_MS).toISOString() },
    })
    mestre = m.modo === 'desligado' ? null : m.modo
    if (m.motivo && logId) await supabase.from('tradingview_signals').update({ ai_error: `mestre premium II: ${m.motivo}`.slice(0, 300) }).eq('id', logId)
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error('[premium-scanner] mestre:', motivo)
    if (logId) await supabase.from('tradingview_signals').update({ ai_error: `mestre premium II: erro ao encaminhar: ${motivo}`.slice(0, 300) }).eq('id', logId)
  }
  return { ok: true, estrategia: ESTRATEGIA_PREMIUM_SCANNER, simbolo, direcao, entrada, sl, tps, mestre }
}

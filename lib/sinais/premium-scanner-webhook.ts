/**
 * Entrada do webhook do MTM Premium Scanner (docs/pine/mtm-premium-scanner.pine), pedido do dono a 27/10/2026.
 *
 * SÓ SOMBRA: regista cada alerta em `tradingview_signals` com os níveis que o Pine calculou e não
 * publica, não notifica e não executa. `signal_kind = 'sombra'` deixa a linha fora do gatilho
 * `notify_signal_subscribers`, do avaliador das MTM Alerts e dos feeds; `trade_status = 'filtered'`
 * tira-a também do feed principal. Serve para comparar 2–4 semanas com os sinais Premium reais
 * (docs/premium-scanner-engenharia-reversa.md) antes de se decidir publicar ou ligar uma mestre.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { normalizeSymbol } from '@/lib/mtmcopy/signal-parser'

type Json = Record<string, unknown>

export const ESTRATEGIA_PREMIUM_SCANNER = 'premium-scanner'

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
  const tickerBruto = String(payload.ticker ?? payload.symbol ?? '')
  const simbolo = normalizeSymbol(tickerBruto.split(':').pop() ?? '')
  const acao = String(payload.action ?? '').toLowerCase()
  const direcao = acao === 'buy' || acao === 'sell' ? acao : null
  const entrada = numero(payload.entry)
  const sl = numero(payload.sl)
  const tp1 = numero(payload.tp1)

  const { data, error } = await getSupabaseAdmin()
    .from('tradingview_signals')
    .insert({
      source: 'tradingview',
      ticker: simbolo || tickerBruto || null,
      timeframe: String(payload.timeframe ?? '') || null,
      action: direcao,
      price: entrada,
      sl,
      tp: tp1,
      alert_name: 'MTM Premium Scanner',
      raw_payload: { ...payload, modo: 'sombra' },
      estrategia: ESTRATEGIA_PREMIUM_SCANNER,
      signal_kind: 'sombra',
      trade_status: 'filtered',
      ligacao: 'origem',
      ai_error: !simbolo || !direcao || !entrada || !sl || !tp1 ? 'premium-scanner: alerta incompleto (ticker, action, entry, sl, tp1)' : null,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[premium-scanner] registo falhou:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, sombra: true, id: data?.id ?? null }
}

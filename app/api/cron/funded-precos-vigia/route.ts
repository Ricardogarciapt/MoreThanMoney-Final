import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMarketQuotes } from '@/lib/mtmcopy/metaapi'
import { CANONICAL_PREMIUM_ACCOUNT_ID } from '@/lib/mtmcopy/provider-constants'
import { isMarketOpen } from '@/lib/mtmcopy/market-hours'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * VIGIA DO FEED DE PREÇOS DO MTM FUNDED — os preços têm de estar SEMPRE funcionais.
 *
 * O feed principal é o funded-motor no VPS. Quando ele pára (crash, egress da Supabase, VPS em
 * baixo — aconteceu tudo isto a 2026-09-19/20), o WebTrader congela e nenhum sinal abre. Este
 * cron corre a cada minuto na Vercel, um caminho FÍSICO diferente do VPS:
 *
 *  · feed fresco (tick < 90s em símbolo de mercado aberto) → não faz NADA (zero custo MetaApi);
 *  · feed parado → puxa cotações pelo MetaApi (uma ligação RPC, todos os símbolos ativos com
 *    mercado aberto) e escreve funded_precos — modo degradado a ~1 tick/min, mas o WebTrader
 *    mexe, os SL/TP têm preço e os sinais abrem;
 *  · avisa o admin por Telegram na PRIMEIRA falha e no regresso (dedup em site_settings).
 *
 * Conta MetaApi das cotações: FUNDED_VIGIA_METAAPI_ACCOUNT ou a mestre Premium (sempre deployed).
 */
const FLAG = 'funded_precos_vigia'
const ADMIN_CHAT = () => process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '1446687230'

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = getSupabaseAdmin()
  try {
    // Frescura: só conta um símbolo cujo MERCADO está aberto — sábado o EURUSD parado é normal.
    const { data: ticks } = await db.from('funded_precos').select('symbol, em').order('em', { ascending: false }).limit(30)
    const agora = Date.now()
    const maisFresco = (ticks ?? []).find((t) => isMarketOpen(String(t.symbol)).open)
    const idadeMs = maisFresco ? agora - Date.parse(String(maisFresco.em)) : Number.POSITIVE_INFINITY
    const { data: flag } = await db.from('site_settings').select('value').eq('key', FLAG).maybeSingle()
    const alertado = Boolean((flag?.value as { alertado_em?: string } | null)?.alertado_em)

    if (idadeMs < 90_000) {
      if (alertado) {
        await db.from('site_settings').delete().eq('key', FLAG)
        await sendTelegramChannelMessage(ADMIN_CHAT(), '✅ MTM Funded: o feed de preços do motor voltou — vigia de novo em espera.').catch(() => undefined)
      }
      return NextResponse.json({ ok: true, motor: 'vivo', idadeSeg: Math.round(idadeMs / 1000) })
    }

    // Feed parado → cotações pelo MetaApi para os símbolos ativos com mercado aberto.
    const { data: simbolos } = await db.from('funded_symbols').select('symbol').eq('ativo', true).order('ordem').limit(25)
    const abertos = (simbolos ?? []).map((s) => String(s.symbol)).filter((s) => isMarketOpen(s).open)
    const conta = process.env.FUNDED_VIGIA_METAAPI_ACCOUNT?.trim() || CANONICAL_PREMIUM_ACCOUNT_ID
    const quotes = await getMarketQuotes(conta, abertos)
    const linhas = Object.entries(quotes).map(([symbol, q]) => ({ symbol, bid: q.bid, ask: q.ask, em: new Date().toISOString() }))
    let escritos = 0
    if (linhas.length) {
      const { error } = await db.from('funded_precos').upsert(linhas, { onConflict: 'symbol' })
      if (!error) escritos = linhas.length
    }

    if (!alertado) {
      await db.from('site_settings').upsert({ key: FLAG, value: { alertado_em: new Date().toISOString() } }, { onConflict: 'key' })
      const min = Number.isFinite(idadeMs) ? Math.round(idadeMs / 60_000) : '?'
      await sendTelegramChannelMessage(
        ADMIN_CHAT(),
        `🚨 MTM Funded: o feed de preços do motor está PARADO há ${min} min.\n` +
          `O vigia da Vercel assumiu em modo degradado (${escritos} símbolos a ~1 tick/min via MetaApi).\n` +
          `Reiniciar no VPS: sudo systemctl restart funded-motor funded-copier`,
      ).catch(() => undefined)
    }
    return NextResponse.json({ ok: true, motor: 'parado', idadeSeg: Number.isFinite(idadeMs) ? Math.round(idadeMs / 1000) : null, simbolosAbertos: abertos.length, escritos })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'erro' }, { status: 500 })
  }
}

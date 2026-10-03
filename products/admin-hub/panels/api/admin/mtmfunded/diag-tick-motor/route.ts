import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { tickSincronoLigado, ticksDoMotor, resumoTickMotor, ESPERA_MS, IDADE_ALVO_MS } from '@/lib/mtmfunded/precos/tick-motor'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * DIAGNÓSTICO do atalho /precos/tick (Vercel → motor do VPS) — a perna que tira o retrato velho
 * da Supabase do caminho das aberturas. Existe porque a 28/09 as mestres recusavam entradas com
 * «sem preço ao vivo» apesar de o atalho estar construído: esta rota diz QUAL das pernas falta
 * (env na Vercel · nginx · segredo no motor) sem expor nenhum segredo.
 *
 * Autorização: admin de sessão, ou token de uso único em site_settings.diag_tick_token.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')?.trim() ?? ''
  const db = getSupabaseAdmin()
  let autorizado = false
  if (key) {
    const { data } = await db.from('site_settings').select('value').eq('key', 'diag_tick_token').maybeSingle()
    const esperado = typeof data?.value === 'string' ? data.value : (data?.value as { token?: string } | null)?.token
    if (esperado && key === esperado) {
      autorizado = true
      await db.from('site_settings').delete().eq('key', 'diag_tick_token')
    }
  }
  if (!autorizado) {
    const negado = await requireAdmin(req)
    if (negado) return negado
  }

  const base = (process.env.FUNDED_TICK_URL || 'https://stream.morethanmoney.pt/precos/tick').replace(/\/+$/, '')
  const envs = {
    LMS_CAPTION_WORKER_SECRET: Boolean(process.env.LMS_CAPTION_WORKER_SECRET),
    FUNDED_TICK_SINCRONO: process.env.FUNDED_TICK_SINCRONO ?? null,
    FUNDED_TICK_URL: process.env.FUNDED_TICK_URL ?? null,
    NEXT_PUBLIC_FUNDED_WS_URL: process.env.NEXT_PUBLIC_FUNDED_WS_URL ?? null,
  }

  // 1. O fetch cru — o código de estado diz qual perna falta (404=nginx · 503=segredo no motor
  //    · 401=segredos diferentes · 200=tudo ligado).
  let cru: { status: number | null; corpo: string } = { status: null, corpo: '' }
  try {
    const r = await fetch(`${base}?symbols=XAUUSD`, {
      headers: process.env.LMS_CAPTION_WORKER_SECRET ? { 'x-caption-secret': process.env.LMS_CAPTION_WORKER_SECRET } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    cru = { status: r.status, corpo: (await r.text()).slice(0, 300) }
  } catch (e) {
    cru = { status: null, corpo: `fetch falhou: ${e instanceof Error ? e.message : String(e)}` }
  }

  // 2. O caminho real das aberturas (com memo/backoff), como o abrir.ts o usa.
  let caminho: unknown = null
  try {
    const ticks = await ticksDoMotor(['XAUUSD', 'EURUSD', 'BTCUSD'])
    caminho = Object.fromEntries([...ticks.entries()].map(([s, t]) => [s, { bid: t.bid, fonte: t.fonte, idadeMs: t.idadeMs }]))
  } catch (e) {
    caminho = { erro: e instanceof Error ? e.message : String(e) }
  }

  return NextResponse.json({
    ok: cru.status === 200,
    sincronoLigado: tickSincronoLigado(),
    envs,
    limites: { esperaMs: ESPERA_MS, idadeAlvoMs: IDADE_ALVO_MS },
    fetchCru: cru,
    caminhoReal: caminho,
    resumo: resumoTickMotor(),
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { listOpenPositions } from '@/lib/mtmcopy/metaapi'

/**
 * Posições abertas de uma ou mais contas MetaApi (Bearer CRON_SECRET) — uso operacional/diagnóstico
 * (ex.: confirmar se um subscritor copiou uma trade do master). body: { accounts: [metaapiId,...] }.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const b = (await req.json().catch(() => ({}))) as { accounts?: string[] }
  const accounts = Array.isArray(b.accounts) ? b.accounts.filter(Boolean).slice(0, 10) : []
  if (!accounts.length) return NextResponse.json({ ok: false, error: 'accounts em falta' }, { status: 400 })

  const out: Record<string, { count: number; positions: Array<{ symbol: string; volume: number; type: string }> }> = {}
  await Promise.all(
    accounts.map(async (id) => {
      try {
        const pos = await listOpenPositions(id)
        out[id] = {
          count: pos.length,
          positions: pos.map((p) => ({
            symbol: (p as { symbol?: string }).symbol ?? '?',
            volume: (p as { volume?: number }).volume ?? 0,
            type: (p as { type?: string }).type ?? '?',
          })),
        }
      } catch (e) {
        out[id] = { count: -1, positions: [] }
        console.error('[positions] erro', id, e instanceof Error ? e.message : e)
      }
    }),
  )
  return NextResponse.json({ ok: true, accounts: out })
}

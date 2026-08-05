import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { buildSalesState, runSalesCommand } from '@/lib/sales-machine'

/**
 * HUB da MÁQUINA DE VENDAS — ponto único de estado + comandos.
 * Consumido por: consola /admin (sessão-admin) e AIOS local/VPS (Bearer CRON_SECRET).
 * (O AIOS via /api/agent/v1/business partilha a mesma lib lib/sales-machine.)
 *
 *  GET  → estado completo.  POST → { action, ... } (ver runSalesCommand).
 */
export const dynamic = 'force-dynamic'

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET
  if (secret && (req.headers.get('authorization') || '') === `Bearer ${secret}`) return null
  return requireAdmin(req)
}

export async function GET(req: NextRequest) {
  const denied = await authorize(req)
  if (denied) return denied
  try {
    return NextResponse.json({ ok: true, state: await buildSalesState() })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await authorize(req)
  if (denied) return denied
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; account?: string; key?: string; on?: boolean }
  const result = await runSalesCommand(body)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}

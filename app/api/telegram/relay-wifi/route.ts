import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { relayTextToWifi } from '@/lib/telegram/relay'

/**
 * Relay manual de texto da Premium → canal parceiro (Wifi Money), com branding.
 * Usado para validar / reencaminhar mensagens já publicadas (que o webhook não apanha).
 * Bearer CRON_SECRET. body: { text, sourceMessageId? }
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const b = (await req.json().catch(() => ({}))) as { text?: string; sourceMessageId?: number }
  const text = (b.text ?? '').toString()
  if (!text.trim()) return NextResponse.json({ ok: false, error: 'text obrigatório' }, { status: 400 })
  const sourceMessageId = typeof b.sourceMessageId === 'number' ? b.sourceMessageId : Date.now()
  const r = await relayTextToWifi(getSupabaseAdmin(), text, sourceMessageId)
  return NextResponse.json(r)
}

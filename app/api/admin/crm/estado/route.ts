import { NextResponse } from 'next/server'
import { verifyAdminAccess } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
export const dynamic = 'force-dynamic'

/** Estado operacional sem textos de conversas, segredos ou contactos. Nunca aberto por CRON_SECRET. */
export async function GET() {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  try {
    const db = getSupabaseAdmin()
    const [interruptor, ...contagens] = await Promise.all([
      db.from('site_settings').select('value').eq('key', 'crm_bots_ligado').maybeSingle(),
      ...['pendente','processando','feito','revisao','morto'].map(estado =>
        db.from('crm_bots_fila').select('id', { count: 'exact', head: true }).eq('estado', estado)),
    ])
    if (interruptor.error || contagens.some(r => r.error)) throw new Error('consulta_falhou')
    const { data: antigo, error } = await db.from('crm_bots_fila').select('criado_em')
      .in('estado', ['pendente','processando']).order('criado_em').limit(1).maybeSingle()
    if (error) throw error
    return NextResponse.json({
      ligado: interruptor.data?.value === true,
      fila: Object.fromEntries(['pendente','processando','feito','revisao','morto'].map((s,i) => [s,contagens[i].count ?? 0])),
      mais_antigo: antigo?.criado_em ?? null,
      configuracao: {
        supabase: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        instagram_assinatura: !!process.env.INSTAGRAM_APP_SECRET,
        whatsapp_assinatura: !!process.env.WHATSAPP_APP_SECRET,
        telegram_autenticacao: !!process.env.TELEGRAM_WEBHOOK_SECRET,
        cron: (process.env.CRON_SECRET?.length ?? 0) >= 32,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Estado CRM indisponível; verificar migrações e ligação à base.' }, { status: 503 })
  }
}

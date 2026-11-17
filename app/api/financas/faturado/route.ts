/**
 * Link «marcar faturado» da lista do Telegram. Assinado com HMAC (CRON_SECRET), por isso funciona
 * sem login mas só para o pagamento a que o link pertence. `?n=FR 2026/12` guarda o número da fatura.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { assinaturaValida } from '@/lib/financas/por-faturar'

export const dynamic = 'force-dynamic'

const pagina = (titulo: string, texto: string, status = 200) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><body style="background:#0b0b0b;color:#eee;font-family:system-ui;padding:32px;text-align:center"><h1 style="color:#D2A63C">${titulo}</h1><p>${texto}</p></body>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } },
  )

export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get('c') ?? ''
  const t = req.nextUrl.searchParams.get('t') ?? ''
  const n = req.nextUrl.searchParams.get('n')?.slice(0, 60) || null
  const segredo = process.env.CRON_SECRET?.trim()
  if (!segredo || !c || !assinaturaValida(c, t, segredo)) return pagina('Link inválido', 'Este link não é válido.', 403)
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('financas_por_faturar')
    .update({ faturado_em: new Date().toISOString(), ...(n ? { numero_fatura: n } : {}) })
    .eq('charge_id', c)
    .select('valor, moeda, cliente_email')
    .maybeSingle()
  if (error || !data) return pagina('Não encontrado', 'Esse pagamento não está na lista.', 404)
  return pagina('Faturado ✅', `${Number(data.valor).toFixed(2).replace('.', ',')} ${data.moeda}${data.cliente_email ? ` · ${data.cliente_email}` : ''} saiu da lista.`)
}

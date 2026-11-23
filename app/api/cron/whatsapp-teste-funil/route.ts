import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { enviarWhatsApp } from '@/lib/whatsapp-mensageiro'
import { normalizarE164 } from '@/lib/whatsapp-envio'
import { primeiroNome } from '@/lib/whatsapp/templates-mtm'
import { TEMPLATE_REENCONTRO } from '@/lib/vendas/guiao-whatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * TESTE DO FUNIL DE WHATSAPP (23/11/2026) — manda a abertura do reencontro a um número de TESTE,
 * pelo caminho real (template aprovado + `telegram_leads` em `wa_reencontro`), para o dono ver como
 * chega e tocar nos botões. Só para números em `site_settings.whatsapp_numeros_teste.numeros`.
 *
 *   GET ?chave=<whatsapp_diag_chave>&para=+351912666699[&nome=Ricardo][&template=mtm_reencontro]
 */
async function autorizado(req: NextRequest): Promise<boolean> {
  const segredo = process.env.CRON_SECRET
  if (segredo && req.headers.get('authorization') === `Bearer ${segredo}`) return true
  const chave = req.nextUrl.searchParams.get('chave') ?? ''
  if (chave.length < 24) return false
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'whatsapp_diag_chave').maybeSingle()
  const guardada = (data?.value as { chave?: string } | null)?.chave
  return !!guardada && guardada === chave
}

export async function GET(req: NextRequest) {
  if (!(await autorizado(req))) return NextResponse.json({ ok: false, erro: 'nao_autorizado' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { e164 } = normalizarE164(req.nextUrl.searchParams.get('para'))
  if (!e164) return NextResponse.json({ ok: false, erro: 'numero_invalido' }, { status: 400 })

  const { data: s } = await db.from('site_settings').select('value').eq('key', 'whatsapp_numeros_teste').maybeSingle()
  const permitidos = ((s?.value as { numeros?: string[] } | null)?.numeros ?? []).map((n) => normalizarE164(n).e164)
  if (!permitidos.includes(e164)) return NextResponse.json({ ok: false, erro: 'nao_e_numero_de_teste' }, { status: 403 })

  const nome = req.nextUrl.searchParams.get('nome') || 'Ricardo'
  const template = req.nextUrl.searchParams.get('template') || TEMPLATE_REENCONTRO
  const digitos = e164.replace(/\D/g, '')
  // Recomeça o funil do número de teste do zero.
  await db.from('telegram_leads').delete().eq('chat_id', `wa:${digitos}`)

  const res = await enviarWhatsApp({
    para: e164,
    finalidade: 'campanha',
    template: { nome: template, idioma: 'pt_PT', parametros: [primeiroNome(nome)] },
    agente: { funil: 'whatsapp:reencontro' },
    licencaDono: 'teste do dono',
  })
  if (res.enviado) {
    await db.from('telegram_leads').upsert(
      { chat_id: `wa:${digitos}`, source: 'whatsapp', stage: 'wa_reencontro', first_name: primeiroNome(nome), updated_at: new Date().toISOString() },
      { onConflict: 'chat_id' },
    )
  }
  return NextResponse.json({ ok: res.enviado, template, decisao: res.decisao?.codigo, porque: res.porque })
}

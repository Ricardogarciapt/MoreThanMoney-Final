/**
 * LEAD INSTANTÂNEO (cron de 5 em 5 min) — o lead quente entra no pipeline e o dono é avisado em
 * minutos, não na manhã seguinte.
 *
 *   1. ingere só as fontes quentes (Telegram e Instagram) — `ingerirQuentes`;
 *   2. avisa por Telegram cada negócio quente criado nos últimos 30 min ainda não avisado
 *      (memória em `bot_avisos_enviados`, chave `lead-instantaneo:<id>`).
 *
 * Não escreve a ninguém de fora: avisa um humano, com o toque para responder já.
 * Leads importados (WhatsApp) ficam de fora de propósito: não são novos.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import { chatDeAdminDoAmbiente } from '@/lib/telegram-admin-menu'
import { ingerirQuentes } from '@/lib/backoffice-dia-ingestao'
import { mensagemDoAviso, type LeadNovo } from '@/lib/vendas/lead-instantaneo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.morethanmoney.pt'
const FONTES_QUENTES = ['telegram', 'instagram', 'formulario', 'agenda']
const JANELA_MIN = 30

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()

  const ingestao = await ingerirQuentes(db)

  const desde = new Date(Date.now() - JANELA_MIN * 60000).toISOString()
  const { data, error } = await db
    .from('vendas_negocios')
    .select('id, nome, origem, interesse, broker_uid, telegram_username, instagram_handle, telefone, idioma, criado_em')
    .in('origem', FONTES_QUENTES)
    .eq('estado', 'lead')
    .gte('criado_em', desde)
    .order('criado_em', { ascending: true })
    .limit(20)
  if (error) return NextResponse.json({ ok: false, ingestao, error: error.message }, { status: 500 })

  const leads = (data ?? []) as LeadNovo[]
  if (!leads.length) return NextResponse.json({ ok: true, ingestao, avisados: 0 })

  const chaves = leads.map((l) => `lead-instantaneo:${l.id}`)
  const { data: ja } = await db.from('bot_avisos_enviados').select('chave').in('chave', chaves)
  const avisadas = new Set((ja ?? []).map((r) => String(r.chave)))

  const chat = chatDeAdminDoAmbiente()
  let avisados = 0
  for (const l of leads) {
    const chave = `lead-instantaneo:${l.id}`
    if (avisadas.has(chave)) continue
    // Marca ANTES de enviar: um aviso perdido é melhor do que o mesmo aviso de 5 em 5 minutos.
    const { error: e } = await db.from('bot_avisos_enviados').upsert({ chave, tipo: 'lead-instantaneo', alvo: l.nome }, { onConflict: 'chave', ignoreDuplicates: true })
    if (e) continue
    const r = await sendTelegramChannelMessage(chat, mensagemDoAviso(l, SITE), { parseMode: 'HTML' })
    if (r.ok) avisados++
  }
  return NextResponse.json({ ok: true, ingestao, avisados })
}

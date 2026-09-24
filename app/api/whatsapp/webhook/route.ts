import { NextRequest, NextResponse } from 'next/server'
import { runLeadFunnelReply } from '@/lib/telegram-lead-funnel'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Webhook do WhatsApp (Meta Cloud API) — funil de vendas MTM no WhatsApp, reutilizando o MESMO
 * cérebro closer do Telegram (runLeadFunnelReply), e por isso a escada que anuncia é sempre a de
 * `lib/escada-precos.ts`. Este comentário dizia «PU Prime 300$» muito depois de o mínimo ter
 * passado a 350 — um comentário errado é a próxima pessoa a escrever o número errado.
 *
 * PREPARADO mas inerte até configurares no VPS/Meta:
 *  - WHATSAPP_VERIFY_TOKEN     → token de verificação do webhook (GET hub.verify_token)
 *  - WHATSAPP_TOKEN            → token de acesso (permanente/system-user) para enviar mensagens
 *  - WHATSAPP_PHONE_NUMBER_ID  → id do número de WhatsApp Business (Cloud API)
 *  Alternativa VPS: WHATSAPP_RELAY_URL (+ CRON_SECRET) para enviar via um relay próprio no VPS.
 */
export const dynamic = 'force-dynamic'

// 1) Verificação do webhook (Meta faz um GET com hub.challenge ao configurar)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const mode = p.get('hub.mode')
  const token = p.get('hub.verify_token')
  const challenge = p.get('hub.challenge')
  const expected = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && expected && token === expected) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return NextResponse.json({ ok: false, error: 'verify failed' }, { status: 403 })
}

interface WAMessage { from?: string; type?: string; text?: { body?: string } }

/**
 * O funil de WhatsApp só trata LEADS NOVOS — nunca contactos/clientes já existentes.
 * "Existente" = já é utilizador registado (profiles.phone/whatsapp ou users.phone) OU já tem
 * um registo de lead com outra origem que não o próprio bot de WhatsApp (ex.: contacto humano).
 * Um número novo (ou já iniciado por este bot) continua o funil normalmente.
 */
async function isNewWhatsAppLead(phone: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const digits = phone.replace(/\D/g, '')
  const last9 = digits.slice(-9)
  // 1) Já é cliente/utilizador registado? → NÃO é lead novo (não abordar).
  const like = `%${last9}`
  const { data: prof } = await supabase
    .from('profiles')
    .select('id')
    .or(`phone.ilike.${like},whatsapp.ilike.${like}`)
    .limit(1)
  if (prof?.length) return false
  const { data: usr } = await supabase.from('users').select('id').ilike('phone', like).limit(1)
  if (usr?.length) return false
  // 2) Já existe lead com origem diferente do bot de WhatsApp (contacto humano/outro canal)?
  const { data: lead } = await supabase
    .from('telegram_leads')
    .select('source')
    .eq('chat_id', `wa:${phone}`)
    .maybeSingle()
  if (lead && lead.source && lead.source !== 'whatsapp') return false
  return true
}

async function sendWhatsApp(to: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  // Relay próprio no VPS (contorna limites/gestão de token no servidor da Meta), se configurado.
  const relay = process.env.WHATSAPP_RELAY_URL
  if (relay) {
    await fetch(relay, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
      body: JSON.stringify({ to, text: body }),
    }).catch(() => {})
    return
  }
  if (!token || !phoneId) {
    console.warn('[whatsapp] WHATSAPP_TOKEN/PHONE_NUMBER_ID em falta — mensagem não enviada (prepara no VPS/Meta)')
    return
  }
  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  }).catch((e) => console.error('[whatsapp] envio falhou:', e))
}

// 2) Mensagens recebidas → cérebro do funil → resposta
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  try {
    const changes = body?.entry?.[0]?.changes ?? []
    for (const ch of changes) {
      const value = ch?.value ?? {}
      const contactName = value?.contacts?.[0]?.profile?.name ?? null
      for (const m of (value?.messages ?? []) as WAMessage[]) {
        const from = m.from
        const text = m.text?.body?.trim()
        if (!from || !text) continue
        // SÓ leads novos — nunca contactos/clientes existentes.
        if (!(await isNewWhatsAppLead(from))) {
          console.log('[whatsapp] contacto existente — funil ignorado:', from)
          continue
        }
        // Mesmo funil do Telegram + MESMAS tags (source='whatsapp') — estado por chat_id 'wa:<n>'.
        const reply = await runLeadFunnelReply({
          chatId: `wa:${from}`,
          firstName: contactName,
          username: from,
          userText: text,
          source: 'whatsapp',
        })
        await sendWhatsApp(
          from,
          reply ||
            'Diz-me só: procuras aprender, copiar sinais prontos ou algo automático? 🙂',
        )
      }
    }
  } catch (e) {
    console.error('[whatsapp] webhook erro:', e instanceof Error ? e.message : e)
  }
  // Responder 200 sempre (a Meta reenviaria em erro).
  return NextResponse.json({ ok: true })
}

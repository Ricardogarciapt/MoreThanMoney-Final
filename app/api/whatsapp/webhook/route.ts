import { NextRequest, NextResponse } from 'next/server'
import { runLeadFunnelReply } from '@/lib/telegram-lead-funnel'

/**
 * Webhook do WhatsApp (Meta Cloud API) — funil de vendas MTM no WhatsApp, reutilizando o MESMO
 * cérebro closer do Telegram (runLeadFunnelReply): escada Membro → PU Prime 300$ → Premium grátis.
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
        // Mesmo funil do Telegram — estado por chat_id ('wa:<numero>').
        const reply = await runLeadFunnelReply({
          chatId: `wa:${from}`,
          firstName: contactName,
          username: from,
          userText: text,
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

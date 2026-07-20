/**
 * Funil broker-gated do Telegram — acesso aos grupos de sinais + app SÓ após:
 *  1) abrir conta na PU Prime (link),
 *  2) enviar o UID da corretora,
 *  3) provar depósito ≥ $300 (auto-match em broker_clients OU print screen aprovado).
 * Ao validar: gera links pessoais (Forex/Sensei) + cupão Premium individual (ativa app + onboarding).
 * Sem promessas de lucro. Estado em telegram_leads.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

type Supa = ReturnType<typeof getSupabaseAdmin>

export const PUPRIME_LINK = 'https://www.puprime.com/campaign?cs=morethanmoney'
export const MIN_DEPOSIT = 300
const FOREX_CHAT = '-1003716578747'
const SENSEI_CHAT = '-1003853860780'
const BOT = () => process.env.TELEGRAM_BOT_TOKEN

async function tg(method: string, body: Record<string, unknown>) {
  const token = BOT()
  if (!token) return null
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await r.json()
  } catch {
    return null
  }
}
const send = (chatId: string | number, text: string, extra: Record<string, unknown> = {}) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra })

/** Um UID de corretora = número com 5–12 dígitos. */
export function looksLikeBrokerUid(text: string): string | null {
  const m = text.replace(/\s/g, '').match(/^#?(\d{5,12})$/)
  return m ? m[1] : null
}

async function getAdminChatId(supabase: Supa): Promise<string | null> {
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'telegram_admin_chat_id')
    .maybeSingle()
  const v = (data?.value as { chat_id?: string } | null)?.chat_id
  return v ? String(v) : null
}

/** Auto-match: o UID existe em broker_clients com depósito E saldo ≥ mínimo? */
async function autoValidated(supabase: Supa, uid: string): Promise<boolean> {
  const { data } = await supabase
    .from('broker_clients')
    .select('deposits_usd, balance_usd')
    .eq('uid', uid)
    .maybeSingle()
  if (!data) return false
  return Number(data.deposits_usd ?? 0) >= MIN_DEPOSIT && Number(data.balance_usd ?? 0) >= MIN_DEPOSIT
}

/** Lead enviou o UID. Guarda; se auto-validado liberta, senão pede o print screen. */
export async function handleBrokerUid(
  supabase: Supa,
  chatId: string,
  uid: string,
  firstName?: string | null,
): Promise<void> {
  await supabase.from('telegram_leads').upsert(
    {
      chat_id: chatId,
      first_name: firstName ?? null,
      broker_uid: uid,
      stage: 'awaiting_proof',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'chat_id' },
  )
  if (await autoValidated(supabase, uid)) {
    await grantBrokerAccess(supabase, chatId)
    return
  }
  await send(
    chatId,
    `✅ Recebi o teu UID <b>${uid}</b>.\n\n` +
      `Agora envia-me um <b>print screen</b> da tua conta PU Prime a mostrar o <b>depósito de ≥ $${MIN_DEPOSIT}</b>. ` +
      `Assim que confirmar, liberto o acesso aos grupos de sinais + cupão Premium para a app. 📸`,
  )
}

/** Lead enviou o print screen (foto). Guarda e envia ao admin para aprovar. */
export async function handleProofPhoto(
  supabase: Supa,
  chatId: string,
  fileId: string,
  firstName?: string | null,
): Promise<void> {
  const { data: lead } = await supabase
    .from('telegram_leads')
    .select('broker_uid, stage')
    .eq('chat_id', chatId)
    .maybeSingle()
  const uid = (lead as { broker_uid?: string } | null)?.broker_uid
  if (!uid) {
    await send(chatId, `Primeiro envia-me o teu <b>UID</b> da PU Prime (só o número). Ainda não abriste conta? 👉 ${PUPRIME_LINK}`)
    return
  }
  // auto-match tem prioridade
  if (await autoValidated(supabase, uid)) {
    await grantBrokerAccess(supabase, chatId)
    return
  }
  await supabase
    .from('telegram_leads')
    .update({ proof_file_id: fileId, stage: 'pending_review', first_name: firstName ?? null, updated_at: new Date().toISOString() })
    .eq('chat_id', chatId)
  await send(chatId, '📸 Recebido! Estou a validar o teu depósito — em breve liberto o acesso. 🙌')

  const adminChat = await getAdminChatId(supabase)
  if (!adminChat) {
    console.warn('[broker-gate] telegram_admin_chat_id não configurado — não é possível notificar aprovação')
    return
  }
  await tg('sendPhoto', {
    chat_id: adminChat,
    photo: fileId,
    caption: `🆕 <b>Pedido de acesso</b>\nUID: <code>${uid}</code>\nLead: ${firstName ?? chatId} (chat ${chatId})\n\nDepósito ≥ $${MIN_DEPOSIT}?`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Aprovar', callback_data: `bkapprove:${chatId}` },
          { text: '❌ Rejeitar', callback_data: `bkreject:${chatId}` },
        ],
      ],
    },
  })
}

/** Cria um cupão Premium individual e devolve o código. */
async function createPremiumCoupon(supabase: Supa, chatId: string, uid?: string | null): Promise<string | null> {
  const rand = Math.abs((Number(chatId) || 0) ^ (Date.parse(new Date().toISOString()) & 0xffffff))
    .toString(36)
    .toUpperCase()
    .slice(0, 6)
  const code = `MTM-BROKER-${(uid || chatId).toString().slice(-6)}-${rand}`
  const { error } = await supabase.from('coupons').insert({
    code,
    type: 'free_subscription',
    discount_value: 0,
    plan_override: 'premium',
    max_uses: 1,
    used_count: 0,
    is_active: true,
    grant_days: 30,
    grants_vip: false,
    description: `Broker-gated (PU Prime UID ${uid ?? '?'}) — Premium enquanto saldo ≥ $${MIN_DEPOSIT}`,
  })
  if (error) {
    console.error('[broker-gate] criar cupão falhou:', error.message)
    return null
  }
  return code
}

/** VALIDADO → gera links pessoais Forex+Sensei + cupão Premium e entrega ao lead. */
export async function grantBrokerAccess(supabase: Supa, chatId: string): Promise<void> {
  const { data: lead } = await supabase
    .from('telegram_leads')
    .select('broker_uid, coupon_code, stage')
    .eq('chat_id', chatId)
    .maybeSingle()
  if ((lead as { stage?: string } | null)?.stage === 'granted') return
  const uid = (lead as { broker_uid?: string } | null)?.broker_uid ?? null

  // links de convite pessoais (one-time)
  const mkLink = async (chat: string) => {
    const r = await tg('createChatInviteLink', { chat_id: chat, member_limit: 1, name: `lead ${chatId}` })
    return (r as { result?: { invite_link?: string } } | null)?.result?.invite_link ?? null
  }
  const forex = await mkLink(FOREX_CHAT)
  const sensei = await mkLink(SENSEI_CHAT)

  const coupon = (lead as { coupon_code?: string } | null)?.coupon_code || (await createPremiumCoupon(supabase, chatId, uid))

  await supabase
    .from('telegram_leads')
    .update({ stage: 'granted', coupon_code: coupon, granted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('chat_id', chatId)

  const links = [forex ? `💱 <a href="${forex}">Grupo Forex</a>` : null, sensei ? `🧠 <a href="${sensei}">Grupo Sensei</a>` : null]
    .filter(Boolean)
    .join('\n')
  await send(
    chatId,
    `🎉 <b>Acesso libertado!</b>\n\n` +
      `Entra nos grupos de sinais (links pessoais):\n${links}\n\n` +
      (coupon
        ? `📲 O teu cupão Premium para a app: <code>${coupon}</code>\n` +
          `Descarrega a app, cria conta e usa o cupão para ativar + fazer onboarding: https://www.morethanmoney.pt/register\n\n`
        : '') +
      `Mantém o saldo ≥ $${MIN_DEPOSIT} na PU Prime para continuares com acesso. Bons trades! 🚀`,
  )
}

/** Callback dos botões Aprovar/Rejeitar do admin. Devolve texto p/ editar a caption. */
export async function handleBrokerApproval(
  supabase: Supa,
  data: string,
  adminChatId: string,
  messageId: number,
): Promise<boolean> {
  const m = data.match(/^bk(approve|reject):(.+)$/)
  if (!m) return false
  const [, action, leadChat] = m
  if (action === 'approve') {
    await grantBrokerAccess(supabase, leadChat)
    await tg('editMessageCaption', { chat_id: adminChatId, message_id: messageId, caption: `✅ APROVADO (chat ${leadChat})`, parse_mode: 'HTML' })
  } else {
    await supabase.from('telegram_leads').update({ stage: 'rejected', updated_at: new Date().toISOString() }).eq('chat_id', leadChat)
    await send(leadChat, `Não consegui confirmar o depósito de ≥ $${MIN_DEPOSIT}. Verifica e reenvia o print screen, ou fala comigo. 🙏`)
    await tg('editMessageCaption', { chat_id: adminChatId, message_id: messageId, caption: `❌ REJEITADO (chat ${leadChat})`, parse_mode: 'HTML' })
  }
  return true
}

/** Mensagem que instrui o passo do broker (usada pela IA / comando). */
export function brokerStepMessage(): string {
  return (
    `🔓 <b>Para teres acesso aos grupos de sinais + app Premium:</b>\n\n` +
    `1️⃣ Abre conta na PU Prime (a corretora que usamos): ${PUPRIME_LINK}\n` +
    `2️⃣ Deposita no mínimo <b>$${MIN_DEPOSIT}</b>\n` +
    `3️⃣ Envia-me aqui o teu <b>UID</b> da PU Prime (só o número)\n` +
    `4️⃣ Envia um <b>print screen</b> do depósito\n\n` +
    `Assim que validar, liberto os grupos + dou-te o cupão Premium para a app. 🚀`
  )
}

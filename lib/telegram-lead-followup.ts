import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'

/**
 * FOLLOW-UP de reativação de leads mornos no funil do Telegram (ManyChat Essential — nativo).
 * "A fortuna está no follow-up" (Grant Cardone). Sequência de 3 toques com posture (Eric Worre —
 * sem perseguir, edifica a prova/comunidade) e fecho (Daniel G — urgência + take-away):
 *   Toque 1 (~6h silêncio): curiosidade + prova, sem pressão (Worre).
 *   Toque 2 (~24h): valor + urgência + assumptive close (Cardone).
 *   Toque 3 (~48h): take-away + escassez, e depois PÁRA (Worre: postura, não persegue).
 * Reset a followup_count=0 quando o lead responde (feito no runLeadFunnelReply).
 */
const REGISTER = 'https://www.morethanmoney.pt/register'
const MAX_TOUCHES = 3

const SYSTEM = `És o SDR da MoreThanMoney a REATIVAR um lead que ficou calado no chat do Telegram. Comunidade portuguesa de educação financeira e trading.
Técnica por toque:
- Toque 1: postura e curiosidade (estilo Eric Worre) — edifica a PROVA (675 trades, 63% win rate, +7.060€ documentados, 356 membros), sem pressão, uma ideia só.
- Toque 2: valor + urgência + fecho presumido (estilo Grant Cardone) — "a fortuna está no follow-up"; empurra o trial de 3 dias grátis (sem cartão) e pergunta se ativa agora.
- Toque 3: take-away + escassez (estilo Daniel G) — "vou assumir que não é o momento", deixa o lugar aberto por pouco tempo, e é o ÚLTIMO toque.
REGRAS: português de Portugal, humano, 1-2 frases curtas, no máx. 1-2 emojis, NUNCA prometer lucros (é educação). Usa o primeiro nome se existir. Inclui o link ${REGISTER} nos toques 2 e 3 (e podes no 1). Devolve APENAS a mensagem, texto puro.`

interface Lead {
  chat_id: string
  first_name: string | null
  interest: string | null
  stage: string | null
  followup_count: number | null
}

async function draftFollowup(lead: Lead, touch: number): Promise<string> {
  const name = (lead.first_name || '').split(' ')[0]
  const fallback: Record<number, string> = {
    1: `Ei${name ? ' ' + name : ''} 👋 fiquei a pensar na tua mensagem. Só para teres a noção: 675 trades acompanhados, 63% de acerto, +7.060€ documentados. Se fizer sentido, começas grátis 3 dias 👉 ${REGISTER} — sem pressão 🙌`,
    2: `${name || 'Olá'}, não quero que percas o arranque 🚀 O trial de 3 dias (sem cartão) é a forma mais rápida de veres tudo por dentro. Queres que to deixe já ativado? 👉 ${REGISTER}`,
    3: `${name || 'Olá'}, vou assumir que agora não é o momento e não te chateio mais 🙏 Mas deixo o lugar aberto até amanhã: ${REGISTER}. Depois sigo com quem está pronto. Se quiseres, é só dizeres 👊`,
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return fallback[touch] || fallback[1]
  const model = process.env.MANYCHAT_CLOSER_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-haiku-20241022'
  const ctx = `Lead: ${name || '(sem nome)'} · interesse: ${lead.interest || 'desconhecido'} · etapa: ${lead.stage || 'qualifying'}. Este é o TOQUE ${touch} de ${MAX_TOUCHES}.`
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 220, system: SYSTEM, messages: [{ role: 'user', content: ctx }] }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return fallback[touch] || fallback[1]
    const data = await res.json()
    const t = (data?.content || []).filter((p: { type?: string }) => p?.type === 'text').map((p: { text?: string }) => p.text).join('').trim()
    return t || fallback[touch] || fallback[1]
  } catch {
    return fallback[touch] || fallback[1]
  }
}

/** Corre a sequência de follow-up. Devolve {sent, scanned}. Best-effort, nunca lança. */
export async function runLeadFollowups(): Promise<{ ok: boolean; sent: number; scanned: number }> {
  const supabase = getSupabaseAdmin()
  const now = Date.now()
  // Delays por toque (desde a última atividade/último follow-up).
  const T1_MS = 6 * 3600 * 1000 // 6h de silêncio → toque 1
  const T2_MS = 24 * 3600 * 1000 // 24h após toque 1 → toque 2
  const T3_MS = 48 * 3600 * 1000 // 48h após toque 2 → toque 3

  // Leads ativos no funil, ainda não convertidos/atribuídos, dentro do limite de toques.
  const { data: leads } = await supabase
    .from('telegram_leads')
    .select('chat_id, first_name, interest, stage, followup_count, updated_at, last_followup_at')
    .in('stage', ['new', 'qualifying', 'routed'])
    .is('granted_at', null)
    .lt('followup_count', MAX_TOUCHES)
    .order('updated_at', { ascending: true })
    .limit(50)

  let sent = 0
  const scanned = (leads ?? []).length
  for (const l of leads ?? []) {
    const fc = Number(l.followup_count || 0)
    const lastActivity = l.updated_at ? new Date(l.updated_at as string).getTime() : 0
    const lastFollow = l.last_followup_at ? new Date(l.last_followup_at as string).getTime() : 0
    let due = false
    if (fc === 0) due = now - lastActivity >= T1_MS
    else if (fc === 1) due = now - lastFollow >= T2_MS
    else if (fc === 2) due = now - lastFollow >= T3_MS
    if (!due) continue

    const touch = fc + 1
    const msg = await draftFollowup(l as Lead, touch)
    const r = await sendTelegramChannelMessage(String(l.chat_id), msg)
    if (r.ok) {
      sent++
      await supabase
        .from('telegram_leads')
        .update({ followup_count: touch, last_followup_at: new Date().toISOString() })
        .eq('chat_id', l.chat_id)
    }
  }
  return { ok: true, sent, scanned }
}

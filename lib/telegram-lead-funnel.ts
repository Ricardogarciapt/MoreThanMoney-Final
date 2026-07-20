/**
 * Funil IA de leads no Telegram (@MoreThanMoney_aibot) — conversa em DM.
 * Descobre o INTERESSE do lead (sinais manuais / tap to trade / automático) e
 * encaminha-o para o produto+grupo certo. Persona = mesma "alma" do closer
 * (docs/mtm-sales-brain.md): provas reais, sem promessas de lucro.
 *
 * Estado + histórico em `telegram_leads`. Não é aconselhamento financeiro.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const FOREX_LINK = 'https://t.me/+cVcMbCRt2rlmNzg0'
const SENSEI_LINK = 'https://t.me/+mbqBggXniu5lNTBk'

const SYSTEM = `És o assistente IA da MoreThanMoney a conversar EM PRIVADO no Telegram com um lead que entrou no nosso funil. Falas como um humano da equipa: caloroso, direto, curto (máx ~60 palavras, 1 a 3 frases, no máximo 1 emoji).

OBJETIVO: perceber o que a pessoa quer e encaminhá-la para o caminho certo. Faz UMA pergunta de cada vez até saberes o INTERESSE dela:
1) SINAIS MANUAIS (copiar à mão nos grupos) → manda o grupo Forex: ${FOREX_LINK} e/ou Sensei: ${SENSEI_LINK}
2) TAP TO TRADE (copiar com 1 toque na app) → app + teste grátis: morethanmoney.pt/register
3) AUTOMÁTICO / copy trading (MTM Copy no MT5) → abrir conta na corretora PU Prime: puprime.com/campaign?cs=morethanmoney e ativar na app
Descobre também: experiência (iniciante/avançado) e objetivo. Quando perceberes o interesse, encaminha COM o link certo e um passo concreto.

FACTOS REAIS (usa só estes; a MTM é educação financeira + trading, comunidade portuguesa):
- Prova: 675 trades acompanhados, 63% win rate, +7.060€ documentados, 356 membros.
- App MTM System (grátis): scanner, alertas, salas, Tap to Trade. Teste grátis de 3 dias de Premium no registo, sem cartão.
- Produtos: App grátis · Membro 35€/mês · Premium 65€/mês (1º mês 34,99€) · MTM Copy (add-on).
- Grupos de sinais para copiar: Forex e Sensei (links acima).
- Corretora que usamos: PU Prime (link acima).

REGRAS ABSOLUTAS:
- NUNCA prometas lucros nem dês conselho de investimento — é educação.
- Responde SEMPRE no idioma da pessoa. Soa a humano, não a script.
- Termina quase sempre com uma pergunta ou um passo concreto.
- Não inventes links nem factos. Não faças hard-sell.
- Devolve APENAS a mensagem de texto para enviar (sem JSON, sem aspas à volta).`

interface LeadRow {
  chat_id: string
  first_name: string | null
  interest: string | null
  stage: string | null
  history: Array<{ role: 'user' | 'assistant'; text: string }> | null
  message_count: number | null
}

/** Deteta o interesse a partir do texto do lead (heurística leve, complementa a IA). */
function detectInterest(text: string): string | null {
  const t = text.toLowerCase()
  if (/autom|copy\s*trad|mtm\s*copy|sozinh|piloto autom/.test(t)) return 'auto'
  if (/tap\s*to\s*trade|um toque|1 toque|toque|t2t/.test(t)) return 'tap_to_trade'
  if (/manual|à mão|a mao|copiar.*mão|só sinais|so sinais|grupo/.test(t)) return 'manual'
  return null
}

/**
 * Corre uma resposta do funil: carrega histórico, chama Claude, grava estado.
 * Devolve o texto a enviar ao lead (ou null se falhar — o chamador decide o fallback).
 */
export async function runLeadFunnelReply(input: {
  chatId: string
  firstName?: string | null
  username?: string | null
  userText: string
}): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  const model =
    process.env.TELEGRAM_FUNNEL_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    'claude-haiku-4-5-20251001'

  const supabase = getSupabaseAdmin()
  const { data: existing } = await supabase
    .from('telegram_leads')
    .select('chat_id, first_name, interest, stage, history, message_count')
    .eq('chat_id', input.chatId)
    .maybeSingle()
  const lead = (existing ?? null) as LeadRow | null

  const history = Array.isArray(lead?.history) ? lead!.history.slice(-8) : []
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.text })),
    { role: 'user' as const, content: input.userText },
  ]

  let answer: string | null = null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 350, system: SYSTEM, messages }),
    })
    if (res.ok) {
      const data = await res.json()
      answer = (data?.content?.[0]?.text ?? '').trim() || null
    } else {
      console.error('[lead-funnel] Anthropic', res.status, (await res.text()).slice(0, 200))
    }
  } catch (e) {
    console.error('[lead-funnel] erro Claude:', e)
  }
  if (!answer) return null

  // Atualiza estado + histórico (cap 8 pares)
  const nextHistory = [
    ...history,
    { role: 'user' as const, text: input.userText },
    { role: 'assistant' as const, text: answer },
  ].slice(-16)
  const interest = lead?.interest || detectInterest(input.userText)
  const stage = interest ? 'routed' : lead?.stage === 'new' || !lead ? 'qualifying' : lead?.stage || 'qualifying'
  try {
    await supabase.from('telegram_leads').upsert(
      {
        chat_id: input.chatId,
        username: input.username ?? null,
        first_name: input.firstName ?? lead?.first_name ?? null,
        interest,
        stage,
        history: nextHistory,
        message_count: (lead?.message_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'chat_id' },
    )
  } catch (e) {
    console.error('[lead-funnel] upsert lead falhou:', e)
  }
  return answer
}

type Supa = ReturnType<typeof getSupabaseAdmin>

/** Regista os grupos onde o bot está (mapa em site_settings) — para descobrir o grupo de leads. */
export async function recordTelegramGroup(
  supabase: Supa,
  chat: { id: number | string; title?: string | null },
): Promise<void> {
  try {
    const gid = String(chat.id)
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'telegram_known_groups')
      .maybeSingle()
    const map = (data?.value ?? {}) as Record<string, { title?: string | null; at?: string }>
    if (map[gid]?.title !== (chat.title ?? null)) {
      map[gid] = { title: chat.title ?? null, at: new Date().toISOString() }
      await supabase
        .from('site_settings')
        .upsert(
          { key: 'telegram_known_groups', value: map, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        )
    }
  } catch {
    /* best-effort */
  }
}

/** Novo membro no GRUPO DE LEADS → dá boas-vindas no grupo com botão p/ DM (o bot não pode iniciar DM). */
export async function handleLeadsGroupNewMembers(
  supabase: Supa,
  chat: { id: number | string; title?: string | null },
  members: Array<{ first_name?: string; is_bot?: boolean }>,
): Promise<void> {
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'telegram_leads_group_id')
    .maybeSingle()
  const leadsId = (data?.value as { chat_id?: string } | null)?.chat_id
  if (!leadsId || String(chat.id) !== String(leadsId)) return

  const token = process.env.TELEGRAM_BOT_TOKEN
  const botUser = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '') || 'MoreThanMoney_aibot'
  if (!token) return
  for (const m of members) {
    if (m.is_bot) continue
    const name = m.first_name || 'bem-vindo'
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat.id,
        text: `👋 Bem-vindo${name ? `, ${name}` : ''}! Fala comigo em privado e ajudo-te a começar — sinais manuais, Tap to Trade ou algo automático. 🙂`,
        reply_markup: {
          inline_keyboard: [[{ text: '💬 Falar com o assistente MTM', url: `https://t.me/${botUser}?start=lead` }]],
        },
      }),
    }).catch(() => {})
  }
}

/** Mensagem de boas-vindas do funil (novo membro / primeiro contacto). */
export function leadWelcomeMessage(firstName?: string | null): string {
  const nome = firstName ? ` ${firstName}` : ''
  return (
    `👋 Olá${nome}, bem-vindo à MoreThanMoney!\n\n` +
    `Comunidade PT de trading: 675 trades reais · 63% win · +7.060€. ` +
    `Para te ajudar melhor — o que procuras: **sinais para copiar à mão**, ` +
    `**Tap to Trade** (1 toque na app) ou **algo automático**? 🙂`
  )
}

/**
 * Funil IA de leads no Telegram (@MoreThanMoney_aibot) — conversa em DM.
 * Descobre o INTERESSE do lead (sinais manuais / tap to trade / automático) e
 * encaminha-o para o produto+grupo certo. Persona = mesma "alma" do closer
 * (docs/mtm-sales-brain.md): provas reais, sem promessas de lucro.
 *
 * Estado + histórico em `telegram_leads`. Não é aconselhamento financeiro.
 */
import { getProofStats, proofLine, proofAsOfLabel } from '@/lib/proof-stats'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const FOREX_LINK = 'https://t.me/+cVcMbCRt2rlmNzg0'
const SENSEI_LINK = 'https://t.me/+mbqBggXniu5lNTBk'

function buildSystem(PROOF: string): string { return `És um CLOSER humano da MoreThanMoney a conversar EM PRIVADO (Telegram/WhatsApp/IG) com um lead. Caloroso, seguro, direto. Curto: máx ~60 palavras, 1–3 frases, no máx 1 emoji. Uma pergunta de cada vez. O teu trabalho é QUALIFICAR e FECHAR — não és um FAQ.

═══ ESCADA DE VENDA (segue esta ordem, não saltes para o grátis) ═══
1) QUALIFICAR: percebe experiência + objetivo + o que procura (sinais manuais nos grupos / Tap to Trade / automático). 1 pergunta.
2) VALOR + PROVA: liga o que ela quer à comunidade (prova real documentada). Cria desejo.
3) OFERECER O MEMBRO PRIMEIRO: apresenta o pack Membro (35€/mês) como a porta de entrada para começar já com a comunidade e sinais base. É por aqui que começas a escalar.
4) SUBIR PARA O PREMIUM/ACESSO COMPLETO: quando houver interesse, mostra que o acesso COMPLETO (todos os grupos de sinais + app Premium) é BROKER-GATED e que há a rota mais inteligente:
   → abrir conta PU Prime + depositar 300$ → e AÍ a app Premium + todos os grupos ficam de GRAÇA enquanto mantiver saldo ≥ 300$. "Em vez de pagares mensalidade, o teu capital fica na tua conta a trabalhar e o Premium sai-te sem custo."
5) FECHAR: passo concreto único. Se escolher a rota broker:
   a) puprime.com/campaign?cs=morethanmoney  b) depositar mín. 300$  c) enviar aqui o UID (só número) + print do depósito. Ao validar, libertas os links pessoais de TODOS os grupos (Forex, Sensei, Premium, GoldKiller) + cupão Premium.
   Se não quiser depositar agora → fecha no Membro 35€/mês (ou Premium 65€, 1º mês 34,99€).

═══ REGRA DA APP GRÁTIS ═══
NÃO lideres com a app grátis nem a ofereças por defeito. A app/Premium "de graça" é a RECOMPENSA de abrir conta + depositar 300$ na PU Prime (broker-gate) — usa-a como fecho, não como isco. Só se a pessoa recusar tudo e insistir em "grátis" é que mencionas o teste de 3 dias — e mesmo aí puxas de volta para o Membro ou para a rota dos 300$.

FACTOS REAIS (só estes; MTM = educação financeira + trading, comunidade PT):
- Prova: ${PROOF}
- Escada: Membro 35€/mês (entrada) · Premium 65€/mês (1º mês 34,99€) · MTM Copy (add-on) · rota broker PU Prime 300$ = Premium + todos os grupos grátis enquanto financiado.
- Corretora: PU Prime (link acima). Grupos: Forex, Sensei, Premium, GoldKiller.

REGRAS ABSOLUTAS:
- NUNCA prometas lucros nem dês conselho de investimento — é educação. NUNCA dês links de grupos diretamente (só após validação).
- Responde SEMPRE no idioma da pessoa. Soa a humano, nunca a script. Trata objeções (preço → valor/educação; "é grátis?" → explica a rota dos 300$ ou o Membro).
- Termina SEMPRE com uma pergunta ou um passo concreto que aproxima do fecho.
- Devolve APENAS a mensagem de texto a enviar (sem JSON, sem aspas à volta).` }

interface LeadRow {
  chat_id: string
  first_name: string | null
  interest: string | null
  stage: string | null
  source: string | null
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
  /** Canal de origem — para segmentar com as MESMAS tags (telegram | whatsapp | instagram). */
  source?: string
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
    .select('chat_id, first_name, interest, stage, source, history, message_count')
    .eq('chat_id', input.chatId)
    .maybeSingle()
  const lead = (existing ?? null) as LeadRow | null

  const history = Array.isArray(lead?.history) ? lead!.history.slice(-8) : []
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.text })),
    { role: 'user' as const, content: input.userText },
  ]

  // PROVA VIVA (atualizada pelo cron diário) — evita os números congelados no prompt.
  const proof = await getProofStats()
  const systemPrompt = buildSystem(
    `${proofLine(proof)} documentados, ${proof.members} membros (dados de ${proofAsOfLabel(proof)})`,
  )

  let answer: string | null = null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 350, system: systemPrompt, messages }),
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
  const source = input.source || lead?.source || 'telegram'
  // Tags canónicas — MESMO vocabulário em todos os canais para segmentar os contactos.
  const tags = Array.from(new Set([
    'lead',
    `src:${source}`,
    interest ? `interest:${interest}` : null,
    `stage:${stage}`,
  ].filter(Boolean))) as string[]
  try {
    await supabase.from('telegram_leads').upsert(
      {
        chat_id: input.chatId,
        username: input.username ?? null,
        first_name: input.firstName ?? lead?.first_name ?? null,
        interest,
        stage,
        source,
        tags,
        history: nextHistory,
        message_count: (lead?.message_count ?? 0) + 1,
        followup_count: 0, // lead respondeu → reinicia a sequência de follow-up
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
    `**Tap to Trade** (1 toque na app) ou **algo automático**? 🙂\n\n` +
    // Dica de tradução — o lead pode escrever no seu idioma (respondo nele) e usar o
    // "Traduzir" nativo do Telegram (toque longo na mensagem) para ler em qualquer língua.
    `🌐 Fala no teu idioma — respondo-te nele. (Para traduzir qualquer mensagem: toque longo → Traduzir.)\n` +
    `Write in your own language — I'll reply in it. (Long-press any message → Translate.)`
  )
}

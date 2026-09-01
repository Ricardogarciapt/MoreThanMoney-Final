/**
 * Funil IA de leads no Telegram (@MoreThanMoney_aibot) — conversa em DM.
 * Descobre o INTERESSE do lead (sinais manuais / tap to trade / automático) e
 * encaminha-o para o produto+grupo certo. Persona = mesma "alma" do closer
 * (docs/mtm-sales-brain.md): provas reais, sem promessas de lucro.
 *
 * Estado + histórico em `telegram_leads`. Não é aconselhamento financeiro.
 */
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import { getProofStats } from '@/lib/proof-stats'
import { MIN_DEPOSIT } from '@/lib/telegram-broker-gate'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const FOREX_LINK = 'https://t.me/+cVcMbCRt2rlmNzg0'
const SENSEI_LINK = 'https://t.me/+mbqBggXniu5lNTBk'

function buildSystem(PROOF: string): string { return `És um CLOSER humano da MoreThanMoney a conversar EM PRIVADO (Telegram/WhatsApp/IG) com um lead. Caloroso, seguro, direto. Curto: máx ~60 palavras, 1–3 frases, no máx 1 emoji. Uma pergunta de cada vez. O teu trabalho é QUALIFICAR e FECHAR — não és um FAQ.

═══ ESCADA DE VENDA (segue esta ordem, não saltes para o grátis) ═══
1) QUALIFICAR: percebe experiência + objetivo + o que procura (sinais manuais nos grupos / Tap to Trade / automático). 1 pergunta.
2) VALOR + PROVA: liga o que ela quer à comunidade (prova real documentada). Cria desejo.
3) OFERECER O MEMBRO PRIMEIRO: apresenta o pack Membro (35€/mês) como a porta de entrada para começar já com a comunidade e sinais base. É por aqui que começas a escalar.
4) SUBIR PARA O PREMIUM/ACESSO COMPLETO: quando houver interesse, mostra que o acesso COMPLETO (todos os grupos de sinais + app Premium) é BROKER-GATED e que há a rota mais inteligente:
   → abrir conta PU Prime + depositar ${MIN_DEPOSIT}$ → e AÍ a app Premium + todos os grupos ficam de GRAÇA enquanto mantiver saldo ≥ ${MIN_DEPOSIT}$. "Em vez de pagares mensalidade, o teu capital fica na tua conta a trabalhar e o Premium sai-te sem custo."
5) FECHAR: passo concreto único. Se escolher a rota broker:
   a) puprime.com/campaign?cs=morethanmoney  b) depositar mín. ${MIN_DEPOSIT}$  c) enviar aqui o UID (só número) + print do depósito. Ao validar, libertas os links pessoais de TODOS os grupos (Forex, Sensei, Premium, GoldKiller) + cupão Premium.
   Se não quiser depositar agora → fecha no Membro 35€/mês (ou Premium 65€, 1º mês 34,99€).

═══ REGRA DA APP GRÁTIS ═══
NÃO lideres com a app grátis nem a ofereças por defeito. A app/Premium "de graça" é a RECOMPENSA de abrir conta + depositar ${MIN_DEPOSIT}$ na PU Prime (broker-gate) — usa-a como fecho, não como isco. Só se a pessoa recusar tudo e insistir em "grátis" é que mencionas o teste de 3 dias — e mesmo aí puxas de volta para o Membro ou para a rota dos ${MIN_DEPOSIT}$.

FACTOS REAIS (só estes; MTM = educação financeira + trading, comunidade PT):
- Prova: ${PROOF}
- Escada: Membro 35€/mês (entrada) · Premium 65€/mês (1º mês 34,99€) · MTM Copy (add-on) · rota broker PU Prime ${MIN_DEPOSIT}$ = Premium + todos os grupos grátis enquanto financiado.
- Corretora: PU Prime (link acima). Grupos: Forex, Sensei, Premium, GoldKiller.

REGRAS ABSOLUTAS:
- NUNCA prometas lucros nem dês conselho de investimento — é educação. NUNCA dês links de grupos diretamente (só após validação).
- NÚMEROS: só os que vierem em "Prova" acima, tal e qual. Não somes, não arredondes para cima, não
  cites de memória e não uses totais em euros (ex.: "+7.060€" está PROIBIDO desde 26/08). Se a
  prova disser que a amostra é curta, NÃO cites percentagem de acerto. Sem prova, não há número.
- Responde SEMPRE no idioma da pessoa. Soa a humano, nunca a script. Trata objeções (preço → valor/educação; "é grátis?" → explica a rota dos ${MIN_DEPOSIT}$ ou o Membro).
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

  // PROVA — sem euros. O tamanho da comunidade é um facto; o desempenho fala-se em pips e
  // percentagem, porque o mesmo sinal vale 8 $ a quem opera 0,01 lote e 800 $ a quem opera 1.
  const proof = await getProofStats()

  /**
   * Os NÚMEROS REAIS vão para dentro do prompt.
   *
   * Proibir sem substituir não chega. A regra "nunca cites lucro em euros" já cá estava a 27/08
   * e no dia seguinte o bot disse a um lead «675 trades com 63% e +7.060€ documentados» — um
   * número congelado a 30/06 e proibido desde 26/08. Sem factos na mão, o modelo vai buscar o
   * que se lembra.
   *
   * `provaParaLead` devolve pips e período, e cala a taxa de acerto quando a amostra é curta
   * demais para a citar. Se não houver nada medido devolve null, e aí o bot fala do produto sem
   * números — em vez de os inventar.
   */
  let provaMedida: string | null = null
  try {
    const [{ getSupabaseAdmin: admin }, { provaParaLead }] = await Promise.all([
      import('@/lib/supabase-admin-client'),
      import('@/lib/pips-proof'),
    ])
    const { data } = await admin().from('site_settings').select('value').eq('key', 'pips_proof').maybeSingle()
    provaMedida = provaParaLead(data?.value as never)
  } catch {
    /* sem prova medida o bot fala do produto, e não de resultados */
  }

  const systemPrompt = buildSystem(
    `${proof.members} membros na comunidade. ` +
    (provaMedida
      ? `RESULTADOS MEDIDOS (usa ESTES e mais nenhuns, tal como estão): ${provaMedida}. `
      : `NÃO tens resultados medidos disponíveis: NÃO cites número nenhum de desempenho — fala do que a comunidade faz e faz perguntas. `) +
    `HÁ DOIS CAMINHOS e a tua primeira tarefa é perceber qual é o desta pessoa: ` +
    `(A) ECOSSISTEMA — quer comunidade, formação, sessões ao vivo e os grupos de sinais; ` +
    `(B) MTM AUTO — só quer a app que copia os sinais para a conta dele, sem trabalho. ` +
    `Se for (B): explica que a app abre as ordens na conta DELE com o risco DELE, que a mensalidade é ` +
    `24,99 €/mês mas fica a ZERO com conta real na PU Prime, e conduz passo a passo — abrir conta pelo ` +
    `nosso link, depositar ${MIN_DEPOSIT} $ (o dinheiro é dele e fica na conta dele), mandar o UID e o print para eu ` +
    `validar, e só depois instalar a app e ligar a conta MT5. Uma coisa de cada vez, nunca tudo de enfiada. ` +
    `Se for (A): segue o funil normal da comunidade. Se ainda não sabe, pergunta com as duas opções. ` +
    `NUNCA cites lucro em euros nem prometas ganhos: ` +
    `os resultados dos sinais falam-se em PIPS e PERCENTAGEM, e o valor em dinheiro apresenta-se como ` +
    `exemplo por lote (0,01 · 0,1 · 1,0), sempre com a ressalva de que é bruto e de que resultados ` +
    `passados não garantem resultados futuros.`,
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

  const token = getMtmcopyBotToken()
  const botUser = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '') || 'MoreThanMoney_aibot'
  if (!token) return
  // A primeira coisa que um lead lê. O texto é editável no /admin/social — mudar uma vírgula
  // aqui obrigava a um commit e a um deploy, e por isso ninguém o mudava.
  const { lerMensagem } = await import('@/lib/mensagens-funil')
  for (const m of members) {
    if (m.is_bot) continue
    const name = m.first_name || ''
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat.id,
        text: await lerMensagem('boas_vindas_grupo', { nome: name ? `, ${name}` : '' }),
        reply_markup: {
          inline_keyboard: [[{ text: '💬 Falar com o assistente MTM', url: `https://t.me/${botUser}?start=lead` }]],
        },
      }),
    }).catch(() => {})
  }
}

/** Mensagem de boas-vindas do funil (novo membro / primeiro contacto). */
/**
 * As boas-vindas — editáveis no /admin/social.
 *
 * `leadWelcomeMessageEditavel()` devolve o texto que o Ricardo escreveu, se escreveu algum. Esta
 * função fica como o DEFEITO: quem nunca editou recebe sempre a versão nova quando o produto
 * muda, em vez de uma cópia congelada no dia em que foi feita.
 */
export async function leadWelcomeMessageEditavel(firstName?: string | null): Promise<string> {
  const { lerMensagem } = await import('@/lib/mensagens-funil')
  return lerMensagem('boas_vindas', { nome: firstName ? ` ${firstName}` : '' })
}

export function leadWelcomeMessage(firstName?: string | null): string {
  const nome = firstName ? ` ${firstName}` : ''
  return (
    `👋 Olá${nome}, bem-vindo à MoreThanMoney!\n\n` +
    `Comunidade PT de trading: sinais acompanhados do início ao fim, medidos em pips e percentagem. ` +
    `Para te ajudar melhor — o que procuras: **sinais para copiar à mão**, ` +
    `**Tap to Trade** (1 toque na app) ou **algo automático**? 🙂\n\n` +
    // Dica de tradução — o lead pode escrever no seu idioma (respondo nele) e usar o
    // "Traduzir" nativo do Telegram (toque longo na mensagem) para ler em qualquer língua.
    `🌐 Fala no teu idioma — respondo-te nele. (Para traduzir qualquer mensagem: toque longo → Traduzir.)\n` +
    `Write in your own language — I'll reply in it. (Long-press any message → Translate.)`
  )
}

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerSinal } from '@/lib/sinais/formato-sinal'

/**
 * Traduz o REPLY do Telegram para o threading do chat da app.
 * No Telegram, os follow-ups (HIT TP1, "Trade active and running", BE, fecho) são REPLIES à mensagem
 * do setup. As nossas rotas de ingestão gravavam só `telegram_message_id` e nunca o `reply_to_id` →
 * as mensagens apareciam TODAS ao mesmo nível no chat da app (sem thread). Este helper resolve o
 * `chat_messages.id` do PAI a partir do `reply_to_message_id` de origem.
 *
 * Devolve null se não houver reply ou se o pai ainda não estiver no chat (ex.: mensagem anterior à
 * ligação do canal) — nesse caso a mensagem entra ao nível de topo, como antes.
 */
export async function resolveReplyToChatMessageId(
  channelSlug: string | null | undefined,
  telegramReplyToMessageId: number | null | undefined,
): Promise<string | null> {
  if (!channelSlug || !telegramReplyToMessageId) return null
  try {
    const { data } = await getSupabaseAdmin()
      .from('chat_messages')
      .select('id')
      .eq('channel_slug', channelSlug)
      .eq('telegram_message_id', telegramReplyToMessageId)
      .maybeSingle()
    return (data?.id as string | undefined) ?? null
  } catch {
    return null
  }
}

/**
 * FALLBACK de threading para follow-ups que chegam SEM reply no Telegram.
 *
 * O trader nem sempre responde à mensagem do setup — às vezes publica o "HIT TP1 ✅ +109PIPS"
 * solto. Nesse caso não há `reply_to_message_id` e o follow-up ficava ao nível de topo, órfão.
 *
 * O texto do follow-up não traz símbolo nem direção, mas traz duas coisas que chegam para o
 * identificar: o NÍVEL do alvo e os PIPS. Com a zona de entrada e os TPs de cada setup aberto,
 * calcula-se quantos pips vale cada alvo e escolhe-se o setup cuja conta bate certo. Com dois
 * setups de ouro abertos ao mesmo tempo, é isto que os distingue (+109 vs +110).
 */

/** Tamanho do pip por instrumento — ouro é 0,10; JPY 0,01; resto 0,0001. */
function pipSize(texto: string): number {
  if (/gold|xau/i.test(texto)) return 0.1
  if (/jpy/i.test(texto)) return 0.01
  return 0.0001
}

interface SetupParsed {
  id: string
  zoneLow: number
  zoneHigh: number
  tps: number[]
  pip: number
}

/** Lê "Gold Buy Zone 4489 - 4483 … TP1 : 4494 TP2 : 4499 …" de uma mensagem de setup. */
function parseSetup(id: string, content: string): SetupParsed | null {
  // Formato único (lib/sinais/formato-sinal): «🎯 Zona: a – b» + «✅ TPn: x».
  const unico = lerSinal(content)
  if (unico?.zona && unico.tps.length) {
    return { id, zoneLow: unico.zona[0], zoneHigh: unico.zona[1], tps: unico.tps, pip: pipSize(unico.simbolo) }
  }
  const zona = content.match(/zone\s*([\d.]+)\s*[-–]\s*([\d.]+)/i)
  if (!zona) return null
  const a = Number(zona[1])
  const b = Number(zona[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const tps: number[] = []
  for (const m of content.matchAll(/tp\s*(\d)\s*:?\s*([\d.]+)/gi)) {
    const nivel = Number(m[1])
    const valor = Number(m[2])
    if (Number.isFinite(nivel) && Number.isFinite(valor)) tps[nivel - 1] = valor
  }
  if (!tps.length) return null
  return { id, zoneLow: Math.min(a, b), zoneHigh: Math.max(a, b), tps, pip: pipSize(content) }
}

/**
 * Quantos pips vale o alvo N deste setup. Devolve DUAS contas — uma de cada beira da zona —
 * porque o trader reporta ora uma ora outra consoante onde a ordem encheu: com a zona 4489-4483
 * e o TP1 em 4494, viu-se hoje o mesmo alvo publicado como +110 (do fundo) e como +50 (do topo).
 */
function pipsParaAlvo(s: SetupParsed, nivel: number): number[] {
  const tp = s.tps[nivel - 1]
  if (tp == null || !Number.isFinite(tp)) return []
  return [Math.abs(tp - s.zoneLow) / s.pip, Math.abs(tp - s.zoneHigh) / s.pip]
}

export async function resolveFollowupParentByPips(
  channelSlug: string | null | undefined,
  content: string | null | undefined,
): Promise<string | null> {
  if (!channelSlug || !content) return null
  const alvo = content.match(/hit\s*tp\s*(\d)/i)
  const pips = content.match(/([+-]?\d+(?:[.,]\d+)?)\s*pips?/i)
  if (!alvo || !pips) return null
  const nivel = Number(alvo[1])
  const pipsRelatados = Math.abs(Number(String(pips[1]).replace(',', '.')))
  if (!Number.isFinite(nivel) || !Number.isFinite(pipsRelatados)) return null

  try {
    const { data } = await getSupabaseAdmin()
      .from('chat_messages')
      .select('id, content')
      .eq('channel_slug', channelSlug)
      .gte('created_at', new Date(Date.now() - 48 * 3600 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(40)
    if (!data?.length) return null

    let melhor: { id: string; erro: number } | null = null
    for (const m of data) {
      const row = m as { id: string; content?: string | null }
      const setup = parseSetup(row.id, row.content ?? '')
      if (!setup) continue
      const candidatos = pipsParaAlvo(setup, nivel)
      if (!candidatos.length) continue
      const erro = Math.min(...candidatos.map((c) => Math.abs(c - pipsRelatados)))
      if (!melhor || erro < melhor.erro) melhor = { id: row.id, erro }
    }
    // Tolerância de 3 pips: o preenchimento real raramente cai na beira exata da zona.
    // Acima disso não arriscamos — mais vale sem thread do que na trade errada.
    return melhor && melhor.erro <= 3 ? melhor.id : null
  } catch {
    return null
  }
}

/**
 * ÚLTIMO RECURSO: o follow-up cola-se à ENTRADA mais recente do canal (12h).
 *
 * Um "Tp3 hit" solto, ao nível de topo, lê-se como se fosse um sinal novo — e é isso que engana
 * quem abre o chat. Preso à entrada, lê-se pelo que é: o desfecho daquela trade. Só se usa
 * quando o reply e a conta dos pips falharam, e só para mensagens que NÃO são entradas.
 */
async function resolveParentPorUltimaEntrada(
  channelSlug: string,
  content: string,
): Promise<string | null> {
  const { isT2TEntrySignal } = await import('@/lib/mtmcopy/t2t-source')
  if (isT2TEntrySignal(channelSlug, content)) return null
  try {
    const { data } = await getSupabaseAdmin()
      .from('chat_messages')
      .select('id, content')
      .eq('channel_slug', channelSlug)
      .eq('is_deleted', false)
      .gte('created_at', new Date(Date.now() - 12 * 3600 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(30)
    for (const m of data ?? []) {
      const row = m as { id: string; content?: string | null }
      if (isT2TEntrySignal(channelSlug, row.content ?? '')) return row.id
    }
  } catch {
    /* sem pai — fica ao nível de topo */
  }
  return null
}

/** Reply do Telegram → conta dos pips → entrada mais recente do canal. */
export async function resolveThreadParent(
  channelSlug: string | null | undefined,
  telegramReplyToMessageId: number | null | undefined,
  content?: string | null,
): Promise<string | null> {
  const porReply = await resolveReplyToChatMessageId(channelSlug, telegramReplyToMessageId)
  if (porReply) return porReply
  const porPips = await resolveFollowupParentByPips(channelSlug, content)
  if (porPips) return porPips
  if (!channelSlug || !content) return null
  return resolveParentPorUltimaEntrada(channelSlug, content)
}

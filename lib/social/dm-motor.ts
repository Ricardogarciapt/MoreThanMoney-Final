/**
 * MOTOR ÚNICO DE DMs DA META — Instagram Direct e Messenger das Páginas (22/11/2026).
 *
 * Até aqui só o webhook do Instagram respondia, e `ig_dm_log` nunca teve uma linha: a Meta não
 * entregava nada (app em modo de desenvolvimento / sem acesso avançado) e as mensagens do
 * Messenger (objecto `page`) caíam no webhook dos Lead Ads, que as deitava fora.
 *
 * Agora há UMA função que trata uma mensagem recebida, venha ela de onde vier:
 *  - do webhook do Instagram (objecto `instagram` ou `page`);
 *  - do webhook dos Lead Ads, quando a Meta lá entrega `messaging` do Messenger;
 *  - do leitor da caixa (`/api/cron/dm-caixa`), que pergunta à Graph API pelas conversas de 5 em
 *    5 minutos e não depende de webhooks.
 *
 * O dedup é pelo `mid` em `ig_dm_log` (único): a mesma mensagem que chegue pelos dois caminhos é
 * respondida uma vez. No Messenger, `account_id` é o id da PÁGINA.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  generateDmReply,
  sendInstagramDmResilient,
  candidateTokensForIgAccount,
  carregarTokensIG,
} from '@/lib/instagram/dm-closer'

export type CanalDm = 'instagram' | 'messenger'

/**
 * Mensagem sem texto (foto, publicação partilhada, sticker, gosto, áudio). A API não diz o que é,
 * por isso o closer recebe esta descrição e responde com um quebra-gelo curto que puxa a conversa.
 */
export const SEM_TEXTO =
  '[A pessoa mandou uma mensagem sem texto: foto, publicação partilhada, sticker, gosto ou áudio. Não sabes o conteúdo. Responde com um quebra-gelo curto e simpático (1-2 frases), agradece e faz UMA pergunta leve sobre o que a trouxe até nós. Não finjas que viste ou ouviste o conteúdo.]'

/** Páginas do Facebook ↔ conta IG ligada (confirmado pelo diagnóstico de 22/11). */
export const PAGINAS = [
  { pagina: '1194330033767059', ig: '17841474872672009', nome: 'MoreThanMoney' },
  { pagina: '703646486337596', ig: '17841405656956716', nome: 'Ricardo Garcia' },
] as const

export function igDaPagina(pageId: string): string | null {
  return PAGINAS.find((p) => p.pagina === pageId)?.ig ?? null
}

/**
 * Ids que são NOSSOS — páginas, contas IG e os IGSID com que cada conta nossa aparece na caixa da
 * outra. NUNCA se responde a nenhum, nos dois sentidos: a 22/11 a marca e a pessoal ficaram a
 * responder uma à outra em loop. Mais contas internas (educadores, testes) em
 * `site_settings.dm_contas_internas` (lista de ids).
 */
export const IDS_NOSSOS = new Set<string>([
  ...PAGINAS.flatMap((p) => [p.pagina, p.ig]),
  '621570614380294',
  '3964182023892810', // MoreThanMoney visto da caixa do Ricardo
  '2225784651530753', // Ricardo visto da caixa da MoreThanMoney
])

let internasCache: { em: number; ids: Set<string> } | null = null
export async function contasInternas(): Promise<Set<string>> {
  if (internasCache && Date.now() - internasCache.em < 60_000) return internasCache.ids
  const ids = new Set(IDS_NOSSOS)
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'dm_contas_internas').maybeSingle()
    const v = data?.value as unknown
    const lista = Array.isArray(v) ? v : Array.isArray((v as { ids?: unknown })?.ids) ? (v as { ids: unknown[] }).ids : []
    for (const x of lista) if (x != null) ids.add(String(x))
  } catch {}
  internasCache = { em: Date.now(), ids }
  return ids
}

async function enviarMessenger(pageId: string, destino: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  await carregarTokensIG()
  const tokens = candidateTokensForIgAccount(igDaPagina(pageId))
  if (!tokens.length) return { ok: false, error: 'sem token de Página' }
  let ultimo: string | undefined
  for (const t of tokens) {
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/me/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: destino },
          messaging_type: 'RESPONSE',
          message: { text: texto.slice(0, 1900) },
          access_token: t,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && !j?.error) return { ok: true }
      ultimo = j?.error?.message || `HTTP ${r.status}`
    } catch (e) {
      ultimo = e instanceof Error ? e.message : 'erro'
    }
  }
  return { ok: false, error: ultimo }
}

export interface MensagemRecebida {
  canal: CanalDm
  /** Instagram: id da conta IG; Messenger: id da Página. */
  contaId: string
  remetente: string
  mid: string
  texto: string
  origem: 'webhook' | 'caixa'
}

export type ResultadoDm = 'respondida' | 'repetida' | 'ignorada' | 'erro'

export async function responderMensagem(m: MensagemRecebida): Promise<{ resultado: ResultadoDm; erro?: string }> {
  const texto = (m.texto ?? '').trim()
  // TRAVÃO 1: contas nossas ou internas nunca recebem resposta automática (nos dois sentidos).
  if (!texto || !m.remetente || m.remetente === m.contaId) return { resultado: 'ignorada' }
  if ((await contasInternas()).has(m.remetente)) return { resultado: 'ignorada' }
  const supabase = getSupabaseAdmin()
  await carregarTokensIG()

  // TRAVÃO 2: no máximo 1 resposta automática por mensagem humana. Se já respondemos a esta pessoa
  // nos últimos 2 minutos, é rajada/loop: não se responde (a próxima volta da caixa apanha a mais
  // recente, se for mesmo nova).
  try {
    const { count } = await supabase
      .from('ig_dm_log')
      .select('mid', { count: 'exact', head: true })
      .eq('sender_id', m.remetente)
      .eq('status', 'replied')
      .gte('created_at', new Date(Date.now() - 2 * 60_000).toISOString())
    if ((count ?? 0) > 0) return { resultado: 'ignorada' }
  } catch {
    return { resultado: 'ignorada' }
  }

  // Dedup + auditoria. Conflito no mid único → já tratada (pelo outro caminho).
  try {
    const { data: ins, error } = await supabase
      .from('ig_dm_log')
      .insert({ mid: m.mid, account_id: m.contaId, sender_id: m.remetente, message: texto, status: 'received' })
      .select('id')
      .maybeSingle()
    if (error || !ins) return { resultado: 'repetida' }
  } catch {
    return { resultado: 'repetida' }
  }

  const igConta = m.canal === 'instagram' ? m.contaId : igDaPagina(m.contaId)
  if (candidateTokensForIgAccount(igConta).length === 0) {
    await supabase.from('ig_dm_log').update({ status: 'error', error: 'sem token' }).eq('mid', m.mid)
    return { resultado: 'erro', erro: 'sem token' }
  }

  const funil = m.canal === 'instagram' ? 'instagram:dm-closer' : 'messenger:dm-closer'
  try {
    const { prepararMensagem } = await import('@/lib/agentes/mensagem-saida')
    const { registarMensagemDeAgente } = await import('@/lib/agentes/mensagem-livro')
    const { comLinkDaAgenda } = await import('@/lib/agenda/pedido-de-chamada')

    let historico: { pessoa: string; nos: string | null }[] = []
    try {
      const { data: antes } = await supabase
        .from('ig_dm_log')
        .select('message, reply, created_at')
        .eq('sender_id', m.remetente)
        .neq('mid', m.mid)
        .order('created_at', { ascending: false })
        .limit(6)
      historico = ((antes ?? []) as Array<{ message: string | null; reply: string | null }>)
        .reverse()
        .map((r) => ({ pessoa: String(r.message ?? ''), nos: r.reply }))
    } catch {}

    let audiosAntes = 0
    try {
      const { count } = await supabase
        .from('ig_dm_log')
        .select('mid', { count: 'exact', head: true })
        .eq('sender_id', m.remetente)
        .not('audio_motivo', 'is', null)
      audiosAntes = count ?? 0
    } catch {
      audiosAntes = 99
    }

    const bruta = comLinkDaAgenda(await generateDmReply(texto, { historico }), texto)
    // O Messenger usa as mesmas regras de links do Instagram (mesma caixa da Meta).
    const marcacao = prepararMensagem({ canal: 'instagram', texto: bruta, funil })
    const reply = marcacao.texto
    const sent =
      m.canal === 'instagram'
        ? await sendInstagramDmResilient(m.contaId, m.remetente, reply)
        : await enviarMessenger(m.contaId, m.remetente, reply)

    await supabase
      .from('ig_dm_log')
      .update({ reply, status: sent.ok ? 'replied' : 'error', error: sent.ok ? null : sent.error })
      .eq('mid', m.mid)
    await registarMensagemDeAgente({
      canal: 'instagram',
      destino: m.remetente,
      funil,
      tipo: 'dm',
      texto: reply,
      estado: sent.ok ? 'enviada' : 'falhou',
      motivo: sent.ok ? null : String(sent.error ?? 'erro').slice(0, 300),
      referencia: m.mid,
      marcacao,
    })

    if (sent.ok && m.canal === 'instagram') {
      const { talvezAudioInstagram } = await import('@/lib/vendas/audio-dm')
      const audio = await talvezAudioInstagram(supabase as never, {
        accountId: m.contaId,
        destino: m.remetente,
        resposta: reply,
        referencia: m.mid,
        conversa: { mensagensAntes: historico.length, audiosAntes },
      })
      if (audio.enviado && audio.momento) {
        await supabase.from('ig_dm_log').update({ audio_motivo: audio.momento }).eq('mid', m.mid)
      }
    }
    return sent.ok ? { resultado: 'respondida' } : { resultado: 'erro', erro: sent.error }
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'erro'
    try {
      await supabase.from('ig_dm_log').update({ status: 'error', error: erro }).eq('mid', m.mid)
    } catch {}
    return { resultado: 'erro', erro }
  }
}

type Messaging = {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[]; sticker_id?: unknown }
}

/**
 * Corpo de um webhook da Meta (objecto `instagram` ou `page`) → mensagens para o motor.
 * Puro: não toca na rede.
 */
export function mensagensDoWebhook(corpo: unknown): MensagemRecebida[] {
  const b = corpo as { object?: string; entry?: { id?: string; messaging?: Messaging[] }[] } | null
  if (!b || !Array.isArray(b.entry)) return []
  const canal: CanalDm | null = b.object === 'instagram' ? 'instagram' : b.object === 'page' ? 'messenger' : null
  if (!canal) return []
  const out: MensagemRecebida[] = []
  for (const e of b.entry) {
    for (const m of e.messaging ?? []) {
      const msg = m.message
      const remetente = m.sender?.id
      const temAnexo = Array.isArray(msg?.attachments) && msg!.attachments!.length > 0 || msg?.sticker_id != null
      if (!msg || msg.is_echo || (!msg.text?.trim() && !temAnexo) || !remetente) continue
      out.push({
        canal,
        contaId: e.id || m.recipient?.id || '',
        remetente,
        mid: msg.mid || `${remetente}-${m.timestamp ?? ''}`,
        texto: msg.text?.trim() || SEM_TEXTO,
        origem: 'webhook',
      })
    }
  }
  return out
}

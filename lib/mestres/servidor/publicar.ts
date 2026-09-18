/**
 * PUBLICADOR DA MESTRE — o chat da estratégia e o Telegram contam o que a CONTA-MESTRE fez.
 *
 * Uma fonte de verdade (pedido do dono, 18/09, a começar pelo «MTM Auto Sensei»): com
 * `sinal_modo='live'`, o webhook abre o sinal na mestre SIM e o motor do VPS gere-a (parciais,
 * break-even, trailing, fecho). O que sai para o cliente sai DAQUI, lido das posições da mestre
 * (`funded_positions`):
 *
 *   posição-mãe aberta            → ENTRADA no formato único (lib/sinais/formato-sinal.ts)
 *   filha com motivo tp_parcial   → «🎯 Alvo N» em resposta à entrada
 *   be_feito sem parcial antes    → «🔒 Break-even» em resposta
 *   mãe fechada                   → «🏁 Alvo final» / «🔒 Stop protegido» / «🛑 Stop loss» / «🏁 Posição fechada»
 *
 * Cada mensagem vai ao chat da app E ao grupo Telegram com o MESMO texto, e os seguimentos
 * respondem à entrada nos dois lados (reply_to_id / reply_to_message_id).
 *
 * Idempotente: pode correr no webhook (entrada, no momento), no cron de minuto a minuto e num
 * gatilho da base — cada acontecimento é reclamado uma vez (`mtmcopy_signal_dedup`) e confirmado
 * contra o que já está no chat.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { claimSignalOnce } from '@/lib/mtmcopy/premium-single'
import { lifecycleMessage, stopFoiProtegido, type SignalEvent } from '@/lib/mtmcopy/signal-lifecycle'
import { computeOutcome } from '@/lib/mtmcopy/trade-outcome'
import { formatarSeguimento, formatarSinal } from '@/lib/sinais/formato-sinal'
import { estrategiasPublicadasPelaMestre, type EstrategiaPublicada } from './canais-publicados'

const TG_TOKEN = () => (process.env.TELEGRAM_AIBOT_TOKEN || '').trim()
const TTL_RECLAMACAO_S = 60 * 60 * 24 * 30
/** Só se publica a ENTRADA de posições recentes (não se reescreve o passado no primeiro arranque). */
const JANELA_ENTRADA_MS = 15 * 60_000
const JANELA_SEGUIMENTOS_MS = 72 * 3600_000

interface Posicao {
  id: string
  account_id: string
  symbol: string
  direcao: 'buy' | 'sell'
  volume: number | null
  volume_inicial: number | null
  preco_entrada: number | null
  sl: number | null
  tp: number | null
  tps: Array<{ pct?: number; preco?: number; atingido?: boolean }> | null
  estado: string
  preco_fecho: number | null
  motivo_fecho: string | null
  be_feito: boolean | null
  aberta_em: string
  fechada_em: string | null
  ideia_ref: string | null
  mae_id: string | null
}

const n = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

function lerPosicao(r: Record<string, unknown>): Posicao {
  return {
    id: String(r.id),
    account_id: String(r.account_id),
    symbol: String(r.symbol ?? '').toUpperCase(),
    direcao: r.direcao === 'sell' ? 'sell' : 'buy',
    volume: n(r.volume),
    volume_inicial: n(r.volume_inicial),
    preco_entrada: n(r.preco_entrada),
    sl: n(r.sl),
    tp: n(r.tp),
    tps: Array.isArray(r.tps) ? (r.tps as Posicao['tps']) : null,
    estado: String(r.estado ?? ''),
    preco_fecho: n(r.preco_fecho),
    motivo_fecho: r.motivo_fecho == null ? null : String(r.motivo_fecho),
    be_feito: r.be_feito === true,
    aberta_em: String(r.aberta_em ?? ''),
    fechada_em: r.fechada_em == null ? null : String(r.fechada_em),
    ideia_ref: r.ideia_ref == null ? null : String(r.ideia_ref),
    mae_id: r.mae_id == null ? null : String(r.mae_id),
  }
}

/** A posição veio de um SINAL (webhook → mestre), não do espelho da mestre MT5 antiga? */
export function posicaoDeSinal(p: Pick<Posicao, 'ideia_ref' | 'mae_id'>): boolean {
  return !p.mae_id && /^sinal:/i.test(p.ideia_ref ?? '')
}

/** Alvos da ENTRADA como a mestre os gere: os níveis das parciais e o alvo final. */
export function alvosDaMestre(p: Pick<Posicao, 'tps' | 'tp'>, alvosDoSinal: number[]): number[] {
  const niveis = (p.tps ?? []).map((t) => n(t?.preco)).filter((v): v is number => v != null && v > 0)
  const final = p.tp != null && p.tp > 0 ? p.tp : null
  const todos = final != null && !niveis.includes(final) ? [...niveis, final] : niveis
  return todos.length ? todos : alvosDoSinal
}

/**
 * O acontecimento de FECHO da posição-mãe, pelo motivo que o motor gravou e pela geometria.
 * `sl` acima da entrada numa compra (trailing/BE) não é um stop loss — é o sistema a proteger.
 */
export function eventoDeFecho(p: Pick<Posicao, 'motivo_fecho' | 'direcao' | 'preco_entrada' | 'preco_fecho'>, slOriginal: number | null): SignalEvent {
  const m = String(p.motivo_fecho ?? '').toLowerCase()
  if (m === 'tp' || m === 'tp_final' || m === 'alvo') return 'target_final'
  if (m === 'sl' || m === 'stop' || m === 'stop_loss') {
    return stopFoiProtegido({ direction: p.direcao, entry: p.preco_entrada, slOriginal, price: p.preco_fecho })
      ? 'stop_protegido'
      : 'stop_loss'
  }
  return 'closed'
}

async function enviarTelegram(chatId: string, texto: string, responderA: number | null): Promise<number | null> {
  const token = TG_TOKEN()
  if (!token || !chatId) return null
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        disable_web_page_preview: true,
        ...(responderA != null ? { reply_to_message_id: responderA, allow_sending_without_reply: true } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const j = (await r.json().catch(() => null)) as { ok?: boolean; result?: { message_id?: number } } | null
    return j?.ok ? Number(j.result?.message_id ?? 0) || null : null
  } catch {
    return null
  }
}

/** Chat + Telegram com o mesmo texto. Devolve o id da mensagem do chat. */
async function publicar(
  est: EstrategiaPublicada,
  texto: string,
  resposta: { chatId: string; telegramId: number | null } | null,
): Promise<{ chatId: string | null; telegramId: number | null }> {
  const db = getSupabaseAdmin()
  const insert: Record<string, unknown> = {
    channel_slug: est.canal,
    user_id: null,
    content: texto,
    message_type: 'telegram_forward',
    telegram_sender: est.etiqueta,
    // O push das entradas vai pelo caminho de sempre (webhook/cron); o trigger não duplica.
    notified: true,
  }
  if (resposta?.chatId) insert.reply_to_id = resposta.chatId
  const { data, error } = await db.from('chat_messages').insert(insert).select('id').single()
  if (error || !data?.id) return { chatId: null, telegramId: null }
  const chatId = String(data.id)
  const tg = est.telegram()
  const telegramId = tg ? await enviarTelegram(tg, texto, resposta?.telegramId ?? null) : null
  if (telegramId) await db.from('chat_messages').update({ telegram_message_id: telegramId }).eq('id', chatId)
  return { chatId, telegramId }
}

interface Ponte {
  id: string
  chat_message_id: string | null
  entrada: number | null
  sl: number | null
  tps: number[]
}

async function ponteDaMestre(p: Posicao): Promise<Ponte | null> {
  const { data } = await getSupabaseAdmin()
    .from('funded_sinal_posicoes')
    .select('id, chat_message_id, entrada, sl, tps')
    .eq('account_id', p.account_id)
    .eq('funded_position_id', p.id)
    .maybeSingle()
  if (!data) return null
  return {
    id: String(data.id),
    chat_message_id: data.chat_message_id ? String(data.chat_message_id) : null,
    entrada: n(data.entrada),
    sl: n(data.sl),
    tps: Array.isArray(data.tps) ? (data.tps as unknown[]).map(n).filter((v): v is number => v != null && v > 0) : [],
  }
}

/**
 * Publica a ENTRADA de uma posição-mãe da mestre (se ainda não foi). Devolve o id da mensagem do
 * chat (existente ou nova) — é a raiz da thread de todos os seguimentos.
 */
export async function publicarEntradaDaMestre(
  est: EstrategiaPublicada,
  positionId: string,
  opts: { forcar?: boolean } = {},
): Promise<string | null> {
  const db = getSupabaseAdmin()
  const { data: row } = await db.from('funded_positions').select('*').eq('id', positionId).maybeSingle()
  if (!row) return null
  const p = lerPosicao(row as Record<string, unknown>)
  if (p.account_id !== est.contaMestreId || !posicaoDeSinal(p)) return null
  const ponte = await ponteDaMestre(p)
  if (ponte?.chat_message_id) return ponte.chat_message_id
  if (!opts.forcar && Date.now() - new Date(p.aberta_em).getTime() > JANELA_ENTRADA_MS) return null

  const chave = `mestre-pub:${p.id}:entrada`
  if (!(await claimSignalOnce(chave, TTL_RECLAMACAO_S))) return null

  const texto = formatarSinal({
    estrategia: est.etiqueta,
    simbolo: p.symbol,
    direcao: p.direcao,
    entrada: p.preco_entrada,
    sl: ponte?.sl ?? p.sl,
    tps: alvosDaMestre(p, ponte?.tps ?? []),
    quando: p.aberta_em,
    estado: 'Entrada executada',
  })
  const { chatId } = await publicar(est, texto, null)
  if (!chatId) {
    await db.from('mtmcopy_signal_dedup').delete().eq('key', chave)
    return null
  }
  if (ponte) await db.from('funded_sinal_posicoes').update({ chat_message_id: chatId }).eq('id', ponte.id)
  return chatId
}

/** Publica um seguimento em resposta à entrada — uma vez por acontecimento. */
async function publicarSeguimento(
  est: EstrategiaPublicada,
  raiz: { chatId: string; telegramId: number | null },
  chaveEvento: string,
  evento: SignalEvent,
  ctx: Parameters<typeof lifecycleMessage>[1],
): Promise<boolean> {
  const db = getSupabaseAdmin()
  const { text } = lifecycleMessage(evento, ctx)
  const titulo = lifecycleMessage(evento, { symbol: ctx.symbol, direction: ctx.direction, level: ctx.level }).text.split('\n')[0]
  const { data: dup } = await db
    .from('chat_messages')
    .select('id')
    .eq('reply_to_id', raiz.chatId)
    .ilike('content', `${titulo}%`)
    .limit(1)
    .maybeSingle()
  if (dup) return false
  const chave = `mestre-pub:${chaveEvento}`
  if (!(await claimSignalOnce(chave, TTL_RECLAMACAO_S))) return false
  const { chatId } = await publicar(est, formatarSeguimento(text, est.etiqueta), raiz)
  if (!chatId) {
    await db.from('mtmcopy_signal_dedup').delete().eq('key', chave)
    return false
  }
  return true
}

/** Resultado na mensagem de ENTRADA (o cartão lê daqui) — medido na mestre. */
async function gravarResultado(chatId: string, p: Posicao, rotulo: string) {
  const o = computeOutcome({ symbol: p.symbol, direction: p.direcao, entry: p.preco_entrada, exit: p.preco_fecho })
  await getSupabaseAdmin()
    .from('chat_messages')
    .update({ outcome: { label: rotulo, pips: o?.pips ?? null, pct: o?.pct ?? null } })
    .eq('id', chatId)
}

const ROTULO: Partial<Record<SignalEvent, string>> = {
  target_final: 'Alvo final',
  stop_protegido: 'Stop protegido',
  stop_loss: 'Stop loss',
  closed: 'Fechada',
}

export interface ResumoPublicacao {
  estrategia: string
  posicoes: number
  entradas: number
  seguimentos: number
}

/** Uma passagem por UMA estratégia: entradas em falta + seguimentos novos das posições recentes. */
export async function publicarDaMestre(est: EstrategiaPublicada): Promise<ResumoPublicacao> {
  const db = getSupabaseAdmin()
  const desde = new Date(Date.now() - JANELA_SEGUIMENTOS_MS).toISOString()
  const { data: linhas } = await db
    .from('funded_positions')
    .select('*')
    .eq('account_id', est.contaMestreId)
    .gte('aberta_em', desde)
    .order('aberta_em', { ascending: true })
    .limit(400)
  const todas = ((linhas ?? []) as Record<string, unknown>[]).map(lerPosicao)
  const maes = todas.filter(posicaoDeSinal)
  const out: ResumoPublicacao = { estrategia: est.estrategia, posicoes: maes.length, entradas: 0, seguimentos: 0 }

  for (const p of maes) {
    const ponte = await ponteDaMestre(p)
    let chatId = ponte?.chat_message_id ?? null
    if (!chatId) {
      chatId = await publicarEntradaDaMestre(est, p.id)
      if (chatId) out.entradas++
    }
    // Sem entrada publicada não há thread: não se anunciam seguimentos soltos (era a confusão).
    if (!chatId) continue
    const { data: raizRow } = await db.from('chat_messages').select('telegram_message_id').eq('id', chatId).maybeSingle()
    const raiz = { chatId, telegramId: n(raizRow?.telegram_message_id) }
    const base = { symbol: p.symbol, direction: p.direcao, entry: p.preco_entrada, source: est.etiqueta }

    // Parciais, pela ordem em que o motor as fechou.
    const parciais = todas
      .filter((c) => c.mae_id === p.id && String(c.motivo_fecho ?? '') === 'tp_parcial' && c.preco_fecho != null)
      .sort((a, b) => String(a.fechada_em).localeCompare(String(b.fechada_em)))
    for (let i = 0; i < parciais.length; i++) {
      const c = parciais[i]!
      const pct = n(p.tps?.[i]?.pct)
      if (await publicarSeguimento(est, raiz, `${p.id}:parcial:${i + 1}`, 'partial', { ...base, level: i + 1, price: c.preco_fecho, pct })) {
        out.seguimentos++
      }
    }

    // Break-even: só é notícia quando nenhuma parcial o anunciou («o resto corre protegido»).
    if (p.be_feito && parciais.length === 0 && p.estado !== 'fechada') {
      if (await publicarSeguimento(est, raiz, `${p.id}:be`, 'break_even', base)) out.seguimentos++
    }

    if (p.estado === 'fechada') {
      const evento = eventoDeFecho(p, ponte?.sl ?? null)
      const ok = await publicarSeguimento(est, raiz, `${p.id}:fecho`, evento, {
        ...base,
        price: p.preco_fecho,
        slOriginal: ponte?.sl ?? null,
      })
      if (ok) {
        out.seguimentos++
        await gravarResultado(chatId, p, ROTULO[evento] ?? 'Fechada')
        // A mestre fechou → as posições T2T de quem aceitou ESTA entrada seguem-na (no stop, só
        // as pendentes: a posição do cliente fecha pelo stop dela).
        try {
          const { closeFollowersByMessage } = await import('@/lib/mtmcopy/t2t-lifecycle')
          await closeFollowersByMessage(chatId, p.symbol, evento, `${est.etiqueta} (mestre)`, evento === 'stop_loss')
        } catch { /* nunca parte a publicação */ }
      }
    }
  }
  return out
}

/** Todas as estratégias com a mestre em live. Nunca lança. */
export async function publicarTodasAsMestres(): Promise<ResumoPublicacao[]> {
  const lista = await estrategiasPublicadasPelaMestre()
  const out: ResumoPublicacao[] = []
  for (const est of lista) {
    try {
      out.push(await publicarDaMestre(est))
    } catch (e) {
      console.warn('[mestre-publicar]', est.estrategia, e instanceof Error ? e.message : String(e))
    }
  }
  return out
}

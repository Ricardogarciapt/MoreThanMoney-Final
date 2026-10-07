import { premiumParaFormatoUnico } from '@/lib/sinais/premium-formato'
import { NextRequest, NextResponse } from 'next/server'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { resolveAppChannelSlug } from '@/lib/telegram-app-channels'
import { resolveThreadParent } from '@/lib/telegram-reply-thread'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { fonteSoPublicacaoDoCanal } from '@/lib/sinais/identidade'

/**
 * Fontes com chat próprio na app: espelham no chat, geram cartão T2T e executam na CONTA
 * PROVEDORA da rota — nunca em contas de clientes. Ver executeSignalOnRouteProvider.
 */
// O chat da Aurum Flow saiu a 2026-08-27: foi retirado das apps e espelhar mensagens para um
// canal escondido é escrever para ninguém.
const FONTES_COM_CHAT_PROPRIO = new Set(['gold-did'])

/**
 * Aplica uma edição da fonte: corrige o Telegram, corrige o chat da app, e — no Premium —
 * volta a passar o texto pelo processador para os níveis ficarem ancorados na versão nova.
 *
 * As ordens PENDENTES do texto antigo são apagadas (é a mesma semântica do "Updated" que o
 * trader escreve à mão); posições já abertas não se tocam, porque uma correção de texto não
 * é razão para fechar uma trade a correr ao preço de mercado.
 */
async function tratarEdicao(args: {
  chatId: string
  slug: string | null
  outText: string
  body: { source_chat_id?: string | number; source_message_id?: number }
}): Promise<NextResponse> {
  const { chatId, slug, outText, body } = args
  const supabase = getSupabaseAdmin()
  const sourceChatId = body.source_chat_id != null ? String(body.source_chat_id) : null
  const sourceMsgId = typeof body.source_message_id === 'number' ? body.source_message_id : null
  if (!sourceChatId || sourceMsgId == null) {
    return NextResponse.json({ ok: false, error: 'edição exige source_chat_id e source_message_id' }, { status: 400 })
  }

  const { data: linha } = await supabase
    .from('telegram_relay_log')
    .select('target_message_id')
    .eq('source_chat_id', sourceChatId)
    .eq('source_message_id', sourceMsgId)
    .eq('target_chat_id', chatId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .maybeSingle()

  const destMsgId = (linha as { target_message_id?: number } | null)?.target_message_id ?? null
  // Nunca foi publicada → não há nada para editar. Devolve-se ok para o relay não insistir.
  if (destMsgId == null) return NextResponse.json({ ok: true, skipped: 'sem original' })

  const { editTelegramChannelMessage } = await import('@/lib/mtmcopy/telegram-bot')
  const ed = await editTelegramChannelMessage(chatId, destMsgId, outText)

  // Chat da app: a mensagem foi guardada com o telegram_message_id do destino.
  let chatAtualizado = false
  try {
    const { data: msg } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('telegram_message_id', destMsgId)
      .maybeSingle()
    if (msg?.id) {
      await supabase.from('chat_messages').update({ content: outText }).eq('id', msg.id)
      chatAtualizado = true
    }
  } catch (e) {
    console.warn('[relay-post] edição no chat falhou:', e instanceof Error ? e.message : e)
  }

  // Premium: reancorar. O texto novo pode ter zona/SL/TP diferentes — as pendentes do texto
  // antigo deixam de fazer sentido.
  let reprocessado = false
  if (slug === 'premium-ideas' && !ed.unchanged) {
    try {
      const { handleSourceFollowup } = await import('@/lib/mtmcopy/followup-reader')
      await handleSourceFollowup({ channelSlug: slug, content: 'updated' })
      const { processMtmcopyTelegramMessage } = await import('@/lib/mtmcopy/processor')
      await processMtmcopyTelegramMessage({
        chat: { id: Number(chatId), type: 'channel', title: 'MTM Premium' },
        text: outText,
        message_id: destMsgId,
      } as Parameters<typeof processMtmcopyTelegramMessage>[0])
      reprocessado = true
    } catch (e) {
      console.error('[relay-post] reprocessar edição falhou:', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({
    ok: ed.ok,
    edited: ed.ok && !ed.unchanged,
    unchanged: ed.unchanged === true,
    chat: chatAtualizado,
    reprocessed: reprocessado,
    error: ed.error,
  })
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as {
    chat_id?: string | number
    /** true = a fonte EDITOU esta mensagem; corrigir a que já foi publicada. */
    edit?: boolean
    text?: string
    /** id da msg NO DESTINO a que responder (se o VPS já o souber). Normalmente não sabe. */
    reply_to_message_id?: number
    /** Texto do SINAL-PAI (o SETUP a que este HIT/update responde) — dá o contexto ao executor
     *  para casar a gestão com o sinal certo. */
    reply_to_text?: string
    /** id + canal da msg NA FONTE (New York/London Intelligence) — para encadear as RESPOSTAS
     *  no destino (mapa fonte→destino em telegram_relay_log), tal como aparecem no canal original. */
    source_chat_id?: string | number
    source_message_id?: number
    reply_to_source_id?: number
    /** Só espelha no chat da app — não republica no Telegram. Ver ESPELHO_SEM_EXECUCAO. */
    app_only?: boolean
  }
  const chatId = body.chat_id != null ? String(body.chat_id) : ''
  const rawText = (body.text ?? '').toString()
  if (!chatId || !rawText.trim()) {
    return NextResponse.json({ ok: false, error: 'chat_id e text obrigatórios' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const slug = resolveAppChannelSlug({ id: Number(chatId) })

  // BRANDING do canal: garante o cabeçalho "🏦 MTM Premium" (como no canal original), sem duplicar.
  let outText = rawText.trim()
  if (slug === 'premium-ideas' && !/^\s*🏦/.test(outText)) {
    outText = `🏦 MTM Premium\n\n${outText}`
  }

  // ── EDIÇÃO NA FONTE ──────────────────────────────────────────────────────────────────
  // O trader editou a mensagem no canal dele. Em vez de publicar uma correção nova (que o
  // cliente lê como um segundo sinal), corrige-se a que já lá está — no Telegram e no chat da
  // app — e reprocessa-se para os níveis ficarem ancorados no texto novo.
  if (body.edit === true) {
    return await tratarEdicao({ chatId, slug, outText, body })
  }

  const replyTo = typeof body.reply_to_message_id === 'number' ? body.reply_to_message_id : null
  const replyText = typeof body.reply_to_text === 'string' && body.reply_to_text.trim() ? body.reply_to_text.trim() : null
  const sourceChatId = body.source_chat_id != null ? String(body.source_chat_id) : null
  const sourceMsgId = typeof body.source_message_id === 'number' ? body.source_message_id : null
  const replyToSourceId = typeof body.reply_to_source_id === 'number' ? body.reply_to_source_id : null

  // THREADING (Respostas como no original): resolve a msg-pai NO DESTINO a partir da msg-pai na FONTE.
  let replyToDest: number | null = replyTo
  if (replyToDest == null && replyToSourceId != null && sourceChatId) {
    try {
      const { data: parent } = await supabase
        .from('telegram_relay_log')
        .select('target_message_id')
        .eq('source_chat_id', sourceChatId)
        .eq('source_message_id', replyToSourceId)
        .eq('target_chat_id', chatId)
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .maybeSingle()
      replyToDest = parent?.target_message_id ?? null
    } catch { /* best-effort: sem mapa → publica na mesma, só não encadeia */ }
  }

  // DEDUP ATÓMICO: com ids da fonte, reservamos a linha no mapa ANTES de publicar. Conflito no
  // unique (source_chat_id, source_message_id, target_chat_id) → já foi relayado (pelo real-time OU
  // por um poll anterior) → NÃO repetir: evita duplicados no canal e dupla execução. Isto é o que
  // permite ao POLLER de segurança reenviar sem risco (só passam mensagens ainda em falta).
  let claimId: string | null = null
  if (sourceChatId && sourceMsgId != null) {
    const { data: claim } = await supabase
      .from('telegram_relay_log')
      .insert({ source_chat_id: sourceChatId, source_message_id: sourceMsgId, target_chat_id: chatId, status: 'pending' })
      .select('id')
      .maybeSingle()
    if (claim) {
      claimId = claim.id as string
    } else {
      // Conflito no unique → já existe linha. Só é duplicado REAL se já foi publicada ('sent').
      // Se ficou em 'error'/'pending' (envio anterior falhou), reaproveitamos a linha p/ RETENTAR.
      const { data: ex } = await supabase
        .from('telegram_relay_log')
        .select('id, status')
        .eq('source_chat_id', sourceChatId)
        .eq('source_message_id', sourceMsgId)
        .eq('target_chat_id', chatId)
        .maybeSingle()
      if (!ex || ex.status === 'sent') return NextResponse.json({ ok: true, skipped: 'dup' })
      claimId = ex.id as string
    }
  }

  // `app_only`: a fonte já vive num canal Telegram do próprio trader — não há nada para
  // republicar. Só se espelha no chat da app. Poupa um grupo Telegram por fonte nova.
  const r = body.app_only
    ? { ok: true, messageId: null as number | null, error: undefined as string | undefined }
    : await sendTelegramChannelMessage(chatId, outText, { replyToMessageId: replyToDest })

  // Fecha a reserva com o id da msg no destino (para futuras RESPOSTAS encadearem por este mapa).
  if (claimId) {
    await supabase
      .from('telegram_relay_log')
      .update({ status: r.ok ? 'sent' : 'error', target_message_id: r.messageId ?? null, error: r.ok ? null : (r.error ?? 'falha') })
      .eq('id', claimId)
  }

  // EXECUÇÃO: o Telegram não entrega ao webhook as mensagens do próprio bot, por isso o
  // processador (Premium/Forex/Sensei-telegram) nunca as veria. Alimentamo-lo aqui direto.
  // O processador auto-filtra por allowlist de canais (chats não-ativos são ignorados) e
  // tem guarda de duplicados — seguro chamar para tudo o que passa por aqui.
  // RECEÇÃO: se o canal estiver desligado no admin, não processa nem espelha (o relay do VPS
  // continua a chamar, mas nada entra no sistema).
  const intakeSlug = slug === 'premium-ideas' ? 'premium' : null
  if (intakeSlug) {
    const { isIntakeEnabled } = await import('@/lib/mtmcopy/intake-switches')
    if (!(await isIntakeEnabled(intakeSlug as 'premium'))) {
      return NextResponse.json({ ok: true, skipped: 'intake_off', channel: 'premium' })
    }
  }

  const execText = outText.replace(/^\s*🏦[^\n]*\n+/, '') // tira o cabeçalho de marca
  // EXECUÇÃO só para o PREMIUM. O título 'MTM Premium' estava fixo e o processador corria para
  // QUALQUER relay que passasse por aqui: o relay do Forex Swings entrava rotulado como Premium,
  // era classificado como premium-signals, e todos os clientes com telegram_groups=['premium']
  // abriam EURUSD/USDJPY/NZDUSD/EURCHF nas contas deles. Outros relays só espelham, não executam.
  // ESPELHO das FONTES com chat próprio: entram no chat da app e no Tap to Trade,
  // mas NÃO passam pelo processador — não abrem nada sozinhas em conta nenhuma. Quem executa é
  // o cliente, ao aceitar no T2T. A execução automática na conta provedora fica para quando for
  // ligada de propósito; misturá-la aqui era como o Forex Swings entrar rotulado de Premium.
  // 2026-09-14: as fontes SÓ-EXECUÇÃO (entrada direta na conta provedora) saíram com a única
  // estratégia que as usava.

  const idEspelho = body.app_only ? sourceMsgId : r.messageId
  if ((body.app_only || r.ok) && slug && FONTES_COM_CHAT_PROPRIO.has(slug) && idEspelho) {
    try {
      const { data: dup } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('channel_slug', slug)
        .eq('telegram_message_id', idEspelho)
        .maybeSingle()
      if (!dup) {
        // Threading pelo id da FONTE: nestas fontes é o id da fonte que fica gravado em
        // telegram_message_id (não há mensagem de destino). Sem isto os follow-ups ficavam ao
        // nível de topo e liam-se como sinais novos.
        const paiId = await resolveThreadParent(slug, replyToSourceId ?? replyTo, execText)
        // ESPELHO FIEL: o chat mostra o que o trader escreveu, tal como está no Telegram.
        // Traduzir os follow-ups para o nosso cartão afastava o chat do canal — quem segue os
        // dois via textos diferentes para o mesmo acontecimento. Os cartões de gestão (entry
        // hit, break-even, parciais, fecho) continuam a existir, mas vindos do MOTOR DE PREÇO:
        // publicam-se quando acontecem de facto na conta, não quando o trader os escreve.
        const conteudo = execText
        const { data: msg } = await supabase
          .from('chat_messages')
          .insert({
            channel_slug: slug,
            user_id: null,
            content: conteudo,
            message_type: 'telegram_forward',
            telegram_sender: null,
            telegram_message_id: idEspelho,
            notified: true,
            ...(paiId ? { reply_to_id: paiId } : {}),
          })
          .select('id')
          .single()
        await sendTelegramChannelPush({
          slug, content: conteudo, chatMessageId: msg?.id as string, telegramMessageId: idEspelho,
        }).catch(() => {})

        // ENTRADA → executa na conta provedora da rota (e só nela).
        // FOLLOW-UP ("Tp3 hit", "close") → ciclo de vida: anuncia em thread com pips e
        // percentagem e fecha as ordens de quem aceitou no T2T. É o mesmo formato do Premium.
        try {
          const { isT2TEntrySignal } = await import('@/lib/mtmcopy/t2t-source')
          if (isT2TEntrySignal(slug, execText)) {
            const { executeSignalOnRouteProvider } = await import('@/lib/mtmcopy/processor')
            const r2 = await executeSignalOnRouteProvider({
              chatId, text: execText, telegramMessageId: idEspelho ?? undefined,
            })
            if (!r2.ok) console.log(`[relay-post] ${slug}: sem execução — ${r2.reason}`)
          } else {
            const { handleSourceFollowup } = await import('@/lib/mtmcopy/followup-reader')
            await handleSourceFollowup({ channelSlug: slug, content: execText })
          }
        } catch (e) {
          console.error(`[relay-post] ${slug} execução/ciclo erro:`, e instanceof Error ? e.message : e)
        }
      }
    } catch (e) {
      console.error('[relay-post] espelho fonte nova erro:', e instanceof Error ? e.message : e)
    }
  }

  if (r.ok && slug === 'premium-ideas') {
    // O CHAT VEM PRIMEIRO, A EXECUÇÃO A SEGUIR.
    //
    // Estava ao contrário: primeiro o processador (que fala com a MetaAPI e leva segundos), só
    // depois o espelho. A 2026-08-25, com o `relay-post` a exceder os 20s de leitura do relay, a
    // trade abriu às 14:09:51 e o sinal só apareceu no chat às 14:10:32 — o cliente viu a posição
    // aberta 41 segundos antes de ver o sinal que a abriu. Escrever o chat primeiro custa uma
    // ida à base de dados (dezenas de ms) e garante que quem está a olhar para a app vê sempre
    // o sinal antes da ordem.
    //
    // ESPELHO DO LITERAL → chat da app (só Premium/'premium-ideas'). Sem etiqueta (telegram_sender=null,
    // pedido Ricardo). Dedup por telegram_message_id. O T2T reconhece a entrada pelo próprio texto.
    try {
      if (slug === 'premium-ideas' && r.messageId) {
        const { data: dup } = await supabase
          .from('chat_messages')
          .select('id')
          .eq('channel_slug', slug)
          .eq('telegram_message_id', r.messageId)
          .maybeSingle()
        if (!dup) {
          const { data: msg } = await supabase
            .from('chat_messages')
            .insert({
              channel_slug: slug,
              user_id: null,
              // Entradas no formato único (com as notas do trader); o resto fica literal.
              content: premiumParaFormatoUnico(execText) ?? execText,
              message_type: 'telegram_forward',
              telegram_sender: null,
              telegram_message_id: r.messageId,
              notified: true,
              // Threading: follow-ups (HIT TP1/BE/fecho) são REPLIES no Telegram → responder ao
              // mesmo pai no chat da app (senão aparecem todos ao mesmo nível).
              // O pai NO DESTINO (resolvido pelo mapa fonte→destino), não o `reply_to_message_id`
              // cru, que o VPS quase nunca sabe — sem ele o pai caía na heurística dos pips (199).
              ...(await resolveThreadParent(slug, replyToDest, execText).then((id) => (id ? { reply_to_id: id } : {}))),
            })
            .select('id')
            .single()
          await sendTelegramChannelPush({ slug, content: execText, chatMessageId: msg?.id as string, telegramMessageId: r.messageId }).catch(() => {})
        }
      }
    } catch (e) {
      console.error('[relay-post] espelho premium erro:', e instanceof Error ? e.message : e)
    }

    // EXECUÇÃO: o Telegram não entrega ao webhook as mensagens do próprio bot, por isso o
    // processador nunca as veria. Alimentamo-lo aqui, já com o sinal visível no chat.
    try {
      const { processMtmcopyTelegramMessage } = await import('@/lib/mtmcopy/processor')
      await processMtmcopyTelegramMessage({
        chat: { id: Number(chatId), type: 'channel', title: 'MTM Premium' },
        text: execText,
        message_id: r.messageId ?? 0,
        // reply_to_message com TEXT → o executor resolve o sinal-pai direto (sem depender de
        // threading/lookup). Passamos o message_id (se houver) e/ou o texto do SETUP.
        // O id do PAI no destino (o mesmo espaço de ids de `message_id`, a chave do sinal na mestre:
        // premium-ouro:msg:tg:<id>). Era `replyTo` cru — quase sempre null — e por isso «HIT SL»/
        // «Close all» nunca chegavam ao sinal certo pelo id (07/10, isolamento 199).
        ...(replyToDest || replyText
          ? { reply_to_message: { ...(replyToDest ? { message_id: replyToDest } : {}), ...(replyText ? { text: replyText } : {}) } }
          : {}),
      } as Parameters<typeof processMtmcopyTelegramMessage>[0])
    } catch (e) {
      console.error('[relay-post] processador erro:', e instanceof Error ? e.message : e)
    }
  }
  /**
   * FONTES SÓ DE PUBLICAÇÃO (07/10 — Forex Swings, lib/sinais/identidade.ts › FONTES_SO_PUBLICACAO):
   * o que o relay publicou no grupo da casa ESPELHA-SE no canal da app e notifica — e acaba aqui. Não
   * passa pelo processador nem por executor nenhum: não há estratégia, mestre nem rotas por trás.
   * (O Telegram não entrega ao webhook as mensagens do próprio bot; sem isto o canal da app ficava vazio.)
   */
  if (r.ok && r.messageId && slug && fonteSoPublicacaoDoCanal(slug)) {
    try {
      const { intakeKeyDoEspelhoTelegram, isIntakeEnabled } = await import('@/lib/mtmcopy/intake-switches')
      const ik = intakeKeyDoEspelhoTelegram(slug)
      if (!ik || (await isIntakeEnabled(ik))) {
        const { data: dup } = await supabase
          .from('chat_messages')
          .select('id')
          .eq('channel_slug', slug)
          .eq('telegram_message_id', r.messageId)
          .maybeSingle()
        if (!dup) {
          const paiId = await resolveThreadParent(slug, replyToDest, execText)
          const { data: msg } = await supabase
            .from('chat_messages')
            .insert({
              channel_slug: slug,
              user_id: null,
              content: execText,
              message_type: 'telegram_forward',
              telegram_sender: null,
              telegram_message_id: r.messageId,
              notified: true,
              ...(paiId ? { reply_to_id: paiId } : {}),
            })
            .select('id')
            .single()
          await sendTelegramChannelPush({ slug, content: execText, chatMessageId: msg?.id as string, telegramMessageId: r.messageId }).catch(() => {})
        }
      }
    } catch (e) {
      console.error(`[relay-post] espelho ${slug} (só publicação) erro:`, e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ ok: r.ok, messageId: r.messageId, error: r.error })
}

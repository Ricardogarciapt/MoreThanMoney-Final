import { type NextRequest, NextResponse, after } from "next/server"
import { resolveThreadParent } from "@/lib/telegram-reply-thread"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { processMtmcopyTelegramMessage } from "@/lib/mtmcopy/processor"
import {
  getMtmcopyBotInfo,
  getMtmcopyBotToken,
  getMtmcopyWebhookInfo,
  MTMCOPY_BOT_USERNAME,
  registerMtmcopyTelegramWebhook,
} from "@/lib/mtmcopy/telegram-bot"
import { getSiteOrigin } from "@/lib/site-url"
import { resolveAppChannelSlug } from "@/lib/telegram-app-channels"
import { sendTelegramChannelPush } from "@/lib/telegram-channel-push"

async function mirrorTelegramMessage(supabase: ReturnType<typeof getSupabaseAdmin>, message: any) {
  const chatId = String(message.chat?.id ?? "")
  const slug = resolveAppChannelSlug(message.chat ?? {})

  if (!slug) {
    const channelTitle = message.chat?.title ?? ""
    const channelUsername = message.chat?.username ?? ""
    console.log(`[Telegram] Canal não mapeado: id=${chatId} title="${channelTitle}" username="${channelUsername}"`)
    return
  }

  console.log(`[Telegram] Espelhar ${chatId} → ${slug}`)

  const telegramMessageId = message.message_id
  const senderName = message.chat?.title || message.sender_chat?.title || "Telegram"

  // Dedup: skip if already imported
  const { data: existing } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("telegram_message_id", telegramMessageId)
    .eq("channel_slug", slug)
    .maybeSingle()

  if (existing) return

  // Build content
  let content: string | null = message.text || message.caption || null
  let imageUrl: string | null = null

  // ECO dos nossos anúncios de ciclo de vida (o push que NÓS enviámos ao canal volta pelo
  // webhook): já estão no chat e já foram notificados na origem — reinseri-los duplicava a
  // mensagem, repetia o push e realimentava o leitor de follow-ups (loop de "Ideia descartada").
  {
    const { isOwnLifecycleAnnouncement } = await import("@/lib/mtmcopy/signal-lifecycle")
    if (isOwnLifecycleAnnouncement(content)) {
      console.log(`[Telegram] eco de anúncio próprio ignorado em ${slug}`)
      return
    }
  }

  // Handle photo: pick highest resolution
  if (message.photo && message.photo.length > 0) {
    const bestPhoto = message.photo[message.photo.length - 1]
    const fileId = bestPhoto.file_id
    const botToken = getMtmcopyBotToken()
    if (botToken) {
      try {
        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
        if (fileRes.ok) {
          const fileData = await fileRes.json()
          if (fileData.ok) {
            imageUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`
          }
        }
      } catch {
        // ignore
      }
    }
  }

  const replyToId = await resolveThreadParent(
    slug,
    (message as { reply_to_message?: { message_id?: number } }).reply_to_message?.message_id ?? null,
    content,
  )
  const { error } = await supabase.from("chat_messages").insert({
    channel_slug: slug,
    user_id: null,
    content,
    image_url: imageUrl,
    message_type: "telegram_forward",
    telegram_sender: senderName,
    telegram_message_id: telegramMessageId,
    ...(replyToId ? { reply_to_id: replyToId } : {}),
    ...(message.date ? { created_at: new Date(message.date * 1000).toISOString() } : {}),
  })

  if (error) {
    console.error(`[Telegram] Erro ao inserir mensagem em ${slug}:`, error.message)
  } else {
    console.log(`[Telegram] ✅ Mensagem ${telegramMessageId} inserida em ${slug}`)

    const push = await sendTelegramChannelPush({
      slug,
      content,
      imageUrl,
      telegramMessageId,
    })
    if (!push.ok) {
      console.warn(`[Telegram] Push falhou para ${slug}:`, push.error ?? push.status)
    }

    // LEITOR ÚNICO de follow-ups: se a mensagem for um fecho/cancelamento/descarte, espelha-o nas
    // ordens T2T de quem aceitou aquele sinal — venha de que fonte vier. É isto que cobre as
    // Ideias de Forex e qualquer canal T2T novo sem precisar de código próprio por fonte.
    try {
      const { handleSourceFollowup } = await import("@/lib/mtmcopy/followup-reader")
      const r = await handleSourceFollowup({ channelSlug: slug, content: content ?? '' })
      if (r.handled) {
        console.log(`[Telegram] follow-up ${r.event} em ${slug}: ${r.followers ?? 0} seguidor(es), ${r.cancelled ?? 0} pendente(s), ${r.closed ?? 0} fechada(s)`)
      }
    } catch (err) {
      console.error("[Telegram] leitor de follow-up falhou:", err)
    }
  }
}

async function handleTelegramChannelMessage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  message: Parameters<typeof processMtmcopyTelegramMessage>[0],
) {
  const runMtmcopy = async () => {
    try {
      await processMtmcopyTelegramMessage(message)
    } catch (err) {
      console.error("[mtmcopy] erro no processamento:", err)
    }
  }

  // Chat + push imediatos em paralelo com MTMcopier (MetaAPI não bloqueia a app)
  await Promise.all([
    mirrorTelegramMessage(supabase, message),
    (async () => {
      const { registerDiscoveredTelegramChat } = await import("@/lib/mtmcopy/signal-sources-config")
      await registerDiscoveredTelegramChat(message.chat ?? {})
    })(),
    runMtmcopy(),
    // Relay MTMgold (Premium) → canal do parceiro (Alcy), marca escondida. Gated na config.
    (async () => {
      const { relayPremiumMessage } = await import("@/lib/telegram/relay")
      await relayPremiumMessage(supabase, message)
    })(),
  ])
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (secret && request.nextUrl.searchParams.get("secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const supabase = getSupabaseAdmin()

    // IMPORTANTE: o processamento de sinais (mirror + MetaApi) é PESADO (ligação MetaApi fria pode
    // demorar dezenas de segundos). Se o awaitássemos antes de responder, o Telegram dava "Read timeout
    // expired" e PARAVA de entregar TODAS as mensagens (foi o que aconteceu 06/08 → Premium sem relay).
    // Com after() respondemos 200 imediatamente e processamos em background (até maxDuration=120s).
    if (body.channel_post) {
      after(() => handleTelegramChannelMessage(supabase, body.channel_post).catch((e) => console.error("[tg channel_post]", e)))
    }

    if (body.edited_channel_post) {
      after(() => handleTelegramChannelMessage(supabase, body.edited_channel_post).catch((e) => console.error("[tg edited_channel_post]", e)))
    }

    if (body.message?.chat?.type === "supergroup" || body.message?.chat?.type === "group") {
      after(() => handleTelegramChannelMessage(supabase, body.message).catch((e) => console.error("[tg group]", e)))
      // Descobrir o grupo de leads (regista os grupos vistos) + boas-vindas a novos membros
      try {
        const { recordTelegramGroup, handleLeadsGroupNewMembers } = await import("@/lib/telegram-lead-funnel")
        await recordTelegramGroup(supabase, body.message.chat)
        if (Array.isArray(body.message.new_chat_members) && body.message.new_chat_members.length) {
          await handleLeadsGroupNewMembers(supabase, body.message.chat, body.message.new_chat_members)
        }
      } catch (e) {
        console.error("[telegram-leads-group]", e)
      }
    }

    if (body.edited_message?.chat?.type === "supergroup" || body.edited_message?.chat?.type === "group") {
      after(() => handleTelegramChannelMessage(supabase, body.edited_message).catch((e) => console.error("[tg edited_message]", e)))
    }

    // Callback dos botões (Aprovar/Rejeitar acesso broker)
    if (body.callback_query?.data) {
      try {
        const cq = body.callback_query
        const bg = await import("@/lib/telegram-broker-gate")

        // Os botões do caminho (ecossistema vs MTM Auto) respondem-se ANTES de tudo: são de quem
        // ainda está a decidir, e uma pergunta que fica sem resposta é um lead que se vai embora.
        const dadosBotao = typeof cq.data === "string" ? cq.data : ""
        if (dadosBotao.startsWith("caminho:") || dadosBotao.startsWith("mtmauto:")) {
          const mf = await import("@/lib/telegram-mtmauto-funnel")
          const chatBotao = String(cq.message?.chat?.id ?? cq.from?.id ?? "")
          const bt0 = getMtmcopyBotToken()
          if (dadosBotao === "caminho:ecossistema") {
            await mf.marcarInteresse(chatBotao, "ecossistema")
            if (bt0) {
              await fetch(`https://api.telegram.org/bot${bt0}/sendMessage`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatBotao, parse_mode: "HTML", disable_web_page_preview: true,
                  text: await bg.brokerStepMessageEditavel() }),
              })
            }
          } else {
            const passo = dadosBotao === "mtmauto:corretora" ? "corretora"
              : dadosBotao === "mtmauto:app" ? "app_instalada"
              : dadosBotao === "mtmauto:ligar" ? "a_operar" : null
            // "não consigo entrar" fica registado como app_instalada: a conta existe, o que falta
            // é a porta abrir. Serve para o admin ver quem ficou preso à entrada.
            if (dadosBotao === "mtmauto:login" || dadosBotao === "mtmauto:sememail") {
              await mf.marcarPassoMtmAuto(chatBotao, "app_instalada")
            }
            if (passo) await mf.marcarPassoMtmAuto(chatBotao, passo as "corretora" | "app_instalada" | "a_operar")
            else await mf.marcarInteresse(chatBotao, "mtmauto")
            // Quem JÁ tem a corretora validada e só agora diz que quer a app não devia ter de
            // repetir nada: o cupão é emitido aqui mesmo.
            if (dadosBotao === "caminho:mtmauto") {
              const { data: leadJa } = await supabase
                .from("telegram_leads")
                .select("stage, broker_uid")
                .eq("chat_id", chatBotao)
                .maybeSingle()
              if ((leadJa as { stage?: string } | null)?.stage === "granted") {
                const cupaoApp = await mf.criarCupaoMtmAuto(chatBotao, (leadJa as { broker_uid?: string } | null)?.broker_uid ?? null)
                if (cupaoApp && bt0) {
                  await mf.marcarPassoMtmAuto(chatBotao, "validado")
                  const mc = mf.mtmAutoCupaoValidado(cupaoApp)
                  await fetch(`https://api.telegram.org/bot${bt0}/sendMessage`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: chatBotao, parse_mode: "HTML", disable_web_page_preview: true,
                      text: mc.texto, reply_markup: mc.teclado }),
                  })
                }
              }
            }

            const resposta = mf.respostaDeCallback(dadosBotao)
            if (resposta && bt0) {
              await fetch(`https://api.telegram.org/bot${bt0}/sendMessage`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatBotao, parse_mode: "HTML", disable_web_page_preview: true,
                  text: resposta.texto, reply_markup: resposta.teclado }),
              })
            }
          }
          const btAck = getMtmcopyBotToken()
          if (btAck) {
            await fetch(`https://api.telegram.org/bot${btAck}/answerCallbackQuery`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callback_query_id: cq.id }),
            })
          }
          return NextResponse.json({ ok: true })
        }

        if (typeof cq.data === "string" && cq.data.startsWith("admin:")) {
          await bg.handleAdminAction(supabase, cq.data.slice(6), String(cq.from?.id ?? cq.message?.chat?.id ?? ""))
        } else {
          await bg.handleBrokerApproval(supabase, cq.data, String(cq.message?.chat?.id ?? ""), Number(cq.message?.message_id ?? 0))
        }
        const bt = getMtmcopyBotToken()
        if (bt) {
          await fetch(`https://api.telegram.org/bot${bt}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: cq.id }),
          })
        }
      } catch (e) {
        console.error("[telegram-callback]", e)
      }
    }

    // Print screen (foto) em DM → prova de depósito do funil broker-gated
    if (body.message?.chat?.type === "private" && Array.isArray(body.message?.photo) && body.message.photo.length) {
      try {
        const fileId = body.message.photo[body.message.photo.length - 1].file_id
        const { handleProofPhoto } = await import("@/lib/telegram-broker-gate")
        await handleProofPhoto(supabase, String(body.message.chat.id), fileId, body.message.from?.first_name ?? null)
      } catch (e) {
        console.error("[broker-gate-photo]", e)
      }
    }

    // Comandos privados DM (não processar mensagens de grupos/canais)
    if (
      body.message?.chat?.type === "private" &&
      body.message?.chat?.id &&
      typeof body.message?.text === "string"
    ) {
      const text: string = body.message.text.trim()
      const chatId = String(body.message.chat.id)
      const botToken = getMtmcopyBotToken()

      const sendMessage = async (msg: string, teclado?: unknown) => {
        if (!botToken) return
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: msg,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            ...(teclado ? { reply_markup: teclado } : {}),
          }),
        })
      }

      /**
       * A pergunta que separa os caminhos.
       *
       * Vai logo a seguir às boas-vindas porque é a única coisa que muda tudo o que vem depois:
       * quem quer só a app não quer ouvir falar de sessões ao vivo, e quem quer a comunidade não
       * quer um tutorial de instalação. Duas opções, e a resposta fica guardada.
       */
      const perguntarCaminho = async () => {
        const mf = await import("@/lib/telegram-mtmauto-funnel")
        await mf.marcarInteresse(chatId, "indeciso")
        const q = mf.perguntaDeCaminho(body.message?.from?.first_name ?? null)
        await sendMessage(q.texto, q.teclado)
      }

      // Boas-vindas (reutilizada por /start e por deep-links de funil)
      const welcomeMsg =
        "👋 <b>Bem-vindo à MoreThanMoney!</b>\n\n" +
        "O ecossistema português de trading: scanner, alertas, comunidade e app. " +
        "Sinais acompanhados do início ao fim, medidos em pips e percentagem.\n\n" +
        "Por onde queres começar?\n" +
        "🎁 /app — 14 dias Premium GRÁTIS (código 14DayTrial, sem cartão)\n" +
        "💬 /grupos — Entrar nos grupos de sinais\n" +
        "📊 /sinais — Ver os últimos sinais\n" +
        "🏦 /corretora — Abrir conta (PU Prime)\n" +
        "👑 /premium — Ser Premium\n" +
        "ℹ️ /ajuda — Todos os comandos"

      // Tokens reservados dos deep-links de captação — NÃO são tokens de mentor.
      const RESERVED_START = new Set([
        "lead", "leads", "funnel", "funil", "broker",
        "premium", "app", "sinais", "grupos", "corretora", "start",
      ])

      // /start <token> — token de mentor OU deep-link de funil
      const startMatch = text.match(/^\/start\s+([a-zA-Z0-9_]+)$/)
      if (startMatch?.[1]) {
        const token = startMatch[1]
        let linked = false

        // Só procura mentor se NÃO for um token reservado do funil.
        if (!RESERVED_START.has(token.toLowerCase())) {
          const { data: profile } = await supabase
            .from("mentor_profiles")
            .select("user_id")
            .eq("telegram_start_token", token)
            .maybeSingle()

          if (profile?.user_id) {
            await supabase
              .from("mentor_profiles")
              .update({ telegram_chat_id: chatId })
              .eq("user_id", profile.user_id)

            await supabase.from("notifications").insert({
              user_id: profile.user_id,
              type: "mentor",
              title: "Telegram ligado ao Mentor",
              message: "Canal privado do mentor ativo. Vais receber lembretes e progresso por aqui também.",
              data: { source: "telegram" },
              read: false,
            })

            await sendMessage("✅ <b>Telegram ligado com sucesso!</b>\n\nVais receber as tuas notificações de mentor por aqui. Bem-vindo ao MTM! 🚀")
            linked = true
          }
        }

        // Deep-link de funil (lead/broker/…) OU token de mentor não encontrado:
        // NUNCA dead-end — arranca o funil com as boas-vindas.
        if (!linked) {
          // Quem chega pelo botão "Validate partner broker" da app cai DIRETO nos passos da
          // validação de corretora. Mandá-lo para as boas-vindas genéricas era fazê-lo procurar
          // outra vez aquilo em que já tinha carregado.
          const t = token.toLowerCase()
          if (t === "broker" || t === "corretora") {
            const { brokerStepMessageEditavel } = await import("@/lib/telegram-broker-gate")
            await sendMessage(await brokerStepMessageEditavel())
          } else if (t === "mtmauto" || t === "auto") {
            // Quem chega pelo link da app já disse o que quer — não se lhe pergunta outra vez.
            const mf = await import("@/lib/telegram-mtmauto-funnel")
            await mf.marcarInteresse(chatId, "mtmauto")
            const m = mf.mtmAutoIntro()
            await sendMessage(m.texto, m.teclado)
          } else {
            await sendMessage(welcomeMsg)
            await perguntarCaminho()
          }
        }
      }

      // /start sem token
      else if (text === "/start") {
        await sendMessage(welcomeMsg)
        await perguntarCaminho()
      }

      // /mtmauto — atalho para quem já sabe o que quer
      else if (text === "/mtmauto" || text === "/auto") {
        const mf = await import("@/lib/telegram-mtmauto-funnel")
        await mf.marcarInteresse(chatId, "mtmauto")
        const m = mf.mtmAutoIntro()
        await sendMessage(m.texto, m.teclado)
      }

      // /sinais — últimos sinais
      else if (text === "/sinais" || text === "/sinais@MoreThanMoney_aibot") {
        const { data: signals } = await supabase
          .from("telegram_signals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5)

        if (!signals || signals.length === 0) {
          await sendMessage("📊 Sem sinais recentes. Aguarda o próximo sinal!")
        } else {
          const lines = signals.map((s: any, i: number) => {
            const date = new Date(s.created_at).toLocaleDateString("pt-PT")
            return `${i + 1}. <b>${s.symbol || "N/A"}</b> — ${s.direction || ""} ${s.entry_price ? `@ ${s.entry_price}` : ""} <i>(${date})</i>`
          })
          await sendMessage("📊 <b>Últimos sinais MTM:</b>\n\n" + lines.join("\n"))
        }
      }

      // /status
      else if (text === "/status" || text === "/status@MoreThanMoney_aibot") {
        const { data: mentor } = await supabase
          .from("mentor_profiles")
          .select("user_id, telegram_chat_id")
          .eq("telegram_chat_id", chatId)
          .maybeSingle()

        if (mentor) {
          await sendMessage("✅ <b>Telegram ligado à plataforma MTM</b>\n\nTudopronto! Vais receber notificações por aqui.")
        } else {
          await sendMessage("⚠️ <b>Telegram não ligado</b>\n\nVai à plataforma MTM e liga o teu Telegram na área do mentor.")
        }
      }

      // /app — teste grátis + descarregar app
      else if (text === "/app" || text === "/app@MoreThanMoney_aibot" || text === "/teste" || text === "/trial") {
        await sendMessage(
          "📲 <b>Testa a MoreThanMoney grátis</b>\n\n" +
          "🎁 <b>14 dias Premium grátis</b> com o código <code>14DayTrial</code> — sem cartão. Vê os sinais, o Tap-to-Trade e as sessões ao vivo por dentro.\n\n" +
          "1️⃣ Descarrega a app · 2️⃣ Cria conta · 3️⃣ <b>Mais → Definições → Resgatar código</b> → <code>14DayTrial</code>\n\n" +
          "▶️ <a href='https://www.morethanmoney.pt/register'>Criar conta</a>\n" +
          "🍏 <a href='https://apps.apple.com/pt/app/id6778558643'>App iOS</a>\n" +
          "🤖 <a href='https://www.morethanmoney.pt/downloads/MoreThanMoney.apk'>App Android</a>"
        )
      }

      // /grupos — acesso aos grupos é BROKER-GATED (conta PU Prime + depósito $300)
      else if (text === "/grupos" || text === "/grupos@MoreThanMoney_aibot" || text === "/sinal" || text === "/acesso") {
        const { brokerStepMessageEditavel } = await import("@/lib/telegram-broker-gate")
        await sendMessage(await brokerStepMessageEditavel())
      }

      // /premium — ser Premium
      else if (text === "/premium" || text === "/premium@MoreThanMoney_aibot") {
        await sendMessage(
          "👑 <b>MoreThanMoney Premium</b>\n\n" +
          "Scanner, Trading Alerts, Tap to Trade, salas Premium, aulas e comunidade.\n\n" +
          "🎁 <b>1º mês 34,99€</b> (depois 65€/mês)\n" +
          "▶️ <a href='https://www.morethanmoney.pt/upgrade'>Subscrever Premium</a>\n" +
          "🆓 Ou testa grátis primeiro: /app"
        )
      }

      // /corretora — abrir conta PU Prime
      else if (text === "/corretora" || text === "/corretora@MoreThanMoney_aibot" || text === "/conta") {
        await sendMessage(
          "🏦 <b>Abrir conta na corretora (PU Prime)</b>\n\n" +
          "É a corretora que usamos para copiar os sinais no MT5.\n\n" +
          "▶️ <a href='https://www.puprime.com/campaign?cs=morethanmoney'>Abrir conta PU Prime</a>\n\n" +
          "Depois liga-a na app para o <b>Tap to Trade</b> / <b>MTM Copy</b>: /app"
        )
      }

      // /ajuda
      else if (text === "/ajuda" || text === "/ajuda@MoreThanMoney_aibot" || text === "/help") {
        await sendMessage(
          "ℹ️ <b>Comandos MoreThanMoney</b>\n\n" +
          "/app — Teste grátis da app 📲\n" +
          "/sinais — Últimos sinais 📊\n" +
          "/grupos — Grupos de sinais 💬\n" +
          "/premium — Ser Premium 👑\n" +
          "/corretora — Abrir conta (PU Prime) 🏦\n" +
          "/status — Estado da ligação\n\n" +
          "🌐 <a href='https://www.morethanmoney.pt/new-landing'>Conhece a MTM</a>"
        )
      }

      // /admin ou /painel — regista aprovador + mostra o painel de admin (só o admin vê)
      else if (text === "/admin" || text === "/painel") {
        await supabase.from("site_settings").upsert(
          { key: "telegram_admin_chat_id", value: { chat_id: chatId }, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        )
        const { adminPanelKeyboard } = await import("@/lib/telegram-broker-gate")
        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "🛠️ <b>Painel de Admin MTM</b>\n\nAprovador registado ✅. Recebes aqui os pedidos de acesso (UID + print) com botões. Escolhe:",
              parse_mode: "HTML",
              reply_markup: adminPanelKeyboard(),
            }),
          })
        }
      }

      // Mensagem LIVRE (não-comando) em DM → ADMIN fala com a IA do site · OU UID da corretora · OU funil IA persona
      else if (!text.startsWith("/")) {
        try {
          const bg = await import("@/lib/telegram-broker-gate")
          // ADMIN (Ricardo): texto livre vai para a IA DO SITE (consulta o negócio + arranca tarefas).
          // NÃO se mistura com o funil de leads. Só o chat aprovador.
          if (await bg.isAdminChat(supabase, chatId)) {
            try {
              const { runSiteAgentChat } = await import("@/lib/agent-site-api")
              const { reply } = await runSiteAgentChat(text, "Canal: Telegram admin (Ricardo). Responde curto e podes arrancar tarefas/comandos do site.")
              await sendMessage(reply || "✅ Feito.")
            } catch (e) {
              console.error("[telegram-admin-ai]", e)
              await sendMessage("⚠️ A IA do site não respondeu agora. Tenta /admin para o painel.")
            }
            return NextResponse.json({ ok: true })
          }
          const uid = bg.looksLikeBrokerUid(text)
          if (uid) {
            await bg.handleBrokerUid(supabase, chatId, uid, body.message.from?.first_name ?? null)
          } else {
            /**
             * As NOSSAS automações primeiro.
             *
             * Uma regra que o Ricardo escreveu no /admin/social ganha à resposta genérica da IA:
             * ele escreveu-a porque sabe o que quer dizer àquela palavra, e uma IA a improvisar
             * por cima disso é a diferença entre uma automação e uma surpresa.
             *
             * Se nenhuma regra apanha, segue o funil de sempre — nada se perde por não haver
             * automações configuradas.
             */
            const { encontrarAutomacao, reservarDisparo, contarDisparo, textoDaResposta } =
              await import("@/lib/automacoes")
            const auto = await encontrarAutomacao("telegram", text)
            if (auto) {
              /**
               * Uma regra por PALAVRA responde já; uma por IA espera.
               *
               * Quem escreve "APP" quer o link agora — fazê-lo esperar por uma heurística seria
               * estragar o caso simples para melhorar o complicado. Mas quem escreve três
               * mensagens seguidas ("olá", "queria saber", "sobre os sinais") merece UMA resposta
               * ao conjunto, não três à primeira. É a distinção que o ChatbotX faz, e é a certa.
               */
              if (auto.respostaTipo === "ia") {
                const { enfileirarParaIA } = await import("@/lib/automacoes")
                await enfileirarParaIA("telegram", String(chatId), text)
                return NextResponse.json({ ok: true, enfileirado: true })
              }

              // Marca ANTES de responder: falhar a responder é melhor do que responder duas vezes.
              const primeiraVez = await reservarDisparo(auto.id, String(chatId), auto.valor ?? null)
              if (primeiraVez) {
                const resposta = await textoDaResposta(auto, text)
                if (resposta) {
                  await sendMessage(resposta)
                  await contarDisparo(auto.id)
                  return NextResponse.json({ ok: true, automacao: auto.nome })
                }
              }
            }

            const { runLeadFunnelReply } = await import("@/lib/telegram-lead-funnel")
            const reply = await runLeadFunnelReply({
              chatId,
              firstName: body.message.from?.first_name ?? null,
              username: body.message.from?.username ?? null,
              userText: text,
            })
            await sendMessage(
              reply ||
                "Diz-me só: procuras <b>sinais para copiar à mão</b>, <b>Tap to Trade</b> (1 toque) ou algo <b>automático</b>? 🙂",
            )
            // Supervisão: se o lead está quente (compra/UID/falar contigo), avisa o admin.
            try {
              const { maybeEscalateLead } = await import("@/lib/mtm-sdr-escalation")
              await maybeEscalateLead({
                chatId,
                username: body.message.from?.username ?? null,
                firstName: body.message.from?.first_name ?? null,
                userText: text,
                aiReply: reply,
                channel: "telegram",
              })
            } catch {}
          }
        } catch (e) {
          console.error("[telegram-funnel] erro:", e)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Erro no webhook do Telegram:", error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const { isMetaApiConfigured } = await import("@/lib/mtmcopy/metaapi")
  const botInfo = await getMtmcopyBotInfo()
  const webhook = await getMtmcopyWebhookInfo()
  const register = request.nextUrl.searchParams.get("register") === "1"

  let webhookRegister: { ok: boolean; description?: string; webhook_url?: string } | undefined
  if (register) {
    webhookRegister = await registerMtmcopyTelegramWebhook(getSiteOrigin())
  }

  return NextResponse.json({
    status: "Webhook ativo",
    bot: botInfo.ok
      ? { username: botInfo.username, name: botInfo.first_name, id: botInfo.id }
      : { error: botInfo.error ?? "TELEGRAM_AIBOT_TOKEN em falta" },
    expected_bot: `@${MTMCOPY_BOT_USERNAME()}`,
    webhook,
    webhook_register: webhookRegister,
    mtmcopy: "Bot API · Telegram → MetaAPI → MT5",
    metaapi: isMetaApiConfigured() ? "configurado" : "METAAPI_TOKEN em falta",
  })
}

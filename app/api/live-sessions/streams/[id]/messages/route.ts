import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import {
  getLmsChatRollingCutoffIso,
  shouldPurgeEntireStreamChat,
} from "@/lib/lms-chat-retention"
import { criarLeitorDeEspectador } from "@/lib/live-acesso-servidor"
import { userIdDoPedido } from "@/lib/sessao-do-pedido"
import {
  motivoDeRecusaDoChat,
  podeEscreverNoChatDaSala,
  podeLerChatDaSala,
  tierParaGravar,
} from "@/lib/live-chat-sala"
import { awardXp } from "@/lib/xp-service"

const supabaseAdmin = getSupabaseAdmin()

/** As colunas que o chat mostra. `select("*")` arrastava tudo o que a tabela venha a ganhar. */
const COLUNAS_CHAT = "id, stream_id, sender_type, sender_name, sender_tier, message, created_at"

/**
 * A limpeza de retenção corria a CADA leitura: com sondagem de poucos segundos por espectador,
 * eram dezenas de DELETE por minuto na mesma sala para apagar o mesmo nada. Agora corre no
 * máximo uma vez por minuto por sala, no processo — a retenção é de 24 h, um minuto de atraso
 * não muda nada e a sondagem incremental deixa de escrever na base.
 */
const INTERVALO_LIMPEZA_MS = 60_000
const ultimaLimpezaPorSala = new Map<string, number>()

function deveLimparAgora(streamId: string): boolean {
  const agora = Date.now()
  const ultima = ultimaLimpezaPorSala.get(streamId) ?? 0
  if (agora - ultima < INTERVALO_LIMPEZA_MS) return false
  ultimaLimpezaPorSala.set(streamId, agora)
  return true
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const limit = Math.min(200, Number(url.searchParams.get("limit") || 80))
    // Cursor incremental: `?desde=<ISO>` traz só o que nasceu depois. A 1ª sondagem vem sem ele
    // e leva o histórico — é como quem entra aos 20 minutos vê o que já se disse.
    const desdeParam = url.searchParams.get("desde")
    const desde = desdeParam && !Number.isNaN(Date.parse(desdeParam)) ? desdeParam : null

    const { data: streamMeta } = await supabaseAdmin
      .from("lms_streams")
      .select("live_ended_at, access_tier")
      .eq("id", id)
      .maybeSingle()

    if (!streamMeta) {
      return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 })
    }

    // O CADEADO DO CHAT. A reprodução da sala já era fechada por direito de acesso
    // (lib/live-acesso-servidor); o chat da MESMA sala lia-se sempre com a chave de serviço e
    // sem perguntar nada — qualquer pedido que soubesse o id lia a conversa de uma sala Premium.
    const quem = await criarLeitorDeEspectador(request)()
    if (!podeLerChatDaSala(quem, streamMeta.access_tier)) {
      // 403 com motivo, NUNCA uma lista vazia: vazio é indistinguível de "ainda sem mensagens",
      // e foi assim que já se perdeu um ecrã de mensagens em branco (ver messages-dm-blank-fix).
      return NextResponse.json(
        { success: false, bloqueado: true, error: motivoDeRecusaDoChat(quem, streamMeta.access_tier) },
        { status: 403 }
      )
    }

    const rollingCutoff = getLmsChatRollingCutoffIso()
    // Sessões GRATUITAS: o chat auto-limpa assim que a transmissão termina (não espera 24h).
    const freeSessionEnded = streamMeta.access_tier === "free" && !!streamMeta.live_ended_at
    const purgarTudo = freeSessionEnded || shouldPurgeEntireStreamChat(streamMeta.live_ended_at)

    // A sala gratuita que terminou limpa-se SEMPRE (é a regra do produto, não retenção), mesmo
    // numa sondagem incremental — senão quem já tem o chat aberto continuava a ver o histórico.
    if (freeSessionEnded) {
      await supabaseAdmin.from("lms_stream_messages").delete().eq("stream_id", id)
    } else if (deveLimparAgora(id)) {
      if (purgarTudo) {
        await supabaseAdmin.from("lms_stream_messages").delete().eq("stream_id", id)
      } else {
        await supabaseAdmin
          .from("lms_stream_messages")
          .delete()
          .eq("stream_id", id)
          .lt("created_at", rollingCutoff)
      }
    }

    if (freeSessionEnded || purgarTudo) {
      return NextResponse.json({ success: true, data: [], chatLimpo: true })
    }

    let consulta = supabaseAdmin
      .from("lms_stream_messages")
      .select(COLUNAS_CHAT)
      .eq("stream_id", id)
      .gte("created_at", rollingCutoff)

    if (desde) {
      // Exclusivo (`gt`): o cliente manda o instante da última que já tem.
      consulta = consulta.gt("created_at", desde).order("created_at", { ascending: true }).limit(limit)
      const { data, error } = await consulta
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, data: data || [], incremental: true })
    }

    // Histórico: as últimas `limit`, devolvidas da mais antiga para a mais nova.
    const { data, error } = await consulta.order("created_at", { ascending: false }).limit(limit)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data: (data || []).reverse() })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const message = String(body.message || "").trim()

    if (!message) {
      return NextResponse.json({ error: "Mensagem obrigatória" }, { status: 400 })
    }

    const { data: streamMeta } = await supabaseAdmin
      .from("lms_streams")
      .select("access_tier")
      .eq("id", id)
      .maybeSingle()

    if (!streamMeta) {
      return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 })
    }

    const cookieStore = await cookies()
    const educatorToken = cookieStore.get(getEducatorCookieName())?.value
    const educator = educatorToken ? verifyEducatorToken(educatorToken) : null

    if (educator) {
      const { data, error } = await supabaseAdmin
        .from("lms_stream_messages")
        .insert({
          stream_id: id,
          sender_type: "educator",
          sender_name: educator.displayName,
          message,
        })
        .select(COLUNAS_CHAT)
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, data })
    }

    // Escrever pede o MESMO direito que ler. Antes bastava ter sessão: qualquer conta escrevia
    // numa sala Premium ou VIP a que não podia assistir.
    // `userIdDoPedido` lê o token E o cookie — ler só o cookie deixava fora as apps nativas e o
    // Safari emoldurado, que foi como os Alertas de Trading deram lista vazia a quem tinha sessão.
    const userId = await userIdDoPedido(request)
    const quem = await criarLeitorDeEspectador(request)()
    if (!userId || !quem.perfil) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (!podeEscreverNoChatDaSala(quem, streamMeta.access_tier)) {
      return NextResponse.json(
        { error: motivoDeRecusaDoChat(quem, streamMeta.access_tier) },
        { status: 403 }
      )
    }

    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("full_name, username, email")
      .eq("id", userId)
      .maybeSingle()

    const senderName =
      profileRow?.full_name?.trim() ||
      profileRow?.username?.trim() ||
      profileRow?.email?.split("@")[0] ||
      "Aluno"

    const { data, error } = await supabaseAdmin
      .from("lms_stream_messages")
      .insert({
        stream_id: id,
        sender_type: "student",
        sender_name: senderName,
        // Quem é quem fica GRAVADO com a mensagem: o chat mostrava só "educador vs aluno", e o
        // perfil de quem escreveu não era recuperável depois (a tabela não guardava o autor).
        sender_id: userId,
        sender_tier: tierParaGravar(quem.perfil),
        message,
      })
      .select(COLUNAS_CHAT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const xp = await awardXp(supabaseAdmin, userId, "live_chat_message", {
      actionDescription: `Live chat · ${id}`,
    })

    return NextResponse.json({
      success: true,
      data,
      xp: { ...xp, action_type: "live_chat_message" },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

/** Apaga todo o histórico do chat: apenas educador dono do canal ou admin do site. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: streamId } = await params
    if (!streamId) {
      return NextResponse.json({ error: "streamId inválido" }, { status: 400 })
    }

    const cookieStore = await cookies()
    const educatorToken = cookieStore.get(getEducatorCookieName())?.value
    const educator = educatorToken ? verifyEducatorToken(educatorToken) : null

    let educatorOwnsStream = false
    if (educator) {
      const { data: stream } = await supabaseAdmin
        .from("lms_streams")
        .select("id")
        .eq("id", streamId)
        .eq("educator_id", educator.educatorId)
        .maybeSingle()
      educatorOwnsStream = Boolean(stream)
    }

    if (!educatorOwnsStream) {
      const adminGate = await requireAdmin(request)
      if (adminGate !== null) return adminGate
    }

    const { error } = await supabaseAdmin.from("lms_stream_messages").delete().eq("stream_id", streamId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

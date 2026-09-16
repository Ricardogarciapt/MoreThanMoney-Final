import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { getLmsIngestServerUrl } from "@/lib/lms-stream-ingest"
import { DEFAULT_RESTREAM_INGEST_URL, normalizeRestreamIngestUrl } from "@/lib/lms-restream"
import { normalizeIngestProvider } from "@/lib/lms-stream-options"
import { decidirEstadoDaSala, normalizarTituloGravacao, podeOperarSala } from "@/lib/lms-sala-introducao"

const supabase = getSupabaseAdmin()

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const educator = token ? verifyEducatorToken(token) : null

    if (!educator) {
      return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })
    }

    const body = await request.json()
    const streamId = String(body.streamId || "")
    const action = String(body.action || "").trim()
    const isLive = Boolean(body.isLive)
    const forceRegenerateKey = Boolean(body.regenerate)

    if (!streamId) {
      return NextResponse.json({ error: "streamId é obrigatório" }, { status: 400 })
    }

    // Autorização ANTES da escrita (ver `podeOperarSala`): a sala é lida por chave primária e a
    // pergunta «esta pessoa pode mexer nisto?» é respondida em código. O update a seguir fica
    // filtrado só por `id` — encadear `.eq()` no Supabase é AND, e a sala «Introdução» não tem
    // educador nenhum para casar com o filtro antigo.
    const { data: stream, error: streamError } = await supabase
      .from("lms_streams")
      .select("*")
      .eq("id", streamId)
      .maybeSingle()

    if (streamError || !stream) {
      return NextResponse.json({ error: "Canal não encontrado para este educador" }, { status: 404 })
    }

    // Mesma resposta de «não existe» para quem não manda nesta sala: quem não a opera também não
    // precisa de saber que ela existe.
    if (!podeOperarSala(stream as { educator_id?: string | null; operador_educator_id?: string | null }, educator.educatorId)) {
      return NextResponse.json({ error: "Canal não encontrado para este educador" }, { status: 404 })
    }

    const wantsStart = action === "start" || (action === "" && isLive === true)
    const wantsPause = action === "pause" || (action === "" && isLive === false)
    const wantsGenerate = action === "generate"

    // Salas de gravação (ex.: «Introdução») nunca ficam em direto — mas a transmissão não é
    // bloqueada: as chaves são atribuídas na mesma e o DVR grava. É a diferença entre gravar e
    // anunciar. A linha já foi lida acima com `*`, por isso isto não custa outra query.
    const nuncaAoVivo = Boolean((stream as Record<string, unknown>).nunca_ao_vivo)

    const updates: Record<string, any> = {}
    const { data: educatorRow } = await supabase
      .from("lms_educators")
      .select("stream_key_fixed, restream_enabled, restream_ingest_url, restream_stream_key")
      .eq("id", educator.educatorId)
      .single()
    const restreamBase =
      normalizeRestreamIngestUrl(educatorRow?.restream_ingest_url || null) || DEFAULT_RESTREAM_INGEST_URL
    const restreamKey = educatorRow?.restream_stream_key || null
    const restreamEnabled = Boolean(educatorRow?.restream_enabled)
    const ingestProvider = normalizeIngestProvider(stream.ingest_provider)
    // O Restream não serve a uma sala de gravação: o ficheiro tem de cair no NOSSO servidor (SRS)
    // para o DVR o apanhar e o mandar à playlist própria. Aqui o ingest é sempre MTM direto,
    // independentemente do que estiver no campo da sala.
    const shouldUseRestream = Boolean(!nuncaAoVivo && ingestProvider === "restream" && restreamEnabled && restreamKey)

    if (!nuncaAoVivo && ingestProvider === "restream" && !shouldUseRestream) {
      return NextResponse.json(
        {
          error:
            "Este canal está em Ingest Restream, mas a conta do educador não tem Restream configurado corretamente (ativar Restream e definir stream key).",
        },
        { status: 400 }
      )
    }

    const fixedKey = educatorRow?.stream_key_fixed || stream.stream_key
    if (!fixedKey && !shouldUseRestream) {
      return NextResponse.json({ error: "Falta definir chave de ingestão para iniciar o canal." }, { status: 400 })
    }

    // Só devemos sobrescrever ingest/keys quando:
    // - a gente pediu geração de chave (`generate`), ou
    // - o canal está com chave/ingest em falta.
    // Isso evita divergência entre a chave que o OBS está a usar e a que o site passa a procurar (HLS).
    const needsKey = !stream.stream_key || !stream.rtmps_url
    const shouldRefreshIngest = wantsGenerate || needsKey

    // Ingestão: Restream (RTMPS + key) quando configurado; caso contrário MTM direto.
    //
    // Decisão do dono (16/09): a sala de gravação usa a MESMA chave fixa do educador que as
    // outras salas dele, para ele não ter de trocar a chave no OBS entre uma coisa e outra.
    //
    // Isso reintroduz o empate no `on_dvr`, onde várias salas partilham a chave e a de gravação
    // nunca está ao vivo — antes ganhava outra sala e a gravação ia para a playlist errada. O
    // desempate passou a ser `gravacao_iniciada_em` (ver a rota on-dvr): enquanto ele carregou em
    // «Iniciar transmissão», é esta sala que fica com o ficheiro. Por isso é seguro agora, e não
    // era antes — se alguém desfizer aquela ordenação, isto volta a partir.
    updates.stream_key = shouldUseRestream ? restreamKey : fixedKey
    if (shouldRefreshIngest) updates.rtmps_url = shouldUseRestream ? restreamBase : getLmsIngestServerUrl()

    // O estado da sala vive numa função pura (lib/lms-sala-introducao.ts) porque é aí que a
    // invariante se prova: numa sala de gravação nunca sai daqui `is_live: true`.
    const { campos, notificar } = decidirEstadoDaSala({
      nuncaAoVivo,
      querIniciar: wantsStart,
      querParar: wantsPause,
    })
    Object.assign(updates, campos)
    // O título da gravação só existe nas salas de gravação e só se escreve ao INICIAR. Não se
    // apaga ao terminar: o ficheiro chega ao DVR depois do «Terminar», e é nesse momento que o
    // `on_dvr` o copia para a gravação.
    if (nuncaAoVivo && wantsStart) updates.gravacao_titulo = normalizarTituloGravacao(body.titulo)

    // Ignora tentativa de regenerar chave quando a política é chave fixa.
    if (forceRegenerateKey && wantsGenerate) {
      updates.live_ended_at = stream.live_ended_at || null
    }

    // Filtrado só por `id`: a autorização já foi decidida acima, e esta sala pode não ter educador.
    const { data, error } = await supabase
      .from("lms_streams")
      .update(updates)
      .eq("id", streamId)
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Push notification when going live (nunca numa sala de gravação: não há sessão para abrir)
    if (data && notificar) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.morethanmoney.pt"
      fetch(`${siteUrl}/api/notifications/send-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          all: true,
          title: "🔴 Estamos em Direto!",
          body: `"${stream.title}" está agora ao vivo. Entra já!`,
          data: { type: "live_session", url: "/app-mobile?tab=live", streamId },
        }),
      }).catch((e) => console.error("[presence] push failed:", e))
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


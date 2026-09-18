import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { podeVerReproducaoDaSala } from "@/lib/perfil-ui"
import { criarLeitorDeEspectador } from "@/lib/live-acesso-servidor"

/**
 * Proxy de signaling WHEP (WebRTC egress / playback tipo "chamada Zoom") para os espectadores WEB.
 *
 * Porquê: a página é HTTPS (www.morethanmoney.pt) e o WHEP do SRS vive noutra origem
 * (stream.morethanmoney.pt) → um POST direto dava CORS/mixed-content e exporia a chave. O cliente
 * envia a oferta SDP + o streamId; nós resolvemos a stream_key server-side (NÃO a expomos) e
 * reencaminhamos para o WHEP do SRS. O media (ICE/DTLS) vai direto browser↔SRS.
 *
 * SÓ WEB. As apps nativas (iOS/Android) continuam em HLS (não sabem WebRTC) — este endpoint não as
 * toca. Se o WHEP falhar, o player web cai para HLS. Captions/dobragem/DVR não dependem disto
 * (leem o RTMP do SRS), por isso ficam intactos.
 */

const supabase = getSupabaseAdmin()

function srsHost(): string {
  return process.env.RTMP_SERVER_HOST?.replace(/^rtmps?:\/\//i, "").split("/")[0] || "stream.morethanmoney.pt"
}

/** Bases candidatas para o WHEP (TLS via nginx /rtc/ primeiro; fallbacks diretos). */
function whepBases(): string[] {
  const explicit = process.env.LMS_WHIP_BASE?.trim() || process.env.LMS_SRS_HTTP_BASE?.trim()
  if (explicit) return [explicit.replace(/\/+$/, "")]
  const host = srsHost()
  return [`https://${host}`, `http://${host}:1985`, `http://${host}:8000`]
}

/** Resolve a stream_key a partir do streamId (só streams ao vivo). Não expõe a chave ao cliente. */
async function resolveStreamKey(streamId: string): Promise<{ key: string; tier: string | null } | null> {
  const { data } = await supabase
    .from("lms_streams")
    .select("stream_key, is_live, access_tier")
    .eq("id", streamId)
    .maybeSingle()
  const row = data as { stream_key?: string | null; is_live?: boolean | null; access_tier?: string | null } | null
  if (!row?.stream_key?.trim()) return null
  return { key: row.stream_key.trim(), tier: row.access_tier ?? null }
}

export async function POST(request: NextRequest) {
  const streamId = request.nextUrl.searchParams.get("streamId")
  if (!streamId) return NextResponse.json({ error: "no_stream" }, { status: 400 })

  const offer = await request.text()
  if (!offer || !offer.includes("v=0")) {
    return NextResponse.json({ error: "invalid_offer" }, { status: 400 })
  }

  const sala = await resolveStreamKey(streamId)
  if (!sala) return NextResponse.json({ error: "stream_not_found_or_offline" }, { status: 404 })
  // O WHEP é reprodução como o HLS: mesma regra (sala `free` pública; o resto por nível; equipa vê).
  if (!podeVerReproducaoDaSala(null, sala.tier)) {
    const quem = await criarLeitorDeEspectador(request)()
    if (!podeVerReproducaoDaSala(quem.perfil, sala.tier, { equipa: quem.equipa })) {
      return NextResponse.json({ error: "sem_acesso_a_sala" }, { status: 403 })
    }
  }
  const key = sala.key

  const q = `/rtc/v1/whep/?app=live&stream=${encodeURIComponent(key)}`
  const errors: string[] = []
  for (const base of whepBases()) {
    try {
      const srs = await fetch(`${base}${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer,
        cache: "no-store",
      })
      if (!srs.ok) {
        errors.push(`${base}: HTTP ${srs.status}`)
        continue
      }
      const answer = await srs.text()
      if (!answer.includes("v=0")) {
        errors.push(`${base}: resposta sem SDP`)
        continue
      }
      const resource = srs.headers.get("Location")
      return new NextResponse(answer, {
        status: 201,
        headers: {
          "Content-Type": "application/sdp",
          ...(resource ? { "X-Whep-Resource": resource } : {}),
        },
      })
    } catch (e) {
      errors.push(`${base}: ${e instanceof Error ? e.message : "fetch failed"}`)
    }
  }
  return NextResponse.json({ error: "srs_unreachable", detail: errors.join(" | ").slice(0, 400) }, { status: 502 })
}

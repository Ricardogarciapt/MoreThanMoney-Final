import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { generateMtmIngestStreamKey } from "@/lib/lms-stream-keys"

/**
 * Proxy de signaling WHIP para o Studio de streaming INTERNO (F2).
 *
 * Porquê um proxy: a página é servida em HTTPS (morethanmoney.pt) e o SRS expõe o WHIP em
 * HTTP na porta 8000 → um POST direto do browser seria bloqueado por mixed-content e revelaria
 * o IP/chave. O browser envia a oferta SDP para esta rota (same-origin HTTPS), nós resolvemos a
 * chave do educador no servidor e reencaminhamos para o SRS. O media (ICE/DTLS/UDP) vai direto
 * browser↔SRS — só o signaling passa aqui.
 *
 * GET  → devolve o alvo (streams do educador) para a UI escolher onde publicar.
 * POST (body = SDP offer, ?streamId=…) → publica: reencaminha a oferta ao SRS, marca is_live e
 *        devolve a resposta SDP. Header `Location` (recurso WHIP) devolvido em `X-Whip-Resource`.
 * DELETE (?streamId=…) → marca a stream offline (o media termina ao fechar a PeerConnection).
 */

const supabase = getSupabaseAdmin()

/**
 * Bases candidatas para o signaling WHIP no SRS. Se LMS_WHIP_BASE estiver definido, usa só essa.
 * Caso contrário tenta a HTTP-API padrão do SRS (1985) e depois a porta RTC (8000) — deployments
 * variam. O media (UDP) vai sempre direto ao rtc_server; só o POST de signaling passa por aqui.
 */
function srsHost(): string {
  return process.env.RTMP_SERVER_HOST?.replace(/^rtmps?:\/\//i, "").split("/")[0] || "stream.morethanmoney.pt"
}

function whipBases(): string[] {
  const explicit = process.env.LMS_WHIP_BASE?.trim() || process.env.LMS_SRS_HTTP_BASE?.trim()
  if (explicit) return [explicit.replace(/\/+$/, "")]
  const host = srsHost()
  // 1º: caminho TLS via nginx (443, já público) que faz proxy p/ a http-api do SRS (1985) em /rtc/.
  // Fallbacks diretos caso o nginx não tenha a location (deployments antigos).
  return [`https://${host}`, `http://${host}:1985`, `http://${host}:8000`]
}

/** Bases da API do SRS (nginx TLS /srs-api → 1985/api). */
function apiBases(): string[] {
  const explicit = process.env.LMS_SRS_API_BASE?.trim()
  if (explicit) return [explicit.replace(/\/+$/, "")]
  const host = srsHost()
  return [`https://${host}/srs-api`, `http://${host}:1985/api`]
}

/**
 * Expulsa qualquer publisher RTC preso NA MESMA stream antes de re-publicar. Evita o 502
 * "duplicate publisher" quando o educador re-transmite antes do SRS libertar a sessão anterior
 * (timeout ~30s). Best-effort: nunca bloqueia o publish se falhar.
 */
async function kickExistingPublisher(key: string): Promise<void> {
  for (const api of apiBases()) {
    try {
      const r = await fetch(`${api}/v1/clients/?count=200`, { cache: "no-store" })
      if (!r.ok) continue
      const j = (await r.json()) as { clients?: Array<{ id?: string; type?: string; publish?: boolean; url?: string }> }
      const victims = (j.clients || []).filter(
        (c) => c.publish && String(c.type || "").includes("rtc") && String(c.url || "").includes(key),
      )
      for (const v of victims) {
        if (v.id) await fetch(`${api}/v1/clients/${v.id}`, { method: "DELETE", cache: "no-store" }).catch(() => {})
      }
      if (victims.length) await new Promise((res) => setTimeout(res, 350))
      return
    } catch {
      /* tenta a próxima base */
    }
  }
}

async function requireEducator() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  return token ? verifyEducatorToken(token) : null
}

/** Chave fixa do educador (mtm_…), criada on-demand se ainda não existir. */
async function resolveEducatorKey(educatorId: string): Promise<string> {
  const { data } = await supabase
    .from("lms_educators")
    .select("stream_key_fixed")
    .eq("id", educatorId)
    .maybeSingle()
  let key = (data as { stream_key_fixed?: string | null } | null)?.stream_key_fixed || null
  if (!key) {
    key = generateMtmIngestStreamKey(educatorId)
    await supabase.from("lms_educators").update({ stream_key_fixed: key }).eq("id", educatorId)
  }
  return key
}

/** Resolve a chave da stream escolhida (verifica posse) ou cai na chave fixa do educador. */
async function resolveTargetKey(educatorId: string, streamId: string | null): Promise<string | null> {
  if (streamId) {
    const { data } = await supabase
      .from("lms_streams")
      .select("stream_key, educator_id")
      .eq("id", streamId)
      .maybeSingle()
    const row = data as { stream_key?: string | null; educator_id?: string | null } | null
    if (!row || row.educator_id !== educatorId) return null
    if (row.stream_key?.trim()) return row.stream_key.trim()
  }
  return resolveEducatorKey(educatorId)
}

export async function GET() {
  const edu = await requireEducator()
  if (!edu) return NextResponse.json({ authenticated: false }, { status: 401 })
  const { data } = await supabase
    .from("lms_streams")
    .select("id, title, is_live, scheduled_start_at, category")
    .eq("educator_id", edu.educatorId)
    .order("scheduled_start_at", { ascending: true, nullsFirst: false })
  return NextResponse.json({
    authenticated: true,
    educatorId: edu.educatorId,
    displayName: edu.displayName,
    streams: data ?? [],
  })
}

export async function POST(request: NextRequest) {
  const edu = await requireEducator()
  if (!edu) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })

  const streamId = request.nextUrl.searchParams.get("streamId")
  const offer = await request.text()
  if (!offer || !offer.includes("v=0")) {
    return NextResponse.json({ error: "invalid_offer" }, { status: 400 })
  }

  const key = await resolveTargetKey(edu.educatorId, streamId)
  if (!key) return NextResponse.json({ error: "stream_not_found" }, { status: 404 })

  // liberta qualquer publisher preso na mesma stream (evita 502 "duplicate publisher")
  await kickExistingPublisher(key)

  const q = `/rtc/v1/whip/?app=live&stream=${encodeURIComponent(key)}`
  let answer: string | null = null
  let resource: string | null = null
  const errors: string[] = []
  for (const base of whipBases()) {
    try {
      const srs = await fetch(`${base}${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer,
        cache: "no-store",
      })
      if (!srs.ok) {
        const detail = await srs.text().catch(() => "")
        errors.push(`${base}: HTTP ${srs.status} ${detail.slice(0, 200)}`)
        continue
      }
      const body = await srs.text()
      if (!body.includes("v=0")) {
        errors.push(`${base}: resposta sem SDP`)
        continue
      }
      answer = body
      resource = srs.headers.get("Location")
      break
    } catch (e) {
      errors.push(`${base}: ${e instanceof Error ? e.message : "fetch failed"}`)
    }
  }
  if (!answer) {
    return NextResponse.json(
      { error: "srs_unreachable", detail: errors.join(" | ").slice(0, 500) },
      { status: 502 },
    )
  }

  // Marca a stream como ao vivo (não bloqueia a resposta se falhar).
  if (streamId) {
    await supabase
      .from("lms_streams")
      .update({ is_live: true, live_started_at: new Date().toISOString(), live_ended_at: null })
      .eq("id", streamId)
      .eq("educator_id", edu.educatorId)
  }

  return new NextResponse(answer, {
    status: 201,
    headers: {
      "Content-Type": "application/sdp",
      ...(resource ? { "X-Whip-Resource": resource } : {}),
    },
  })
}

export async function DELETE(request: NextRequest) {
  const edu = await requireEducator()
  if (!edu) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  const streamId = request.nextUrl.searchParams.get("streamId")
  // liberta a sessão RTC no SRS de imediato (para poder re-publicar sem esperar o timeout)
  const key = await resolveTargetKey(edu.educatorId, streamId)
  if (key) await kickExistingPublisher(key)
  if (streamId) {
    await supabase
      .from("lms_streams")
      .update({ is_live: false, live_ended_at: new Date().toISOString() })
      .eq("id", streamId)
      .eq("educator_id", edu.educatorId)
  }
  return NextResponse.json({ ok: true })
}

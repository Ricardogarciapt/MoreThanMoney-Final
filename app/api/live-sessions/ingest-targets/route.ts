import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

export const dynamic = "force-dynamic"

/**
 * MULTISTREAM do LMS via SRS (servidor de streaming em ossrs/srs:5, container mtm-srs).
 *
 * O educador transmite 1× para rtmp://stream.morethanmoney.pt/live/<stream_key_fixed>. O SRS
 * serve o HLS próprio ao site E, com `forward { backend <este endpoint>; }`, consulta-o em cada
 * publish para saber para onde REENCAMINHAR (YouTube, TikTok) — forward NATIVO do SRS, sem ffmpeg.
 * Cada educador multistreama com a sua própria key (Restream removido).
 *
 * Auth: `?secret=` == env RTMP_RELAY_SECRET (o SRS chama com esse query param).
 * Contrato SRS: POST {action,stream,app,vhost,...} → resposta {"code":0,"data":{"urls":[...]}}.
 */
async function targetsFor(name: string): Promise<string[]> {
  const key = (name || "").trim()
  if (!key) return []
  const supabase = getSupabaseAdmin()
  const { data: edu } = await supabase
    .from("lms_educators")
    .select("youtube_stream_key, youtube_enabled, tiktok_stream_key, tiktok_server, tiktok_enabled")
    .eq("stream_key_fixed", key)
    .maybeSingle()
  if (!edu) return []
  const urls: string[] = []
  if (edu.youtube_enabled && edu.youtube_stream_key) {
    urls.push(`rtmp://a.rtmp.youtube.com/live2/${edu.youtube_stream_key}`)
  }
  if (edu.tiktok_enabled && edu.tiktok_stream_key && edu.tiktok_server) {
    const s = edu.tiktok_server.endsWith("/") ? edu.tiktok_server : `${edu.tiktok_server}/`
    urls.push(`${s}${edu.tiktok_stream_key}`)
  }
  return urls
}

function authed(req: NextRequest): boolean {
  const secret = process.env.RTMP_RELAY_SECRET
  const given = new URL(req.url).searchParams.get("secret") || req.headers.get("x-relay-secret")
  return !!secret && given === secret
}

/** SRS forward backend — chamado pelo SRS em cada publish. Devolve os destinos de forward. */
export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ code: 403 }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as { stream?: string }
  const urls = await targetsFor(String(body?.stream || ""))
  // code:0 = SRS reencaminha para urls; urls vazio = só HLS (sem forward). Nunca bloqueia o publish.
  return NextResponse.json({ code: 0, data: { urls } })
}

/** Debug (GET ?name=<stream_key_fixed>) — vê os destinos legíveis. */
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const name = (new URL(req.url).searchParams.get("name") || "").trim()
  return NextResponse.json({ name, urls: await targetsFor(name) })
}

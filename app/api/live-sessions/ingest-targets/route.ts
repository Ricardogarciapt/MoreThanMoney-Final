import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

export const dynamic = "force-dynamic"

/**
 * Contrato de MULTISTREAM para o servidor RTMP (nginx-rtmp) do MTM.
 *
 * O educador transmite 1× para rtmp://stream.morethanmoney.pt/live/<stream_key_fixed>. O nginx
 * serve o HLS próprio ao site (playback dos alunos) E, no on_publish/exec_push, consulta este
 * endpoint com `?name=<stream_key_fixed>` para saber para onde REPLICAR (YouTube, TikTok). Depois
 * o relay (ffmpeg -c copy) faz o push para cada destino. Assim cada educador multistreama com a
 * sua própria key, sem Restream.
 *
 * Auth: header `x-relay-secret` == RTMP_RELAY_SECRET (o VPS é o único que chama).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.RTMP_RELAY_SECRET
  const given = request.headers.get("x-relay-secret") || new URL(request.url).searchParams.get("secret")
  if (!secret || given !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const name = (new URL(request.url).searchParams.get("name") || "").trim()
  if (!name) return NextResponse.json({ error: "name em falta", targets: [] }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: edu } = await supabase
    .from("lms_educators")
    .select("id, display_name, youtube_stream_key, youtube_enabled, tiktok_stream_key, tiktok_server, tiktok_enabled")
    .eq("stream_key_fixed", name)
    .maybeSingle()

  const targets: { name: string; url: string }[] = []
  if (edu) {
    if (edu.youtube_enabled && edu.youtube_stream_key) {
      targets.push({ name: "youtube", url: `rtmp://a.rtmp.youtube.com/live2/${edu.youtube_stream_key}` })
    }
    if (edu.tiktok_enabled && edu.tiktok_stream_key && edu.tiktok_server) {
      const server = edu.tiktok_server.endsWith("/") ? edu.tiktok_server : `${edu.tiktok_server}/`
      targets.push({ name: "tiktok", url: `${server}${edu.tiktok_stream_key}` })
    }
  }
  // O HLS próprio (site) é servido localmente pelo nginx (hls on) — não é um push aqui.
  return NextResponse.json({ name, educator: edu?.display_name ?? null, targets })
}

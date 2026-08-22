/**
 * Cron de publicação nativa no Instagram.
 *
 * Faz poll da fila `social_scheduled_posts` e publica apenas os posts que o
 * Ricardo aprovou (status='approved') cuja hora já chegou. NADA é publicado
 * sem aprovação — o gate é humano; este cron só executa o que já foi validado.
 *
 * Recomenda-se cadência de 5 em 5 minutos (ver vercel.json).
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"
import {
  publishScheduledPost,
  MediaNotReadyError,
  usernameForAccount,
  isAutoPublishBlocked,
  type ScheduledPost,
} from "@/lib/instagram/publish"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_PER_RUN = 4
const MAX_ATTEMPTS = 3

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const nowIso = new Date().toISOString()

  // Elegíveis: aprovados cuja hora chegou, ou já em processamento (ex.: Reels em encoding).
  const { data: due, error } = await supabase
    .from("social_scheduled_posts")
    .select("*")
    .in("status", ["approved", "processing"])
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) {
    console.error("[ig-publish] erro a ler fila:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, published: 0, message: "nada a publicar" })
  }

  const results: Array<Record<string, unknown>> = []

  for (const row of due) {
    // O Instagram pessoal do Ricardo não é destino de automação: se alguma coisa pôs uma linha
    // na fila para lá, morre aqui em vez de sair no perfil dele.
    if (isAutoPublishBlocked(row.ig_account_id)) {
      await supabase
        .from("social_scheduled_posts")
        .update({
          status: "cancelled",
          error: "Conta pessoal (@ricardogarciapt) não recebe publicações automáticas.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      results.push({ id: row.id, status: "cancelled", reason: "conta pessoal" })
      continue
    }

    const attempts = (row.attempts ?? 0) + 1

    // Marca como em publicação (lock otimista).
    await supabase
      .from("social_scheduled_posts")
      .update({ status: "publishing", attempts, updated_at: new Date().toISOString() })
      .eq("id", row.id)

    const post: ScheduledPost = {
      id: row.id,
      ig_account_id: row.ig_account_id,
      ig_username: row.ig_username,
      media_type: row.media_type,
      media_urls: row.media_urls || [],
      caption: row.caption,
      creation_id: row.creation_id,
      child_creation_ids: row.child_creation_ids,
    }

    try {
      const res = await publishScheduledPost(post)
      await supabase
        .from("social_scheduled_posts")
        .update({
          status: "published",
          published_media_id: res.mediaId,
          permalink: res.permalink,
          creation_id: res.creationId,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      results.push({
        id: row.id,
        account: usernameForAccount(row.ig_account_id),
        status: "published",
        permalink: res.permalink,
      })
    } catch (e: any) {
      if (e instanceof MediaNotReadyError) {
        // Container ainda a processar — guarda e retoma na próxima ronda.
        await supabase
          .from("social_scheduled_posts")
          .update({
            status: "processing",
            creation_id: e.creationId,
            child_creation_ids: e.childIds ?? row.child_creation_ids,
            error: "media em processamento",
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
        results.push({ id: row.id, status: "processing" })
        continue
      }
      const failed = attempts >= MAX_ATTEMPTS
      await supabase
        .from("social_scheduled_posts")
        .update({
          status: failed ? "failed" : "approved", // reagenda p/ nova tentativa se ainda houver margem
          error: String(e?.message || e).slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      console.error(`[ig-publish] post ${row.id} erro (tentativa ${attempts}):`, e?.message)
      results.push({ id: row.id, status: failed ? "failed" : "retry", error: String(e?.message) })
    }
  }

  const published = results.filter((r) => r.status === "published").length
  return NextResponse.json({ ok: true, published, processed: results.length, results })
}

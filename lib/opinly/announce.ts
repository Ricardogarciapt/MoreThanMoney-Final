/**
 * "O blog É o chat da app, os chats de comunidade e o feed" (Ricardo 2026-08-29):
 * cada artigo Opinly publicado entra automaticamente
 *  1) no chat da comunidade da app (chat_messages · canal 'geral'), e
 *  2) no feed social da app (tabela posts, com link_preview).
 *
 * Chamado pelo webhook content.routes-changed. Dedup por slug em
 * site_settings.opinly_blog_announced — edições de um artigo já anunciado
 * revalidam o cache mas não repetem o anúncio.
 */

import { imageUrl } from "@opinly/shared"
import { opinlyConfig } from "@opinly/next"
import type { ContentRouteChange } from "@opinly/backend"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getOpinly, opinlyConfigured } from "./client"

const STATE_KEY = "opinly_blog_announced"
const CHAT_CHANNEL = "geral" // Comunidade → Geral (chat da app mobile)
const ADMIN_EMAIL = "morethanmoneypt@gmail.com"
const SITE = "https://www.morethanmoney.pt"

export async function announceOpinlyPosts(changes: ContentRouteChange[]): Promise<{ announced: string[] }> {
  const announced: string[] = []
  if (!opinlyConfigured()) return { announced }
  const postSlugs = [...new Set(changes.filter((c) => c.type === "post" && c.slug).map((c) => c.slug))]
  if (postSlugs.length === 0) return { announced }

  const supabase = getSupabaseAdmin()

  // Estado de dedup (slug → ISO do anúncio)
  const { data: stateRow } = await supabase.from("site_settings").select("value").eq("key", STATE_KEY).maybeSingle()
  const state: Record<string, string> =
    stateRow?.value && typeof stateRow.value === "object" ? { ...(stateRow.value as Record<string, string>) } : {}

  // Autor oficial no feed: perfil admin MTM
  const { data: admin } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle()

  const opinly = getOpinly()
  for (const slug of postSlugs) {
    if (state[slug]) continue
    const post = await opinly.post(slug)
    if (!post) continue // removido/despublicado — nada a anunciar

    const url = `${SITE}/blog/${post.slug}`
    const cover = post.titleFile?.fileKey ? imageUrl(post.titleFile.fileKey, opinlyConfig) : null
    const preview = {
      url,
      title: post.title,
      description: post.description ?? null,
      image: cover,
      siteName: "MoreThanMoney",
    }

    // 1) Chat da comunidade
    const chatText = `📰 Novo artigo no blog MTM\n\n${post.title}\n${post.description ?? ""}\n\n${url}`.trim()
    const { error: chatErr } = await supabase.from("chat_messages").insert({
      channel_slug: CHAT_CHANNEL,
      user_id: admin?.id ?? null,
      message_type: "text",
      content: chatText,
      image_url: cover,
      link_url: url,
      link_preview: preview,
    })
    if (chatErr) console.error(`[opinly-announce] chat falhou (${slug}):`, chatErr.message)

    // 2) Feed social da app
    if (admin?.id) {
      const { error: feedErr } = await supabase.from("posts").insert({
        user_id: admin.id,
        user_name: admin.full_name || "MoreThanMoney",
        category: "blog",
        content: `📰 ${post.title}\n\n${post.description ?? ""}\n\n👉 ${url}`.trim(),
        media_url: cover,
        link_preview: preview,
      })
      if (feedErr) console.error(`[opinly-announce] feed falhou (${slug}):`, feedErr.message)
    } else {
      console.warn("[opinly-announce] perfil admin não encontrado — feed ignorado")
    }

    state[slug] = new Date().toISOString()
    announced.push(slug)
  }

  if (announced.length > 0) {
    await supabase.from("site_settings").upsert(
      {
        key: STATE_KEY,
        value: state,
        description: "Artigos do blog Opinly já anunciados no chat/feed da app (slug → data)",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    )
  }

  return { announced }
}

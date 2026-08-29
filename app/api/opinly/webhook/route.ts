/**
 * Webhook Opinly — content.routes-changed (publicação/edição/remoção no editor).
 *
 * Faz as DUAS revalidações, porque nenhuma sozinha chega em self-hosted:
 *  1) revalidateTag('opinly', { expire: 0 }) — despeja o DATA CACHE (todos os
 *     fetches do cliente levam a tag 'opinly'). No Next 16+ o 2.º argumento é
 *     obrigatório e { expire: 0 } é o drop imediato — um perfil nomeado tipo
 *     'max' continuaria a servir posts velhos até um ano. No Next 15 o argumento
 *     extra é ignorado em runtime (daí o cast).
 *  2) revalidatePath(...) para as rotas alteradas — sozinho não faz nada em
 *     rotas dinâmicas self-hosted, mas limpa o full-route cache onde exista.
 *
 * Segurança: se OPINLY_WEBHOOK_SECRET (whsec_…) estiver definido, verifica a
 * assinatura Svix (HMAC-SHA256 de "id.timestamp.payload"). Sem secret, aceita
 * e regista aviso — revalidar é idempotente e não expõe dados.
 */

import { NextRequest, NextResponse } from "next/server"
import { revalidatePath, revalidateTag } from "next/cache"
import { createHmac, timingSafeEqual } from "crypto"
import type { OpinlyWebhookEvent, ContentRouteChange } from "@opinly/backend"
import { OPINLY_CACHE_TAG } from "@/lib/opinly/client"
import { announceOpinlyPosts } from "@/lib/opinly/announce"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BLOG = "/blog"

function verifySvixSignature(req: NextRequest, payload: string, secret: string): boolean {
  const id = req.headers.get("svix-id")
  const timestamp = req.headers.get("svix-timestamp")
  const signatures = req.headers.get("svix-signature")
  if (!id || !timestamp || !signatures) return false
  // tolerância de 5 min contra replay
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64")
  return signatures.split(" ").some((part) => {
    const sig = part.split(",")[1] ?? ""
    try {
      const a = Buffer.from(sig, "base64")
      const b = Buffer.from(expected, "base64")
      return a.length === b.length && timingSafeEqual(a, b)
    } catch {
      return false
    }
  })
}

/** Paths a revalidar para uma entidade alterada — espelha o mapa de rotas do blog. */
function pathsFor(change: ContentRouteChange): string[] {
  switch (change.type) {
    case "home":
      return [BLOG]
    case "post":
      return [`${BLOG}/${change.slug}`, BLOG]
    case "category":
      return [`${BLOG}/category/${change.slug}`]
    case "author":
      return [`${BLOG}/authors/${change.slug}`, `${BLOG}/authors`]
    case "tag":
      return [`${BLOG}/tag/${change.slug}`]
    default:
      return []
  }
}

export async function POST(request: NextRequest) {
  const payload = await request.text()

  const secret = process.env.OPINLY_WEBHOOK_SECRET?.trim()
  if (secret) {
    if (!verifySvixSignature(request, payload, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 })
    }
  } else {
    console.warn("[opinly-webhook] OPINLY_WEBHOOK_SECRET não definido — a aceitar sem verificação")
  }

  let event: OpinlyWebhookEvent
  try {
    event = JSON.parse(payload) as OpinlyWebhookEvent
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  // O evento legacy content.paths-invalidated é dual-emitido para a mesma
  // alteração — ignorá-lo evita revalidar duas vezes.
  if (event.type !== "content.routes-changed") {
    return NextResponse.json({ ok: true, ignored: event.type })
  }

  // 1) Data cache — ver docblock: Next 16 exige o perfil; Next 15 ignora-o.
  ;(revalidateTag as unknown as (tag: string, profile?: unknown) => void)(OPINLY_CACHE_TAG, { expire: 0 })

  // 2) Full-route cache das rotas alteradas + sitemap
  const paths = new Set<string>(["/sitemap.xml"])
  for (const change of event.data.changed ?? []) {
    for (const p of pathsFor(change)) paths.add(p)
  }
  for (const p of paths) revalidatePath(p)

  // 3) O blog É o chat/feed da app: anuncia artigos novos no canal da comunidade
  //    e no feed social (dedup por slug — edições não repetem o anúncio).
  let announced: string[] = []
  try {
    announced = (await announceOpinlyPosts(event.data.changed ?? [])).announced
  } catch (err) {
    console.error("[opinly-webhook] anúncio chat/feed falhou:", err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ ok: true, revalidated: [...paths], tag: OPINLY_CACHE_TAG, announced })
}

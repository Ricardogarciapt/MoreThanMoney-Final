/**
 * Cliente Opinly partilhado (conteúdo do blog + eventos server-side).
 *
 * A chave vem SEMPRE de process.env.OPINLY_API_KEY (sk-…, definida na Vercel) —
 * nunca hardcoded. Todos os fetches de conteúdo levam a tag 'opinly': é ela que
 * o webhook content.routes-changed revalida; sem a tag, revalidatePath sozinho
 * não limpa o data cache em rotas dinâmicas self-hosted.
 */

import { createOpinlyClient, type OpinlyClient } from '@opinly/backend'

export const OPINLY_CACHE_TAG = 'opinly'

let cached: OpinlyClient | null = null

export function getOpinly(): OpinlyClient {
  if (!cached) {
    cached = createOpinlyClient({
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, next: { tags: [OPINLY_CACHE_TAG] } } as RequestInit),
    })
  }
  return cached
}

export function opinlyConfigured(): boolean {
  return Boolean(process.env.OPINLY_API_KEY?.trim())
}

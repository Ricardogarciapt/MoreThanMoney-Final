import { NextRequest } from 'next/server'
import { DEPS_REAIS, correrContentRepost } from '@/lib/instagram/content-repost'

/**
 * Rota fina: a lógica vive em `lib/instagram/content-repost.ts` para a guarda a poder correr com dependências falsas
 * (base, Instagram, IA) sem Next nem rede. Ver o cabeçalho de lá.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return correrContentRepost(req, DEPS_REAIS)
}

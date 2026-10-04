import { NextRequest } from 'next/server'
import { DEPS_REAIS, correrContentDraft } from '@/lib/instagram/content-draft'

/**
 * Rota fina: a lógica vive em `lib/instagram/content-draft.ts` para a guarda a poder correr com dependências falsas
 * (base, Instagram, IA) sem Next nem rede. Ver o cabeçalho de lá.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return correrContentDraft(req, DEPS_REAIS)
}

import { NextRequest } from "next/server"
import { DEPS_REAIS, correrCuracao } from "@/lib/instagram/curation"

/**
 * Rota fina: a lógica vive em `lib/instagram/curation.ts` para a guarda a poder correr com dependências falsas
 * (base, Instagram, IA) sem Next nem rede. Ver o cabeçalho de lá.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  return correrCuracao(request, DEPS_REAIS)
}

import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { aplicarSincronizacao, preverSincronizacao } from '@/lib/copia-contas/servidor/sincronizacao'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * «SINCRONIZAR TUDO».
 *   GET                                        → pré-visualização (dry-run): correcções propostas + avisos
 *   POST { ids: [], segundaConfirmacao? }      → aplica SÓ as seleccionadas; o diff é recalculado antes.
 *                                                Apagar na MetaApi / tirar subscrições sem dono exige «APAGAR».
 */
export const GET = soAdmin(async () => NextResponse.json(await preverSincronizacao()))

export const POST = soAdmin(async (_a: string, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as { ids?: unknown; segundaConfirmacao?: unknown }
  const ids = Array.isArray(corpo.ids) ? corpo.ids.map(String).slice(0, 100) : []
  if (!ids.length) return NextResponse.json({ error: 'Selecciona pelo menos uma correcção.' }, { status: 400 })
  return NextResponse.json(await aplicarSincronizacao(ids, corpo.segundaConfirmacao as string | undefined))
})

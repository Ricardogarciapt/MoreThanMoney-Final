import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { executarAcao } from '@/lib/admin-centro/servidor/acoes'
import { db } from '@/lib/admin-centro/servidor/base'
import { CHAVE_FLAG_PADRAO, lerFlagPadrao } from '@/lib/admin-centro/regras'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 *   GET                                 → estado da flag admin_centro_padrao
 *   POST { acao, confirmacao, ... }     → pausar_monitores | retomar_monitores | desligar_motor_copia |
 *                                         conta { ref, operacao } | trocar_fonte { providerId, fonte } |
 *                                         flag_padrao { ligado }   — confirmadas e auditadas
 */
export const GET = soAdmin(async (_a: string, _req: NextRequest) => {
  const { data } = await db().from('site_settings').select('value').eq('key', CHAVE_FLAG_PADRAO).maybeSingle()
  return NextResponse.json({ padrao: lerFlagPadrao(data?.value, process.env.ADMIN_CENTRO_PADRAO), porEnv: String(process.env.ADMIN_CENTRO_PADRAO ?? '') === '1' })
})

export const POST = soAdmin(async (adminId: string, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const r = await executarAcao(adminId, corpo)
  return NextResponse.json({ ok: r.ok, message: r.mensagem, detalhe: r.detalhe ?? null, ...(r.ok ? {} : { error: r.mensagem }) }, { status: r.status })
})

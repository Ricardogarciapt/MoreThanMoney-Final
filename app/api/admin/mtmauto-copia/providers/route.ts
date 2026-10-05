import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { listarProvidersPorEquipa } from '@/lib/copia-contas/servidor/providers-equipas'
import { escreverEstrategia } from '@/lib/admin-centro/servidor/estrategia-escrita'
import { quemAdminDoSite } from '@/lib/admin-centro/servidor/quem-decide'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET → providers (contas de estratégia) agrupados por equipa MTM Auto. Só leitura; sem tokens. */
export const GET = soAdmin(async () => NextResponse.json(await listarProvidersPorEquipa()))

/**
 * POST — FACHADA (05/10) da camada única (`lib/admin-centro/servidor/estrategia-escrita.ts`):
 *   { acao: 'registar', providerId }         → mestre SIM + mestres_estrategias (sombra) + rotas + canal
 *   { acao: 'criar', slug, nome, tipo, … }   → cria o provider externo e regista-o na cadeia
 * Nada disto liga live: tudo nasce em sombra.
 */
export const POST = soAdmin(async (adminId: string, req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (b.acao === 'registar') {
    const id = String(b.providerId ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'providerId inválido' }, { status: 400 })
    const r = await escreverEstrategia(quemAdminDoSite(adminId), { accao: 'registar', providerId: id })
    return NextResponse.json(r.dados ?? { ok: r.ok, error: r.mensagem }, { status: r.ok ? 200 : r.status })
  }
  if (b.acao === 'criar') {
    const { acao: _a, providerId: _p, id: _i, ...resto } = b
    void _a; void _p; void _i
    const r = await escreverEstrategia(quemAdminDoSite(adminId), { ...resto, accao: 'criar' })
    return r.ok ? NextResponse.json(r.dados ?? { ok: true }) : NextResponse.json({ error: r.mensagem }, { status: r.status })
  }
  return NextResponse.json({ error: 'acao inválida (registar | criar)' }, { status: 400 })
})

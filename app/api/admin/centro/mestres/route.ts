import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { carregarPainelMestres } from '@/lib/mestres/servidor/painel-leitura'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** GET → estado do motor das mestres (116) para o cockpit. Só leitura; as mudanças vão por POST /api/admin/mtmauto-copia/mestres (Centro › Estratégias ou MTM Auto · Cópia › Estratégias). */
export const GET = soAdmin(async (_a: string, _req: NextRequest) => NextResponse.json(await carregarPainelMestres()))

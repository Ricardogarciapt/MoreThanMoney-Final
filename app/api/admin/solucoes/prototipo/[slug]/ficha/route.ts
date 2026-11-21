import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAccess } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { fichaKit, type PrototipoSpec } from '@/lib/site-solucoes/prototipo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET (só admins): a ficha do protótipo no formato dos kits do Monorepo, para montar a demo real:
 *   kits/pagina-app/novo-cliente.sh <slug> ficha.json logo.png
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  const { slug } = await params
  const { data } = await getSupabaseAdmin().from('prototipos_solucao').select('spec, email, telefone').eq('slug', slug).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Protótipo não encontrado' }, { status: 404 })
  const ficha = fichaKit(data.spec as PrototipoSpec, { email: String(data.email), telefone: String(data.telefone ?? '') })
  return new NextResponse(JSON.stringify(ficha, null, 2) + '\n', {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${slug}.json"` },
  })
}

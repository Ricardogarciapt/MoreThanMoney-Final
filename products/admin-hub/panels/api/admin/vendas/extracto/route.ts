/**
 * O extracto único de uma pessoa, visto pelo admin.
 *
 * A pessoa vê o DELA em `/api/vendas/meu` — a mesma função, a mesma conta. Duas implementações do
 * mesmo extracto divergiam no dia em que alguém corrigisse uma delas, e o dono ficava a discutir
 * com um membro da equipa qual dos dois números estava certo.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { extractoDaPessoa } from '@/lib/vendas/extracto'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const pessoa = searchParams.get('pessoa')
  if (!pessoa) return NextResponse.json({ error: 'Falta a pessoa (id do perfil)' }, { status: 400 })

  try {
    const extracto = await extractoDaPessoa(supabase, pessoa, { desde: searchParams.get('desde') })
    const { data: perfil } = await supabase
      .from('profiles')
      .select('username, full_name, email')
      .eq('id', pessoa)
      .maybeSingle()
    const { data: plano } = await supabase
      .from('vendas_pessoa_plano')
      .select('plano, desde, nota')
      .eq('pessoa_id', pessoa)
      .maybeSingle()

    return NextResponse.json({ ...extracto, perfil, plano })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao ler o extracto' }, { status: 500 })
  }
}

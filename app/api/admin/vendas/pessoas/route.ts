/**
 * Procurar pessoas para atribuir a um negócio.
 *
 * Isto NÃO decide papéis nem permissões — quem é setter ou closer vive no backoffice de
 * permissões, que é outro lado da casa. Aqui só se procura um perfil por nome ou email para o
 * poder pôr num negócio; o papel é a COLUNA em que a pessoa é colocada, e isso é um facto
 * histórico da venda, não um direito.
 *
 * Devolve o plano de comissão de cada um quando existe: quem atribui uma venda a alguém deve ver,
 * no momento em que o faz, se aquela pessoa está no plano geral ou num plano próprio (o legado dos
 * 50 %, por exemplo). Descobri-lo só ao pagar é descobri-lo tarde.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const procura = (new URL(request.url).searchParams.get('q') ?? '').trim()

  let query = supabase.from('profiles').select('id, username, full_name, email, user_type').limit(50)
  if (procura) {
    const escapado = procura.replace(/[%,()]/g, '')
    query = query.or(`full_name.ilike.%${escapado}%,username.ilike.%${escapado}%,email.ilike.%${escapado}%`)
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (data ?? []).map((p) => String(p.id))
  const { data: planos } = ids.length
    ? await supabase.from('vendas_pessoa_plano').select('pessoa_id, plano').in('pessoa_id', ids)
    : { data: [] as Array<{ pessoa_id: string; plano: string }> }
  const planoPorPessoa = new Map((planos ?? []).map((p) => [String(p.pessoa_id), String(p.plano)]))

  return NextResponse.json({
    pessoas: (data ?? []).map((p) => ({
      id: p.id,
      nome: p.full_name || p.username || p.email,
      email: p.email,
      plano: planoPorPessoa.get(String(p.id)) ?? null,
    })),
  })
}

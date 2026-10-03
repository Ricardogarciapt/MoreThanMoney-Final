import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSupabaseAdmin, isValidUUID } from '@/lib/admin-api-helpers'

export const dynamic = 'force-dynamic'

/** GET /api/admin/forms/submissions?slug=… — lista submissões (todas ou por formulário). */
export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const slug = request.nextUrl.searchParams.get('slug')
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('form_submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300)
  if (slug) query = query.eq('form_slug', slug)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ submissions: data || [] })
}

/** PUT /api/admin/forms/submissions — atualizar estado (new | read | contacted | rejected). */
export async function PUT(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '')
  const status = String(body.status || '')
  if (!isValidUUID(id) || !['new', 'read', 'contacted', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('form_submissions').update({ status }).eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

/** DELETE /api/admin/forms/submissions?id=… — apaga uma submissão. */
export async function DELETE(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const id = request.nextUrl.searchParams.get('id') || ''
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('form_submissions').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

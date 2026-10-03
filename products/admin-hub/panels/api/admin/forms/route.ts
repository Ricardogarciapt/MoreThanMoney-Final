import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSupabaseAdmin, isValidUUID } from '@/lib/admin-api-helpers'
import { sanitizeFields, SLUG_RE } from '@/lib/custom-forms'

export const dynamic = 'force-dynamic'

/** GET /api/admin/forms — todos os formulários + contagem de submissões. */
export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const supabase = getSupabaseAdmin()
  const { data: forms, error } = await supabase
    .from('custom_forms')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: subs } = await supabase.from('form_submissions').select('form_slug, status')
  const counts: Record<string, { total: number; new: number }> = {}
  for (const s of subs || []) {
    const c = (counts[s.form_slug] ||= { total: 0, new: 0 })
    c.total += 1
    if (s.status === 'new') c.new += 1
  }

  return NextResponse.json({
    forms: (forms || []).map((f) => ({
      ...f,
      submissions: counts[f.slug] || { total: 0, new: 0 },
    })),
  })
}

/** POST /api/admin/forms — criar formulário novo. */
export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const slug = String(body.slug || '').trim().toLowerCase()
  const title = String(body.title || '').trim().slice(0, 160)
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Slug inválido (a-z, 0-9 e hífens; 3-60 caracteres).' }, { status: 400 })
  }
  if (!title) {
    return NextResponse.json({ error: 'Título obrigatório.' }, { status: 400 })
  }
  const fields = sanitizeFields(body.fields)
  if (!fields) {
    return NextResponse.json({ error: 'Estrutura de campos inválida.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('custom_forms')
    .insert({
      slug,
      title,
      subtitle: String(body.subtitle || '').trim().slice(0, 300) || null,
      description: String(body.description || '').trim().slice(0, 2000) || null,
      badge: String(body.badge || '').trim().slice(0, 40) || null,
      active: body.active !== false,
      fields,
    })
    .select()
    .single()
  if (error) {
    const msg = error.code === '23505' ? 'Já existe um formulário com esse slug.' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ success: true, form: data })
}

/** PUT /api/admin/forms — atualizar um formulário existente (por id). */
export async function PUT(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) {
    const title = String(body.title || '').trim().slice(0, 160)
    if (!title) return NextResponse.json({ error: 'Título obrigatório.' }, { status: 400 })
    update.title = title
  }
  if (body.subtitle !== undefined) update.subtitle = String(body.subtitle || '').trim().slice(0, 300) || null
  if (body.description !== undefined) update.description = String(body.description || '').trim().slice(0, 2000) || null
  if (body.badge !== undefined) update.badge = String(body.badge || '').trim().slice(0, 40) || null
  if (body.active !== undefined) update.active = body.active === true
  if (body.fields !== undefined) {
    const fields = sanitizeFields(body.fields)
    if (!fields) return NextResponse.json({ error: 'Estrutura de campos inválida.' }, { status: 400 })
    update.fields = fields
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('custom_forms')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, form: data })
}

/** DELETE /api/admin/forms?id=… — apaga o formulário e as suas submissões. */
export async function DELETE(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const id = request.nextUrl.searchParams.get('id') || ''
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: form } = await supabase.from('custom_forms').select('slug').eq('id', id).maybeSingle()
  if (!form) {
    return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 })
  }

  await supabase.from('form_submissions').delete().eq('form_slug', form.slug)
  const { error } = await supabase.from('custom_forms').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

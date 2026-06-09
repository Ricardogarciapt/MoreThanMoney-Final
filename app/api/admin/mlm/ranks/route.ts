import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSupabaseAdmin } from '@/lib/admin-api-helpers'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { data, error } = await supabase
    .from('mlm_ranks')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ranks: data })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json()
  const {
    name, slug, left_requirement, right_requirement, direct_requirement,
    rank_bonus, monthly_residual, free_pack_months, color, icon, sort_order
  } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'name e slug são obrigatórios' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('mlm_ranks')
    .insert({
      name, slug,
      left_requirement: left_requirement ?? 0,
      right_requirement: right_requirement ?? 0,
      direct_requirement: direct_requirement ?? 0,
      rank_bonus: rank_bonus ?? 0,
      monthly_residual: monthly_residual ?? 0,
      free_pack_months: free_pack_months ?? 0,
      color: color ?? '#D2A63C',
      icon: icon ?? '⭐',
      sort_order: sort_order ?? 0,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rank: data }, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('mlm_ranks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rank: data })
}

export async function DELETE(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
  }

  const { error } = await supabase
    .from('mlm_ranks')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

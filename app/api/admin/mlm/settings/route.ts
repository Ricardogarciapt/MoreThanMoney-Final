import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSupabaseAdmin } from '@/lib/admin-api-helpers'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { data, error } = await supabase
    .from('mlm_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ settings: data })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json()
  const { is_active, direct_commission_pct } = body

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof is_active === 'boolean') updates.is_active = is_active
  if (typeof direct_commission_pct === 'number') updates.direct_commission_pct = direct_commission_pct

  const { data, error } = await supabase
    .from('mlm_settings')
    .update(updates)
    .eq('id', 1)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ settings: data })
}

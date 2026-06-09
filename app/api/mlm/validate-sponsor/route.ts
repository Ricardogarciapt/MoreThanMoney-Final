import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/admin-api-helpers'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const username = searchParams.get('username')?.trim()

  if (!username) {
    return NextResponse.json({ valid: false, error: 'username é obrigatório' }, { status: 400 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, is_active')
    .eq('username', username)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !profile) {
    return NextResponse.json({ valid: false })
  }

  return NextResponse.json({ valid: true, name: profile.full_name || username })
}

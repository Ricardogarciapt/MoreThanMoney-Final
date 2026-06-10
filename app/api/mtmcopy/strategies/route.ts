import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmStrategyOptionsAsync } from '@/lib/mtmcopy/copy-methods'

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(accessToken)
  if (error || !user) return null
  return user
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const strategies = await getMtmStrategyOptionsAsync()
  return NextResponse.json({ strategies })
}

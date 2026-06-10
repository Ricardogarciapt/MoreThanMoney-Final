import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { searchKnownMtServersEnhanced } from '@/lib/mtmcopy/metaapi-admin'
import { isMetaApiConfigured } from '@/lib/mtmcopy/metaapi'

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

  if (!isMetaApiConfigured()) {
    return NextResponse.json({ brokers: [], metaapi: false })
  }

  const { searchParams } = new URL(request.url)
  const platform = searchParams.get('platform') === 'mt4' ? 'mt4' : 'mt5'
  const q = searchParams.get('q')?.trim() || ''
  const limit = Math.min(60, Math.max(10, parseInt(searchParams.get('limit') ?? '40', 10) || 40))

  try {
    const brokers = await searchKnownMtServersEnhanced(platform, q, limit)
    return NextResponse.json({ brokers, platform, query: q || 'popular', metaapi: true, count: brokers.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao pesquisar servidores'
    return NextResponse.json({ error: message, brokers: [] }, { status: 502 })
  }
}

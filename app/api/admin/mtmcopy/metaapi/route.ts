import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { fetchMetaApiOverview } from '@/lib/mtmcopy/metaapi-admin'

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const overview = await fetchMetaApiOverview()
    return NextResponse.json(overview)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro MetaAPI'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

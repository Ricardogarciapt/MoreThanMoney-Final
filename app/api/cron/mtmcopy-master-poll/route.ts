import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { pollMasterAccounts } from '@/lib/mtmcopy/master-poll'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Polling das contas-mestre (MetaApi) para o Tap to Trade sem Telegram:
 * deteta opens/closes/edições no MT5 do mestre e propaga para as contas T2T slave.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await pollMasterAccounts()
    console.log('[CRON master-poll]', result)
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[CRON master-poll] erro:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'erro' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}

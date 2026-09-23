import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { searchKnownMtServersEnhanced } from '@/lib/mtmcopy/metaapi-admin'
import { isMetaApiConfigured } from '@/lib/mtmcopy/metaapi'
import { T2T_BROKERS } from '@/lib/mtmcopy/t2t-brokers'

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

  const { searchParams } = new URL(request.url)
  const platform = searchParams.get('platform') === 'mt4' ? 'mt4' : 'mt5'
  const q = searchParams.get('q')?.trim() || ''
  const limit = Math.min(60, Math.max(10, parseInt(searchParams.get('limit') ?? '40', 10) || 40))

  // A LISTA NÃO PODE DEPENDER SÓ DA METAAPI.
  //
  // O endpoint `known-mt-servers` deles passou a responder **404** (confirmado a 23/09) — o que
  // deixava esta rota a devolver lista vazia e, no WebTrader, um seletor de servidores sem nada
  // dentro: ninguém conseguia ligar uma conta MT5/MT4. A lista passa a começar nas corretoras que
  // NÓS servimos (lib/mtmcopy/t2t-brokers.ts) e nos servidores onde a pessoa já tem contas
  // ligadas — que é onde 99% das ligações acontecem. O que a MetaApi devolver junta-se a isso.
  const grupos = new Map<string, Set<string>>()
  const juntar = (corretora: string, servidores: string[]) => {
    if (!servidores.length) return
    if (!grupos.has(corretora)) grupos.set(corretora, new Set())
    for (const s of servidores) if (s?.trim()) grupos.get(corretora)!.add(s.trim())
  }
  for (const b of T2T_BROKERS) juntar(b.label, b.servers)

  // Os servidores das contas que esta pessoa já ligou (inclui corretoras fora da nossa lista).
  const [{ data: doSite }, { data: doAuto }] = await Promise.all([
    getSupabaseAdmin().from('mtmcopy_connections').select('mt5_server').eq('user_id', user.id).not('mt5_server', 'is', null),
    getSupabaseAdmin().from('mtmauto_accounts').select('servidor').eq('user_id', user.id).not('servidor', 'is', null),
  ])
  const meus = new Set<string>()
  for (const r of doSite ?? []) { const v = String(r.mt5_server ?? '').split(' · ')[0].trim(); if (v && v !== 'MTM Funded') meus.add(v) }
  for (const r of doAuto ?? []) { const v = String(r.servidor ?? '').trim(); if (v && v !== 'MTM Funded') meus.add(v) }
  juntar('As tuas contas', [...meus])

  if (isMetaApiConfigured()) {
    try {
      for (const b of await searchKnownMtServersEnhanced(platform, q, limit)) juntar(b.broker, b.servers)
    } catch {
      // A MetaApi é um extra: a lista de cima chega para ligar uma conta.
    }
  }

  const termo = q.toLowerCase()
  const brokers = [...grupos]
    .map(([broker, servidores]) => ({
      broker,
      servers: [...servidores].filter((s) => !termo || s.toLowerCase().includes(termo) || broker.toLowerCase().includes(termo)).sort(),
    }))
    .filter((b) => b.servers.length)
    .sort((a, b) => (a.broker === 'As tuas contas' ? -1 : b.broker === 'As tuas contas' ? 1 : a.broker.localeCompare(b.broker)))
    .slice(0, limit)

  return NextResponse.json({ brokers, platform, query: q || 'todas', metaapi: isMetaApiConfigured(), count: brokers.length })
}

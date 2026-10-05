import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { listarProvidersPorEquipa } from '@/lib/copia-contas/servidor/providers-equipas'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { validarProviderExterno } from '@/lib/mestres/provider-externo'
import { depsReais, registarProvider } from '@/lib/mestres/servidor/registar-provider'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET → providers (contas de estratégia) agrupados por equipa MTM Auto. Só leitura; sem tokens. */
export const GET = soAdmin(async () => NextResponse.json(await listarProvidersPorEquipa()))

/**
 * POST — o MESMO modelo do admin da MTM Auto (05/10):
 *   { acao: 'registar', providerId }         → mestre SIM + mestres_estrategias (sombra) + rotas + canal
 *   { acao: 'criar', slug, nome, tipo, … }   → cria o provider (metaapi id colado / telegram chat id /
 *                                              mt5 credenciais cifradas) e regista-o na cadeia
 * Nada disto liga live: tudo nasce em sombra. O admin da MTM Auto chama 'registar' depois de gravar.
 */
export const POST = soAdmin(async (adminId: string, req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (b.acao === 'registar') {
    const id = String(b.providerId ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'providerId inválido' }, { status: 400 })
    const r = await registarProvider(id, await depsReais())
    return NextResponse.json(r, { status: r.ok ? 200 : 409 })
  }
  if (b.acao === 'criar') {
    const slug = String(b.slug ?? '').trim()
    const nome = String(b.nome ?? '').trim()
    if (!slug || !nome) return NextResponse.json({ error: 'slug e nome são obrigatórios' }, { status: 400 })
    const ext = validarProviderExterno(b)
    if (!ext.ok) return NextResponse.json({ error: ext.erro }, { status: 400 })
    const db = getSupabaseAdmin()
    const extra: Record<string, unknown> = { ...ext.linha }
    if (ext.tipo === 'metaapi') {
      // Só leitura, com a chave da casa: confirma que a conta existe antes de gravar.
      const token = process.env.METAAPI_TOKEN
      if (!token) return NextResponse.json({ error: 'METAAPI_TOKEN em falta no servidor' }, { status: 503 })
      const r = await fetch(`https://mt-client-api-v1.new-york.agiliumtrade.ai/users/current/accounts/${encodeURIComponent(String(ext.linha.metaapi_account_id))}/accountInformation`, { headers: { 'auth-token': token }, signal: AbortSignal.timeout(15_000) }).catch(() => null)
      const info = r?.ok ? ((await r.json().catch(() => null)) as { balance?: number } | null) : null
      if (!info || typeof info.balance !== 'number') return NextResponse.json({ error: 'Essa conta MetaApi não respondeu. Confirma o id.' }, { status: 400 })
    }
    if (ext.tipo === 'mt5' && ext.passwordMt5) {
      const { cifrar, cifraDisponivel } = await import('@/lib/mtmfunded/credenciais')
      if (!cifraDisponivel()) return NextResponse.json({ error: 'MTMFUNDED_CRED_KEY em falta — não se guarda a password MT5' }, { status: 503 })
      extra.mt5_password_cifrada = cifrar(ext.passwordMt5)
    }
    const { data, error } = await db.from('mtmauto_providers').insert({
      slug, nome, descricao: (b.descricao as string) ?? null, tipo: ext.tipo, tenant_id: null, criado_por: adminId,
      ativo: false, espelhar: false, fonte_execucao: 'mestre',
      canal_chat: typeof b.canal_chat === 'string' && b.canal_chat.trim() ? b.canal_chat.trim().toLowerCase() : null,
      ...extra,
    }).select('id').single()
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'não gravou' }, { status: 500 })
    const r = await registarProvider(String(data.id), await depsReais())
    return NextResponse.json({ ...r, providerId: data.id, aviso: ext.aviso })
  }
  return NextResponse.json({ error: 'acao inválida (registar | criar)' }, { status: 400 })
})

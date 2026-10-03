import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import {
  findExistingAccount,
  provisionMasterAccount,
  undeployMetaApiAccount,
  formatMetaApiProvisionError,
} from '@/lib/mtmcopy/metaapi-provision'
import {
  generateStrategyId,
  upsertProviderStrategy,
  removeProviderStrategy,
} from '@/lib/mtmcopy/copyfactory'
import { fetchMetaApiOverview } from '@/lib/mtmcopy/metaapi-admin'
import { getSignalSourcesConfig } from '@/lib/mtmcopy/signal-sources-config'
import { normalizeProviderRoutes } from '@/lib/mtmcopy/provider-routes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Contas PROVIDER (mestre) do MTM Copy — criar, listar e retirar, a partir do site.
 *
 * Até aqui só se podia ESCOLHER uma conta MetaApi já existente ao configurar uma rota; criar a
 * conta era trabalho manual no painel da MetaApi (provisionar, pôr o papel de provider, criar a
 * estratégia CopyFactory à mão). Esta rota encadeia os três passos que já existiam soltos.
 *
 * GET    → contas provider conhecidas + estratégias + rotas que as usam
 * POST   { action:'create', label, login, password, server, platform? }
 *        → reutiliza a conta se o par login+servidor já existir, provisiona-a como mestre,
 *          gera o id de estratégia e cria a estratégia CopyFactory. Devolve accountId+strategyId
 *          para se ligar a uma rota.
 * DELETE { account_id, strategy_id? } → retira a estratégia e desliga a conta (undeploy).
 *          NÃO apaga a conta na MetaApi: desligar é reversível, apagar não.
 */

interface ProviderAccountRow {
  accountId: string
  name: string
  login: string
  strategies: { id: string; name: string }[]
  usedByRoutes: string[]
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  try {
    const [overview, config] = await Promise.all([fetchMetaApiOverview(), getSignalSourcesConfig()])
    const routes = normalizeProviderRoutes(config)

    const contas: ProviderAccountRow[] = (overview.accounts ?? []).map((acc) => ({
      accountId: acc.id,
      name: acc.name ?? '',
      login: acc.login ?? '',
      strategies: (overview.strategies ?? [])
        .filter((s) => s.accountId === acc.id)
        .map((s) => ({ id: s.id, name: s.name ?? '' })),
      usedByRoutes: routes.filter((r) => r.account_id === acc.id).map((r) => r.label ?? r.id),
    }))

    // Primeiro as que já servem rotas — são as que interessam ao operador.
    contas.sort((a, b) => b.usedByRoutes.length - a.usedByRoutes.length || a.name.localeCompare(b.name))
    return NextResponse.json({ ok: true, accounts: contas })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  if (String(body.action ?? '') !== 'create') {
    return NextResponse.json({ ok: false, error: "action inválida (só 'create')" }, { status: 400 })
  }

  const label = String(body.label ?? '').trim()
  const login = String(body.login ?? '').trim()
  const password = String(body.password ?? '')
  const server = String(body.server ?? '').trim()
  const platform = body.platform === 'mt4' ? 'mt4' : 'mt5'

  if (!label || !login || !password || !server) {
    return NextResponse.json(
      { ok: false, error: 'label, login, password e server são obrigatórios' },
      { status: 400 },
    )
  }

  const passos: string[] = []
  try {
    // 1. Já existe? Reutilizar evita contas duplicadas a faturar na MetaApi.
    const existente = await findExistingAccount(login, server)
    let accountId = (existente as { id?: string } | null)?.id ?? null
    if (accountId) {
      passos.push(`conta já existia na MetaApi (${accountId.slice(0, 8)}) — reutilizada`)
    } else {
      const prov = await provisionMasterAccount({
        login,
        password,
        server,
        platform,
        userId: 'mtm-provider',
        userLabel: label,
      })
      if (!prov.success || !prov.accountId) {
        return NextResponse.json({ ok: false, error: prov.error ?? 'provisionamento falhou', passos }, { status: 502 })
      }
      accountId = prov.accountId
      passos.push(`conta provisionada como mestre (${accountId.slice(0, 8)})`)
    }

    // 2. Estratégia CopyFactory — é o que os subscritores passam a poder copiar.
    const gen = await generateStrategyId()
    if (!gen.ok || !gen.id) {
      return NextResponse.json({ ok: false, error: gen.error ?? 'não foi possível gerar o id da estratégia', accountId, passos }, { status: 502 })
    }
    const strat = await upsertProviderStrategy({
      strategyId: gen.id,
      accountId,
      name: label,
      description: `Estratégia provider ${label} (criada no site)`,
    })
    if (!strat.ok) {
      return NextResponse.json({ ok: false, error: strat.error ?? 'criação da estratégia falhou', accountId, passos }, { status: 502 })
    }
    passos.push(`estratégia CopyFactory criada (${gen.id})`)

    return NextResponse.json({
      ok: true,
      accountId,
      strategyId: gen.id,
      passos,
      proximo: 'Liga esta conta a uma rota em Senders → Rotas para começar a receber sinais.',
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: formatMetaApiProvisionError(e), passos },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  const accountId = String(body.account_id ?? '').trim()
  const strategyId = String(body.strategy_id ?? '').trim()
  if (!accountId) return NextResponse.json({ ok: false, error: 'account_id obrigatório' }, { status: 400 })

  // Guarda: uma conta que ainda serve rotas não deve ser desligada às cegas.
  try {
    const routes = normalizeProviderRoutes(await getSignalSourcesConfig())
    const emUso = routes.filter((r) => r.account_id === accountId && r.enabled !== false)
    if (emUso.length && body.force !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: `Esta conta ainda serve ${emUso.length} rota(s): ${emUso.map((r) => r.label ?? r.id).join(', ')}. Desliga as rotas primeiro, ou envia force:true.`,
        },
        { status: 409 },
      )
    }
  } catch {
    /* se não conseguirmos ler as rotas, seguimos — o undeploy é reversível */
  }

  const passos: string[] = []
  if (strategyId) {
    const r = await removeProviderStrategy(strategyId)
    passos.push(r.ok ? `estratégia ${strategyId} removida` : `estratégia não removida: ${r.error ?? 'erro'}`)
  }
  try {
    await undeployMetaApiAccount(accountId)
    passos.push('conta desligada (undeploy) — a conta continua na MetaApi e pode voltar a ligar')
  } catch (e) {
    passos.push(`undeploy falhou: ${e instanceof Error ? e.message : 'erro'}`)
  }
  return NextResponse.json({ ok: true, passos })
}

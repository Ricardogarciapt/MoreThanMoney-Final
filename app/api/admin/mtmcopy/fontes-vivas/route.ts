import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { buildCanonicalProviderRoutes } from '@/lib/mtmcopy/provider-routes-defaults'
import { CONTAS_MOTOR_TEMPO_REAL } from '@/lib/mtmcopy/provider-constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O estado REAL das fontes, lido onde a verdade vive: na MetaApi.
 *
 * O painel dizia o que o código achava que existia. Descobriu-se que metade das contas provider
 * tinha sido apagada e ninguém dava por isso — a estratégia continuava listada, o interruptor
 * continuava a ligar, e o sinal não ia a lado nenhum. Isto pergunta à MetaApi, a cada abertura,
 * se a conta existe, se está ligada, e quantas contas a copiam.
 */
const PROVISIONING = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

export async function GET(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado

  const token = process.env.METAAPI_TOKEN
  if (!token) return NextResponse.json({ ok: false, error: 'METAAPI_TOKEN por configurar' }, { status: 503 })
  const cf = process.env.METAAPI_COPYFACTORY_URL ?? 'https://copyfactory-api-v1.new-york.agiliumtrade.ai'
  const cabecalho = { 'auth-token': token }

  // Subscritores por estratégia — uma leitura só, não uma por rota.
  let subsPorEstrategia = new Map<string, number>()
  try {
    const r = await fetch(`${cf}/users/current/configuration/subscribers`, { headers: cabecalho })
    const lista = (await r.json()) as Array<{ subscriptions?: Array<{ strategyId?: string; pause?: boolean }> }>
    if (Array.isArray(lista)) {
      const contagem = new Map<string, number>()
      for (const s of lista) {
        for (const x of s.subscriptions ?? []) {
          if (!x.strategyId || x.pause) continue
          contagem.set(x.strategyId, (contagem.get(x.strategyId) ?? 0) + 1)
        }
      }
      subsPorEstrategia = contagem
    }
  } catch {
    /* sem CopyFactory, mostra-se o resto */
  }

  const rotas = buildCanonicalProviderRoutes()
  const fontes = await Promise.all(
    rotas.map(async (rota) => {
      let conta: Record<string, unknown> | null = null
      let existe = false
      try {
        const r = await fetch(`${PROVISIONING}/users/current/accounts/${rota.account_id}`, { headers: cabecalho })
        existe = r.ok
        if (r.ok) conta = (await r.json()) as Record<string, unknown>
      } catch {
        /* trata-se como ilegível, não como inexistente */
      }
      return {
        id: rota.id,
        label: rota.label ?? rota.id,
        estrategia: rota.strategy_id ?? null,
        contaId: rota.account_id,
        existe,
        nome: (conta?.name as string) ?? null,
        login: (conta?.login as string) ?? null,
        servidor: (conta?.server as string) ?? null,
        estado: (conta?.state as string) ?? null,
        ligacao: (conta?.connectionStatus as string) ?? null,
        // O motor de preço corre nesta conta? É o que separa "gerido por nós" de "gerido na fonte".
        motor: CONTAS_MOTOR_TEMPO_REAL.includes(rota.account_id),
        copiadores: rota.strategy_id ? (subsPorEstrategia.get(rota.strategy_id) ?? 0) : 0,
        tapToTrade: rota.tap_to_trade === true,
        origem: rota.signal_source ?? 'telegram',
      }
    }),
  )

  /**
   * O PrimeVerse não é uma rota provider — e por isso não aparecia em lado nenhum.
   *
   * Os sinais dos traders de topo do PrimeVerse são colocados por EXECUÇÃO DIRETA numa conta
   * configurada em `site_settings.primeverse_execution`, sem CopyFactory pelo meio. Como o painel
   * só listava rotas, essa conta parecia uma ligação partida: aparecia subscrita a uma estratégia
   * que já não existe (a `su0a` da antiga cascade) e nada explicava de onde lhe vinham as trades.
   * Aqui diz-se.
   */
  let primeverse: Record<string, unknown> | null = null
  try {
    const { getPrimeverseExecConfig } = await import('@/lib/mtmcopy/primeverse-exec')
    const cfg = await getPrimeverseExecConfig()
    if (cfg.mode !== 'off') {
      let conta: Record<string, unknown> | null = null
      try {
        const r = await fetch(`${PROVISIONING}/users/current/accounts/${cfg.accountId}`, { headers: cabecalho })
        if (r.ok) conta = (await r.json()) as Record<string, unknown>
      } catch {
        /* mostra-se o resto */
      }
      primeverse = {
        modo: cfg.mode,
        traders: cfg.traders,
        contaId: cfg.accountId,
        nome: (conta?.name as string) ?? null,
        login: (conta?.login as string) ?? null,
        servidor: (conta?.server as string) ?? null,
        ligacao: (conta?.connectionStatus as string) ?? null,
        existe: Boolean(conta),
        riscoPct: cfg.riskPct,
        lote: cfg.senseiLot,
        bybit: cfg.bybit,
      }
    }
  } catch {
    /* sem config do PrimeVerse, o painel mostra só as rotas */
  }

  return NextResponse.json({ ok: true, fontes, primeverse })
}

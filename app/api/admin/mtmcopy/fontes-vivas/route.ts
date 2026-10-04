import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { buildCanonicalProviderRoutes } from '@/lib/mtmcopy/provider-routes-defaults'
import {
  carregarContasDeEstrategia,
  contasDeEstrategiaEmCache,
  contasDoMotorTempoReal,
  slugDaConta,
} from '@/lib/mtmcopy/contas-provider-estrategia'

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

  // As rotas canónicas só sabem a conta de cada estratégia depois de a cache estar quente.
  await carregarContasDeEstrategia(true).catch(() => undefined)
  const motor = contasDoMotorTempoReal()
  const rotas = buildCanonicalProviderRoutes()
  const fontes = await Promise.all(
    rotas.map(async (rota) => {
      let conta: Record<string, unknown> | null = null
      let existe = false
      try {
        // Sem conta (constante apagada) ou já sabida inexistente: não se pergunta (15/09 — cada 404
        // conta para o estrangulamento «too many unexisting accounts» do token inteiro).
        const { contaInexistente, marcarContaInexistente } = await import('@/lib/mtmcopy/metaapi-inexistentes')
        if (rota.account_id && !(await contaInexistente(rota.account_id))) {
          const r = await fetch(`${PROVISIONING}/users/current/accounts/${rota.account_id}`, { headers: cabecalho })
          existe = r.ok
          if (r.ok) conta = (await r.json()) as Record<string, unknown>
          else if (r.status === 404) {
            await marcarContaInexistente(rota.account_id, Object.assign(new Error('HTTP 404'), { status: 404 }), { nivelConta: true, origem: 'fontes-vivas' })
          }
        }
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
        motor: motor.includes(rota.account_id),
        // De que estratégia é esta conta, e de onde veio o id (conta do VPS ou provider).
        slug: slugDaConta(rota.account_id),
        copiadores: rota.strategy_id ? (subsPorEstrategia.get(rota.strategy_id) ?? 0) : 0,
        tapToTrade: rota.tap_to_trade === true,
        origem: rota.signal_source ?? 'telegram',
      }
    }),
  )

  // (saiu a 2026-10-04) Aqui mostrava-se a conta de execução directa do PrimeVerse (Edge). A fonte acabou
  // com o pv-relay; a rota primeverse-exec devolve 410 e não há execução directa a mostrar.

  /**
   * AS CONTAS MESTRE, COMO A BASE AS TEM.
   *
   * É a resposta à pergunta que custou 24 h de sinais sem execução: «que conta é que esta
   * estratégia usa?». `divergencia` diz quando `mtmauto_providers.metaapi_account_id` aponta
   * para outro sítio — a conta do VPS é a que negoceia, mas a discrepância tem de ser visível.
   */
  const contasMestre = contasDeEstrategiaEmCache().map((c) => ({
    slug: c.slug,
    contaId: c.accountId,
    login: c.login,
    servidor: c.servidor,
    origem: c.origem,
    divergencia: c.divergencia,
    motor: motor.includes(c.accountId),
  }))

  return NextResponse.json({ ok: true, fontes, contasMestre })
}

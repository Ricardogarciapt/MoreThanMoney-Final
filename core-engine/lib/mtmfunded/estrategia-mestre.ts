import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * A ESTRATÉGIA COPYFACTORY DE UMA CONTA MESTRE.
 *
 * Uma conta com papel de PROVIDER ainda não é copiável: é preciso existir uma ESTRATÉGIA que
 * aponte para ela, e são os subscritores que se ligam à estratégia, não à conta. Sem este
 * passo, a conta mestre negoceia e mais ninguém vê nada — que é exactamente o estado em que
 * três das estratégias estavam, com contas a zeros e subscritores a copiar o vazio.
 *
 * O DIMENSIONAMENTO é por SALDO (`tradeSizeScaling: balance`), não por lote fixo. É a única
 * forma de o mesmo sinal servir uma conta de 500 USD e outra de 50.000: cada subscritor abre
 * na proporção do que tem. Com `forceTinyTrades`, uma conta pequena de mais para o lote
 * mínimo do broker abre o mínimo em vez de não abrir nada — e um subscritor que nunca abre
 * ordem nenhuma é um subscritor que cancela sem perceber porquê.
 *
 * O limite de risco diário vem de `MTM_PROVIDER_RISK_LIMITS`: 20% de variação do saldo num dia
 * fecha as posições. Não é para proteger a estratégia — é para nenhum dia isolado da conta
 * mestre poder arrastar todas as contas que a copiam.
 */

export interface ResultadoEstrategia {
  ok: boolean
  strategyId?: string
  erro?: string
}

export async function garantirEstrategiaDaConta(accountId: string): Promise<ResultadoEstrategia> {
  const db = getSupabaseAdmin()

  const { data: conta } = await db
    .from('mtm_trading_accounts')
    .select('id, tipo, provider_slug, metaapi_account_id, metricas, mt5_login')
    .eq('id', accountId)
    .maybeSingle()

  if (!conta) return { ok: false, erro: 'conta não encontrada' }
  if (conta.tipo !== 'provider') return { ok: false, erro: 'não é conta mestre' }
  if (!conta.metaapi_account_id) return { ok: false, erro: 'conta ainda não está na MetaApi' }
  if (!conta.provider_slug) return { ok: false, erro: 'conta sem estratégia associada' }

  const { data: provider } = await db
    .from('mtmauto_providers')
    .select('id, nome, slug, descricao')
    .eq('slug', conta.provider_slug)
    .maybeSingle()

  const nome = (provider?.nome as string) || String(conta.provider_slug)
  const metricas = (conta.metricas ?? {}) as Record<string, unknown>

  /**
   * A conta TEM de estar marcada como provider na MetaApi antes de existir estratégia.
   *
   * A CopyFactory recusa com «is not marked as CopyFactory strategy provider», e é uma recusa
   * fácil de apanhar tarde: acontece a criar a estratégia, não a criar a conta. Contas
   * reaproveitadas de tentativas anteriores — ou criadas antes de isto existir — chegam aqui
   * sem o papel. Garante-se agora, em vez de falhar e pedir a alguém que vá à consola.
   */
  /**
   * A conta TEM de estar marcada como provider na MetaApi antes de existir estratégia.
   *
   * A CopyFactory recusa com «is not marked as CopyFactory strategy provider» — uma recusa
   * fácil de apanhar tarde, porque acontece a criar a estratégia e não a criar a conta.
   *
   * E não se faz por PATCH nem por PUT na conta: o caminho é um endpoint próprio,
   * `enable-copy-factory-api`, que também reserva o SLOT de recurso. Um PATCH devolve 404 e
   * parece um problema de conta inexistente, quando é só o caminho errado.
   *
   * Depois de activar, a MetaApi precisa de ~45s a propagar. Criar a estratégia antes disso
   * falha com a mesma mensagem, e fica a parecer que a activação não funcionou.
   */
  const token = process.env.METAAPI_TOKEN
  if (token) {
    try {
      const base = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'
      const url = `${base}/users/current/accounts/${conta.metaapi_account_id}`
      const actual = await fetch(url, { headers: { 'auth-token': token }, signal: AbortSignal.timeout(15_000) })
      if (actual.ok) {
        const d = (await actual.json()) as { copyFactoryRoles?: string[] }
        if (!(d.copyFactoryRoles ?? []).includes('PROVIDER')) {
          await fetch(`${url}/enable-copy-factory-api`, {
            method: 'POST',
            headers: { 'auth-token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ copyFactoryRoles: ['PROVIDER'], copyFactoryResourceSlots: 1 }),
            signal: AbortSignal.timeout(20_000),
          })
          await new Promise((r) => setTimeout(r, 45_000))
        }
      }
    } catch {
      // Falhando, a criação da estratégia falha logo a seguir com a mensagem certa — não se
      // esconde o problema atrás de um erro pior.
    }
  }

  const { generateStrategyId, ensureMtmProviderStrategyScaling } = await import('@/lib/mtmcopy/copyfactory')

  /**
   * Reaproveita-se a estratégia que já exista para esta conta mestre.
   *
   * Gerar um id novo a cada passagem deixava estratégias órfãs na CopyFactory e, pior, os
   * subscritores ligados à antiga deixavam de receber sem nada mudar do lado deles.
   */
  const jaTem = typeof metricas.strategy_id === 'string' ? metricas.strategy_id : null
  let strategyId = jaTem
  if (!strategyId) {
    const g = await generateStrategyId()
    if (!g.ok || !g.id) return { ok: false, erro: g.error ?? 'não obtive id de estratégia' }
    strategyId = g.id
  }

  const r = await ensureMtmProviderStrategyScaling({
    strategyId,
    accountId: conta.metaapi_account_id as string,
    name: `MTM Auto · ${nome}`,
    description:
      `Conta mestre ${conta.mt5_login ?? ''} · risco ${metricas.risco_pct ?? '—'}% · ` +
      `BE ${metricas.be_pips ?? '—'}p · trailing ${metricas.trailing_pips ?? '—'}p`,
  })
  if (!r.ok) return { ok: false, erro: r.error }

  // Grava-se dos DOIS lados: na conta (que é quem conhece a estratégia) e no provider (que é
  // por onde o resto do sistema procura). Guardar só num deles obrigava a adivinhar no outro.
  await db
    .from('mtm_trading_accounts')
    .update({ metricas: { ...metricas, strategy_id: strategyId } })
    .eq('id', conta.id)

  if (provider?.id) {
    await db
      .from('mtmauto_providers')
      .update({
        metaapi_account_id: conta.metaapi_account_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', provider.id)
  }

  return { ok: true, strategyId }
}

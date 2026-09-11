import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * RECONCILIAR as estratégias entre os quatro sítios onde elas existem.
 *
 * Uma estratégia do MTM Auto vive em quatro sítios ao mesmo tempo: a linha do provider, a conta
 * mestre, a conta na MetaApi e a estratégia na CopyFactory. Cada passo pode falhar sozinho — e
 * falha em silêncio, porque tudo o resto continua a funcionar. Foi assim que três estratégias
 * ficaram com contas a zeros e subscritores a copiar o vazio durante semanas, e que a Gold Did
 * ficou com conta criada e sem ligação (a MetaApi estava sem saldo nesse minuto).
 *
 * Esta função olha para os quatro e diz o que não bate certo. Com `reparar`, arruma o que
 * consegue: ligar a conta à MetaApi, criar a estratégia em falta, apontar o provider para a
 * conta certa.
 *
 * O que NÃO faz sozinha: apagar seja o que for. Uma divergência pode ser um erro ou pode ser
 * uma decisão de alguém, e a diferença entre as duas não se lê daqui.
 */

export interface Divergencia {
  slug: string
  nome: string
  problema: string
  gravidade: 'grave' | 'aviso'
  reparado?: boolean
  erro?: string
}

export async function reconciliarEstrategias(opts?: { reparar?: boolean }): Promise<{
  verificadas: number
  divergencias: Divergencia[]
}> {
  const db = getSupabaseAdmin()
  const divergencias: Divergencia[] = []

  const { data: providers } = await db
    .from('mtmauto_providers')
    .select('id, slug, nome, ativo, metaapi_account_id')
    .order('nome')

  for (const p of providers ?? []) {
    const slug = p.slug as string
    const nome = (p.nome as string) ?? slug

    const { data: conta } = await db
      .from('mtm_trading_accounts')
      .select('id, mt5_login, estado, metaapi_account_id, metricas, mt5_password_cifrada, servidor')
      .eq('tipo', 'provider')
      .eq('provider_slug', slug)
      .maybeSingle()

    // ── sem conta mestre ────────────────────────────────────────────────────
    if (!conta) {
      divergencias.push({
        slug, nome, gravidade: 'grave',
        problema: 'estratégia sem conta mestre — os sinais não têm de onde ser copiados',
      })
      continue
    }

    // A ligação MetaApi desta conta, que a reparação pode preencher.
    let metaapiId = (conta.metaapi_account_id as string | null) ?? null

    // ── conta criada mas não ligada à MetaApi ───────────────────────────────
    if (!metaapiId) {
      const d: Divergencia = {
        slug, nome, gravidade: 'grave',
        problema: `conta ${conta.mt5_login ?? '—'} existe mas não está na MetaApi`,
      }
      if (opts?.reparar && conta.mt5_login && conta.mt5_password_cifrada) {
        try {
          const { decifrar } = await import('@/lib/mtmfunded/credenciais')
          const { ligarContaMetaApi } = await import('@/lib/mtmfunded/metaapi')
          // `decifrar` devolve null com a chave trocada ou o registo corrompido. Tentar ligar
          // com null dava um erro da MetaApi sobre credenciais, que manda procurar no sítio
          // errado — o problema seria nosso, da cifra.
          const password = decifrar(conta.mt5_password_cifrada as string)
          if (!password) {
            d.erro = 'a palavra-passe guardada não é legível (chave de cifra trocada?)'
            divergencias.push(d)
            continue
          }
          const r = await ligarContaMetaApi({
            login: conta.mt5_login as string,
            password,
            servidor: (conta.servidor as string) || 'TheTradingMaster-Live',
            nome: `MTM Auto · ${slug}`,
            papelProvider: true,
          })
          if (r.ok && r.accountId) {
            await db
              .from('mtm_trading_accounts')
              .update({ metaapi_account_id: r.accountId })
              .eq('id', conta.id)
            metaapiId = r.accountId
            d.reparado = true
          } else {
            d.erro = r.erro
          }
        } catch (e) {
          d.erro = e instanceof Error ? e.message : String(e)
        }
      }
      divergencias.push(d)
      if (!metaapiId) continue
    }

    // ── sem estratégia CopyFactory ──────────────────────────────────────────
    const metricas = (conta.metricas ?? {}) as Record<string, unknown>
    if (!metricas.strategy_id) {
      const d: Divergencia = {
        slug, nome, gravidade: 'grave',
        problema: 'conta na MetaApi mas sem estratégia CopyFactory — ninguém a pode subscrever',
      }
      if (opts?.reparar) {
        try {
          const { garantirEstrategiaDaConta } = await import('@/lib/mtmfunded/estrategia-mestre')
          const r = await garantirEstrategiaDaConta(conta.id as string)
          d.reparado = r.ok
          if (!r.ok) d.erro = r.erro
        } catch (e) {
          d.erro = e instanceof Error ? e.message : String(e)
        }
      }
      divergencias.push(d)
    }

    // ── o provider aponta para outra conta ──────────────────────────────────
    if (p.metaapi_account_id !== metaapiId) {
      const d: Divergencia = {
        slug, nome, gravidade: 'grave',
        problema: 'o provider aponta para uma conta diferente da conta mestre — os sinais saem de uma e a cópia vem da outra',
      }
      if (opts?.reparar) {
        const { error } = await db
          .from('mtmauto_providers')
          .update({ metaapi_account_id: metaapiId, updated_at: new Date().toISOString() })
          .eq('id', p.id)
        d.reparado = !error
        if (error) d.erro = error.message
      }
      divergencias.push(d)
    }

    // ── conta que não está activa ───────────────────────────────────────────
    if (conta.estado !== 'ativa') {
      divergencias.push({
        slug, nome, gravidade: 'aviso',
        problema: `a conta mestre está «${conta.estado}» — enquanto assim for não produz sinais`,
      })
    }
  }

  return { verificadas: (providers ?? []).length, divergencias }
}

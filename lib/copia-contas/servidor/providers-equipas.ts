import { providerEhFonteDeCopia, providerVisivel } from '../equipas'
import { db } from './base'

/**
 * PROVIDERS POR EQUIPA (admin do site) — a lista das contas de estratégia de cada equipa MTM Auto,
 * com o que as liga à cópia entre contas. Só leitura; quem cria/edita é o admin da equipa na app MTM Auto.
 * Nunca devolve tokens nem credenciais: só se a equipa TEM chave própria.
 * Custo: 4 consultas pequenas (providers, equipas, partilhas, contagem de rotas por origem `prov:`).
 */
export interface ProviderEquipaAdmin {
  id: string
  nome: string
  slug: string
  tipo: string
  ativo: boolean
  espelhar: boolean
  conta: string | null
  chave: 'casa' | 'equipa' | '—'
  fonteDeCopia: boolean
  rotas: number
  partilhadaCom: string[]
  /** 084: de onde a estratégia executa — conta mestre ou espelho MTM Funded da casa */
  fonteExecucao: 'mestre' | 'espelho'
}

export interface EquipaComProviders {
  tenantId: string | null
  nome: string
  temChaveMetaApi: boolean
  quotaProvidersMetaApi: number | null
  providersMetaApi: number
  providers: ProviderEquipaAdmin[]
}

export async function listarProvidersPorEquipa(): Promise<{ equipas: EquipaComProviders[] }> {
  const [{ data: provs }, { data: tenants }, { data: partilhas }, { data: rotas }] = await Promise.all([
    db().from('mtmauto_providers').select('*').order('nome').limit(500),
    db().from('mtmauto_tenants').select('*').limit(500),
    db().from('mtmauto_provider_tenants').select('provider_id, tenant_id').limit(2000),
    db().from('copia_rotas').select('origem_ref').like('origem_ref', 'prov:%').neq('estado', 'recusada').limit(5000),
  ])
  const nomeEquipa = new Map((tenants ?? []).map((t) => [String(t.id), String(t.nome ?? t.slug ?? '—')]))
  const partilhadas = new Map<string, string[]>()
  for (const p of partilhas ?? []) partilhadas.set(String(p.provider_id), [...(partilhadas.get(String(p.provider_id)) ?? []), nomeEquipa.get(String(p.tenant_id)) ?? String(p.tenant_id)])
  const rotasPorProv = new Map<string, number>()
  for (const r of rotas ?? []) {
    const id = String(r.origem_ref).slice(5)
    rotasPorProv.set(id, (rotasPorProv.get(id) ?? 0) + 1)
  }

  const grupos = new Map<string, EquipaComProviders>()
  const grupo = (tenantId: string | null): EquipaComProviders => {
    const k = tenantId ?? 'casa'
    let g = grupos.get(k)
    if (!g) {
      const t = tenantId ? (tenants ?? []).find((x) => String(x.id) === tenantId) : null
      g = {
        tenantId, nome: tenantId ? nomeEquipa.get(tenantId) ?? tenantId : 'Casa (sem equipa)',
        temChaveMetaApi: Boolean(t?.metaapi_token), quotaProvidersMetaApi: t?.quota_providers_metaapi == null ? null : Number(t.quota_providers_metaapi),
        providersMetaApi: 0, providers: [],
      }
      grupos.set(k, g)
    }
    return g
  }
  for (const t of tenants ?? []) grupo(String(t.id))
  // apagadas (084, apagado_em) ficam fora; filtra-se aqui para funcionar com ou sem a 084 aplicada
  for (const p of (provs ?? []).filter((x) => !x.apagado_em)) {
    const g = grupo(p.tenant_id ? String(p.tenant_id) : null)
    const conta = p.tipo === 'metaapi' ? (p.login ? `${p.plataforma ?? 'mt5'} ${p.login}@${p.servidor ?? '?'}` : p.metaapi_account_id ? `MetaApi ${String(p.metaapi_account_id).slice(0, 8)}…` : null)
      : p.tipo === 'mtmfunded' ? (p.funded_account_id ? `MTM Funded ${String(p.funded_account_id).slice(0, 8)}…` : null)
        : p.tipo === 'tradelocker' ? (p.tl_acc_num ? `TradeLocker ${p.tl_env ?? ''} #${p.tl_acc_num}` : null)
          : p.tipo === 'mtm_t2t' ? `fonte ${p.fonte_mtm ?? '—'}` : p.tipo === 'telegram' ? 'Telegram' : null
    if (p.tipo === 'metaapi' && p.metaapi_account_id) g.providersMetaApi++
    g.providers.push({
      id: String(p.id), nome: String(p.nome), slug: String(p.slug), tipo: String(p.tipo), ativo: p.ativo === true, espelhar: p.espelhar === true, conta,
      chave: p.tipo !== 'metaapi' ? '—' : p.metaapi_chave_equipa === true ? 'equipa' : 'casa',
      fonteDeCopia: providerEhFonteDeCopia(p), rotas: rotasPorProv.get(String(p.id)) ?? 0, partilhadaCom: partilhadas.get(String(p.id)) ?? [],
      fonteExecucao: p.fonte_execucao === 'espelho' ? 'espelho' : 'mestre',
    })
  }
  return { equipas: [...grupos.values()].sort((a, b) => (a.tenantId ? 1 : 0) - (b.tenantId ? 1 : 0) || a.nome.localeCompare(b.nome)) }
}

/** O utilizador (seguidor) pode usar esta estratégia como origem? Mesma regra do catálogo MTM Auto. */
export async function providerVisivelPara(provider: { id: string; tenantId: string | null }, userId: string): Promise<boolean> {
  if (!provider.tenantId) return true
  const [{ data: u }, { data: casa }, { data: partilhas }] = await Promise.all([
    db().from('mtmauto_users').select('tenant_id').eq('user_id', userId).maybeSingle(),
    db().from('mtmauto_tenants').select('id').eq('slug', 'mtm').maybeSingle(),
    db().from('mtmauto_provider_tenants').select('tenant_id').eq('provider_id', provider.id),
  ])
  return providerVisivel(
    { tenantId: provider.tenantId, partilhadaCom: (partilhas ?? []).map((p) => String(p.tenant_id)) },
    u?.tenant_id ? String(u.tenant_id) : null,
    casa?.id ? String(casa.id) : null,
  )
}

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { carregarDireitos, type Direitos } from '@/lib/entitlements'

/**
 * QUOTA DE CONTAS METAAPI — a regra única (decisão do dono, 2026-09-15).
 *
 * Cada conta MT4/MT5 ligada é uma conta na MetaApi, e a MetaApi cobra por conta. Por isso o limite
 * é sobre CONTAS METAAPI, somadas nos dois produtos (site + MTM Auto partilham a Supabase):
 *
 *   • Grátis ........................................ 1 conta MetaApi
 *   • Premium, VIP (user_type OU member_category) ou com direito ao MTM Auto ... 2 contas
 *   • Admin ......................................... sem limite
 *   • + extras já pagas (7 €/mês, site + app MTM Auto + App Store) + bónus da corretora parceira
 *
 * Tabelas contadas: mtmcopy_connections, mtmauto_accounts e webtrader_contas_mt5 (contas MT5 abertas
 * só no WebTrader, migração 076).
 *
 * O que NÃO conta: TradeLocker e MTM Funded — nenhuma delas passa pela MetaApi.
 *
 * Quem já está acima do novo limite NÃO perde nada: não se apaga nem se faz undeploy de nenhuma
 * conta. Só se recusa a PRÓXIMA ligação, com a mensagem e o caminho para o upgrade.
 *
 * Substitui, para contas MetaApi, a regra antiga «1 real + 1 demo por produto». A demo conta
 * como as outras: a MetaApi cobra-a igual.
 *
 * Espelho no MTM Auto: /Users/ricardogarcia/Projetos/mtm-auto/lib/quota-metaapi.ts — mudar a
 * regra = mudar os dois e os testes dos dois.
 */

export const QUOTA_METAAPI_GRATIS = 1
export const QUOTA_METAAPI_PREMIUM = 2

/** Linha mínima de qualquer tabela de contas (mtmcopy_connections ou mtmauto_accounts). */
export interface LinhaConta {
  metaapi_account_id?: string | null
  login?: string | null
  servidor?: string | null
  plataforma?: string | null
  estado?: string | null
}

export type PlanoQuota = 'admin' | 'premium' | 'gratis'

export interface EstadoQuota {
  plano: PlanoQuota
  /** Base do plano (1 ou 2); Infinity para admin. */
  base: number
  /** Extras pagas + bónus da corretora. */
  extras: number
  /** Base + extras (Infinity para admin). */
  limite: number
  emUso: number
  acimaDoLimite: boolean
  /** Contas livres (0 quando cheio ou acima). Infinity para admin. */
  livres: number
}

export interface VeredictoQuota {
  ok: boolean
  estado: EstadoQuota
  erro?: string
  codigo?: 'quota_metaapi'
}

const normalizar = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** Esta linha é uma conta MetaApi? (MT4/MT5 — nunca TradeLocker nem MTM Funded.) */
export function ehContaMetaApi(l: LinhaConta): boolean {
  const p = normalizar(l.plataforma)
  if (p === 'tradelocker' || p === 'mtmfunded') return false
  // Desligada = já não existe na MetaApi (o site apaga-a ao desligar).
  if (normalizar(l.estado) === 'disconnected') return false
  if (l.metaapi_account_id) return true
  // Sem id ainda: só conta se estiver a ser criada agora (pending). Uma que falhou antes de
  // chegar à MetaApi não custa nada.
  return normalizar(l.estado) === 'pending' && Boolean(normalizar(l.login))
}

const chaveLoginServidor = (login: unknown, servidor: unknown) => {
  const lg = String(login ?? '').replace(/\D/g, '')
  const sv = normalizar(servidor)
  return lg && sv ? `${lg}@${sv}` : null
}

/**
 * Quantas contas MetaApi DISTINTAS há nestas linhas.
 *
 * A mesma conta ligada nos dois produtos (mesmo metaapi_account_id, ou o mesmo login+servidor)
 * conta UMA vez: é uma conta só na MetaApi, e cobrá-la duas vezes ao cliente seria injusto.
 */
export function contarContasMetaApi(linhas: LinhaConta[]): number {
  const ids = new Set<string>()
  const chaves = new Set<string>()
  let total = 0
  for (const l of linhas) {
    if (!ehContaMetaApi(l)) continue
    const id = l.metaapi_account_id ? String(l.metaapi_account_id) : null
    const chave = chaveLoginServidor(l.login, l.servidor)
    const vista = (id && ids.has(id)) || (chave && chaves.has(chave))
    if (id) ids.add(id)
    if (chave) chaves.add(chave)
    if (!vista) total++
  }
  return total
}

/** A conta (login+servidor) já está entre as contadas? Religá-la noutro produto não custa mais. */
export function jaContada(linhas: LinhaConta[], login: string, servidor: string): boolean {
  const chave = chaveLoginServidor(login, servidor)
  if (!chave) return false
  return linhas.some((l) => ehContaMetaApi(l) && chaveLoginServidor(l.login, l.servidor) === chave)
}

export function planoDaQuota(d: Pick<Direitos, 'admin' | 'vip' | 'premium' | 'copiaAutomatica'>): PlanoQuota {
  if (d.admin) return 'admin'
  // `vip` já lê os DOIS campos (user_type OU member_category) em carregarDireitos;
  // `copiaAutomatica` = direitoMtmAuto(...).tem.
  if (d.vip || d.premium || d.copiaAutomatica) return 'premium'
  return 'gratis'
}

export function estadoDaQuota(
  d: Pick<Direitos, 'admin' | 'vip' | 'premium' | 'copiaAutomatica' | 'extrasPagas' | 'bonusCorretora'>,
  emUso: number,
): EstadoQuota {
  const plano = planoDaQuota(d)
  if (plano === 'admin') {
    return { plano, base: Infinity, extras: 0, limite: Infinity, emUso, acimaDoLimite: false, livres: Infinity }
  }
  const base = plano === 'premium' ? QUOTA_METAAPI_PREMIUM : QUOTA_METAAPI_GRATIS
  const extras = Math.max(0, Number(d.extrasPagas) || 0) + (d.bonusCorretora ? 1 : 0)
  const limite = base + extras
  return { plano, base, extras, limite, emUso, acimaDoLimite: emUso > limite, livres: Math.max(0, limite - emUso) }
}

/** Mensagem PT com o caminho do upgrade — nunca um «não» seco. */
export function mensagemQuota(e: EstadoQuota): string {
  const contas = (n: number) => `${n} conta${n === 1 ? '' : 's'} MetaTrader`
  const base =
    e.acimaDoLimite
      ? `Tens ${contas(e.emUso)} ligadas e o teu plano inclui ${contas(e.limite)}. As que já tens continuam a funcionar, mas não podes ligar mais.`
      : `Já usas ${e.emUso} de ${contas(e.limite)} do teu plano.`
  const caminho =
    e.plano === 'gratis'
      ? ' Com Premium ou MTM Auto passas a ter 2 contas incluídas. Contas TradeLocker e MTM Funded não contam para este limite.'
      : ' Para mais, fala connosco para uma conta extra. Contas TradeLocker e MTM Funded não contam para este limite.'
  return base + caminho
}

/** Decisão pura: pode ligar mais uma conta MetaApi? */
export function decidirQuotaMetaApi(
  d: Pick<Direitos, 'admin' | 'vip' | 'premium' | 'copiaAutomatica' | 'extrasPagas' | 'bonusCorretora'>,
  linhas: LinhaConta[],
  nova?: { login?: string | null; servidor?: string | null },
): VeredictoQuota {
  const estado = estadoDaQuota(d, contarContasMetaApi(linhas))
  if (estado.plano === 'admin') return { ok: true, estado }
  if (nova?.login && nova?.servidor && jaContada(linhas, nova.login, nova.servidor)) return { ok: true, estado }
  if (estado.emUso < estado.limite) return { ok: true, estado }
  return { ok: false, estado, codigo: 'quota_metaapi', erro: mensagemQuota(estado) }
}

/** Linhas de contas do utilizador nos DOIS produtos, normalizadas. */
export async function linhasDeContas(userId: string): Promise<LinhaConta[]> {
  const db = getSupabaseAdmin()
  const [{ data: site }, { data: auto }, webtrader] = await Promise.all([
    // '*': colunas das migrações 069/074 podem não existir ainda.
    db.from('mtmcopy_connections').select('*').eq('user_id', userId),
    db.from('mtmauto_accounts').select('*').eq('user_id', userId),
    // Contas MT5 abertas só no WebTrader (076). Sem a migração aplicada, a consulta falha e não conta nada.
    db.from('webtrader_contas_mt5').select('*').eq('user_id', userId),
  ])
  return [
    ...(site ?? []).map((c: Record<string, unknown>) => ({
      metaapi_account_id: (c.metaapi_account_id as string) ?? null,
      login: (c.mt5_login as string) ?? null,
      servidor: (c.mt5_server as string) ?? null,
      plataforma: (c.mt5_platform as string) ?? 'mt5',
      estado: (c.mt5_status as string) ?? null,
    })),
    ...(auto ?? []).map((c: Record<string, unknown>) => ({
      metaapi_account_id: (c.metaapi_account_id as string) ?? null,
      login: (c.login as string) ?? null,
      servidor: (c.servidor as string) ?? null,
      plataforma: (c.plataforma as string) ?? 'mt5',
      estado: (c.estado as string) ?? null,
    })),
    ...(webtrader.error ? [] : (webtrader.data ?? [])).map((c: Record<string, unknown>) => ({
      metaapi_account_id: (c.metaapi_account_id as string) ?? null,
      login: (c.login as string) ?? null,
      servidor: (c.servidor as string) ?? null,
      plataforma: (c.plataforma as string) ?? 'mt5',
      estado: (c.estado as string) ?? null,
    })),
  ]
}

/** Estado da quota (para o ecrã «Limites e plano»). */
export async function carregarQuotaMetaApi(userId: string, direitos?: Direitos): Promise<EstadoQuota> {
  const [d, linhas] = await Promise.all([direitos ?? carregarDireitos(userId), linhasDeContas(userId)])
  return estadoDaQuota(d, contarContasMetaApi(linhas))
}

/**
 * O guarda a chamar ANTES de criar qualquer conta na MetaApi em nome de um utilizador.
 * Criar primeiro e recusar depois deixava contas órfãs a pagar.
 */
export async function verificarQuotaMetaApi(
  userId: string,
  nova?: { login?: string | null; servidor?: string | null },
  direitos?: Direitos,
): Promise<VeredictoQuota> {
  const [d, linhas] = await Promise.all([direitos ?? carregarDireitos(userId), linhasDeContas(userId)])
  return decidirQuotaMetaApi(d, linhas, nova)
}

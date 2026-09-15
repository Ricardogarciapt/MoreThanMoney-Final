import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ehContaMetaApi } from '@/lib/contas/quota-metaapi'

/**
 * «As minhas contas» — a lista única de contas de um utilizador, dos dois produtos.
 *
 * Lê `mtmcopy_connections` (Tap to Trade no site/app-mobile, contas de cópia antigas, TradeLocker,
 * MTM Funded) e `mtmauto_accounts` (app MTM Auto). Nunca devolve passwords, nem cifradas.
 */

export type PlataformaConta = 'mt5' | 'mt4' | 'tradelocker' | 'mtmfunded'
export type EstadoConta = 'ligada' | 'a_ligar' | 'erro' | 'so_leitura' | 'pausada'
export type OrigemConta = 'site' | 'auto'

export interface ContaUnificada {
  /** `site:<uuid>` ou `auto:<uuid>` — a origem viaja no id para as acções. */
  chave: string
  id: string
  origem: OrigemConta
  plataforma: PlataformaConta
  rotulo: string | null
  login: string | null
  servidor: string | null
  estado: EstadoConta
  erro: string | null
  demo: boolean
  /** Conta paga na MetaApi (entra na quota). */
  contaMetaApi: boolean
  /** Para que serve: «Tap to Trade», «MTM Auto · Premium Gold», «Destino do copiador MTM Funded»… */
  usos: string[]
  saldo: number | null
  acoes: {
    editarCredenciais: boolean
    pausar: boolean
    retomar: boolean
    remover: boolean
    /** Quando a gestão desta conta só se faz na app MTM Auto (TradeLocker/MTM Funded de lá). */
    gerirNaAppMtmAuto: boolean
  }
}

const txt = (v: unknown) => (v == null || v === '' ? null : String(v))

function plataformaDe(v: unknown): PlataformaConta {
  const p = String(v ?? 'mt5').toLowerCase()
  return p === 'mt4' || p === 'tradelocker' || p === 'mtmfunded' ? p : 'mt5'
}

function estadoDe(bruto: unknown, ativa: boolean, soLeitura: boolean): EstadoConta {
  if (soLeitura) return 'so_leitura'
  const e = String(bruto ?? '').toLowerCase()
  if (e === 'error') return 'erro'
  if (e === 'pending' || e === 'deploying' || e === 'connecting') return 'a_ligar'
  if (!ativa) return 'pausada'
  return e === 'connected' ? 'ligada' : 'a_ligar'
}

const demoPeloNome = (s: unknown) => /\b(demo|trial|practice|paper|contest)\b/i.test(String(s ?? ''))

export async function listarContasUnificadas(userId: string): Promise<ContaUnificada[]> {
  const db = getSupabaseAdmin()
  const [{ data: site }, { data: auto }, { data: subs }, { data: copiadores }] = await Promise.all([
    db.from('mtmcopy_connections').select('*').eq('user_id', userId).neq('mt5_status', 'disconnected').order('created_at'),
    db.from('mtmauto_accounts').select('*').eq('user_id', userId).order('created_at'),
    db.from('mtmauto_subscriptions').select('conta_id, provider_id, ativo').eq('user_id', userId).eq('ativo', true),
    db.from('funded_copiers').select('destino_tipo, destino_id, ativo').eq('user_id', userId).eq('ativo', true),
  ])

  const provIds = [...new Set((subs ?? []).map((s) => String(s.provider_id)))]
  const nomeProv = new Map<string, string>()
  if (provIds.length) {
    const { data: provs } = await db.from('mtmauto_providers').select('id, nome, slug').in('id', provIds)
    for (const p of provs ?? []) nomeProv.set(String(p.id), String(p.nome ?? p.slug))
  }
  const destinoCopiador = new Set((copiadores ?? []).map((c) => `${c.destino_tipo}:${c.destino_id}`))

  const contas: ContaUnificada[] = []

  for (const c of (site ?? []) as Record<string, unknown>[]) {
    const plataforma = plataformaDe(c.mt5_platform)
    const soLeitura = plataforma === 'mtmfunded' && c.funded_somente_leitura === true
    const ativa = c.is_active !== false
    const t2t = c.purpose === 'tap_to_trade' || c.t2t_enabled === true
    const usos: string[] = []
    if (t2t) usos.push(c.t2t_enabled === false ? 'Tap to Trade (desligado nesta conta)' : 'Tap to Trade')
    if (c.purpose !== 'tap_to_trade') {
      usos.push(c.copyfactory_strategy_pick ? `MTM Auto · estratégia ${String(c.copyfactory_strategy_pick)}` : 'MTM Auto (cópia)')
    }
    if (destinoCopiador.has(`mtmcopy:${c.id}`) || (plataforma === 'tradelocker' && destinoCopiador.has(`tradelocker:${c.id}`))) {
      usos.push('Destino do copiador MTM Funded')
    }
    const metaApi = ehContaMetaApi({
      metaapi_account_id: txt(c.metaapi_account_id),
      login: txt(c.mt5_login),
      plataforma,
      estado: txt(c.mt5_status),
    })
    contas.push({
      chave: `site:${c.id}`,
      id: String(c.id),
      origem: 'site',
      plataforma,
      rotulo: txt(c.account_label),
      login: plataforma === 'tradelocker' ? txt(c.tl_acc_num) ?? txt(c.tl_account_id) : txt(c.mt5_login) ?? (c.mt5_login_last4 ? `••••${c.mt5_login_last4}` : null),
      servidor: plataforma === 'tradelocker' ? txt(c.tl_server) ?? txt(c.mt5_server) : txt(c.mt5_server),
      estado: estadoDe(c.mt5_status, ativa, soLeitura),
      erro: txt(c.last_error),
      demo: plataforma === 'tradelocker' ? c.tl_env === 'demo' : plataforma === 'mtmfunded' ? false : demoPeloNome(c.mt5_server),
      contaMetaApi: metaApi,
      usos,
      saldo: typeof c.balance === 'number' ? c.balance : null,
      acoes: {
        editarCredenciais: plataforma === 'mt5' || plataforma === 'mt4',
        pausar: ativa && !soLeitura,
        retomar: !ativa && !soLeitura,
        remover: true,
        gerirNaAppMtmAuto: false,
      },
    })
  }

  for (const c of (auto ?? []) as Record<string, unknown>[]) {
    const plataforma = plataformaDe(c.plataforma)
    const funded = plataforma === 'mtmfunded'
    const soLeitura = funded && c.funded_somente_leitura === true
    const ativa = c.copia_ativa !== false
    const usos = ['MTM Auto']
    for (const s of subs ?? []) {
      if (String(s.conta_id ?? '') === String(c.id)) usos.push(`Estratégia ${nomeProv.get(String(s.provider_id)) ?? '—'}`)
    }
    if (destinoCopiador.has(`mtmauto:${c.id}`)) usos.push('Destino do copiador MTM Funded')
    const metaTrader = plataforma === 'mt5' || plataforma === 'mt4'
    contas.push({
      chave: `auto:${c.id}`,
      id: String(c.id),
      origem: 'auto',
      plataforma,
      rotulo: txt(c.rotulo) ?? txt(c.corretora),
      login: plataforma === 'tradelocker' ? txt(c.tl_acc_num) ?? txt(c.login) : txt(c.login),
      servidor: txt(c.servidor),
      estado: estadoDe(c.estado, ativa, soLeitura),
      erro: txt(c.erro) ?? txt(c.tl_last_error),
      demo: Boolean(c.demo),
      contaMetaApi: ehContaMetaApi({
        metaapi_account_id: txt(c.metaapi_account_id),
        login: txt(c.login),
        plataforma,
        estado: txt(c.estado),
      }),
      usos,
      saldo: null,
      acoes: {
        editarCredenciais: metaTrader && Boolean(c.metaapi_account_id),
        pausar: metaTrader && ativa,
        retomar: metaTrader && !ativa,
        remover: metaTrader,
        gerirNaAppMtmAuto: !metaTrader,
      },
    })
  }

  return contas
}

/** Parte `site:<uuid>` / `auto:<uuid>`. */
export function lerChave(chave: unknown): { origem: OrigemConta; id: string } | null {
  const m = /^(site|auto):([0-9a-f-]{36})$/i.exec(String(chave ?? ''))
  return m ? { origem: m[1] as OrigemConta, id: m[2] } : null
}

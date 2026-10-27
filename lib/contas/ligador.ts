import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ehContaMetaApi } from '@/lib/contas/quota-metaapi'
import { etiquetaDaLinha } from '@/lib/contas/etiqueta'
import { rotuloUsoT2T } from '@/lib/mtmcopy/alvo-t2t'
import { chaveDoSaldo } from '@/lib/copia-contas/servidor/saldos-lidos'

/**
 * «As minhas contas» — a lista única de contas de um utilizador, dos dois produtos.
 *
 * Lê `mtmcopy_connections` (Tap to Trade no site/app-mobile, contas de cópia antigas, TradeLocker,
 * MTM Funded) e `mtmauto_accounts` (app MTM Auto). Nunca devolve passwords, nem cifradas.
 */

export type PlataformaConta = 'mt5' | 'mt4' | 'tradelocker' | 'mtmfunded'
export type EstadoConta = 'ligada' | 'a_ligar' | 'erro' | 'so_leitura' | 'pausada'
/** `wt` = conta MT5 aberta só no WebTrader (webtrader_contas_mt5, migração 076). */
export type OrigemConta = 'site' | 'auto' | 'wt'

export interface ContaUnificada {
  /** `site:<uuid>` ou `auto:<uuid>` — a origem viaja no id para as acções. */
  chave: string
  id: string
  origem: OrigemConta
  plataforma: PlataformaConta
  rotulo: string | null
  /** 113 — a etiqueta que o DONO pôs nesta conta (manda sobre `rotulo` no que se mostra). */
  etiquetaDoDono: string | null
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
  /** Equity: MTM Funded pelo motor; corretora pela última leitura guardada (216 · contas_saldo_lido). */
  equity: number | null
  /** Quando o capital/equity da corretora foi lido (216). null = MTM Funded ou nunca lido. */
  saldoLidoEm: string | null
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
  const [{ data: site }, { data: auto }, { data: subs }, { data: copiadores }, webtrader] = await Promise.all([
    db.from('mtmcopy_connections').select('*').eq('user_id', userId).neq('mt5_status', 'disconnected').order('created_at'),
    db.from('mtmauto_accounts').select('*').eq('user_id', userId).order('created_at'),
    db.from('mtmauto_subscriptions').select('conta_id, provider_id, ativo').eq('user_id', userId).eq('ativo', true),
    db.from('funded_copiers').select('destino_tipo, destino_id, ativo').eq('user_id', userId).eq('ativo', true),
    // 076 por aplicar → erro → sem linhas do WebTrader.
    db.from('webtrader_contas_mt5').select('*').eq('user_id', userId).order('created_at'),
  ])

  const provIds = [...new Set((subs ?? []).map((s) => String(s.provider_id)))]
  const nomeProv = new Map<string, string>()
  if (provIds.length) {
    const { data: provs } = await db.from('mtmauto_providers').select('id, nome, slug').in('id', provIds)
    for (const p of provs ?? []) nomeProv.set(String(p.id), String(p.nome ?? p.slug))
  }
  const destinoCopiador = new Set((copiadores ?? []).map((c) => `${c.destino_tipo}:${c.destino_id}`))

  const contas: ContaUnificada[] = []
  // Para o capital/equity no fim: a conta MetaApi (chave do saldo lido) e a conta MTM Funded ligada.
  const extra = new Map<string, { metaapiAccountId: string | null; fundedAccountId: string | null }>()

  for (const c of (site ?? []) as Record<string, unknown>[]) {
    const plataforma = plataformaDe(c.mt5_platform)
    const soLeitura = plataforma === 'mtmfunded' && c.funded_somente_leitura === true
    const ativa = c.is_active !== false
    const usos: string[] = []
    const usoT2T = rotuloUsoT2T(c as { purpose?: string | null; t2t_enabled?: boolean | null })
    if (usoT2T) usos.push(usoT2T)
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
    extra.set(`site:${c.id}`, { metaapiAccountId: txt(c.metaapi_account_id), fundedAccountId: txt(c.funded_account_id) })
    contas.push({
      chave: `site:${c.id}`,
      id: String(c.id),
      origem: 'site',
      plataforma,
      rotulo: txt(c.account_label),
      etiquetaDoDono: etiquetaDaLinha(c),
      login: plataforma === 'tradelocker' ? txt(c.tl_acc_num) ?? txt(c.tl_account_id) : txt(c.mt5_login) ?? (c.mt5_login_last4 ? `••••${c.mt5_login_last4}` : null),
      servidor: plataforma === 'tradelocker' ? txt(c.tl_server) ?? txt(c.mt5_server) : txt(c.mt5_server),
      estado: estadoDe(c.mt5_status, ativa, soLeitura),
      erro: txt(c.last_error),
      demo: plataforma === 'tradelocker' ? c.tl_env === 'demo' : plataforma === 'mtmfunded' ? false : demoPeloNome(c.mt5_server),
      contaMetaApi: metaApi,
      usos,
      saldo: typeof c.balance === 'number' ? c.balance : null,
      equity: null,
      saldoLidoEm: null,
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
    extra.set(`auto:${c.id}`, { metaapiAccountId: txt(c.metaapi_account_id), fundedAccountId: txt(c.funded_account_id) })
    contas.push({
      chave: `auto:${c.id}`,
      id: String(c.id),
      origem: 'auto',
      plataforma,
      rotulo: txt(c.rotulo) ?? txt(c.corretora),
      etiquetaDoDono: etiquetaDaLinha(c),
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
      equity: null,
      saldoLidoEm: null,
      acoes: {
        editarCredenciais: metaTrader && Boolean(c.metaapi_account_id),
        pausar: metaTrader && ativa,
        retomar: metaTrader && !ativa,
        remover: metaTrader,
        gerirNaAppMtmAuto: !metaTrader,
      },
    })
  }

  for (const c of (webtrader.error ? [] : webtrader.data ?? []) as Record<string, unknown>[]) {
    extra.set(`wt:${c.id}`, { metaapiAccountId: txt(c.metaapi_account_id), fundedAccountId: null })
    contas.push({
      chave: `wt:${c.id}`,
      id: String(c.id),
      origem: 'wt',
      plataforma: c.plataforma === 'mt4' ? 'mt4' : 'mt5',
      rotulo: txt(c.rotulo),
      etiquetaDoDono: etiquetaDaLinha(c),
      login: txt(c.login),
      servidor: txt(c.servidor),
      estado: c.estado === 'error' ? 'erro' : c.estado === 'pending' ? 'a_ligar' : 'ligada',
      erro: txt(c.erro),
      demo: demoPeloNome(c.servidor),
      contaMetaApi: ehContaMetaApi({ metaapi_account_id: txt(c.metaapi_account_id), login: txt(c.login), plataforma: 'mt5', estado: txt(c.estado) }),
      usos: ['WebTrader'],
      saldo: null,
      equity: null,
      saldoLidoEm: null,
      acoes: { editarCredenciais: false, pausar: false, retomar: false, remover: true, gerirNaAppMtmAuto: false },
    })
  }

  await juntarCapitalEquity(contas, extra)
  return contas
}

/**
 * Capital e equity em todas as linhas, sem chamar a MetaApi: MTM Funded pelo motor
 * (`sim_saldo`/`sim_equity`), corretora pela última leitura guardada (216). As MESMAS fontes do
 * Centro e do /admin/mtmcopy, para os números baterem entre ecrãs. Falhar aqui nunca parte a lista.
 */
async function juntarCapitalEquity(contas: ContaUnificada[], extra: Map<string, { metaapiAccountId: string | null; fundedAccountId: string | null }>) {
  const db = getSupabaseAdmin()
  const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  const chaveDe = (c: ContaUnificada) => chaveDoSaldo({ ref: c.chave, plataforma: c.plataforma, metaapiAccountId: extra.get(c.chave)?.metaapiAccountId })
  const chaves = [...new Set(contas.map(chaveDe).filter((k): k is string => Boolean(k)))]
  const fundedIds = [...new Set(contas.filter((c) => c.plataforma === 'mtmfunded').map((c) => extra.get(c.chave)?.fundedAccountId).filter((x): x is string => Boolean(x)))]
  try {
    const [lidos, funded] = await Promise.all([
      chaves.length ? db.from('contas_saldo_lido').select('chave, saldo, equity, lido_em').in('chave', chaves) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      fundedIds.length ? db.from('mtm_trading_accounts').select('id, sim_saldo, sim_equity').in('id', fundedIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ])
    const porChave = new Map(((lidos.data ?? []) as Record<string, unknown>[]).map((l) => [String(l.chave), l]))
    const porFunded = new Map(((funded.data ?? []) as Record<string, unknown>[]).map((f) => [String(f.id), f]))
    for (const c of contas) {
      if (c.plataforma === 'mtmfunded') {
        const f = porFunded.get(extra.get(c.chave)?.fundedAccountId ?? '')
        if (f) Object.assign(c, { saldo: num(f.sim_saldo) ?? c.saldo, equity: num(f.sim_equity) ?? num(f.sim_saldo) })
        continue
      }
      const k = chaveDe(c)
      const l = k ? porChave.get(k) : undefined
      if (l) Object.assign(c, { saldo: num(l.saldo) ?? c.saldo, equity: num(l.equity), saldoLidoEm: txt(l.lido_em) })
    }
  } catch {
    // Sem 216 aplicada ou base lenta: a lista sai na mesma, só sem capital/equity.
  }
}

/** Parte `site:<uuid>` / `auto:<uuid>` / `wt:<uuid>`. */
export function lerChave(chave: unknown): { origem: OrigemConta; id: string } | null {
  const m = /^(site|auto|wt):([0-9a-f-]{36})$/i.exec(String(chave ?? ''))
  return m ? { origem: m[1] as OrigemConta, id: m[2] } : null
}

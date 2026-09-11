import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { chavesDaFonte } from './chaves-de-fonte'

/**
 * O DESEMPENHO DE UMA ESTRATÉGIA — uma fonte só, para todas as superfícies.
 *
 * Existe porque o mesmo número aparece no /admin, na app MTM Auto, no MTM System e no site, e
 * até aqui cada um somava o seu. Números que deviam ser iguais e não eram é o que faz alguém
 * deixar de acreditar em todos eles.
 *
 * ── O QUE SE ACUMULA, E PORQUÊ ASSIM ─────────────────────────────────────────
 *
 * As contas mestre são novas; as estratégias não. O histórico pertence à ESTRATÉGIA — foi ela
 * que produziu os sinais, em contas que entretanto foram substituídas — e é por isso que o
 * acumulado atravessa as contas.
 *
 * Mas atravessa DECLARADAMENTE: cada bloco diz de onde vem. Dizer que uma conta aberta hoje
 * fez +1.953 pips seria o mesmo género de número que foi mandado tirar do site, e um dia
 * alguém pede o extracto dessa conta.
 *
 * ── O QUE O CLIENTE VÊ ───────────────────────────────────────────────────────
 *
 * Pips e percentagem. NUNCA saldos nem equity — nem da conta mestre, nem de ninguém. Um saldo
 * numa página de cliente é informação da casa, não dele; e a regra da marca é provar em pips,
 * não em dinheiro. O `admin: true` é a única porta para esses números, e é explícita.
 *
 * ── O QUE ESTES NÚMEROS SÃO, E O QUE NÃO SÃO ─────────────────────────────────
 *
 * Saem de `mtmcopy_signal_tracking`, que mede IDEIAS: cada sinal ganha um desfecho tudo-ou-nada
 * — bateu no alvo ou bateu no stop. Não conta parciais. Uma posição que fechou metade no
 * primeiro alvo e o resto no break-even entra aqui como «stop», e o lucro já embolsado
 * desaparece. É por isso que o acerto medido assim dá sistematicamente abaixo do real.
 *
 * O instrumento honesto existe e é outro: a conta-espelho do `signal-tracker`, que abre TODOS
 * os sinais publicados a 0,03 lotes para que os parciais sejam reais, e grava cada saída em
 * `mtmcopy_trade_exits`. Só que essa conta está parada desde 2026-08-26 — a rota existe, o cron
 * nunca foi agendado — e por isso não há hoje desempenho por estratégia que se possa publicar.
 *
 * Daí o `fiavel` em cada bloco. Não é decoração: é a diferença entre um número que se mostra a
 * um cliente e um número que serve para a casa decidir. Quem desenhar um ecrã com isto tem de o
 * ler — publicar «19% de acerto» ao lado do nome de uma estratégia, sabendo que o instrumento
 * não conta metade do que ela ganhou, é publicar uma coisa falsa.
 */

export interface BlocoDesempenho {
  sinais: number
  pipsTotal: number
  pipsMedia: number
  acertoPct: number
  desde: string | null
  ate: string | null
  /**
   * Estes números contam os parciais?
   *
   * Hoje é sempre `false`, porque a medição vem do registo de ideias (tudo-ou-nada). Fica como
   * campo, e não como comentário, porque é isto que um ecrã tem de consultar antes de escolher
   * mostrar uma taxa de acerto — e um comentário não obriga ninguém a decidir.
   */
  fiavel: boolean
  /** Em linguagem de gente, porque é que não é fiável. Vazio quando for. */
  porqueNaoFiavel: string | null
}

/** A explicação, num sítio só — aparece em todas as superfícies com as mesmas palavras. */
export const PORQUE_NAO_FIAVEL =
  'Mede-se sinal a sinal, tudo-ou-nada: bateu no alvo ou bateu no stop. Não conta as saídas ' +
  'parciais, por isso uma posição que fechou metade em lucro e o resto no break-even entra aqui ' +
  'como perda. O acerto verdadeiro é mais alto do que este.'

export interface DesempenhoEstrategia {
  slug: string
  nome: string
  ativo: boolean
  /** O acumulado da estratégia — contas anteriores e a actual, somadas. */
  total: BlocoDesempenho
  /** De onde vêm os números do total. É o que impede o acumulado de parecer de uma conta só. */
  proveniencia: Array<{ fonte: string; sinais: number; pips: number; ate: string | null }>
  /** A conta mestre de agora. Saldos só com `admin`. */
  contaMestre: {
    login: string | null
    desde: string | null
    ligadaMetaApi: boolean
    estrategiaCf: string | null
    /** Só para admin. */
    saldo?: number | null
    equity?: number | null
  } | null
  regras: {
    riscoPct: number | null
    bePips: number | null
    trailingPips: number | null
    saidasPct: number[] | null
    porque: string | null
  }
  subscritores: number
}


function vazio(): BlocoDesempenho {
  return {
    sinais: 0, pipsTotal: 0, pipsMedia: 0, acertoPct: 0, desde: null, ate: null,
    fiavel: false, porqueNaoFiavel: PORQUE_NAO_FIAVEL,
  }
}

export async function desempenhoDaEstrategia(
  slug: string,
  opts?: { admin?: boolean },
): Promise<DesempenhoEstrategia | null> {
  const db = getSupabaseAdmin()

  const { data: provider } = await db
    .from('mtmauto_providers')
    .select('id, slug, nome, ativo, fonte_mtm, metaapi_account_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!provider) return null

  const chaves = chavesDaFonte(slug, provider.fonte_mtm as string | null)

  const [{ data: sinais }, { data: conta }, { count: subs }] = await Promise.all([
    db
      .from('mtmcopy_signal_tracking')
      .select('source_key, result_pips, created_at')
      .in('source_key', chaves)
      .eq('status', 'closed')
      .not('result_pips', 'is', null),
    db
      .from('mtm_trading_accounts')
      .select('mt5_login, created_at, metaapi_account_id, metricas')
      .eq('tipo', 'provider')
      .eq('provider_slug', slug)
      .maybeSingle(),
    db
      .from('mtmauto_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', provider.id)
      .eq('ativo', true),
  ])

  // ── o acumulado ───────────────────────────────────────────────────────────
  const linhas = sinais ?? []
  const total = vazio()
  const porFonte = new Map<string, { sinais: number; pips: number; ate: string | null }>()

  for (const s of linhas) {
    const pips = Number(s.result_pips ?? 0)
    total.sinais++
    total.pipsTotal += pips
    if (pips > 0) total.acertoPct++
    const t = s.created_at as string
    if (!total.desde || t < total.desde) total.desde = t
    if (!total.ate || t > total.ate) total.ate = t

    const k = String(s.source_key ?? '—')
    const f = porFonte.get(k) ?? { sinais: 0, pips: 0, ate: null }
    f.sinais++
    f.pips += pips
    if (!f.ate || t > f.ate) f.ate = t
    porFonte.set(k, f)
  }

  if (total.sinais) {
    total.acertoPct = Math.round((total.acertoPct / total.sinais) * 1000) / 10
    total.pipsMedia = Math.round((total.pipsTotal / total.sinais) * 10) / 10
    total.pipsTotal = Math.round(total.pipsTotal * 10) / 10
  }

  const metricas = (conta?.metricas ?? {}) as Record<string, unknown>

  /**
   * O SALDO, só com `admin`.
   *
   * Não é um filtro no ecrã: o número nem chega a ser lido quando quem pergunta não é admin.
   * Esconder no cliente deixava-o no HTML, e uma equity de conta mestre no HTML de uma página
   * pública é informação da casa a passear.
   */
  let saldo: number | null | undefined
  let equity: number | null | undefined
  if (opts?.admin && conta?.metaapi_account_id && process.env.METAAPI_TOKEN) {
    try {
      const r = await fetch(
        `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${conta.metaapi_account_id}/account-information`,
        { headers: { 'auth-token': process.env.METAAPI_TOKEN }, cache: 'no-store', signal: AbortSignal.timeout(10_000) },
      )
      if (r.ok) {
        const d = (await r.json()) as { balance?: number; equity?: number }
        saldo = d.balance ?? null
        equity = d.equity ?? null
      }
    } catch {
      saldo = null
      equity = null
    }
  }

  return {
    slug,
    nome: (provider.nome as string) ?? slug,
    ativo: Boolean(provider.ativo),
    total,
    proveniencia: [...porFonte.entries()]
      .map(([fonte, v]) => ({ fonte, sinais: v.sinais, pips: Math.round(v.pips * 10) / 10, ate: v.ate }))
      .sort((a, b) => b.sinais - a.sinais),
    contaMestre: conta
      ? {
          login: (conta.mt5_login as string) ?? null,
          desde: (conta.created_at as string) ?? null,
          ligadaMetaApi: Boolean(conta.metaapi_account_id),
          estrategiaCf: (metricas.strategy_id as string) ?? null,
          ...(opts?.admin ? { saldo, equity } : {}),
        }
      : null,
    regras: {
      riscoPct: metricas.risco_pct != null ? Number(metricas.risco_pct) : null,
      bePips: metricas.be_pips != null ? Number(metricas.be_pips) : null,
      trailingPips: metricas.trailing_pips != null ? Number(metricas.trailing_pips) : null,
      saidasPct: Array.isArray(metricas.saidas_pct) ? (metricas.saidas_pct as number[]) : null,
      porque: (metricas.risco_porque as string) ?? null,
    },
    subscritores: subs ?? 0,
  }
}

/** Todas as estratégias, para os painéis que as listam. */
export async function desempenhoDeTodas(opts?: { admin?: boolean }): Promise<DesempenhoEstrategia[]> {
  const db = getSupabaseAdmin()
  const { data: providers } = await db.from('mtmauto_providers').select('slug').order('nome')
  const saida: DesempenhoEstrategia[] = []
  for (const p of providers ?? []) {
    const d = await desempenhoDaEstrategia(p.slug as string, opts)
    if (d) saida.push(d)
  }
  return saida
}

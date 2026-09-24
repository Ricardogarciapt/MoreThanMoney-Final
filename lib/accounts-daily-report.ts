/**
 * RELATÓRIO DIÁRIO das contas reais (equidade, P&L do dia/mês, win rate, profit factor).
 * Fonte: MetaStats da MetaApi (REST — não precisa de sincronização RPC, funciona com contas ociosas
 * desde que tenham histórico). Corre no cron diário, grava em site_settings.accounts_daily_report e
 * envia o resumo ao Ricardo por Telegram.
 *
 * ⚠️ Sobre os números: `profit`/`gain` do MetaStats são ACUMULADOS DE VIDA e ficam distorcidos por
 * depósitos/levantamentos (ver proof-stats). Por isso o relatório usa o P&L do DIA e do MÊS (soma do
 * dailyGrowth, imune a essas operações) e trata gain%/drawdown como indicativos, não publicáveis.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const KEY = 'accounts_daily_report'
const REGIONS = ['london', 'new-york']

export interface AccountDay {
  label: string
  accountId: string
  balance: number | null
  equity: number | null
  pnlToday: number
  pnlMonth: number
  trades: number | null
  winRatePct: number | null
  profitFactor: number | null
  ok: boolean
  note?: string
}

/**
 * O DINHEIRO REAL — o que vai na mensagem do Telegram.
 *
 * `accounts` acima é o inventário completo (serve o /admin, o artefacto e as métricas de
 * publicação). A mensagem diária é outra coisa: é o dono a perguntar «como está o meu dinheiro e
 * o dos clientes que confiaram em nós». Mestres, desafios e financiadas de avaliação não são
 * dinheiro de ninguém — enchiam a mensagem com 28 linhas quase todas a +0,00.
 */
export type GrupoConta = 'minhas' | 'clientes'

export interface LinhaDinheiroReal {
  grupo: GrupoConta
  etiqueta: string
  equity: number
  pnlToday: number
  /** Null quando não há histórico para o medir — melhor um traço do que um zero mentiroso. */
  pnlMonth: number | null
  /** A conta existe mas não deu leitura. Sem isto, uma equidade em branco lia-se como conta vazia. */
  semLeitura?: boolean
}

export interface SeccaoContas {
  grupo: GrupoConta
  titulo: string
  linhas: LinhaDinheiroReal[]
  equity: number
  pnlToday: number
  pnlMonth: number | null
}

export interface DailyReport {
  date: string
  accounts: AccountDay[]
  totals: { equity: number; pnlToday: number; pnlMonth: number; trades: number }
  /**
   * As contas que são dinheiro real, já separadas por dono. Opcional porque um relatório
   * gravado antes desta mudança não a tem — e a mensagem sabe cair para o formato antigo.
   */
  dinheiroReal?: LinhaDinheiroReal[]
  generatedAt: string
}

async function metastats(accountId: string, token: string): Promise<Record<string, unknown> | null> {
  for (const r of REGIONS) {
    try {
      const res = await fetch(`https://metastats-api-v1.${r}.agiliumtrade.ai/users/current/accounts/${accountId}/metrics`, {
        headers: { 'auth-token': token },
        signal: AbortSignal.timeout(12000),
      })
      if (!res.ok) continue
      const j = (await res.json().catch(() => null)) as { metrics?: Record<string, unknown> } | null
      if (j?.metrics) return j.metrics
    } catch {
      /* tenta a região seguinte */
    }
  }
  return null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * As métricas de PUBLICAÇÃO (lib/inspiring-metrics.ts: dia verde, profit factor, win rate) só
 * podem vir de ligações a contas MetaApi de corretora. Uma ligação a uma conta MTM Funded
 * (`funded_account_id` — as contas da casa, incluindo a «Todos os sinais») nunca entra por aqui,
 * mesmo que um dia ganhe um id MetaApi: essas contas contam só na equidade (ver `linhaDeEquidade`).
 */
export function ligacaoEntraNasMetricas(c: { metaapi_account_id?: string | null; funded_account_id?: string | null }): boolean {
  return Boolean(c.metaapi_account_id) && !c.funded_account_id
}

/**
 * Uma conta do MTM Funded no relatório: SÓ equidade. P&L, trades, win rate e profit factor ficam a
 * zero/nulo de propósito — as contas da casa (reais ou não) não podem pintar o «dia verde» nem o
 * profit factor publicado. A equity que entra na soma já é a contribuição (factor aplicado); o
 * valor de face fica em `balance`, e a razão do factor (10%, 100% real da casa, 0% mestre
 * representada pelo espelho) em `note`.
 */
export function linhaDeEquidade(f: { etiqueta: string; metaapiId: string | null; valorNominal: number; contribuicao: number; nota: string }): AccountDay {
  return {
    label: f.etiqueta,
    accountId: f.metaapiId ?? '',
    balance: f.valorNominal,
    equity: f.contribuicao,
    pnlToday: 0,
    pnlMonth: 0,
    trades: null,
    winRatePct: null,
    profitFactor: null,
    ok: true,
    note: f.nota,
  }
}

/** Totais do relatório (puro) — o que a lib/inspiring-metrics.ts lê. */
export function totaisDoRelatorio(accounts: AccountDay[]): DailyReport['totals'] {
  const live = accounts.filter((a) => a.ok)
  return {
    equity: Number(live.reduce((a, x) => a + (x.equity ?? 0), 0).toFixed(2)),
    pnlToday: Number(live.reduce((a, x) => a + x.pnlToday, 0).toFixed(2)),
    pnlMonth: Number(live.reduce((a, x) => a + x.pnlMonth, 0).toFixed(2)),
    trades: live.reduce((a, x) => a + (x.trades ?? 0), 0),
  }
}

// ───────────────────────── O DINHEIRO REAL (o que vai no Telegram) ─────────────────────────

/**
 * A conta está num servidor de DEMO?
 *
 * O nome do servidor é o que a corretora declara e é o único sinal que temos em
 * `mtmcopy_connections` — não há coluna de ambiente. «VTMarkets-Demo» é demo, «PUPrime-Live 6»
 * não é. Uma conta de prop firm (FXIFY) é ambiente real: o capital é de terceiros, mas as ordens
 * são reais e o cliente responde por elas.
 */
export function ehServidorDemo(servidor?: string | null): boolean {
  return /\b(demo|practice|trial)\b/i.test(String(servidor ?? '').replace(/[-_]/g, ' '))
}

/** O que se lê de `mtm_trading_accounts` para decidir se a conta é dinheiro de alguém. */
export interface ContaMtmFunded {
  mt5_login?: string | null
  tipo?: string | null
  conta_real_casa?: boolean | null
  etiqueta?: string | null
  saldo_inicial?: number | null
  sim_equity?: number | null
  sim_saldo?: number | null
  sim_ancora_dia?: number | null
  metricas?: { lucroPorDia?: Record<string, number> | null } | null
}

/**
 * Pura: uma conta do MTM Funded vira linha de dinheiro real — ou não vira nenhuma.
 *
 * ENTRAM: `tipo = 'real'` (dinheiro do próprio cliente, ou a conta pessoal do dono) e as
 * financiadas marcadas `conta_real_casa` (as de 1K que o dono declarou reais).
 *
 * FICAM DE FORA, e cada uma por uma razão diferente:
 *  · `provider` — as mestres são demo a dimensionar a cópia, não património de ninguém;
 *  · `desafio` / `torneio` — avaliações em dinheiro virtual que podem acabar amanhã;
 *  · `financiada` sem `conta_real_casa` — as contas do produto, que contam 10% (as tais linhas
 *    de «100» que enchiam a mensagem com +0,00 e não são dinheiro que alguém possa levantar).
 */
export function linhaDeContaMtmFunded(
  c: ContaMtmFunded,
  hoje: string,
  nome?: string | null,
): LinhaDinheiroReal | null {
  const daCasa = c.conta_real_casa === true
  const tipo = String(c.tipo ?? '')
  if (tipo !== 'real' && !(tipo === 'financiada' && daCasa)) return null

  const equity = Number(c.sim_equity ?? c.sim_saldo ?? c.saldo_inicial ?? 0)
  const porDia = c.metricas?.lucroPorDia ?? null

  /**
   * O dia vem do `lucroPorDia` do motor. Sem ele, cai na âncora — a equidade com que a conta
   * abriu o dia. É a mesma conta feita de outra maneira, e é melhor do que zero: era o zero
   * fixo do `linhaDeEquidade` que fazia a mensagem antiga parecer um cemitério.
   */
  const doDia = porDia && typeof porDia[hoje] === 'number'
    ? porDia[hoje]
    : Number.isFinite(Number(c.sim_ancora_dia)) && Number(c.sim_ancora_dia) > 0
      ? equity - Number(c.sim_ancora_dia)
      : 0

  // O mês só se soma se houver dias do mês medidos; senão é um traço, não um zero.
  const mes = hoje.slice(0, 7)
  const diasDoMes = porDia ? Object.entries(porDia).filter(([d]) => d.startsWith(mes)) : []
  const doMes = diasDoMes.length ? diasDoMes.reduce((a, [, v]) => a + Number(v ?? 0), 0) : null

  /**
   * Numa conta de cliente manda o NOME da pessoa; numa conta da casa manda a etiqueta.
   * «Real · 77287630» não diz a ninguém de quem é a conta; «Sensei» diz tudo sobre a do dono.
   */
  const etiqueta = daCasa
    ? c.etiqueta?.trim() || nome?.trim() || `Conta ${c.mt5_login ?? '—'}`
    : nome?.trim() || c.etiqueta?.trim() || `Conta ${c.mt5_login ?? '—'}`
  return {
    grupo: daCasa ? 'minhas' : 'clientes',
    etiqueta: `${etiqueta} · ${c.mt5_login ?? '—'}`,
    equity: Math.round(equity * 100) / 100,
    pnlToday: Math.round(doDia * 100) / 100,
    pnlMonth: doMes == null ? null : Math.round(doMes * 100) / 100,
  }
}

/** Pura: arruma as linhas em secções, com o total DE CADA UMA (é o que se lê de relance). */
export function seccoesDoDinheiroReal(linhas: LinhaDinheiroReal[]): SeccaoContas[] {
  const titulos: Record<GrupoConta, string> = {
    minhas: '🏠 As tuas',
    clientes: '👥 Clientes — real',
  }
  const saida: SeccaoContas[] = []
  for (const grupo of ['minhas', 'clientes'] as GrupoConta[]) {
    const desta = linhas.filter((l) => l.grupo === grupo)
    if (!desta.length) continue // secção vazia não se imprime
    const comMes = desta.filter((l) => l.pnlMonth != null)
    saida.push({
      grupo,
      titulo: titulos[grupo],
      // Maior primeiro: quem tem mais dinheiro em jogo é quem se vê primeiro.
      linhas: [...desta].sort((a, b) => b.equity - a.equity),
      equity: Number(desta.reduce((a, l) => a + l.equity, 0).toFixed(2)),
      pnlToday: Number(desta.reduce((a, l) => a + l.pnlToday, 0).toFixed(2)),
      pnlMonth: comMes.length ? Number(comMes.reduce((a, l) => a + (l.pnlMonth ?? 0), 0).toFixed(2)) : null,
    })
  }
  return saida
}

/** Constrói o relatório do dia a partir das ligações ativas com conta MetaApi. */
export async function buildDailyReport(): Promise<DailyReport> {
  const token = process.env.METAAPI_TOKEN?.trim() || ''
  const admin = getSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)
  const month = today.slice(0, 7)

  const { data: conns } = await admin
    .from('mtmcopy_connections')
    // `mt5_server` entra na leitura para separar o ambiente real do demo (ver `ehServidorDemo`).
    .select('account_label, metaapi_account_id, funded_account_id, is_active, mt5_server')
    .not('metaapi_account_id', 'is', null)
    .eq('is_active', true)
    .neq('mt5_status', 'disconnected')
    // Contas marcadas como fora das métricas continuam a operar, mas não entram no relatório.
    .eq('metrics_excluded', false)
    .limit(30)

  const accounts: AccountDay[] = []
  /**
   * As ligações de CLIENTE que estão em ambiente real, para a mensagem do Telegram.
   *
   * São as que mais interessam ao dono e eram as que ele não via: as que a MetaStats não
   * responde saíam da mensagem antiga (`ok: false` → filtradas), e as que respondiam ficavam
   * perdidas no meio das mestres. Aqui a equidade é a da MetaStats quando há, e o saldo visto
   * quando não há.
   */
  const clientesReais: LinhaDinheiroReal[] = []
  // Contas inexistentes na MetaApi ficam de fora (15/09: MetaStats a contas apagadas = NotFoundError).
  const { filtrarContasExistentes } = await import('@/lib/mtmcopy/metaapi-inexistentes')
  const existentes = new Set(await filtrarContasExistentes((conns ?? []).map((c) => (c as { metaapi_account_id: string }).metaapi_account_id)))
  for (const c of conns ?? []) {
    if (!ligacaoEntraNasMetricas(c as { metaapi_account_id?: string | null; funded_account_id?: string | null })) continue
    if (!existentes.has((c as { metaapi_account_id: string }).metaapi_account_id)) continue
    const label = (c as { account_label?: string | null }).account_label || 'Conta sem nome'
    const accountId = (c as { metaapi_account_id: string }).metaapi_account_id
    const real = !ehServidorDemo((c as { mt5_server?: string | null }).mt5_server)
    const m = token ? await metastats(accountId, token) : null
    if (!m) {
      accounts.push({ label, accountId, balance: null, equity: null, pnlToday: 0, pnlMonth: 0, trades: null, winRatePct: null, profitFactor: null, ok: false, note: 'sem métricas (conta ociosa)' })
      // Sem métricas continua a ser uma conta de cliente com dinheiro lá dentro: aparece na
      // mensagem com o dia a zero, em vez de desaparecer como desaparecia.
      if (real) clientesReais.push({ grupo: 'clientes', etiqueta: label, equity: 0, pnlToday: 0, pnlMonth: null, semLeitura: true })
      continue
    }
    const daily = Array.isArray(m.dailyGrowth) ? (m.dailyGrowth as Array<Record<string, unknown>>) : []
    const todayRow = daily.find((d) => String(d.date ?? '').slice(0, 10) === today)
    const pnlMonth = daily
      .filter((d) => String(d.date ?? '').slice(0, 7) === month)
      .reduce((a, d) => a + (num(d.profit) ?? 0), 0)
    accounts.push({
      label,
      accountId,
      balance: num(m.balance),
      equity: num(m.equity),
      pnlToday: Number((num(todayRow?.profit) ?? 0).toFixed(2)),
      pnlMonth: Number(pnlMonth.toFixed(2)),
      trades: num(m.trades),
      winRatePct: num(m.wonTradesPercent),
      profitFactor: num(m.profitFactor),
      ok: true,
    })
    if (real) {
      clientesReais.push({
        grupo: 'clientes',
        etiqueta: label,
        equity: Math.round((num(m.equity) ?? 0) * 100) / 100,
        pnlToday: Number((num(todayRow?.profit) ?? 0).toFixed(2)),
        pnlMonth: Number(pnlMonth.toFixed(2)),
      })
    }
  }

  /**
   * AS CONTAS DO MTM FUNDED entram aqui — e não pelo valor de face.
   *
   * Uma conta financiada de 10.000 USD vale 1.000 à MTM: a negociação é simulada e o que o
   * Fundo lhe afecta é 10% do nominal, que é a regra publicada do produto. Somá-las pelo valor
   * inteiro inflacionava a equidade em dez vezes, com um número que ninguém pode levantar.
   *
   * Os desafios e os torneios ficam de fora por completo — são provas em dinheiro virtual, e
   * contá-las seria dizer que há capital afecto a uma avaliação que pode acabar amanhã.
   *
   * Contas reais da casa (109): as de 1K a 100%, os espelhos de 10K a 10% e a mestre que o espelho
   * representa a 0% (lib/equidade-mtm.ts). Continuam a entrar SÓ pela equidade.
   */
  const { contasFundedNaEquidade } = await import('@/lib/equidade-mtm')
  const funded = await contasFundedNaEquidade().catch(() => [])
  for (const f of funded) accounts.push(linhaDeEquidade(f))

  /**
   * E as contas do MTM Funded que são dinheiro de alguém — as do dono e as dos clientes.
   *
   * Não vêm por `contasFundedNaEquidade` porque essa aplica o factor da equidade (10%, 0%) e
   * zera o P&L de propósito: serve para somar o património da MTM, não para dizer como correu o
   * dia a cada um. Aqui lê-se a conta como ela está, com o resultado do dia medido pelo motor.
   */
  const dinheiroReal: LinhaDinheiroReal[] = [...clientesReais]
  try {
    const { selecionarComOpcionais } = await import('@/lib/mtmfunded/numeros-conta')
    const { data: contas } = await selecionarComOpcionais<Record<string, unknown>>(
      // `conta_real_casa` e `etiqueta` vêm de graça — são colunas opcionais do `selecionarComOpcionais`.
      'id, user_id, mt5_login, tipo, saldo_inicial, sim_equity, sim_saldo, sim_ancora_dia, metricas',
      (cols) =>
        admin
          .from('mtm_trading_accounts')
          .select(cols)
          .in('tipo', ['real', 'financiada'])
          .eq('estado', 'ativa') as never,
    )
    // Os nomes dos clientes numa leitura só — uma linha «Conta 77505307» não diz a ninguém de quem é.
    const donos = Array.from(
      new Set((contas ?? []).map((c) => String((c as { user_id?: string }).user_id ?? '')).filter(Boolean)),
    )
    const nomes = new Map<string, string>()
    if (donos.length) {
      const { data: perfis } = await admin.from('profiles').select('id, full_name').in('id', donos)
      for (const p of perfis ?? []) {
        const nome = (p as { full_name?: string | null }).full_name
        if (nome) nomes.set(String((p as { id: string }).id), nome)
      }
    }
    for (const c of contas ?? []) {
      const linha = linhaDeContaMtmFunded(
        c as ContaMtmFunded,
        today,
        nomes.get(String((c as { user_id?: string }).user_id ?? '')) ?? null,
      )
      if (linha) dinheiroReal.push(linha)
    }
  } catch (e) {
    // A mensagem sai à mesma com o que houver — um erro aqui não pode calar o relatório todo.
    console.error('[accounts-daily-report] contas MTM Funded:', e)
  }

  const totals = totaisDoRelatorio(accounts)
  return { date: today, accounts, totals, dinheiroReal, generatedAt: new Date().toISOString() }
}

/** No máximo estas contas por secção — o resto conta-se numa linha. O Telegram não é um relatório. */
const MAX_LINHAS_POR_SECCAO = 12

/**
 * A mensagem diária das contas, para o Telegram.
 *
 * Duas secções («As tuas», «Clientes — real»), cada uma com o SEU total. Era isto que faltava: a
 * mensagem antiga dava um total geral onde o dinheiro do dono e o dos clientes iam misturados com
 * mestres e desafios, e ordenava pelo P&L do dia — o que punha em cima as contas que não tinham
 * mexido. Aqui manda a equidade: as contas com mais dinheiro em jogo aparecem primeiro.
 *
 * Texto simples de propósito — o cron envia sem `parse_mode`.
 */
export function reportSummary(r: DailyReport): string {
  const nf = (n: number) => new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  const sign = (n: number) => (n >= 0 ? `+${nf(n)}` : nf(n))
  const mes = (n: number | null) => (n == null ? '—' : sign(n))

  const seccoes = seccoesDoDinheiroReal(r.dinheiroReal ?? [])
  const live = r.accounts.filter((a) => a.ok)
  const best = live
    .filter((a) => (a.profitFactor ?? 0) > 0 && (a.trades ?? 0) > 0)
    .reduce<AccountDay | null>((b, a) => (!b || (a.profitFactor ?? 0) > (b.profitFactor ?? 0) ? a : b), null)

  // Um relatório gravado antes desta mudança não tem `dinheiroReal`: vale mais a mensagem antiga
  // do que uma mensagem vazia.
  if (!seccoes.length) {
    const linhas = [...live]
      .sort((a, b) => b.pnlToday - a.pnlToday)
      .map((a) => `• ${a.label}: ${sign(a.pnlToday)} hoje · equidade ${nf(a.equity ?? 0)}`)
    return [
      `📈 Contas — ${r.date}`,
      ``,
      `Equidade total: ${nf(r.totals.equity)}`,
      `P&L hoje: ${sign(r.totals.pnlToday)} · mês: ${sign(r.totals.pnlMonth)}`,
      ``,
      ...linhas,
    ].filter(Boolean).join('\n')
  }

  const out: string[] = [`📈 Dinheiro real — ${r.date}`]
  for (const s of seccoes) {
    out.push(``)
    out.push(`${s.titulo} (${s.linhas.length})`)
    out.push(`   equidade ${nf(s.equity)} · hoje ${sign(s.pnlToday)} · mês ${mes(s.pnlMonth)}`)
    for (const l of s.linhas.slice(0, MAX_LINHAS_POR_SECCAO)) {
      out.push(
        l.semLeitura
          ? `• ${l.etiqueta}: sem leitura hoje`
          : `• ${l.etiqueta}: ${nf(l.equity)} · hoje ${sign(l.pnlToday)}`,
      )
    }
    const sobram = s.linhas.length - MAX_LINHAS_POR_SECCAO
    if (sobram > 0) out.push(`  … e mais ${sobram} conta${sobram === 1 ? '' : 's'} (já somadas acima)`)
  }

  const totalEquity = seccoes.reduce((a, s) => a + s.equity, 0)
  const totalHoje = seccoes.reduce((a, s) => a + s.pnlToday, 0)
  out.push(``)
  out.push(`Σ Total: equidade ${nf(totalEquity)} · hoje ${sign(totalHoje)}`)
  if (best?.profitFactor) {
    out.push(`🏆 Melhor edge: ${best.label} (PF ${best.profitFactor.toFixed(2)}, win ${Math.round(best.winRatePct ?? 0)}%)`)
  }
  return out.join('\n')
}

/** Corre, grava e devolve o relatório (usado pelo cron). */
export async function runDailyReport(): Promise<DailyReport> {
  const report = await buildDailyReport()
  await getSupabaseAdmin().from('site_settings').upsert(
    { key: KEY, value: report as unknown as Record<string, unknown>, description: 'Relatório diário das contas reais (MetaStats)', updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return report
}

/** Último relatório gravado (para o admin / journaling / artefacto). */
export async function getDailyReport(): Promise<DailyReport | null> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', KEY).maybeSingle()
    return (data?.value as unknown as DailyReport) ?? null
  } catch {
    return null
  }
}

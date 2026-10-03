/**
 * «COMO É QUE ESTÁ O NEGÓCIO AGORA?» — a resposta num ecrã, sem abrir o portátil.
 *
 * O painel já respondia a «como está o SISTEMA» (webhook, MetaApi, último sinal). Isso é a saúde
 * da máquina. Isto é outra pergunta, e é a que ele faz primeiro de manhã: quanto entrou, quem
 * pagou, quem falhou, quem está a expirar, o que está parado e quem está à minha espera.
 *
 * ── DUAS COISAS QUE ESTA VISTA SE RECUSA A FAZER ──────────────────────────────────────────────
 *
 *  1. NÃO INVENTA TOTAIS. O que entrou hoje sai de `payment_history` (em cêntimos, e só o que está
 *     `succeeded`). O que não passou por lá — um pagamento fora do Stripe, uma renovação manual —
 *     não aparece, e é dito. Um total que parece completo e não está é pior do que nenhum.
 *
 *  2. NÃO CONFUNDE «NINGUÉM» COM «NÃO SEI». Zero pagamentos hoje às nove da manhã é normal; zero
 *     pagamentos porque a tabela não respondeu é uma avaria. As duas coisas escrevem-se de maneira
 *     diferente.
 *
 * A lista do que precisa de decisão do dono — sinais que não publicaram, pedidos presos, dados da
 * corretora velhos — já vive em `telegram-admin-extra.textoFalhas` e não se repete aqui: o botão
 * remete para lá. Duas listas do «o que falhou» divergem no dia em que alguém corrige uma.
 *
 *   npx tsx lib/__tests__/telegram-admin-hoje.check.ts
 */
import { escaparHtml as esc } from '@/lib/telegram-admin-porta'

// ─────────────────────────────── O QUE SE LÊ ───────────────────────────────

export interface Pagamento {
  user_id?: string | null
  /** Em CÊNTIMOS, como o Stripe os manda e como a tabela os guarda. */
  amount?: number | null
  currency?: string | null
  status?: string | null
  plan?: string | null
  created_at?: string | null
}

export interface AssinaturaAExpirar {
  nome: string
  quandoIso: string
  plano: string | null
}

export interface ContaParada {
  onde: string
  etiqueta: string
  porque: string
}

export interface FontesDeHoje {
  /** Os pagamentos de hoje (o dia de Lisboa), já filtrados pela leitura. */
  pagamentosDeHoje: Pagamento[]
  /** `false` quando a leitura falhou — diferente de uma lista vazia. */
  pagamentosLidos: boolean
  /** Nome por user_id, para se poder dizer QUEM pagou. */
  nomes: Record<string, string>
  aExpirar: AssinaturaAExpirar[]
  comFalhaDePagamento: Array<{ nome: string; falhas: number }>
  paradas: ContaParada[]
  sinaisHoje: number
  pedidosDeAcesso: number
  levantamentosAbertos: number
  agoraMs?: number
}

// ─────────────────────────────── O QUE SAI ───────────────────────────────

export interface Hoje {
  dia: string
  entrou: { total: number; moeda: string; quantos: number } | null
  falharam: number
  quemPagou: Array<{ nome: string; valor: number; plano: string | null }>
  aExpirar: AssinaturaAExpirar[]
  comFalhaDePagamento: Array<{ nome: string; falhas: number }>
  paradas: ContaParada[]
  sinaisHoje: number
  aMinhaEspera: Array<{ o_que: string; quantos: number; callback: string }>
  avisos: string[]
}

/** O dia de hoje em Lisboa, no formato que se compara com um `created_at` em UTC. */
export function diaDeLisboa(agoraMs: number = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(agoraMs))
}

/** Pura: monta a vista. Os cêntimos viram euros aqui e só aqui. */
export function montarHoje(f: FontesDeHoje): Hoje {
  const agoraMs = f.agoraMs ?? Date.now()
  const bons = f.pagamentosDeHoje.filter((p) => p.status === 'succeeded')
  const maus = f.pagamentosDeHoje.filter((p) => p.status === 'failed')
  const moeda = (bons[0]?.currency ?? 'eur').toUpperCase()

  const avisos: string[] = []
  if (!f.pagamentosLidos) {
    avisos.push('Não consegui ler os pagamentos — o que está aqui em branco é «não sei», não é zero.')
  } else {
    avisos.push('Só conta o que passou pelo Stripe. Renovações manuais e cupões não entram neste total.')
  }

  return {
    dia: diaDeLisboa(agoraMs),
    entrou: f.pagamentosLidos
      ? { total: bons.reduce((s, p) => s + Number(p.amount ?? 0), 0) / 100, moeda, quantos: bons.length }
      : null,
    falharam: maus.length,
    quemPagou: bons
      .map((p) => ({
        nome: (p.user_id && f.nomes[p.user_id]) || 'sem nome',
        valor: Number(p.amount ?? 0) / 100,
        plano: p.plan ?? null,
      }))
      .sort((a, b) => b.valor - a.valor),
    aExpirar: [...f.aExpirar].sort((a, b) => a.quandoIso.localeCompare(b.quandoIso)),
    comFalhaDePagamento: [...f.comFalhaDePagamento].sort((a, b) => b.falhas - a.falhas),
    paradas: f.paradas,
    sinaisHoje: f.sinaisHoje,
    aMinhaEspera: [
      { o_que: 'pedidos de acesso (depósito)', quantos: f.pedidosDeAcesso, callback: 'admin:dep' },
      { o_que: 'levantamentos por decidir', quantos: f.levantamentosAbertos, callback: 'admin:lev' },
    ].filter((x) => x.quantos > 0),
    avisos,
  }
}

const eur = (v: number, moeda: string) =>
  `${new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} ${moeda === 'EUR' ? '€' : moeda}`

/** Pura: a vista em HTML do Telegram. Cabe num ecrã — o resto está a um toque. */
export function textoHoje(h: Hoje): string {
  const linhas: string[] = [`🧠 <b>Hoje — ${h.dia}</b>`, '']

  if (h.entrou) {
    linhas.push(
      h.entrou.quantos
        ? `💳 <b>Entrou ${eur(h.entrou.total, h.entrou.moeda)}</b> em ${h.entrou.quantos} pagamento(s).`
        : '💳 <b>Ainda não entrou nada hoje.</b>',
    )
    for (const q of h.quemPagou.slice(0, 6)) {
      linhas.push(`   • ${esc(q.nome)} — ${eur(q.valor, h.entrou.moeda)}${q.plano ? ` (${esc(q.plano)})` : ''}`)
    }
  } else {
    linhas.push('💳 <b>Pagamentos: não consegui ler.</b>')
  }
  if (h.falharam) linhas.push(`   ⚠️ ${h.falharam} pagamento(s) <b>falharam</b> hoje.`)

  if (h.comFalhaDePagamento.length) {
    linhas.push('', `🔴 <b>Com pagamento em falha (${h.comFalhaDePagamento.length})</b>`)
    for (const p of h.comFalhaDePagamento.slice(0, 5)) linhas.push(`   • ${esc(p.nome)} — ${p.falhas} tentativa(s)`)
  }

  if (h.aExpirar.length) {
    linhas.push('', `⏳ <b>A expirar nos próximos 7 dias (${h.aExpirar.length})</b>`)
    for (const a of h.aExpirar.slice(0, 6)) {
      linhas.push(`   • ${esc(a.nome)} — ${new Date(a.quandoIso).toLocaleDateString('pt-PT')}${a.plano ? ` (${esc(a.plano)})` : ''}`)
    }
  }

  if (h.paradas.length) {
    linhas.push('', `💤 <b>Contas paradas (${h.paradas.length})</b>`)
    for (const c of h.paradas.slice(0, 6)) linhas.push(`   • ${esc(c.onde)} ${esc(c.etiqueta)} — ${esc(c.porque)}`)
  }

  linhas.push('', `📡 Sinais hoje: <b>${h.sinaisHoje}</b>`)

  if (h.aMinhaEspera.length) {
    linhas.push('', '🙋 <b>À tua espera</b>')
    for (const x of h.aMinhaEspera) linhas.push(`   • ${x.quantos} ${esc(x.o_que)}`)
  }

  linhas.push('', ...h.avisos.map((a) => `<i>${esc(a)}</i>`))
  return linhas.join('\n')
}

/** Pura: os botões que seguem a vista — cada um leva ao sítio onde se decide. */
export function tecladoHoje(h: Hoje, voltar: Array<{ text: string; callback_data?: string; url?: string }>) {
  const linhas: Array<Array<{ text: string; callback_data?: string; url?: string }>> = []
  for (const x of h.aMinhaEspera) {
    linhas.push([{ text: `👉 ${x.quantos} ${x.o_que}`, callback_data: x.callback }])
  }
  linhas.push([
    { text: '🚨 O que precisa de mim', callback_data: 'admin:falhas' },
    { text: '🎯 Fecho', callback_data: 'admin:fecho' },
  ])
  linhas.push([
    { text: '💰 Contas e equidade', callback_data: 'admin:contas' },
    { text: '🔄 Actualizar', callback_data: 'admin:hoje' },
  ])
  linhas.push(voltar)
  return { inline_keyboard: linhas }
}

// ─────────────────────────────── A LEITURA ───────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type Supa = { from: (t: string) => any }

/** Dias sem um sinal a partir dos quais uma ligação activa se considera parada. */
export const DIAS_PARA_PARADA = 14

export async function carregarHoje(supabase: unknown, agoraMs: number = Date.now()): Promise<Hoje> {
  const db = supabase as Supa
  const dia = diaDeLisboa(agoraMs)
  const inicioDoDia = `${dia}T00:00:00.000Z`
  const daquiA7 = new Date(agoraMs + 7 * 86_400_000).toISOString()
  const agoraIso = new Date(agoraMs).toISOString()
  const paradoDesde = new Date(agoraMs - DIAS_PARA_PARADA * 86_400_000).toISOString()

  /**
   * Uma leitura que falha devolve `{ data: null }` — e `null` não é uma lista vazia.
   *
   * É o que permite ao ecrã dizer «não consegui ler» em vez de «ninguém pagou». Uma tabela que não
   * responde e um dia sem vendas parecem iguais num total a zero, e não são a mesma notícia.
   */
  const tentar = async (q: PromiseLike<{ data?: unknown; count?: number | null }>): Promise<{ data?: unknown; count?: number | null }> => {
    try {
      const r = await q
      return r ?? { data: null }
    } catch {
      return { data: null }
    }
  }

  const [pagamentos, expiram, falhas, copy, auto, sinais, pendentes, levantamentos] = await Promise.all([
    tentar(
      db.from('payment_history').select('user_id, amount, currency, status, plan, created_at').gte('created_at', inicioDoDia).limit(200),
    ),
    tentar(
      db
        .from('profiles')
        .select('full_name, email, subscription_expires_at, subscription_plan')
        .eq('subscription_status', 'active')
        .gte('subscription_expires_at', agoraIso)
        .lte('subscription_expires_at', daquiA7)
        .limit(50),
    ),
    tentar(db.from('profiles').select('full_name, email, payment_failed_count').gt('payment_failed_count', 0).eq('is_active', true).limit(50)),
    tentar(
      /*
       * As contas da CASA não entram.
       *
       * `MTM Funded · Tap to Trade`, `MTM Funded · Todos os sinais` e companhia estão ligadas de
       * propósito e nunca «copiam» nada — apareciam todas como paradas, e uma lista de avarias
       * cheia de coisas que estão bem é uma lista que se aprende a ignorar. Reconhecem-se pela
       * `funded_account_id` (é uma conta nossa do outro lado), não pelo nome.
       */
      db
        .from('mtmcopy_connections')
        .select('account_label, mt5_login_last4, last_signal_at, mt5_status, purpose, funded_account_id')
        .eq('is_active', true)
        .is('funded_account_id', null)
        .limit(100),
    ),
    tentar(db.from('mtmauto_accounts').select('rotulo, login, estado, erro, copia_ativa').limit(100)),
    tentar(db.from('tradingview_signals').select('id', { count: 'exact', head: true }).gte('received_at', inicioDoDia)),
    tentar(db.from('telegram_leads').select('chat_id', { count: 'exact', head: true }).eq('stage', 'pending_review')),
    tentar(
      db.from('mtm_funded_withdrawals').select('id', { count: 'exact', head: true }).in('estado', ['pedido', 'em_analise', 'aprovado']),
    ),
  ])

  const linhas = <T>(r: unknown): T[] => ((r as { data?: T[] | null })?.data ?? []) as T[]
  const conta = (r: unknown): number => Number((r as { count?: number })?.count ?? 0)

  const pags = linhas<Pagamento>(pagamentos)
  const pagamentosLidos = Array.isArray((pagamentos as { data?: unknown }).data)

  // Os nomes de quem pagou, numa consulta só.
  const ids = [...new Set(pags.map((p) => p.user_id).filter((x): x is string => !!x))]
  const nomes: Record<string, string> = {}
  if (ids.length) {
    const perfis = await tentar(db.from('profiles').select('id, full_name, email').in('id', ids.slice(0, 100)))
    for (const p of linhas<{ id: string; full_name?: string; email?: string }>(perfis)) {
      nomes[p.id] = p.full_name?.trim() || p.email || p.id.slice(0, 8)
    }
  }

  const paradas: ContaParada[] = [
    ...linhas<{ account_label?: string; mt5_login_last4?: string; last_signal_at?: string | null; mt5_status?: string; purpose?: string }>(copy)
      .filter((c) => !c.last_signal_at || c.last_signal_at < paradoDesde)
      .map((c) => ({
        onde: c.purpose === 'tap_to_trade' ? 'T2T' : 'MTM Copy',
        etiqueta: c.account_label?.trim() || `••••${c.mt5_login_last4 ?? '????'}`,
        porque: c.last_signal_at
          ? `sem sinal há ${Math.floor((agoraMs - Date.parse(c.last_signal_at)) / 86_400_000)} dias`
          // Numa conta T2T isto não é uma avaria: é uma pessoa que ligou a conta e nunca aceitou
          // nada. Vale a mesma linha, mas não a mesma frase.
          : c.purpose === 'tap_to_trade'
            ? 'ligada e nunca aceitou um sinal'
            : 'nunca copiou um sinal',
      })),
    ...linhas<{ rotulo?: string; login?: string; estado?: string; erro?: string; copia_ativa?: boolean }>(auto)
      .filter((c) => c.estado === 'erro' || !!c.erro)
      .map((c) => ({
        onde: 'MTM Auto',
        etiqueta: c.rotulo?.trim() || `••••${String(c.login ?? '').slice(-4)}`,
        porque: (c.erro ?? 'em erro').slice(0, 80),
      })),
  ].slice(0, 20)

  return montarHoje({
    pagamentosDeHoje: pags,
    pagamentosLidos,
    nomes,
    aExpirar: linhas<{ full_name?: string; email?: string; subscription_expires_at: string; subscription_plan?: string }>(expiram).map((p) => ({
      nome: p.full_name?.trim() || p.email || 'sem nome',
      quandoIso: p.subscription_expires_at,
      plano: p.subscription_plan ?? null,
    })),
    comFalhaDePagamento: linhas<{ full_name?: string; email?: string; payment_failed_count?: number }>(falhas).map((p) => ({
      nome: p.full_name?.trim() || p.email || 'sem nome',
      falhas: Number(p.payment_failed_count ?? 0),
    })),
    paradas,
    sinaisHoje: conta(sinais),
    pedidosDeAcesso: conta(pendentes),
    levantamentosAbertos: conta(levantamentos),
    agoraMs,
  })
}

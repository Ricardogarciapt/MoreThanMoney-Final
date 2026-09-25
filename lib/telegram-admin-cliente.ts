/**
 * «O QUE É QUE O CLIENTE X TEM CONNOSCO» — uma pessoa, uma folha, um ecrã de telemóvel.
 *
 * O pedido do dono a 24/09 foi «ver saldos de contas de clientes». A tentação era fazer uma lista
 * de contas; mas ele nunca pergunta «quantas contas há», pergunta «este senhor tem o quê?». Uma
 * lista de contas soltas obriga-o a cruzar quatro tabelas de cabeça, que é exactamente o trabalho
 * que se está a tentar poupar.
 *
 * As contas de uma pessoa vivem em quatro sítios que nunca se falaram:
 *
 *   · `mtm_trading_accounts`  — MTM Funded (simuladas e as da corretora), saldo na própria linha;
 *   · `mtmcopy_connections`   — as contas reais ligadas ao site (MTM Copy / T2T);
 *   · `mtmauto_accounts`      — as contas da app MTM Auto;
 *   · `broker_clients`        — o que a CORRETORA diz, que é outra coisa e pode contradizer tudo.
 *
 * ── A REGRA QUE MANDA AQUI: UM ZERO TEM DE SE DISTINGUIR DE UM «NÃO SEI» ───────────────────────
 *
 * Nenhuma destas tabelas guarda a equidade ao vivo. As ligações reais não têm sequer coluna de
 * saldo (nunca tiveram); o que existe é a última leitura da MetaApi, gravada pelo cron em
 * `accounts_daily_report`. Uma folha que mostre esse número sem dizer QUANDO foi lido é uma folha
 * que mente com números verdadeiros — e foi assim que o `deposits_usd` a zero passou dois meses a
 * fechar a rota da corretora a toda a gente.
 *
 * Por isso, aqui dentro, `null` nunca vira `0`: vira «—» e uma linha em «o que não sei».
 *
 * Lógica pura em `montarFolha`/`textoFolha`; a leitura está separada para o teste não precisar de
 * rede. Dados pessoais: mostra-se o que a decisão exige — nome, email, plano, últimos 4 dígitos do
 * login. Passwords, telefone e moradas não entram, e uma conversa de Telegram é um sítio onde as
 * coisas ficam.
 *
 *   npx tsx lib/__tests__/telegram-admin-cliente.check.ts
 */
import { escaparHtml as esc } from '@/lib/telegram-admin-porta'

// ─────────────────────────────── O QUE SE LÊ ───────────────────────────────

export interface LinhaPerfilCliente {
  id: string
  email?: string | null
  full_name?: string | null
  member_category?: string | null
  subscription_plan?: string | null
  subscription_status?: string | null
  subscription_expires_at?: string | null
  is_active?: boolean | null
  payment_failed_count?: number | null
  last_payment_at?: string | null
  broker_uid?: string | null
}

export interface LinhaFunded {
  id: string
  mt5_login?: string | null
  tipo?: string | null
  estado?: string | null
  motor?: string | null
  etiqueta?: string | null
  saldo_inicial?: number | null
  sim_saldo?: number | null
  sim_equity?: number | null
  metricas?: Record<string, unknown> | null
  metricas_lidas_em?: string | null
  pausada_em?: string | null
  metaapi_account_id?: string | null
}

export interface LinhaLigacaoReal {
  origem: 'MTM Copy' | 'MTM Auto'
  rotulo?: string | null
  login?: string | null
  ativa: boolean
  estado?: string | null
  metaapiAccountId?: string | null
  /** MTM Auto tem contas de demonstração; uma demo não é dinheiro de ninguém. */
  demo?: boolean
}

export interface LinhaCorretoraCliente {
  uid: string
  deposits_usd?: number | null
  balance_usd?: number | null
  updated_at?: string | null
}

/** A última leitura da MetaApi, do relatório diário. `equity`/`balance` podem vir a null. */
export interface LeituraDoRelatorio {
  accountId: string
  balance: number | null
  equity: number | null
  ok: boolean
}

export interface FontesDaFolha {
  perfil: LinhaPerfilCliente | null
  funded: LinhaFunded[]
  ligacoes: LinhaLigacaoReal[]
  corretora: LinhaCorretoraCliente | null
  /** Indexado por `metaapi_account_id`. Vazio quando o cron nunca correu. */
  leituras: Record<string, LeituraDoRelatorio>
  /** Quando é que o relatório das contas foi gerado. `null` = nunca. */
  relatorioEm: string | null
  /** O lead do Telegram, quando existe — é o que liga a pessoa a uma conversa. */
  lead: { chat_id: string; first_name?: string | null; username?: string | null; stage?: string | null } | null
  pagamentos: Array<{ amount?: number | null; currency?: string | null; status?: string | null; plan?: string | null; created_at?: string | null }>
  agoraMs?: number
}

// ─────────────────────────────── O QUE SAI ───────────────────────────────

export interface ContaNaFolha {
  onde: string
  etiqueta: string
  /** Mascarado: a decisão não precisa do login inteiro. */
  login: string
  estado: string
  /** `null` = não sabemos. NUNCA 0 por omissão. */
  saldo: number | null
  equity: number | null
  /** Quando é que este número foi lido. `null` = nunca houve leitura. */
  lidoEm: string | null
  nota?: string
}

export interface FolhaDeCliente {
  nome: string
  email: string | null
  userId: string | null
  chatTelegram: string | null
  uidCorretora: string | null
  assinatura: {
    plano: string | null
    estado: string | null
    expiraEm: string | null
    diasParaExpirar: number | null
    falhasPagamento: number
    ultimoPagamentoEm: string | null
  }
  corretora: { depositoUsd: number | null; saldoUsd: number | null; lidoEm: string | null } | null
  contas: ContaNaFolha[]
  /** Só das contas que deram leitura — e diz-se quantas ficaram de fora. */
  equityConhecida: number
  /** Quantas contas entraram na soma. Zero ⇒ a soma não é «0 USD», é «não sei». */
  contasComLeitura: number
  contasSemLeitura: number
  lacunas: string[]
}

/** Pura: `123456789` → `••••6789`. A decisão não precisa do login inteiro; o registo sim. */
export function mascararLogin(login: string | null | undefined): string {
  const s = String(login ?? '').trim()
  if (!s) return '—'
  if (s.length <= 4) return s
  return `••••${s.slice(-4)}`
}

const num = (v: unknown): number | null => {
  const x = Number(v)
  return v == null || v === '' || !Number.isFinite(x) ? null : x
}

const dias = (iso: string | null | undefined, agoraMs: number): number | null =>
  iso ? Math.round((Date.parse(iso) - agoraMs) / 86_400_000) : null

/**
 * Pura: monta a folha.
 *
 * Duas decisões que valem a pena explicar:
 *
 *  · uma conta MTM Funded simulada tem o saldo na própria linha e é EXACTO (é a nossa base que o
 *    escreve, tick a tick) — por isso `lidoEm` fica a `null` de propósito e a nota diz «simulada»;
 *  · uma conta real só tem o que o cron leu. Sem leitura, `saldo`/`equity` ficam a `null` e a conta
 *    conta para `contasSemLeitura`, que é o número que impede a soma de se ler como um total.
 */
export function montarFolha(f: FontesDaFolha): FolhaDeCliente {
  const agoraMs = f.agoraMs ?? Date.now()
  const contas: ContaNaFolha[] = []

  for (const c of f.funded) {
    const sim = c.motor === 'sim'
    const m = (c.metricas ?? {}) as Record<string, unknown>
    const saldo = sim ? num(c.sim_saldo) : num(m.saldo ?? m.balance)
    const equity = sim ? num(c.sim_equity) ?? num(c.sim_saldo) : num(m.equity)
    contas.push({
      onde: 'MTM Funded',
      etiqueta: c.etiqueta?.trim() || `${c.tipo ?? 'conta'}`,
      login: mascararLogin(c.mt5_login),
      estado: c.pausada_em ? 'em pausa' : c.estado ?? '—',
      saldo,
      equity,
      lidoEm: sim ? null : c.metricas_lidas_em ?? null,
      nota: sim
        ? 'simulada — o saldo é exacto, não é uma leitura'
        : saldo == null && equity == null
          ? 'conta da corretora sem nenhuma leitura de métricas'
          : undefined,
    })
  }

  for (const l of f.ligacoes) {
    const leitura = l.metaapiAccountId ? f.leituras[l.metaapiAccountId] : undefined
    contas.push({
      onde: l.origem,
      etiqueta: l.rotulo?.trim() || (l.demo ? 'demo' : 'conta real'),
      login: mascararLogin(l.login),
      estado: l.ativa ? l.estado ?? 'ligada' : 'parada',
      saldo: leitura?.balance ?? null,
      equity: leitura?.equity ?? null,
      lidoEm: leitura && (leitura.balance != null || leitura.equity != null) ? f.relatorioEm : null,
      nota: l.demo
        ? 'demonstração — não é dinheiro'
        : !l.metaapiAccountId
          ? 'sem conta MetaApi associada: não há por onde ler o saldo'
          : !leitura
            ? 'esta conta não entrou no último relatório'
            : undefined,
    })
  }

  const comLeitura = contas.filter((c) => !c.nota?.startsWith('demonstração') && (c.equity ?? c.saldo) != null)
  const semLeitura = contas.filter((c) => !c.nota?.startsWith('demonstração') && (c.equity ?? c.saldo) == null)

  const lacunas: string[] = []
  if (!f.perfil) lacunas.push('não encontrei conta no site para esta pessoa')
  if (!f.corretora && (f.perfil?.broker_uid || f.lead)) {
    lacunas.push('o UID desta pessoa não aparece na lista importada da corretora')
  }
  if (f.corretora && f.corretora.deposits_usd == null) {
    lacunas.push('a corretora não trouxe o valor de depósito desta conta — não é zero, é desconhecido')
  }
  if (semLeitura.length) {
    lacunas.push(
      `${semLeitura.length} conta(s) sem leitura de saldo — o total NÃO as inclui` +
        (f.relatorioEm ? '' : ' (o relatório de contas nunca correu)'),
    )
  }
  if (!contas.length) lacunas.push('esta pessoa não tem nenhuma conta ligada a nós')

  const p = f.perfil
  return {
    nome: p?.full_name?.trim() || f.lead?.first_name?.trim() || p?.email?.trim() || 'sem nome',
    email: p?.email ?? null,
    userId: p?.id ?? null,
    chatTelegram: f.lead?.chat_id ?? null,
    uidCorretora: p?.broker_uid ?? f.corretora?.uid ?? null,
    assinatura: {
      plano: p?.subscription_plan ?? p?.member_category ?? null,
      estado: p?.is_active === false ? 'inactivo' : p?.subscription_status ?? null,
      expiraEm: p?.subscription_expires_at ?? null,
      diasParaExpirar: dias(p?.subscription_expires_at, agoraMs),
      falhasPagamento: Number(p?.payment_failed_count ?? 0),
      ultimoPagamentoEm: p?.last_payment_at ?? null,
    },
    corretora: f.corretora
      ? {
          depositoUsd: num(f.corretora.deposits_usd),
          saldoUsd: num(f.corretora.balance_usd),
          lidoEm: f.corretora.updated_at ?? null,
        }
      : null,
    contas,
    equityConhecida: comLeitura.reduce((s, c) => s + (c.equity ?? c.saldo ?? 0), 0),
    contasComLeitura: comLeitura.length,
    contasSemLeitura: semLeitura.length,
    lacunas,
  }
}

// ─────────────────────────────── O TEXTO ───────────────────────────────

const usd = (v: number | null): string =>
  v == null ? '—' : `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(v)} USD`

const dataCurta = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

/** Pura: a folha em HTML do Telegram. */
export function textoFolha(f: FolhaDeCliente): string {
  const a = f.assinatura
  const estadoAssinatura =
    a.estado === 'active'
      ? '💚 a pagar'
      : a.estado === 'inactivo'
        ? '⛔ inactivo'
        : a.estado
          ? `⚪ ${esc(a.estado)}`
          : '⚪ sem assinatura'

  const linhas: string[] = [
    `👤 <b>${esc(f.nome)}</b>`,
    [f.email ? esc(f.email) : null, f.uidCorretora ? `UID <code>${esc(f.uidCorretora)}</code>` : null, f.chatTelegram ? `chat <code>${esc(f.chatTelegram)}</code>` : null]
      .filter(Boolean)
      .join(' · ') || '—',
    '',
    `<b>Assinatura</b>  ${estadoAssinatura}`,
    `  ${esc(a.plano ?? 'sem plano')}` +
      (a.expiraEm
        ? ` · expira ${dataCurta(a.expiraEm)}${a.diasParaExpirar != null ? ` (${a.diasParaExpirar} dias)` : ''}`
        : ''),
  ]
  if (a.falhasPagamento > 0) linhas.push(`  ⚠️ ${a.falhasPagamento} falha(s) de pagamento`)
  if (a.ultimoPagamentoEm) linhas.push(`  último pagamento ${dataCurta(a.ultimoPagamentoEm)}`)

  if (f.corretora) {
    linhas.push(
      '',
      '<b>Corretora</b>',
      `  depósito ${usd(f.corretora.depositoUsd)} · saldo ${usd(f.corretora.saldoUsd)}`,
      `  <i>lido do export de ${dataCurta(f.corretora.lidoEm)}</i>`,
    )
  }

  linhas.push('', `<b>Contas</b> (${f.contas.length})`)
  if (!f.contas.length) linhas.push('  nenhuma')
  for (const c of f.contas) {
    linhas.push(
      `  <b>${esc(c.onde)}</b> ${esc(c.etiqueta)} · <code>${esc(c.login)}</code> · ${esc(c.estado)}`,
      `     saldo ${usd(c.saldo)} · equidade ${usd(c.equity)}${c.lidoEm ? ` · lido ${dataCurta(c.lidoEm)}` : ''}`,
    )
    if (c.nota) linhas.push(`     <i>${esc(c.nota)}</i>`)
  }

  /*
   * Sem uma única leitura, a soma NÃO é «0 USD».
   *
   * Um zero num sítio onde se espera um total lê-se como «esta pessoa não tem nada connosco», e
   * é a leitura errada: o que se sabe é que ninguém leu as contas dela. É a mesma regra do
   * `deposits_usd` — um campo por preencher não pode decidir nada.
   */
  linhas.push(
    '',
    f.contasComLeitura === 0 && f.contasSemLeitura > 0
      ? `<b>Equidade somada: —</b> <i>(nenhuma das ${f.contasSemLeitura} conta(s) deu leitura)</i>`
      : `<b>Equidade somada: ${usd(f.equityConhecida)}</b>` +
        (f.contasSemLeitura ? ` <i>(sem ${f.contasSemLeitura} conta(s) que não deram leitura)</i>` : ''),
  )

  if (f.lacunas.length) {
    linhas.push('', '<i>O que não sei:</i>')
    for (const g of f.lacunas) linhas.push(`  <i>· ${esc(g)}</i>`)
  }

  return linhas.join('\n')
}

// ─────────────────────────────── A LEITURA ───────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type Supa = { from: (t: string) => any }

/**
 * Descobre de quem é esta chave.
 *
 * Aceita-se o que se tem à mão no telemóvel: email, id do perfil, UID da corretora, login MT5 ou
 * chat do Telegram. Um número pode ser três coisas diferentes, por isso tentam-se por ordem de
 * quem é mais provável estar a ser escrito — e a primeira que responder ganha.
 */
async function encontrarPessoa(db: Supa, chave: string): Promise<{ userId: string | null; uid: string | null; chatId: string | null }> {
  const limpa = chave.trim().replace(/^@/, '')
  const so = (r: { data: unknown }) => ((r.data as Array<Record<string, unknown>> | null) ?? [])[0] ?? null

  if (limpa.includes('@')) {
    const p = so(await db.from('profiles').select('id, broker_uid').ilike('email', limpa).limit(1))
    if (p) return { userId: String(p.id), uid: (p.broker_uid as string) ?? null, chatId: null }
  }
  if (/^[0-9a-f-]{36}$/i.test(limpa)) {
    const p = so(await db.from('profiles').select('id, broker_uid').eq('id', limpa).limit(1))
    if (p) return { userId: String(p.id), uid: (p.broker_uid as string) ?? null, chatId: null }
  }
  if (/^\d+$/.test(limpa)) {
    // 1) login de uma conta nossa, 2) UID da corretora, 3) chat do Telegram.
    for (const [tabela, coluna] of [
      ['mtm_trading_accounts', 'mt5_login'],
      ['mtmauto_accounts', 'login'],
      ['mtmcopy_connections', 'mt5_login'],
    ] as const) {
      const l = so(await db.from(tabela).select('user_id').eq(coluna, limpa).limit(1))
      if (l?.user_id) return { userId: String(l.user_id), uid: null, chatId: null }
    }
    const perfilPorUid = so(await db.from('profiles').select('id, broker_uid').eq('broker_uid', limpa).limit(1))
    if (perfilPorUid) return { userId: String(perfilPorUid.id), uid: limpa, chatId: null }
    const lead = so(await db.from('telegram_leads').select('chat_id, broker_uid').eq('chat_id', limpa).limit(1))
    if (lead) return { userId: null, uid: (lead.broker_uid as string) ?? null, chatId: String(lead.chat_id) }
    const leadPorUid = so(await db.from('telegram_leads').select('chat_id, broker_uid').eq('broker_uid', limpa).limit(1))
    if (leadPorUid) return { userId: null, uid: limpa, chatId: String(leadPorUid.chat_id) }
    // Um número que não é nosso pode ainda assim estar na lista da corretora.
    const cli = so(await db.from('broker_clients').select('uid').eq('uid', limpa).limit(1))
    if (cli) return { userId: null, uid: limpa, chatId: null }
  }
  const porUser = so(await db.from('telegram_leads').select('chat_id, broker_uid').ilike('username', limpa).limit(1))
  if (porUser) return { userId: null, uid: (porUser.broker_uid as string) ?? null, chatId: String(porUser.chat_id) }
  return { userId: null, uid: null, chatId: null }
}

/** Carrega a folha de uma pessoa a partir de email, id, UID, login MT5, chat ou @username. */
export async function carregarFolhaDeCliente(supabase: unknown, chave: string): Promise<FolhaDeCliente | null> {
  const db = supabase as Supa
  const quem = await encontrarPessoa(db, chave)
  if (!quem.userId && !quem.uid && !quem.chatId) return null

  const perfil = quem.userId
    ? ((
        await db
          .from('profiles')
          .select('id, email, full_name, member_category, subscription_plan, subscription_status, subscription_expires_at, is_active, payment_failed_count, last_payment_at, broker_uid')
          .eq('id', quem.userId)
          .maybeSingle()
      ).data as LinhaPerfilCliente | null)
    : null

  const uid = perfil?.broker_uid ?? quem.uid

  const [funded, copy, auto, corretora, lead, pagamentos, relatorio] = await Promise.all([
    quem.userId
      ? db
          .from('mtm_trading_accounts')
          .select('id, mt5_login, tipo, estado, motor, etiqueta, saldo_inicial, sim_saldo, sim_equity, metricas, metricas_lidas_em, pausada_em, metaapi_account_id')
          .eq('user_id', quem.userId)
          .limit(30)
          .then((r: { data: unknown }) => (r.data as LinhaFunded[] | null) ?? [])
      : Promise.resolve([] as LinhaFunded[]),
    quem.userId
      ? db
          .from('mtmcopy_connections')
          .select('account_label, mt5_login, mt5_login_last4, is_active, mt5_status, metaapi_account_id')
          .eq('user_id', quem.userId)
          .limit(30)
          .then((r: { data: unknown }) => (r.data as Array<Record<string, unknown>> | null) ?? [])
      : Promise.resolve([] as Array<Record<string, unknown>>),
    quem.userId
      ? db
          .from('mtmauto_accounts')
          .select('rotulo, nome_exibicao, login, estado, copia_ativa, demo, metaapi_account_id')
          .eq('user_id', quem.userId)
          .limit(30)
          .then((r: { data: unknown }) => (r.data as Array<Record<string, unknown>> | null) ?? [])
      : Promise.resolve([] as Array<Record<string, unknown>>),
    uid
      ? db
          .from('broker_clients')
          .select('uid, deposits_usd, balance_usd, updated_at')
          .eq('uid', uid)
          .maybeSingle()
          .then((r: { data: unknown }) => r.data as LinhaCorretoraCliente | null)
      : Promise.resolve(null),
    quem.chatId
      ? db
          .from('telegram_leads')
          .select('chat_id, first_name, username, stage')
          .eq('chat_id', quem.chatId)
          .maybeSingle()
          .then((r: { data: unknown }) => r.data as FontesDaFolha['lead'])
      : uid
        ? db
            .from('telegram_leads')
            .select('chat_id, first_name, username, stage')
            .eq('broker_uid', uid)
            .limit(1)
            .then((r: { data: unknown }) => ((r.data as Array<Record<string, unknown>> | null) ?? [])[0] as FontesDaFolha['lead'])
        : Promise.resolve(null),
    quem.userId
      ? db
          .from('payment_history')
          .select('amount, currency, status, plan, created_at')
          .eq('user_id', quem.userId)
          .order('created_at', { ascending: false })
          .limit(5)
          .then((r: { data: unknown }) => (r.data as FontesDaFolha['pagamentos'] | null) ?? [])
      : Promise.resolve([] as FontesDaFolha['pagamentos']),
    import('@/lib/accounts-daily-report').then((m) => m.getDailyReport()).catch(() => null),
  ])

  const leituras: Record<string, LeituraDoRelatorio> = {}
  for (const a of relatorio?.accounts ?? []) {
    if (a.accountId) leituras[a.accountId] = { accountId: a.accountId, balance: a.balance, equity: a.equity, ok: a.ok }
  }

  const ligacoes: LinhaLigacaoReal[] = [
    ...copy.map((c: Record<string, unknown>) => ({
      origem: 'MTM Copy' as const,
      rotulo: (c.account_label as string) ?? null,
      login: (c.mt5_login as string) ?? (c.mt5_login_last4 as string) ?? null,
      ativa: c.is_active === true,
      estado: (c.mt5_status as string) ?? null,
      metaapiAccountId: (c.metaapi_account_id as string) ?? null,
    })),
    ...auto.map((c: Record<string, unknown>) => ({
      origem: 'MTM Auto' as const,
      rotulo: ((c.rotulo ?? c.nome_exibicao) as string) ?? null,
      login: (c.login as string) ?? null,
      ativa: c.copia_ativa === true,
      estado: (c.estado as string) ?? null,
      metaapiAccountId: (c.metaapi_account_id as string) ?? null,
      demo: c.demo === true,
    })),
  ]

  return montarFolha({
    perfil,
    funded,
    ligacoes,
    corretora,
    leituras,
    relatorioEm: relatorio?.generatedAt ?? null,
    lead: lead ?? null,
    pagamentos,
  })
}

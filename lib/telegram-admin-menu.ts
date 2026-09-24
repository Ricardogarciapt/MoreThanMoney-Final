/**
 * O PAINEL DE ADMIN DO BOT — tudo o que o dono precisa de fazer sem abrir o portátil.
 *
 * Estava espalhado: meia dúzia de botões dentro do `telegram-broker-gate` (que é o funil da
 * corretora, não um painel) e o resto sem existir. Quem falava com o bot em privado tinha acesso
 * a «Performance 30d» e pouco mais — para ver contas, sinais ou desligar uma execução tinha de ir
 * ao site.
 *
 * TRÊS REGRAS, e nenhuma delas é negociável:
 *
 *  1. SÓ O ADMIN. A validação é a mesma que o resto do sistema usa — o chat gravado em
 *     `site_settings.telegram_admin_chat_id`, com o `TELEGRAM_ADMIN_CHAT_ID` do ambiente como a
 *     segunda chave (é o que seis crons já usam). Ver `ehChatDeAdmin`.
 *
 *  2. O QUE MEXE EM DINHEIRO OU EM EXECUÇÃO PEDE DOIS TOQUES. Desligar a execução do Premium com
 *     o polegar a passar pelo ecrã é um acidente à espera de acontecer; o primeiro toque pergunta,
 *     o segundo faz.
 *
 *  3. NÃO HÁ BOTÕES QUE APAGUEM. Apagar faz-se no /admin, com o ecrã todo à frente e não numa
 *     conversa de telemóvel.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'

type Supa = ReturnType<typeof getSupabaseAdmin>

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.morethanmoney.pt'

/**
 * O chat do dono quando ainda não há nenhum gravado.
 *
 * É o MESMO valor que os crons (sales-digest, relay-watchdog, weekly-flyer, accounts-daily-report,
 * funded-precos-vigia) já usam há meses. Repeti-lo aqui não cria uma segunda verdade: fecha a
 * porta que estava aberta, porque até hoje qualquer pessoa que escrevesse /admin ao bot ficava
 * gravada como aprovadora.
 */
const ADMIN_POR_DEFEITO = '1446687230'

export function chatDeAdminDoAmbiente(): string {
  return process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || ADMIN_POR_DEFEITO
}

async function chatDeAdminGravado(supabase: Supa): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'telegram_admin_chat_id')
      .maybeSingle()
    const v = (data?.value as { chat_id?: string } | null)?.chat_id
    return v ? String(v) : null
  } catch {
    return null
  }
}

/**
 * É o chat do dono?
 *
 * Aceita o gravado OU o do ambiente. Os dois, e não só o gravado, porque o gravado pode não
 * existir (instalação nova, base reposta) e nessa altura o painel ficava inacessível a quem é
 * dono e acessível a quem escrevesse /admin primeiro.
 */
export async function ehChatDeAdmin(supabase: Supa, chatId: string | number | null | undefined): Promise<boolean> {
  if (chatId == null) return false
  const id = String(chatId)
  if (id === chatDeAdminDoAmbiente()) return true
  const gravado = await chatDeAdminGravado(supabase)
  return !!gravado && id === gravado
}

/**
 * Regista o chat aprovador — e só para quem já é admin.
 *
 * O /admin fazia este upsert a QUALQUER pessoa que o escrevesse: o primeiro estranho a
 * experimentar o comando passava a receber os pedidos de acesso com foto, os botões de aprovar, o
 * painel todo e o texto livre encaminhado para a IA do site. Devolve false quando recusa.
 */
export async function registarChatDeAdmin(supabase: Supa, chatId: string): Promise<boolean> {
  if (!(await ehChatDeAdmin(supabase, chatId))) return false
  await supabase.from('site_settings').upsert(
    { key: 'telegram_admin_chat_id', value: { chat_id: chatId }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return true
}

async function tg(method: string, body: Record<string, unknown>) {
  const token = getMtmcopyBotToken()
  if (!token) return null
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await r.json()
  } catch {
    return null
  }
}

const enviar = (chatId: string | number, text: string, teclado?: unknown) =>
  tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(teclado ? { reply_markup: teclado } : {}),
  })

// ─────────────────────────────── O TECLADO ───────────────────────────────

interface Botao {
  text: string
  callback_data?: string
  url?: string
}

const VOLTAR: Botao[] = [{ text: '⬅️ Painel', callback_data: 'admin:menu' }]

/** O painel principal. Uma linha por assunto, e cada assunto abre o seu submenu. */
export function adminPanelKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🩺 Estado do sistema', callback_data: 'admin:sys' },
        { text: '💰 Contas e equidade', callback_data: 'admin:contas' },
      ],
      [
        { text: '📡 Sinais de hoje', callback_data: 'admin:sinais' },
        { text: '📊 Desempenho 30d', callback_data: 'admin:perf' },
      ],
      [
        { text: '⚙️ Execução', callback_data: 'admin:exec' },
        { text: '🧲 Máquina de vendas', callback_data: 'admin:sm' },
      ],
      [
        { text: '👥 Leads e funil', callback_data: 'admin:funil' },
        { text: '👑 Subscritores', callback_data: 'admin:subs' },
      ],
      // As três perguntas que ele faz todos os dias e que obrigavam a abrir o portátil.
      [
        { text: '🎯 Fecho', callback_data: 'admin:fecho' },
        { text: '🧲 Prospeção', callback_data: 'admin:prosp' },
      ],
      [
        { text: '🚨 O que precisa de mim', callback_data: 'admin:falhas' },
        { text: '⏱️ Correr um cron', callback_data: 'admin:crons' },
      ],
      [
        { text: '🤖 Falar com a IA do site', callback_data: 'admin:ai_help' },
        { text: '🔗 Links do /admin', callback_data: 'admin:links' },
      ],
    ],
  }
}

export const TEXTO_PAINEL =
  '🛠️ <b>Painel MTM</b>\n\n' +
  'Aprovador registado ✅ — os pedidos de acesso (UID + print) chegam aqui com botões.\n' +
  'Escreve-me em linguagem natural para falar com a IA do site, ou escolhe:\n\n' +
  '<i>Atalho: <code>/quem &lt;chat_id | @user | UID&gt;</code> abre a folha de uma pessoa.</i>'

// ─────────────────────────────── EXECUÇÃO ───────────────────────────────

/**
 * Os interruptores, com um nome que se perceba no telemóvel.
 *
 * A chave é a de `lib/mtmcopy/exec-switches.ts` — não há aqui uma segunda lista de verdades, só
 * uma tradução. Um interruptor novo que não apareça nesta tabela continua a existir e a funcionar;
 * o que não aparece é no botão.
 */
export const NOMES_EXEC: Record<string, string> = {
  sensei: 'Sensei (gestão)',
  sensei_entries: 'Sensei (entradas)',
  forex: 'Forex',
  premium: 'Premium',
  goldkiller: 'GoldKiller',
  premium_master_exec: 'Premium pela mestre',
  premium_price_monitor: 'Premium por preço',
  premium_subscriber_exits: 'Saídas nos subscritores',
  perps_position_monitor: 'Perpétuos (monitor)',
  t2t_auto_close: 'T2T fecho automático',
  t2t_price_monitor: 'T2T monitor de preço',
  trailing_tempo_real: 'Trailing em tempo real',
  funded_copier: 'Funded → conta do aluno',
}

/** Pura: o teclado dos interruptores. Cada um mostra o estado e o primeiro toque só PERGUNTA. */
export function tecladoExecucao(estado: Record<string, boolean>) {
  const linhas: Botao[][] = []
  const chaves = Object.keys(NOMES_EXEC).filter((k) => k in estado)
  for (let i = 0; i < chaves.length; i += 2) {
    linhas.push(
      chaves.slice(i, i + 2).map((k) => ({
        text: `${estado[k] ? '🟢' : '🔴'} ${NOMES_EXEC[k]}`,
        // `ex?` = perguntar. O toque que muda mesmo a execução é o `ex!`, no ecrã seguinte.
        callback_data: `admin:ex?${k}`,
      })),
    )
  }
  linhas.push(VOLTAR)
  return { inline_keyboard: linhas }
}

/** Pura: o texto da lista de interruptores. */
export function textoExecucao(estado: Record<string, boolean>): string {
  const linhas = Object.keys(NOMES_EXEC)
    .filter((k) => k in estado)
    .map((k) => `${estado[k] ? '🟢' : '🔴'} ${NOMES_EXEC[k]}`)
  return `⚙️ <b>Execução</b>\n\n${linhas.join('\n')}\n\n<i>Toca para alterar — pede confirmação.</i>`
}

/** Pura: a pergunta de confirmação de um interruptor. */
export function confirmacaoExec(chave: string, ligar: boolean) {
  const nome = NOMES_EXEC[chave] ?? chave
  return {
    texto:
      `⚠️ <b>Confirmas?</b>\n\n` +
      `${ligar ? 'LIGAR' : 'DESLIGAR'} <b>${nome}</b>.\n\n` +
      (ligar
        ? 'Passa a abrir/gerir ordens em contas reais.'
        : 'Deixa de abrir/gerir ordens. As posições abertas não se fecham sozinhas.'),
    teclado: {
      inline_keyboard: [
        [{ text: `✅ Sim, ${ligar ? 'ligar' : 'desligar'}`, callback_data: `admin:ex!${chave}` }],
        [{ text: '↩️ Não, voltar', callback_data: 'admin:exec' }],
      ],
    },
  }
}

// ─────────────────────────────── AS AÇÕES ───────────────────────────────

const nf = (n: number) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(n)

async function estadoDoSistema(supabase: Supa): Promise<string> {
  const [{ getMtmcopyBotInfo, getMtmcopyWebhookInfo }] = await Promise.all([import('@/lib/mtmcopy/telegram-bot')])
  const [bot, hook, ultimoSinal, ligacoes, relatorio] = await Promise.all([
    getMtmcopyBotInfo().catch(() => ({ ok: false, error: 'falhou' })),
    getMtmcopyWebhookInfo().catch(() => null),
    supabase.from('tradingview_signals').select('received_at').order('received_at', { ascending: false }).limit(1),
    supabase.from('mtmcopy_connections').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('site_settings').select('value').eq('key', 'accounts_daily_report').maybeSingle(),
  ])

  const h = hook as { url?: string; pending_update_count?: number; last_error_message?: string } | null
  const sinal = (ultimoSinal.data?.[0] as { received_at?: string } | undefined)?.received_at
  const gerado = (relatorio.data?.value as { generatedAt?: string } | null)?.generatedAt
  const quando = (iso?: string | null) =>
    iso ? `${Math.round((Date.now() - Date.parse(iso)) / 60000)} min atrás` : '—'

  return [
    '🩺 <b>Estado do sistema</b>',
    '',
    `Bot: ${bot.ok ? `@${(bot as { username?: string }).username}` : `⚠️ ${(bot as { error?: string }).error ?? 'sem resposta'}`}`,
    `Webhook: ${h?.url ? '✅ registado' : '⚠️ sem URL'}${h?.pending_update_count ? ` · ${h.pending_update_count} por entregar` : ''}`,
    h?.last_error_message ? `  último erro: <code>${h.last_error_message.slice(0, 120)}</code>` : '',
    `MetaApi: ${process.env.METAAPI_TOKEN?.trim() ? '✅ configurada' : '⚠️ METAAPI_TOKEN em falta'}`,
    '',
    `Último sinal: ${quando(sinal)}`,
    `Contas ligadas ativas: <b>${ligacoes.count ?? 0}</b>`,
    `Relatório de contas: ${quando(gerado)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function sinaisDeHoje(supabase: Supa): Promise<string> {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
  const { data } = await supabase
    .from('tradingview_signals')
    .select('source, ticker, action, received_at, telegram_status')
    .gte('received_at', `${dia}T00:00:00.000Z`)
    .order('received_at', { ascending: false })
    .limit(60)

  const linhas = data ?? []
  if (!linhas.length) return `📡 <b>Sinais de hoje</b>\n\nNenhum sinal recebido hoje (${dia}).`

  const porFonte: Record<string, number> = {}
  for (const s of linhas) porFonte[String((s as { source?: string }).source ?? '—')] = (porFonte[String((s as { source?: string }).source ?? '—')] ?? 0) + 1
  const falhados = linhas.filter((s) => (s as { telegram_status?: string }).telegram_status === 'error').length

  const ultimos = linhas.slice(0, 8).map((s) => {
    const x = s as { ticker?: string; action?: string; received_at?: string }
    const hora = x.received_at ? new Date(x.received_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }) : '--:--'
    return `• ${hora} <b>${x.ticker ?? '?'}</b> ${x.action ?? ''}`
  })

  return [
    `📡 <b>Sinais de hoje</b> (${linhas.length})`,
    '',
    ...Object.entries(porFonte).sort((a, b) => b[1] - a[1]).map(([f, n]) => `• ${f}: <b>${n}</b>`),
    falhados ? `\n⚠️ ${falhados} com erro a publicar no Telegram` : '',
    '',
    '<b>Últimos:</b>',
    ...ultimos,
  ]
    .filter(Boolean)
    .join('\n')
}

async function contasEEquidade(): Promise<string> {
  const { getDailyReport, reportSummary } = await import('@/lib/accounts-daily-report')
  const r = await getDailyReport()
  if (!r) return '💰 <b>Contas</b>\n\nAinda não há relatório gravado. Corre o cron das contas.'
  // O mesmo texto que sai na mensagem diária — uma fonte, uma leitura.
  return reportSummary(r)
}

async function funilELeads(supabase: Supa): Promise<string> {
  const { data: leads } = await supabase.from('telegram_leads').select('stage, interesse, created_at, mtmauto_passo')
  const todos = leads ?? []
  const desde = Date.now() - 7 * 86400_000
  const porEstado: Record<string, number> = {}
  const porInteresse: Record<string, number> = {}
  let novos7d = 0
  for (const l of todos) {
    const x = l as { stage?: string; interesse?: string; created_at?: string }
    porEstado[x.stage ?? 'novo'] = (porEstado[x.stage ?? 'novo'] ?? 0) + 1
    if (x.interesse) porInteresse[x.interesse] = (porInteresse[x.interesse] ?? 0) + 1
    if (x.created_at && Date.parse(x.created_at) >= desde) novos7d++
  }
  const pendentes = porEstado['pending_review'] ?? 0
  return [
    `👥 <b>Leads no Telegram</b> (${todos.length} · ${novos7d} novos em 7 dias)`,
    '',
    '<b>Por estado:</b>',
    ...Object.entries(porEstado).sort((a, b) => b[1] - a[1]).map(([k, v]) => `• ${k}: <b>${v}</b>`),
    Object.keys(porInteresse).length ? '\n<b>Por caminho:</b>' : '',
    ...Object.entries(porInteresse).map(([k, v]) => `• ${k}: <b>${v}</b>`),
    pendentes ? `\n🔓 <b>${pendentes}</b> à espera de aprovação — vê em «Pendentes».` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function tecladoFunil() {
  return {
    inline_keyboard: [
      [{ text: '🔓 Pendentes de aprovação', callback_data: 'admin:pending' }],
      [{ text: '🌐 Conversas e funis no /admin', url: `${SITE}/admin/social` }],
      VOLTAR,
    ],
  }
}

function tecladoMaquinaVendas() {
  return {
    inline_keyboard: [
      [{ text: '⚙️ Estado', callback_data: 'admin:sm_state' }],
      [
        { text: '🟢 Ativar autopilot', callback_data: 'admin:sm_on?' },
        { text: '🔴 Desativar', callback_data: 'admin:sm_off?' },
      ],
      [
        { text: '✍️ Gerar conteúdo', callback_data: 'admin:sm_generate' },
        { text: '📨 Digest de vendas', callback_data: 'admin:sm_digest' },
      ],
      [{ text: '🌐 Máquina de vendas no site', url: `${SITE}/admin/sales-machine` }],
      VOLTAR,
    ],
  }
}

/**
 * Os atalhos do /admin — e só para páginas que EXISTEM.
 *
 * O painel antigo tinha um botão «Grupo de leads (conteúdo)» para `/admin/telegram-sources`, uma
 * rota que não existe: o botão abria um 404. Um atalho que dá 404 é pior do que não ter atalho —
 * faz duvidar do resto do painel. Estes foram todos confirmados contra `app/admin/`.
 */
function tecladoLinks() {
  return {
    inline_keyboard: [
      [
        { text: '🌐 Admin', url: `${SITE}/admin` },
        { text: '🛰️ MTM Copy', url: `${SITE}/admin/mtmcopy` },
      ],
      [
        { text: '🤖 MTM Auto (cópia)', url: `${SITE}/admin/mtmauto-copia` },
        { text: '🏦 MTM Funded', url: `${SITE}/admin?tab=mtmfunded` },
      ],
      [
        { text: '🧲 Máquina de vendas', url: `${SITE}/admin/sales-machine` },
        { text: '📣 Social e funis', url: `${SITE}/admin/social` },
      ],
      [
        { text: '👤 Utilizadores', url: `${SITE}/admin?tab=users` },
        { text: '🎟️ Cupões', url: `${SITE}/admin/coupons` },
      ],
      VOLTAR,
    ],
  }
}

/**
 * Executa uma ação do painel (callback `admin:*`) — só para o chat do dono.
 *
 * As ações que mexem em execução ou no autopilot vêm em pares: `?` pergunta, `!` faz.
 */
export async function handleAdminAction(supabase: Supa, action: string, chatId: string): Promise<void> {
  if (!(await ehChatDeAdmin(supabase, chatId))) {
    await enviar(chatId, '⛔ Sem permissão.')
    return
  }

  // ── Crons: cr?<chave> pergunta (os que mandam coisas para fora), cr!<chave> corre ──
  if (action.startsWith('cr?') || action.startsWith('cr!')) {
    const { confirmacaoCron, dispararCron, tecladoCrons } = await import('@/lib/telegram-admin-extra')
    const chave = action.slice(3)
    if (action.startsWith('cr?')) {
      const c = confirmacaoCron(chave)
      if (!c) {
        await enviar(chatId, `⚠️ Cron desconhecido: <code>${chave}</code>`, { inline_keyboard: [VOLTAR] })
        return
      }
      await enviar(chatId, c.texto, c.teclado)
      return
    }
    await enviar(chatId, '⏳ A correr…')
    await enviar(chatId, await dispararCron(chave, SITE), tecladoCrons(VOLTAR))
    return
  }

  // ── A folha de uma pessoa: quem é, que passos deu, o que falta ──
  if (action.startsWith('quem:')) {
    const { carregarPerfil, textoPerfil } = await import('@/lib/prospecao/perfil-lead')
    const p = await carregarPerfil(supabase, action.slice(5))
    await enviar(
      chatId,
      p ? textoPerfil(p) : '🤷 Não encontrei ninguém com essa chave.',
      { inline_keyboard: [[{ text: '🎯 Voltar ao fecho', callback_data: 'admin:fecho' }], VOLTAR] },
    )
    return
  }

  // ── Interruptores de execução: ex?<chave> pergunta, ex!<chave> faz ──
  if (action.startsWith('ex?') || action.startsWith('ex!')) {
    const { getExecSwitches, setExecSwitches } = await import('@/lib/mtmcopy/exec-switches')
    const chave = action.slice(3)
    const estado = (await getExecSwitches()) as unknown as Record<string, boolean>
    if (!(chave in estado)) {
      await enviar(chatId, `⚠️ Interruptor desconhecido: <code>${chave}</code>`)
      return
    }
    if (action.startsWith('ex?')) {
      const c = confirmacaoExec(chave, !estado[chave])
      await enviar(chatId, c.texto, c.teclado)
      return
    }
    const novo = (await setExecSwitches({ [chave]: !estado[chave] } as never)) as unknown as Record<string, boolean>
    await enviar(chatId, textoExecucao(novo), tecladoExecucao(novo))
    return
  }

  switch (action) {
    case 'menu':
      await enviar(chatId, TEXTO_PAINEL, adminPanelKeyboard())
      return
    case 'sys':
      await enviar(chatId, await estadoDoSistema(supabase), { inline_keyboard: [VOLTAR] })
      return
    case 'contas':
      await enviar(chatId, await contasEEquidade(), {
        inline_keyboard: [[{ text: '🌐 Contas no /admin', url: `${SITE}/admin?tab=mtmfunded` }], VOLTAR],
      })
      return
    case 'sinais':
      await enviar(chatId, await sinaisDeHoje(supabase), {
        inline_keyboard: [[{ text: '🌐 MTM Copy (fontes)', url: `${SITE}/admin/mtmcopy` }], VOLTAR],
      })
      return
    case 'exec': {
      const { getExecSwitches } = await import('@/lib/mtmcopy/exec-switches')
      const estado = (await getExecSwitches()) as unknown as Record<string, boolean>
      await enviar(chatId, textoExecucao(estado), tecladoExecucao(estado))
      return
    }
    case 'funil':
      await enviar(chatId, await funilELeads(supabase), tecladoFunil())
      return
    case 'links':
      await enviar(chatId, '🔗 <b>Atalhos do /admin</b>', tecladoLinks())
      return
    case 'sm':
      await enviar(chatId, '🧲 <b>Máquina de vendas</b>\n\nO que queres fazer?', tecladoMaquinaVendas())
      return
    case 'fecho': {
      const { textoFecho } = await import('@/lib/telegram-admin-extra')
      await enviar(chatId, await textoFecho(supabase), {
        inline_keyboard: [
          [{ text: '🔓 Pendentes de aprovação', callback_data: 'admin:pending' }],
          [{ text: '🌐 Conversas no /admin', url: `${SITE}/admin/social` }],
          VOLTAR,
        ],
      })
      return
    }
    case 'prosp': {
      const { textoProspecao } = await import('@/lib/telegram-admin-extra')
      await enviar(chatId, await textoProspecao(supabase), {
        inline_keyboard: [
          [{ text: '🔄 Arrumar agora', callback_data: 'admin:cr!prosp' }],
          [{ text: '🌐 Prospeção no /admin', url: `${SITE}/admin/social` }],
          VOLTAR,
        ],
      })
      return
    }
    case 'falhas': {
      const { textoFalhas } = await import('@/lib/telegram-admin-extra')
      await enviar(chatId, await textoFalhas(supabase), {
        inline_keyboard: [[{ text: '🔓 Pendentes', callback_data: 'admin:pending' }], VOLTAR],
      })
      return
    }
    case 'crons': {
      const { tecladoCrons } = await import('@/lib/telegram-admin-extra')
      await enviar(
        chatId,
        '⏱️ <b>Correr um cron</b>\n\nOs marcados com ⚠️ mandam coisas para fora (mensagens, cobranças) — esses pedem confirmação.',
        tecladoCrons(VOLTAR),
      )
      return
    }
    case 'ai_help':
      await enviar(
        chatId,
        '🤖 <b>IA do site</b> — escreve-me aqui em linguagem natural (só tu). Consulto o negócio e arranco tarefas do site.\n\n' +
          'Ex.: <i>«como está o funil hoje?»</i>, <i>«cria uma tarefa para rever os rascunhos»</i>, <i>«gera conteúdo para a marca»</i>.',
        { inline_keyboard: [VOLTAR] },
      )
      return
  }

  // ── Desempenho, leads e subscritores (os que já existiam) ──
  const desde = new Date(Date.now() - 30 * 864e5).toISOString()
  if (action === 'perf') {
    const { data } = await supabase
      .from('trading_plan_trades')
      .select('pnl')
      .eq('trade_source', 'strategy')
      .not('pnl', 'is', null)
      .gte('opened_at', desde)
      .limit(3000)
    const n = data?.length ?? 0
    const ganhos = (data ?? []).filter((t) => Number(t.pnl) > 0).length
    const pnl = (data ?? []).reduce((s, t) => s + Number(t.pnl ?? 0), 0)
    await enviar(
      chatId,
      `📊 <b>Desempenho (executado, 30d)</b>\n\nTrades: <b>${n}</b>\nTaxa de acerto: <b>${n ? Math.round((ganhos / n) * 1000) / 10 : 0}%</b>\nResultado: <b>${nf(pnl)}</b>\n\n<i>Número interno — a prova que se publica é em pips.</i>`,
      { inline_keyboard: [VOLTAR] },
    )
    return
  }
  if (action === 'leads') {
    await enviar(chatId, await funilELeads(supabase), tecladoFunil())
    return
  }
  if (action === 'pending') {
    const { data } = await supabase
      .from('telegram_leads')
      .select('chat_id, broker_uid, first_name')
      .eq('stage', 'pending_review')
      .limit(20)
    if (!data?.length) {
      await enviar(chatId, '🔓 Sem pedidos pendentes de aprovação. ✅', { inline_keyboard: [VOLTAR] })
      return
    }
    /**
     * Uma mensagem por pedido, com os botões de decidir.
     *
     * Antes isto era uma lista de texto: para aprovar era preciso ir procurar a mensagem original
     * com a foto, que pode estar a centenas de mensagens de distância. Um pedido que só se aprova
     * depois de o encontrar é um pedido que fica dias parado — e foi o que aconteceu.
     *
     * Os botões são os MESMOS do gate (`bkapprove:` / `bkreject:`), não uma segunda via: aprovar
     * daqui faz exactamente o que aprovar de lá faz. A única diferença é que a legenda da foto
     * original não se altera (esta mensagem não tem foto) — a confirmação chega pela mensagem que
     * o lead recebe.
     */
    await enviar(chatId, `🔓 <b>Pendentes de aprovação (${data.length})</b>`, { inline_keyboard: [VOLTAR] })
    for (const l of data) {
      const x = l as { first_name?: string; broker_uid?: string; chat_id?: string }
      await enviar(
        chatId,
        `• <b>${x.first_name ?? '?'}</b> — UID <code>${x.broker_uid ?? '?'}</code>`,
        {
          inline_keyboard: [
            [
              { text: '✅ Aprovar', callback_data: `bkapprove:${x.chat_id}` },
              { text: '❌ Rejeitar', callback_data: `bkreject:${x.chat_id}` },
            ],
            [{ text: '🔎 Ver a folha desta pessoa', callback_data: `admin:quem:${x.chat_id}` }],
          ],
        },
      )
    }
    return
  }
  if (action === 'subs') {
    const { count: premium } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('member_category', 'premium')
      .eq('is_active', true)
    const { count: ativas } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('subscription_status', 'active')
    const { count: libertados } = await supabase
      .from('telegram_leads')
      .select('chat_id', { count: 'exact', head: true })
      .eq('stage', 'granted')
    await enviar(
      chatId,
      `👑 <b>Subscrições</b>\n\nPremium ativos: <b>${premium ?? 0}</b>\nSubscrições ativas (todas): <b>${ativas ?? 0}</b>\nLeads com acesso broker: <b>${libertados ?? 0}</b>`,
      { inline_keyboard: [[{ text: '🌐 Utilizadores no /admin', url: `${SITE}/admin?tab=users` }], VOLTAR] },
    )
    return
  }

  // ── Máquina de vendas ──
  if (action.startsWith('sm_')) {
    const { buildSalesState, runSalesCommand, salesStateSummary } = await import('@/lib/sales-machine')
    if (action === 'sm_state') {
      const s = await buildSalesState()
      await enviar(chatId, `⚙️ <b>Máquina de vendas</b>\n\n${salesStateSummary(s)}`, tecladoMaquinaVendas())
      return
    }
    // Ligar/desligar o autopilot publica conteúdo em nome da marca: dois toques.
    if (action === 'sm_on?' || action === 'sm_off?') {
      const ligar = action === 'sm_on?'
      await enviar(
        chatId,
        `⚠️ <b>Confirmas?</b>\n\n${ligar ? 'LIGAR' : 'DESLIGAR'} o autopilot de conteúdo (marca + Ricardo).` +
          (ligar ? '\n\nPassa a gerar e agendar conteúdo para aprovação.' : '\n\nDeixa de gerar conteúdo novo.'),
        {
          inline_keyboard: [
            [{ text: `✅ Sim, ${ligar ? 'ligar' : 'desligar'}`, callback_data: ligar ? 'admin:sm_on!' : 'admin:sm_off!' }],
            [{ text: '↩️ Não, voltar', callback_data: 'admin:sm' }],
          ],
        },
      )
      return
    }
    if (action === 'sm_on!' || action === 'sm_off!' || action === 'sm_on' || action === 'sm_off') {
      const ligar = action.startsWith('sm_on')
      await runSalesCommand({ action: 'set_autopilot', account: 'morethanmoney', on: ligar })
      await runSalesCommand({ action: 'set_autopilot', account: 'ricardo', on: ligar })
      await enviar(
        chatId,
        ligar
          ? '🟢 <b>Autopilot LIGADO</b> — conteúdo gerado e agendado para aprovação (marca + Ricardo).'
          : '🔴 <b>Autopilot DESLIGADO</b> — deixa de gerar conteúdo novo.',
        tecladoMaquinaVendas(),
      )
      return
    }
    if (action === 'sm_generate') {
      await enviar(chatId, '✍️ A gerar conteúdo…')
      const r = await runSalesCommand({ action: 'generate_now' })
      await enviar(
        chatId,
        r.ok ? '✅ Conteúdo gerado — vai a rascunhos para aprovares.' : `⚠️ Falhou: ${r.error ?? 'erro'}`,
        tecladoMaquinaVendas(),
      )
      return
    }
    if (action === 'sm_digest') {
      await enviar(chatId, '📨 A preparar o digest de vendas…')
      const r = await runSalesCommand({ action: 'digest_now' })
      await enviar(chatId, r.ok ? '✅ Digest de vendas gerado.' : `⚠️ Falhou: ${r.error ?? 'erro'}`, tecladoMaquinaVendas())
      return
    }
  }

  // Um botão antigo de uma mensagem antiga não pode ficar sem resposta.
  await enviar(chatId, '🤔 Esse botão já não existe. Aqui está o painel:', adminPanelKeyboard())
}

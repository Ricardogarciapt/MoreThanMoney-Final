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
 *  1. SÓ O DONO, E MAIS NINGUÉM. Pedido dele a 24/09: «permite-me apenas a mim como admin».
 *     A autoridade vem de UM sítio só — `TELEGRAM_ADMIN_CHAT_ID` (ou o valor por defeito, que é
 *     o chat dele). O que está gravado em `site_settings.telegram_admin_chat_id` diz apenas PARA
 *     ONDE se manda um aviso; **não dá acesso a nada**. Ver `ehChatDeAdmin`.
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
import { abrirPorta, portaAberta } from '@/lib/telegram-admin-porta'


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
 * É o chat do dono? **Um só chat, e vem do ambiente.**
 *
 * Aceitava também o valor gravado em `site_settings`. Deixou de aceitar (24/09, pedido do dono).
 * A razão é que esse valor é ESCRITO pelo sistema, e um valor escrito não pode ser a fonte de
 * quem manda: foi exactamente por aí que o `/admin` passou meses a dar o painel a quem o
 * escrevesse primeiro. Corrigiu-se o upsert de manhã — isto fecha a porta do outro lado, para
 * que nem um upsert errado, nem uma base reposta, nem uma linha mexida à mão dêem acesso.
 *
 * Quem é dono passa a mudar-se num sítio só: a variável `TELEGRAM_ADMIN_CHAT_ID` na Vercel.
 * `chatDeAdminGravado` continua a existir, mas só responde à pergunta «para onde mando o aviso».
 */
export async function ehChatDeAdmin(_supabase: Supa, chatId: string | number | null | undefined): Promise<boolean> {
  if (chatId == null) return false
  return String(chatId) === chatDeAdminDoAmbiente()
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

/** A prova de um depósito é uma FOTO. Mostrá-la aqui poupa ir procurá-la centenas de mensagens acima. */
const enviarFoto = (chatId: string | number, fotoId: string, legenda: string, teclado?: unknown) =>
  tg('sendPhoto', {
    chat_id: chatId,
    photo: fotoId,
    caption: legenda.slice(0, 1000),
    parse_mode: 'HTML',
    ...(teclado ? { reply_markup: teclado } : {}),
  })

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
      // A primeira linha é a primeira pergunta do dia — e a que decide, que é onde há dinheiro parado.
      [
        { text: '🧠 Hoje', callback_data: 'admin:hoje' },
        { text: '🙋 A decidir', callback_data: 'admin:decidir' },
      ],
      [
        { text: '🔎 Cliente', callback_data: 'admin:cliente' },
        { text: '🩺 Estado do sistema', callback_data: 'admin:sys' },
      ],
      [
        { text: '💵 Depósitos', callback_data: 'admin:dep' },
        { text: '🏧 Levantamentos', callback_data: 'admin:lev' },
      ],
      [
        { text: '💰 Contas e equidade', callback_data: 'admin:contas' },
        { text: '📊 Desempenho 30d', callback_data: 'admin:perf' },
      ],
      [
        { text: '📡 Sinais de hoje', callback_data: 'admin:sinais' },
        { text: '⚙️ Execução', callback_data: 'admin:exec' },
      ],
      [{ text: '🧲 Máquina de vendas', callback_data: 'admin:sm' }],
      // A equipa de vendas e o MLM: quem faz o quê, o pipeline, e o dinheiro que está à espera de
      // um sim dele. Sem isto, uma comissão de alguém que trabalhou ficava semanas parada à espera
      // de ele abrir o portátil — foi exactamente o que aconteceu com os depósitos.
      [{ text: '👔 Equipa e MLM', callback_data: 'admin:eq' }],
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

  /*
   * ── O QUE MEXE EM DINHEIRO OU EM ACESSOS ────────────────────────────────────────────────────
   *
   * Três regras, e são as mesmas para os três blocos abaixo (depósitos, levantamentos, ofertas):
   *
   *  · a porta reabre-se aqui, no servidor, e traz a identidade que vai assinar o registo — o
   *    `ehChatDeAdmin` de cima diz QUEM é, `abrirPorta` diz EM NOME DE QUEM fica escrito;
   *  · `?` pergunta e `!` faz, sempre, sem excepção;
   *  · nada disto move dinheiro. Muda registos nossos e manda mensagens nossas.
   */

  // ── Depósitos: dep?ok|no:<chat> pergunta, dep!ok|no:<chat> faz ──
  if (action.startsWith('dep?') || action.startsWith('dep!')) {
    const m = action.match(/^dep([?!])(ok|no):(.+)$/)
    if (!m) {
      await enviar(chatId, '🤔 Esse botão já não existe.', adminPanelKeyboard())
      return
    }
    const [, modo, decisao, leadChat] = m
    const dinheiro = await import('@/lib/telegram-admin-dinheiro')
    if (modo === '?') {
      const fila = await dinheiro.carregarPendentesDeDeposito(supabase, 30)
      const pedido = fila.find((x) => x.chatId === leadChat)
      const c = dinheiro.confirmacaoDeposito({
        aprovar: decisao === 'ok',
        chatIdLead: leadChat,
        nome: pedido?.nome ?? leadChat,
        leitura: pedido?.leitura ?? { certeza: 'nao_sei', valorUsd: null, frase: '', automatico: false },
      })
      await enviar(chatId, c.texto, c.teclado)
      return
    }
    const porta = await abrirPorta(supabase, chatId)
    if (!portaAberta(porta)) {
      await enviar(chatId, porta.fechada)
      return
    }
    const texto = decisao === 'ok'
      ? await dinheiro.aprovarDeposito(supabase, porta, leadChat)
      : await dinheiro.recusarDeposito(supabase, porta, leadChat)
    await enviar(chatId, texto, { inline_keyboard: [[{ text: '💵 Voltar aos depósitos', callback_data: 'admin:dep' }], VOLTAR] })
    return
  }

  // ── Levantamentos: lv?<letra>:<id> pergunta, lv!<letra>:<id>[:<motivo>] faz ──
  if (action.startsWith('lv?') || action.startsWith('lv!')) {
    const m = action.match(/^lv([?!])([eapr]):([0-9a-f-]{36})(?::([a-z]))?$/i)
    if (!m) {
      await enviar(chatId, '🤔 Esse botão já não existe.', adminPanelKeyboard())
      return
    }
    const [, modo, letra, id, chaveMotivo] = m
    const dinheiro = await import('@/lib/telegram-admin-dinheiro')
    const para = dinheiro.DESTINOS[letra]
    const pedido = await dinheiro.carregarPedidoDeLevantamento(supabase, id)
    if (!pedido) {
      await enviar(chatId, '🤷 Não encontrei esse pedido.', { inline_keyboard: [VOLTAR] })
      return
    }
    if (modo === '?') {
      // Recusar não precisa de guarda: é sempre permitido, e é o que se faz quando uma regra trava.
      if (para !== 'recusado') {
        const v = dinheiro.avaliarLevantamento(pedido, para)
        if (!v.pode) {
          await enviar(
            chatId,
            `🚫 <b>Não posso ${para === 'pago' ? 'marcar como pago' : 'aprovar'}.</b>\n\n${v.porque}` +
              (v.regra ? `\n\n<b>A regra:</b> ${v.regra}` : ''),
            { inline_keyboard: [[{ text: '❌ Recusar com este motivo', callback_data: `admin:lv?r:${id}` }], [{ text: '🏧 Voltar', callback_data: 'admin:lev' }], VOLTAR] },
          )
          return
        }
      }
      const c = dinheiro.confirmacaoLevantamento(pedido, para)
      await enviar(chatId, c.texto, c.teclado)
      return
    }
    const porta = await abrirPorta(supabase, chatId)
    if (!portaAberta(porta)) {
      await enviar(chatId, porta.fechada)
      return
    }
    const motivo = para === 'recusado'
      ? dinheiro.MOTIVOS_DE_RECUSA[chaveMotivo ?? 'o'] ?? dinheiro.MOTIVOS_DE_RECUSA.o
      : `decidido no Telegram pelo admin (${porta.adminEmail})`
    const texto = await dinheiro.aplicarLevantamento(porta, id, para, motivo)
    await enviar(chatId, texto, { inline_keyboard: [[{ text: '🏧 Voltar aos levantamentos', callback_data: 'admin:lev' }], VOLTAR] })
    return
  }

  // ── Oferta de venda: of?<chat> pergunta, of!<chat> manda ──
  if (action.startsWith('of?') || action.startsWith('of!')) {
    const leadChat = action.slice(3)
    const { estadoDeVenda, mandarOferta } = await import('@/lib/telegram-admin-vendas')
    const { ofertaMostravel, textoOferta } = await import('@/lib/telegram-admin-oferta')
    const e = await estadoDeVenda(supabase, leadChat)
    if (!e) {
      await enviar(chatId, '🤷 Não encontrei essa pessoa.', { inline_keyboard: [VOLTAR] })
      return
    }
    const o = ofertaMostravel(e.estado)
    if (action.startsWith('of?')) {
      if (!o.mensagem) {
        await enviar(chatId, textoOferta(e.nome, e.estado, o), { inline_keyboard: [VOLTAR] })
        return
      }
      const { pedirConfirmacao } = await import('@/lib/telegram-admin-porta')
      const c = pedirConfirmacao({
        titulo: `Mandar a ${e.nome}: ${o.titulo}`,
        vaiAcontecer: ['A pessoa recebe esta mensagem no Telegram, agora.', 'Fica registado em teu nome.'],
        naoVaiAcontecer: ['Não cobra nada nem emite cupão nenhum — é só a mensagem.'],
        fazer: `admin:of!${leadChat}`,
        voltar: 'admin:fecho',
        rotuloSim: '📨 Sim, mandar',
      })
      await enviar(chatId, `${textoOferta(e.nome, e.estado, o)}\n\n${c.texto}`, c.teclado)
      return
    }
    const porta = await abrirPorta(supabase, chatId)
    if (!portaAberta(porta)) {
      await enviar(chatId, porta.fechada)
      return
    }
    await enviar(chatId, await mandarOferta(porta, leadChat), { inline_keyboard: [[{ text: '🎯 Voltar ao fecho', callback_data: 'admin:fecho' }], VOLTAR] })
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
    const chave = action.slice(5)
    const p = await carregarPerfil(supabase, chave)
    await enviar(
      chatId,
      p ? textoPerfil(p) : '🤷 Não encontrei ninguém com essa chave.',
      {
        inline_keyboard: [
          // A folha diz quem é e o que falta; a oferta é o passo a seguir, e estava a um portátil
          // de distância. `of?` só pergunta — mandar é o segundo toque.
          ...(p ? [[{ text: '🧲 Oferta para esta pessoa', callback_data: `admin:of?${chave}` }]] : []),
          ...(p ? [[{ text: '💰 O que tem connosco', callback_data: `admin:cli:${chave}` }]] : []),
          [{ text: '🎯 Voltar ao fecho', callback_data: 'admin:fecho' }],
          VOLTAR,
        ],
      },
    )
    return
  }

  // ── A folha de saldos de uma pessoa (o mesmo que /cliente, mas a um toque) ──
  if (action.startsWith('cli:')) {
    const { carregarFolhaDeCliente, textoFolha } = await import('@/lib/telegram-admin-cliente')
    const f = await carregarFolhaDeCliente(supabase, action.slice(4))
    await enviar(chatId, f ? textoFolha(f) : '🤷 Não encontrei ninguém com essa chave.', { inline_keyboard: [VOLTAR] })
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

  /*
   * ── EQUIPA, PAPÉIS, COMISSÕES E MLM ──────────────────────────────────────────────────────────
   *
   * As mesmas três regras dos blocos de cima, e por isso o mesmo desenho: `?` pergunta, `!` faz, e
   * o `!` só corre depois de `abrirPorta` — que é o que traz a identidade que assina o registo.
   *
   * O que aqui NÃO existe é um botão de PAGAR. Aprovar uma comissão autoriza; o dinheiro sai por
   * transferência, com as mãos dele, e marca-se pago no /admin com a referência à frente. Um botão
   * de pagar num telemóvel era a definição de «nada paga sozinho» ao contrário.
   */

  // ── Comissões: cm?a|c:<uuid> pergunta, cm!a|c:<uuid> decide ──
  if (action.startsWith('cm?') || action.startsWith('cm!')) {
    const m = action.match(/^cm([?!])([ac]):([0-9a-f-]{36})$/i)
    if (!m) {
      await enviar(chatId, '🤔 Esse botão já não existe.', adminPanelKeyboard())
      return
    }
    const [, modo, letra, id] = m
    const decisao = letra.toLowerCase() === 'a' ? 'aprovada' : 'cancelada'
    const equipa = await import('@/lib/telegram-admin-equipa')
    if (modo === '?') {
      // Relê-se a fila para a pergunta trazer o VALOR e o NOME de agora, e não os do ecrã anterior:
      // uma confirmação que repita números velhos é uma confirmação que não confirma nada.
      const { fila } = await equipa.carregarComissoesPendentes(supabase, 200)
      const c = fila.find((x) => x.id.toLowerCase() === id.toLowerCase())
      if (!c) {
        await enviar(chatId, 'ℹ️ Essa comissão já não está pendente — alguém decidiu entretanto.', {
          inline_keyboard: [[{ text: '💸 Ver as que faltam', callback_data: 'admin:eq_com' }], VOLTAR],
        })
        return
      }
      const q = equipa.confirmacaoComissao({ decisao, c })
      await enviar(chatId, q.texto, q.teclado)
      return
    }
    const porta = await abrirPorta(supabase, chatId)
    if (!portaAberta(porta)) {
      await enviar(chatId, porta.fechada)
      return
    }
    const { decidirComissao } = await import('@/lib/telegram-admin-equipa-acoes')
    await enviar(chatId, await decidirComissao(porta, id, decisao), {
      inline_keyboard: [[{ text: '💸 Voltar às comissões', callback_data: 'admin:eq_com' }], VOLTAR],
    })
    return
  }

  // ── Papéis: pp?d|r + letra do papel + :<uuid> pergunta; pp! faz ──
  if (action.startsWith('pp?') || action.startsWith('pp!')) {
    const m = action.match(/^pp([?!])([dr])([ascrt]):([0-9a-f-]{36})$/i)
    if (!m) {
      await enviar(chatId, '🤔 Esse botão já não existe.', adminPanelKeyboard())
      return
    }
    const [, modo, acto, codigo, userId] = m
    const equipa = await import('@/lib/telegram-admin-equipa')
    const papel = equipa.papelDoCodigo(codigo.toLowerCase())
    if (!papel) {
      await enviar(chatId, '🤔 Papel desconhecido nesse botão.', adminPanelKeyboard())
      return
    }
    const dar = acto.toLowerCase() === 'd'
    if (modo === '?') {
      const lista = await equipa.carregarEquipa(supabase)
      const p = lista.find((x) => x.userId.toLowerCase() === userId.toLowerCase())
      const { carregarFolhaDeCliente } = await import('@/lib/telegram-admin-cliente')
      // Pode ser alguém que ainda não tem papel nenhum (é o caso normal do primeiro papel): aí o
      // nome vem da folha do cliente. Perguntar «dar papel a <uuid>?» não é perguntar nada.
      const nome = p?.nome ?? (await carregarFolhaDeCliente(supabase, userId))?.nome ?? userId.slice(0, 8)
      const q = equipa.confirmacaoPapel({ dar, papel, quem: nome, userId })
      await enviar(chatId, q.texto, q.teclado)
      return
    }
    const porta = await abrirPorta(supabase, chatId)
    if (!portaAberta(porta)) {
      await enviar(chatId, porta.fechada)
      return
    }
    const { mexerPapel } = await import('@/lib/telegram-admin-equipa-acoes')
    await enviar(chatId, await mexerPapel(porta, userId, papel, dar), {
      inline_keyboard: [[{ text: '👤 Ver esta pessoa', callback_data: `admin:eq_p:${userId}` }], [{ text: '🎚️ Voltar aos papéis', callback_data: 'admin:eq_papeis' }], VOLTAR],
    })
    return
  }

  // ── Plano de comissão: pl?l|p:<uuid> pergunta, pl!l|p:<uuid> faz ──
  if (action.startsWith('pl?') || action.startsWith('pl!')) {
    const m = action.match(/^pl([?!])([lp]):([0-9a-f-]{36})$/i)
    if (!m) {
      await enviar(chatId, '🤔 Esse botão já não existe.', adminPanelKeyboard())
      return
    }
    const [, modo, codigo, userId] = m
    const equipa = await import('@/lib/telegram-admin-equipa')
    const plano = equipa.planoDoCodigo(codigo.toLowerCase())
    if (!plano) {
      await enviar(chatId, '🤔 Plano desconhecido nesse botão.', adminPanelKeyboard())
      return
    }
    if (modo === '?') {
      const lista = await equipa.carregarEquipa(supabase)
      const p = lista.find((x) => x.userId.toLowerCase() === userId.toLowerCase())
      const q = equipa.confirmacaoPlano({
        plano,
        quem: p?.nome ?? userId.slice(0, 8),
        userId,
        planoActual: p?.plano ?? 'padrao',
      })
      await enviar(chatId, q.texto, q.teclado)
      return
    }
    const porta = await abrirPorta(supabase, chatId)
    if (!portaAberta(porta)) {
      await enviar(chatId, porta.fechada)
      return
    }
    const { mudarPlano } = await import('@/lib/telegram-admin-equipa-acoes')
    await enviar(chatId, await mudarPlano(porta, userId, plano), {
      inline_keyboard: [[{ text: '👤 Ver esta pessoa', callback_data: `admin:eq_p:${userId}` }], [{ text: '🎚️ Voltar aos papéis', callback_data: 'admin:eq_papeis' }], VOLTAR],
    })
    return
  }

  // ── A folha de uma pessoa da equipa (papéis que tem, plano em que está) ──
  if (action.startsWith('eq_p:')) {
    const userId = action.slice(5)
    const equipa = await import('@/lib/telegram-admin-equipa')
    const lista = await equipa.carregarEquipa(supabase)
    const p = lista.find((x) => x.userId === userId)
    if (!p) {
      await enviar(chatId, '🤷 Essa pessoa já não tem papel activo.', { inline_keyboard: [[{ text: '🎚️ Voltar aos papéis', callback_data: 'admin:eq_papeis' }], VOLTAR] })
      return
    }
    await enviar(chatId, equipa.textoPessoa(p), equipa.tecladoPessoa(p, VOLTAR))
    return
  }

  switch (action) {
    case 'menu':
      await enviar(chatId, TEXTO_PAINEL, adminPanelKeyboard())
      return
    case 'hoje': {
      const { carregarHoje, textoHoje, tecladoHoje } = await import('@/lib/telegram-admin-hoje')
      const h = await carregarHoje(supabase)
      await enviar(chatId, textoHoje(h), tecladoHoje(h, VOLTAR))
      return
    }
    /**
     * A fila de tudo o que está à espera de uma decisão dele, num sítio só.
     *
     * Depósitos e levantamentos vivem em tabelas diferentes e chegam por caminhos diferentes, mas
     * a pergunta é a mesma — «tenho alguma coisa parada à minha espera?». Duas listas separadas
     * respondem-lhe duas vezes; uma responde-lhe uma.
     */
    case 'decidir': {
      const { carregarPendentesDeDeposito, carregarLevantamentosAbertos } = await import('@/lib/telegram-admin-dinheiro')
      const [deps, levs] = await Promise.all([
        carregarPendentesDeDeposito(supabase, 10),
        carregarLevantamentosAbertos(supabase, 10),
      ])
      if (!deps.length && !levs.length) {
        await enviar(chatId, '✅ <b>Nada à tua espera.</b>\n\nSem pedidos de acesso e sem levantamentos por decidir.', {
          inline_keyboard: [[{ text: '🚨 O que precisa de mim', callback_data: 'admin:falhas' }], VOLTAR],
        })
        return
      }
      const linhas = [
        '🙋 <b>À tua espera</b>',
        '',
        deps.length ? `💵 <b>${deps.length} pedido(s) de acesso</b> — depósito por validar` : '',
        ...deps.slice(0, 5).map((d) => `   • ${d.nome}${d.uid ? ` · UID ${d.uid}` : ''}`),
        levs.length ? `\n🏧 <b>${levs.length} levantamento(s)</b> por decidir` : '',
        ...levs.slice(0, 5).map((l) => `   • ${l.quem} — ${l.valorUsd} USD (${l.estado})`),
      ].filter(Boolean)
      const botoes: Botao[][] = []
      if (deps.length) botoes.push([{ text: `💵 Ver os ${deps.length} depósitos`, callback_data: 'admin:dep' }])
      if (levs.length) botoes.push([{ text: `🏧 Ver os ${levs.length} levantamentos`, callback_data: 'admin:lev' }])
      botoes.push(VOLTAR)
      await enviar(chatId, linhas.join('\n'), { inline_keyboard: botoes })
      return
    }
    case 'cliente':
      await enviar(
        chatId,
        '🔎 <b>A folha de um cliente</b>\n\n' +
          'Escreve <code>/cliente &lt;chave&gt;</code>. A chave é o que tiveres à mão:\n' +
          '• email · <code>/cliente joao@exemplo.pt</code>\n' +
          '• login MT5 · <code>/cliente 1234567</code>\n' +
          '• UID da corretora, id do perfil, chat do Telegram ou @username\n\n' +
          'Respondo com a assinatura, o que a corretora diz e o saldo de <b>todas</b> as contas que essa pessoa tem connosco — ' +
          'e digo sempre quando um número é velho ou não existe.',
        { inline_keyboard: [[{ text: '🎯 Quem está a fechar', callback_data: 'admin:fecho' }], VOLTAR] },
      )
      return
    /**
     * A fila dos depósitos — uma mensagem POR pedido, com a foto da prova.
     *
     * Em texto corrido era preciso ir procurar a foto original, que pode estar a centenas de
     * mensagens de distância; um pedido que só se aprova depois de o encontrar é um pedido que
     * fica dias parado. Os botões são os do painel novo, que passam pelo mesmo `grantBrokerAccess`
     * dos botões da foto original.
     */
    case 'dep': {
      const { carregarPendentesDeDeposito, textoDeposito, tecladoDeposito } = await import('@/lib/telegram-admin-dinheiro')
      const fila = await carregarPendentesDeDeposito(supabase, 10)
      if (!fila.length) {
        await enviar(chatId, '💵 <b>Depósitos</b>\n\nSem pedidos à espera. ✅', { inline_keyboard: [VOLTAR] })
        return
      }
      await enviar(chatId, `💵 <b>Depósitos por validar (${fila.length})</b>`, { inline_keyboard: [VOLTAR] })
      for (const d of fila) {
        const teclado = tecladoDeposito(d.chatId, VOLTAR)
        if (d.fotoId) await enviarFoto(chatId, d.fotoId, textoDeposito(d), teclado)
        else await enviar(chatId, `${textoDeposito(d)}\n\n<i>Esta pessoa não enviou print — foi validada pela lista da corretora ou está a meio.</i>`, teclado)
      }
      return
    }
    case 'lev': {
      const { carregarLevantamentosAbertos, carregarPedidoDeLevantamento, textoLevantamento, tecladoLevantamento } =
        await import('@/lib/telegram-admin-dinheiro')
      const fila = await carregarLevantamentosAbertos(supabase, 6)
      if (!fila.length) {
        await enviar(
          chatId,
          '🏧 <b>Levantamentos</b>\n\nNenhum por decidir.\n\n<i>Nunca houve nenhum pedido até hoje — quando houver, aparece aqui.</i>',
          { inline_keyboard: [VOLTAR] },
        )
        return
      }
      await enviar(chatId, `🏧 <b>Levantamentos por decidir (${fila.length})</b>`, { inline_keyboard: [VOLTAR] })
      for (const l of fila) {
        const p = await carregarPedidoDeLevantamento(supabase, l.id)
        if (!p) continue
        await enviar(chatId, `<b>${l.quem}</b>\n${textoLevantamento(p)}`, tecladoLevantamento(p, VOLTAR))
      }
      return
    }
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
    /**
     * O submenu da equipa. O cabeçalho já traz o número que decide se vale a pena entrar: quantas
     * comissões estão à espera e quanto está em jogo. Um menu que obrigue a abrir um submenu para
     * saber se há trabalho é um menu que ninguém abre.
     */
    case 'eq': {
      const { carregarComissoesPendentes, tecladoEquipa, eur } = await import('@/lib/telegram-admin-equipa')
      const r = await carregarComissoesPendentes(supabase, 1)
      await enviar(
        chatId,
        '👔 <b>Equipa e MLM</b>\n\n' +
          (r.quantas
            ? `💸 <b>${r.quantas}</b> comissão(ões) por aprovar — <b>${eur(r.totalCents)}</b> em jogo.`
            : '💸 Nada por aprovar. ✅') +
          '\n\n<i>Aprovar autoriza; pagar é contigo, na transferência.</i>',
        tecladoEquipa(VOLTAR),
      )
      return
    }
    case 'eq_equipa': {
      const { carregarEquipa, textoEquipa } = await import('@/lib/telegram-admin-equipa')
      await enviar(chatId, textoEquipa(await carregarEquipa(supabase)), {
        inline_keyboard: [
          [{ text: '🎚️ Dar/retirar papel', callback_data: 'admin:eq_papeis' }],
          [{ text: '🌐 Backoffice no /admin', url: `${SITE}/admin/backoffice` }],
          VOLTAR,
        ],
      })
      return
    }
    case 'eq_pipe': {
      const { carregarPipeline, textoPipeline } = await import('@/lib/telegram-admin-equipa')
      await enviar(chatId, textoPipeline(await carregarPipeline(supabase)), {
        inline_keyboard: [[{ text: '🌐 Vendas no /admin', url: `${SITE}/admin/vendas` }], VOLTAR],
      })
      return
    }
    /**
     * A fila das comissões — uma MENSAGEM por comissão, com os botões de decidir.
     *
     * A lição dos depósitos: uma lista de texto obriga a ir procurar a linha noutro sítio para
     * agir, e um pedido que só se decide depois de o encontrar é um pedido que fica dias parado.
     */
    case 'eq_com': {
      const { carregarComissoesPendentes, textoComissoesResumo, textoComissao, tecladoComissao } =
        await import('@/lib/telegram-admin-equipa')
      const r = await carregarComissoesPendentes(supabase, 8)
      await enviar(chatId, textoComissoesResumo(r), {
        inline_keyboard: [[{ text: '🌐 Comissões no /admin', url: `${SITE}/admin/vendas` }], VOLTAR],
      })
      for (const c of r.fila) await enviar(chatId, textoComissao(c), tecladoComissao(c, VOLTAR))
      if (r.quantas > r.fila.length) {
        await enviar(chatId, `<i>Mostrei as ${r.fila.length} mais antigas de ${r.quantas}. Toca outra vez depois de decidires estas.</i>`, {
          inline_keyboard: [[{ text: '💸 Recarregar', callback_data: 'admin:eq_com' }], VOLTAR],
        })
      }
      return
    }
    case 'eq_mlm': {
      const { carregarEstadoMlm, textoMlm } = await import('@/lib/telegram-admin-equipa')
      // Sem botão para «MLM no /admin»: essa página não existe (o MLM vive dentro do /admin/vendas).
      // Um atalho que dá 404 faz duvidar do resto do painel — já aconteceu uma vez.
      await enviar(chatId, textoMlm(await carregarEstadoMlm(supabase)), {
        inline_keyboard: [[{ text: '🌐 Comissões no /admin', url: `${SITE}/admin/vendas` }], VOLTAR],
      })
      return
    }
    case 'eq_papeis': {
      const { carregarEquipa, tecladoEscolherPessoa } = await import('@/lib/telegram-admin-equipa')
      const lista = await carregarEquipa(supabase)
      await enviar(
        chatId,
        '🎚️ <b>Papéis e planos</b>\n\n' +
          (lista.length
            ? 'Escolhe a pessoa. No ecrã dela dás ou retiras papéis e mudas o plano de comissão — sempre com confirmação.'
            : 'Ninguém tem papel activo ainda.') +
          '\n\n<i>Para dar o PRIMEIRO papel a quem ainda não está na lista, usa o /admin: aqui só aparece quem já tem algum.</i>',
        tecladoEscolherPessoa(lista, VOLTAR),
      )
      return
    }
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

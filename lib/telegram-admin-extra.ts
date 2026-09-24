/**
 * O PAINEL DE ADMIN, A PARTE FUNDA — o que ele faz mesmo todos os dias.
 *
 * O painel de base responde a «como está o sistema?». Isto responde às três perguntas que ele faz
 * a seguir e que, até hoje, obrigavam a abrir o portátil:
 *
 *   • «quem é que eu devo abordar hoje?»        → prospeção
 *   • «quem está prestes a fechar, e falta o quê?» → fecho
 *   • «o que é que falhou hoje?»                 → falhas
 *
 * E um quarto, que é o que transforma um painel de leitura num painel de trabalho: disparar um
 * cron sem ir à Vercel.
 *
 * ── AS REGRAS SÃO AS MESMAS DO PAINEL DE BASE ──────────────────────────────────────────────────
 *  1. Só o admin verificado no servidor — quem chama isto já passou pelo `ehChatDeAdmin`.
 *  2. O que mexe em dinheiro, em execução, ou que MANDA MENSAGENS A CLIENTES pede dois toques.
 *     Um cron que envia seguimentos a cinquenta leads não pode disparar com o polegar a passar.
 *  3. Nada aqui envia uma mensagem a um estranho. A prospeção prepara; quem aborda é ele.
 *
 *   npx tsx lib/__tests__/telegram-admin-extra.check.ts
 */
import { prontidaoDeFecho, type DadosDeFecho } from '@/lib/prospecao/pontuacao-fecho'

type Supa = {
  from: (t: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ─────────────────────────────── OS CRONS À MÃO ───────────────────────────────

export interface CronDoPainel {
  chave: string
  rota: string
  nome: string
  /**
   * Manda alguma coisa para fora — mensagens a clientes, publicações, cobranças.
   *
   * É isto que decide se o botão pede confirmação. Um relatório que se gera duas vezes não faz
   * mal a ninguém; uma ronda de seguimentos disparada duas vezes é a mesma pessoa a receber a
   * mesma mensagem duas vezes, e isso não se desfaz.
   */
  mexe: boolean
  oQueFaz: string
}

export const CRONS_DO_PAINEL: CronDoPainel[] = [
  { chave: 'contas', rota: 'accounts-daily-report', nome: '💰 Relatório de contas', mexe: false, oQueFaz: 'Relê as contas e a equidade.' },
  { chave: 'prosp', rota: 'prospecao-radar', nome: '🧲 Arrumar prospeção', mexe: false, oQueFaz: 'Refaz o mapa dos grupos e a lista de contactos.' },
  { chave: 'pips', rota: 'pips-proof', nome: '📈 Prova em pips', mexe: false, oQueFaz: 'Recalcula a prova pública.' },
  { chave: 'broker', rota: 'broker-dados-frescura', nome: '🏦 Frescura da corretora', mexe: false, oQueFaz: 'Verifica se os dados da corretora estão velhos.' },
  { chave: 'stats', rota: 'landing-stats', nome: '🔢 Números da landing', mexe: false, oQueFaz: 'Actualiza os números da página inicial.' },
  { chave: 'digest', rota: 'sales-digest', nome: '📨 Digest de vendas', mexe: true, oQueFaz: 'Gera e ENVIA o resumo de vendas.' },
  { chave: 'follow', rota: 'lead-followup', nome: '📣 Seguimentos aos leads', mexe: true, oQueFaz: 'ENVIA mensagens de reactivação a até 50 leads.' },
  { chave: 'renova', rota: 'broker-gate-renew', nome: '🔁 Renovar acessos', mexe: true, oQueFaz: 'Renova e REVOGA acessos conforme o saldo na corretora.' },
]

/** Um botão do painel. O mesmo formato do `telegram-admin-menu`, para os teclados se misturarem. */
interface Botao {
  text: string
  callback_data?: string
  url?: string
}

/** Pura: o teclado dos crons. Os que mexem levam `?` — o toque que executa é o `!`. */
export function tecladoCrons(voltar: Botao[]) {
  const linhas: Botao[][] = []
  for (let i = 0; i < CRONS_DO_PAINEL.length; i += 2) {
    linhas.push(
      CRONS_DO_PAINEL.slice(i, i + 2).map((c) => ({
        text: `${c.mexe ? '⚠️ ' : ''}${c.nome}`,
        callback_data: `admin:cr${c.mexe ? '?' : '!'}${c.chave}`,
      })),
    )
  }
  linhas.push(voltar)
  return { inline_keyboard: linhas }
}

/** Pura: a pergunta antes de um cron que manda coisas para fora. */
export function confirmacaoCron(chave: string) {
  const c = CRONS_DO_PAINEL.find((x) => x.chave === chave)
  if (!c) return null
  return {
    texto: `⚠️ <b>Confirmas?</b>\n\nCorrer <b>${esc(c.nome)}</b>.\n\n${esc(c.oQueFaz)}\n\n<i>Isto sai para fora e não se desfaz.</i>`,
    teclado: {
      inline_keyboard: [
        [{ text: '✅ Sim, correr', callback_data: `admin:cr!${chave}` }],
        [{ text: '↩️ Não, voltar', callback_data: 'admin:crons' }],
      ],
    },
  }
}

/** Dispara o cron pela mesma porta que a Vercel usa — sem atalhos nem segundas verdades. */
export async function dispararCron(chave: string, site: string): Promise<string> {
  const c = CRONS_DO_PAINEL.find((x) => x.chave === chave)
  if (!c) return `⚠️ Cron desconhecido: <code>${esc(chave)}</code>`
  const segredo = process.env.CRON_SECRET?.trim()
  if (!segredo) return '⚠️ Sem <code>CRON_SECRET</code> no ambiente — não consigo disparar nada daqui.'
  try {
    const r = await fetch(`${site}/api/cron/${c.rota}`, {
      headers: { authorization: `Bearer ${segredo}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    })
    const corpo = await r.text()
    return r.ok
      ? `✅ <b>${esc(c.nome)}</b> correu.\n\n<code>${esc(corpo.slice(0, 500))}</code>`
      : `⚠️ <b>${esc(c.nome)}</b> respondeu ${r.status}.\n\n<code>${esc(corpo.slice(0, 300))}</code>`
  } catch (e) {
    return `⚠️ Não consegui correr <b>${esc(c.nome)}</b>: ${esc(e instanceof Error ? e.message : 'erro')}`
  }
}

// ─────────────────────────────── FECHO ───────────────────────────────

/**
 * Os leads por prontidão de fecho, com o próximo passo de cada um.
 *
 * Lê-se tudo de uma vez e cruza-se em memória: são dezenas de linhas, não milhares, e uma consulta
 * por lead num webhook de Telegram é a forma garantida de o painel demorar dez segundos a abrir.
 */
export async function textoFecho(supabase: unknown, quantos = 6): Promise<string> {
  const db = supabase as Supa

  const [{ data: leads }, { data: clientes }] = await Promise.all([
    db.from('telegram_leads').select('*').limit(500),
    db.from('broker_clients').select('uid, deposits_usd'),
  ])

  const porUid = new Map(
    ((clientes ?? []) as Array<{ uid: string; deposits_usd: number | null }>).map((c) => [String(c.uid), c.deposits_usd]),
  )

  // Os cupões emitidos dizem quem já tem conta no site: a ligação lead→perfil é pelo cupão.
  const cupoes = ((leads ?? []) as Array<{ coupon_code?: string | null }>)
    .map((l) => l.coupon_code)
    .filter((c): c is string => !!c)
  const { data: perfis } = cupoes.length
    ? await db.from('profiles').select('coupon_code, subscription_status, is_active').in('coupon_code', cupoes)
    : { data: [] }
  const porCupao = new Map(
    ((perfis ?? []) as Array<{ coupon_code: string; subscription_status?: string; is_active?: boolean }>).map((p) => [
      String(p.coupon_code),
      p,
    ]),
  )

  const agora = Date.now()
  const avaliados = ((leads ?? []) as Array<Record<string, unknown>>).map((l) => {
    const uid = (l.broker_uid as string) ?? null
    const perfil = l.coupon_code ? porCupao.get(String(l.coupon_code)) : undefined
    const dados: DadosDeFecho = {
      falouEmPrivado: /^\d+$/.test(String(l.chat_id)),
      interesse: (l.interesse as string) ?? null,
      estado: (l.stage as string) ?? null,
      passoMtmAuto: (l.mtmauto_passo as string) ?? null,
      uidCorretora: uid,
      uidConfirmado: !!uid && porUid.has(uid),
      depositoUsd: uid ? (porUid.get(uid) ?? null) : null,
      temConta: !!perfil,
      contaACopiar: false,
      pagante: perfil?.subscription_status === 'active' && perfil?.is_active !== false,
      diasSemSinal: l.updated_at ? Math.floor((agora - Date.parse(String(l.updated_at))) / 86_400_000) : null,
      seguimentosSemResposta: Number(l.followup_count ?? 0),
    }
    return {
      nome: (l.first_name as string) || (l.username as string) || String(l.chat_id),
      chatId: String(l.chat_id),
      r: prontidaoDeFecho(dados),
    }
  })

  const fila = avaliados.filter((a) => a.r.nivel !== 'pagante').sort((a, b) => b.r.pontos - a.r.pontos)
  if (!fila.length) return '🎯 <b>Fecho</b>\n\nNenhum lead por fechar. (Ou a tabela está vazia — vê a Prospeção.)'

  const linhas = fila.slice(0, quantos).map((a) => {
    const emoji = a.r.nivel === 'a fechar' ? '🔥' : a.r.nivel === 'quente' ? '🟠' : a.r.nivel === 'morno' ? '🟡' : '🔵'
    return (
      `${emoji} <b>${esc(a.nome)}</b> — ${a.r.pontos}/100\n` +
      `   ${esc(a.r.proximoPasso)}\n` +
      `   <code>/quem ${esc(a.chatId)}</code>`
    )
  })

  const naoAcionaveis = fila.filter((a) => !a.r.acionavelPeloSistema).length

  return [
    `🎯 <b>Fecho</b> — ${fila.length} por fechar, ${avaliados.length - fila.length} já a pagar`,
    '',
    ...linhas,
    naoAcionaveis
      ? `\n<i>${naoAcionaveis} destes nunca escreveram ao bot: o bot não lhes pode falar primeiro, a abordagem tem de ser tua.</i>`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

// ─────────────────────────────── PROSPEÇÃO ───────────────────────────────

/** A lista priorizada e o mapa, no telemóvel. */
export async function textoProspecao(supabase: unknown, quantos = 6): Promise<string> {
  const { lerListaPrioritaria } = await import('@/lib/prospecao/correr-radar')
  const db = supabase as Supa

  const [lista, { data: grupos }, { data: contactos }] = await Promise.all([
    lerListaPrioritaria(db, quantos),
    db.from('prospecao_grupos').select('nosso, ultima_atividade, titulo, membros, fonte'),
    db.from('prospecao_contactos').select('estado'),
  ])

  const todos = (contactos ?? []) as Array<{ estado: string }>
  const gs = (grupos ?? []) as Array<{ nosso: boolean; ultima_atividade: string | null; titulo: string | null; fonte: string }>
  const semBot = gs.filter((g) => g.nosso && g.fonte === 'mtproto' && !g.ultima_atividade)
  /**
   * Grupos nossos calados.
   *
   * Vale a pena dizê-lo aqui e não só no mapa: audiência que custou a juntar e está a esfriar é
   * prospeção tanto como uma pessoa nova. A diferença é que estas já nos conhecem.
   */
  const parados = gs
    .filter((g) => g.nosso && g.ultima_atividade && Date.now() - Date.parse(g.ultima_atividade) > 7 * 86_400_000)
    .sort((a, b) => String(a.ultima_atividade).localeCompare(String(b.ultima_atividade)))

  const linhas = lista.map((c) => {
    const quem = c.firstName ?? 'sem nome'
    const alvo = c.username ? `@${c.username}` : `<code>${esc(c.tgUserId)}</code>`
    return `• <b>${c.pontuacao}</b> ${esc(quem)} ${alvo}\n   <i>${esc(c.porque)}</i>\n   ➡️ ${esc(c.comoAbordar)}`
  })

  return [
    `🧲 <b>Prospeção</b> — ${todos.filter((c) => c.estado === 'novo').length} por tratar de ${todos.length}`,
    `Grupos no mapa: ${gs.length} (${gs.filter((g) => g.nosso).length} nossos)`,
    semBot.length ? `\n🚨 <b>${semBot.length} grupo(s) teus SEM o bot lá dentro</b> — sem boas-vindas, sem radar, sem leads.\n<code>t.me/morethanmoneypt_bot?startgroup=true</code>` : '',
    parados.length
      ? `\n😴 <b>${parados.length} grupo(s) teus sem uma mensagem há mais de uma semana</b>:\n` +
        parados
          .slice(0, 4)
          .map(
            (g) =>
              `   · ${esc(g.titulo ?? '?')} — ${Math.floor((Date.now() - Date.parse(String(g.ultima_atividade))) / 86_400_000)} dias`,
          )
          .join('\n')
      : '',
    '',
    linhas.length ? linhas.join('\n\n') : 'Ninguém por tratar. O radar só conta a partir de agora — não vê o passado.',
    '',
    '<i>O bot não pode escrever a quem nunca lhe escreveu. Isto prepara; quem fala és tu.</i>',
  ]
    .filter(Boolean)
    .join('\n')
}

// ─────────────────────────────── O QUE FALHOU HOJE ───────────────────────────────

/**
 * As falhas de hoje, num sítio só.
 *
 * Não é um log: é a lista curta do que exige uma decisão dele. Um sinal que não publicou, um lead
 * à espera de aprovação há dois dias, dados da corretora velhos — cada linha tem um dono e uma
 * acção. O que não tem dono não entra aqui, vai para os logs.
 */
export async function textoFalhas(supabase: unknown): Promise<string> {
  const db = supabase as Supa
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
  const ha48h = new Date(Date.now() - 48 * 3600_000).toISOString()

  const [{ data: sinaisMaus }, { data: pendentes }, { data: brokerFresco }, { data: cupoesPorUsar }] = await Promise.all([
    db
      .from('tradingview_signals')
      .select('ticker, received_at')
      .eq('telegram_status', 'error')
      .gte('received_at', `${dia}T00:00:00.000Z`)
      .limit(20),
    db.from('telegram_leads').select('chat_id, first_name, updated_at').eq('stage', 'pending_review').limit(20),
    db.from('broker_clients').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    db.from('telegram_leads').select('chat_id, coupon_code, granted_at').eq('stage', 'granted').lt('granted_at', ha48h).limit(50),
  ])

  const linhas: string[] = []

  const maus = (sinaisMaus ?? []) as Array<{ ticker?: string }>
  if (maus.length) {
    linhas.push(`📡 <b>${maus.length} sinal(is) não publicaram</b> no Telegram hoje: ${maus.slice(0, 5).map((s) => esc(s.ticker ?? '?')).join(', ')}`)
  }

  const pend = (pendentes ?? []) as Array<{ first_name?: string; updated_at?: string }>
  const presos = pend.filter((p) => p.updated_at && Date.parse(p.updated_at) < Date.now() - 24 * 3600_000)
  if (pend.length) {
    linhas.push(
      `🔓 <b>${pend.length} pedido(s) de acesso à tua espera</b>${presos.length ? ` — ${presos.length} há mais de um dia` : ''}.`,
    )
  }

  const ultimo = ((brokerFresco ?? []) as Array<{ updated_at?: string }>)[0]?.updated_at
  if (ultimo) {
    const { avaliarFrescura } = await import('@/lib/broker/dados-corretora')
    const f = avaliarFrescura(ultimo)
    if (f.estado !== 'fresco') linhas.push(`🏦 <b>Dados da corretora ${f.estado}</b> — ${esc(f.mensagem)}`)
  } else {
    linhas.push('🏦 <b>Nunca foi importada</b> a lista da corretora — sem ela nenhum UID se confirma.')
  }

  /**
   * Cupões emitidos que ninguém resgatou.
   *
   * É a fuga mais silenciosa do funil: a pessoa fez tudo, recebeu a promessa, e não há conta no
   * site. Não aparece em lado nenhum porque tecnicamente nada falhou — só que ninguém entrou.
   */
  const emitidos = (cupoesPorUsar ?? []) as Array<{ coupon_code?: string | null }>
  const codigos = emitidos.map((c) => c.coupon_code).filter((c): c is string => !!c)
  if (codigos.length) {
    const { data: perfis } = await db.from('profiles').select('coupon_code').in('coupon_code', codigos)
    const usados = new Set(((perfis ?? []) as Array<{ coupon_code: string }>).map((p) => String(p.coupon_code)))
    const porResgatar = codigos.filter((c) => !usados.has(c)).length
    if (porResgatar) {
      linhas.push(`🎟️ <b>${porResgatar} cupão(ões) emitidos há mais de 2 dias e por resgatar</b> — prometemos e ninguém entrou.`)
    }
  }

  return linhas.length
    ? `🚨 <b>O que precisa de ti</b>\n\n${linhas.join('\n\n')}`
    : '✅ <b>Nada a precisar de ti</b>\n\nSem sinais falhados, sem pedidos presos, dados da corretora frescos e cupões resgatados.'
}

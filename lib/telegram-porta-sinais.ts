/**
 * PORTA DOS GRUPOS DE SINAIS — quem pede para entrar só entra validado.
 *
 * A regra está em `lib/telegram-porta-sinais-regra.ts`. Aqui fica o que fala com a base e com o
 * Telegram:
 *
 *  • `chat_join_request` num grupo de sinais → quem tem direito é aprovado na hora; os outros ficam
 *    PENDENTES e recebem do bot os dois caminhos (o Telegram deixa o bot escrever a quem pediu, mesmo
 *    sem nunca lhe ter falado, enquanto o pedido estiver aberto).
 *  • Entrada DIRETA por um link antigo (sem pedido) → por omissão só avisa o admin; com
 *    `site_settings.telegram_porta_sinais = {"modo":"expulsar"}` tira a pessoa (ban + unban, para poder
 *    voltar a pedir). Quem já está nos grupos não é tocado: isto só vê ENTRADAS novas.
 *  • `/membro email` + `/codigo 123456` → liga a conta do Telegram ao perfil MTM (código para o email
 *    da conta, nunca confiar só no email escrito) e aprova os pedidos pendentes.
 *  • Validação da corretora (`grantBrokerAccess`) → aprova os pedidos pendentes.
 *
 * O bot tem de ser administrador de cada grupo com «Adicionar membros» (para aprovar) e «Banir»
 * (para o modo expulsar). Sem isso as chamadas falham e fica tudo como estava.
 */
import { createHash, randomInt } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopyBotToken, MTMCOPY_BOT_USERNAME } from '@/lib/mtmcopy/telegram-bot'
import {
  CANONICAL_TELEGRAM_CHANNELS,
  resolvedForexIdeasChatId,
  resolvedGoldkillerScannerChatId,
  resolvedPerpsChatId,
  resolvedPremiumSignalsChatId,
  resolvedTradeIdeasChatId,
} from '@/lib/telegram-channel-ids'
import {
  decidirEntrada,
  lerModoPorta,
  mascararEmail,
  textoDoPedidoPendente,
  type ViaDeEntrada,
} from '@/lib/telegram-porta-sinais-regra'

type Supa = ReturnType<typeof getSupabaseAdmin>

const T_PEDIDOS = 'telegram_sinais_pedidos'
const T_LIGADOS = 'telegram_membros_ligados'
const T_CODIGOS = 'telegram_membros_codigos'
const CODIGO_MINUTOS = 15
const CODIGO_TENTATIVAS = 5

function envOu(chaves: string[], omissao: string): string {
  for (const k of chaves) {
    const v = process.env[k]?.trim()
    if (v) return v
  }
  return omissao
}

/**
 * Os 7 grupos de sinais: Sensei, Ideias de Forex (MTM Scanner), GoldKiller, TrendShot, Perps,
 * FOREX swings e Premium. O grupo de leads (MTM System) NÃO está aqui: é a porta de entrada aberta.
 */
export function gruposDeSinais(): Set<string> {
  const c = CANONICAL_TELEGRAM_CHANNELS
  const ids = [
    resolvedTradeIdeasChatId(),
    resolvedForexIdeasChatId(),
    resolvedGoldkillerScannerChatId(),
    resolvedPremiumSignalsChatId(),
    resolvedPerpsChatId() ?? '',
    envOu(c.trendshot.envVars, c.trendshot.chatId),
    envOu(c.forexSwings.envVars, c.forexSwings.chatId),
  ]
  return new Set(ids.map((s) => String(s).trim()).filter((s) => /^-?\d+$/.test(s)))
}

export function ehGrupoDeSinais(chatId: unknown): boolean {
  return chatId != null && gruposDeSinais().has(String(chatId))
}

async function tg(method: string, body: Record<string, unknown>): Promise<{ ok?: boolean; description?: string } | null> {
  const token = getMtmcopyBotToken()
  if (!token) return null
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await r.json()) as { ok?: boolean; description?: string }
  } catch {
    return null
  }
}

const enviar = (chatId: string | number, text: string) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })

async function adminChatId(db: Supa): Promise<string | null> {
  try {
    const { data } = await db.from('site_settings').select('value').eq('key', 'telegram_admin_chat_id').maybeSingle()
    const v = data?.value ? String(data.value).replace(/["\s]/g, '') : ''
    return v || null
  } catch {
    return null
  }
}

async function modoPorta(db: Supa) {
  try {
    const { data } = await db.from('site_settings').select('value').eq('key', 'telegram_porta_sinais').maybeSingle()
    return lerModoPorta(data?.value)
  } catch {
    return lerModoPorta(null)
  }
}

/** Tem direito a entrar nos grupos de sinais? Lê só o que a regra precisa. */
export async function podeEntrarNosSinais(
  db: Supa,
  tgUserId: string,
): Promise<{ pode: true; via: ViaDeEntrada } | { pode: false }> {
  const [admin, lead, ligado, auto] = await Promise.all([
    adminChatId(db),
    db.from('telegram_leads').select('stage').eq('chat_id', tgUserId).maybeSingle(),
    db.from(T_LIGADOS).select('profile_id').eq('tg_user_id', tgUserId).maybeSingle(),
    db.from('mtmauto_users').select('user_id').or(`telegram_user_id.eq.${tgUserId},telegram_id.eq.${tgUserId}`).limit(1),
  ])

  const profileId = (ligado.data as { profile_id?: string } | null)?.profile_id ?? null
  let perfil: { is_active?: boolean | null; user_type?: string | null } | null = null
  if (profileId) {
    const { data } = await db.from('profiles').select('is_active, user_type').eq('id', profileId).maybeSingle()
    perfil = data as typeof perfil
  }

  // O direito MTM Auto só se pergunta se o resto não chegar (é uma RPC).
  const base = decidirEntrada({
    ehAdmin: admin != null && admin === tgUserId,
    stageLead: (lead.data as { stage?: string } | null)?.stage ?? null,
    perfil,
  })
  if (base.pode) return base

  const candidatos = new Set<string>()
  if (profileId) candidatos.add(profileId)
  for (const r of (auto.data ?? []) as { user_id?: string }[]) if (r.user_id) candidatos.add(r.user_id)
  if (!candidatos.size) return base
  try {
    const { direitoMtmAuto } = await import('@/lib/entitlements')
    for (const id of candidatos) {
      if ((await direitoMtmAuto(id)).tem) return decidirEntrada({ direitoMtmAuto: true })
    }
  } catch {
    /* sem direito confirmado → fica pendente, não entra */
  }
  return base
}

interface PedidoDeAdesao {
  chat?: { id?: number | string; title?: string | null }
  from?: { id?: number | string; is_bot?: boolean; first_name?: string | null; last_name?: string | null; username?: string | null }
  user_chat_id?: number | string
}

function nomeDe(u: PedidoDeAdesao['from']): string | null {
  const n = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim()
  return n ? n.slice(0, 120) : null
}

/** Garante que quem pediu fica no funil (sem pisar um lead que já existe). */
async function garantirLead(db: Supa, tgUserId: string, nome: string | null, username: string | null) {
  try {
    const { data } = await db.from('telegram_leads').select('chat_id').eq('chat_id', tgUserId).maybeSingle()
    if (data) return
    await db.from('telegram_leads').insert({
      chat_id: tgUserId,
      first_name: nome,
      username,
      // Escreveu-lhe o bot no pedido; o follow-up por DM fica para quando a pessoa responder.
      stage: 'pedido_sinais',
      source: 'pedido-grupo-sinais',
      message_count: 0,
      followup_count: 0,
      updated_at: new Date().toISOString(),
    })
  } catch {
    /* o lead é um extra; o pedido segue */
  }
}

/** Update `chat_join_request`. Devolve true se era de um grupo de sinais (e foi tratado). */
export async function tratarPedidoDeAdesao(db: Supa, pedido: PedidoDeAdesao): Promise<boolean> {
  const grupoId = pedido.chat?.id != null ? String(pedido.chat.id) : ''
  const uid = pedido.from?.id != null ? String(pedido.from.id) : ''
  if (!grupoId || !uid || pedido.from?.is_bot || !ehGrupoDeSinais(grupoId)) return false

  const nome = nomeDe(pedido.from)
  const username = pedido.from?.username ?? null
  const agora = new Date().toISOString()
  const decisao = await podeEntrarNosSinais(db, uid)

  if (decisao.pode) {
    const r = await tg('approveChatJoinRequest', { chat_id: grupoId, user_id: Number(uid) })
    await db.from(T_PEDIDOS).upsert(
      { grupo_id: grupoId, tg_user_id: uid, nome, username, estado: r?.ok ? 'aprovado' : 'pendente', via: decisao.via, criado_em: agora, tratado_em: r?.ok ? agora : null },
      { onConflict: 'grupo_id,tg_user_id' },
    )
    return true
  }

  await db.from(T_PEDIDOS).upsert(
    { grupo_id: grupoId, tg_user_id: uid, nome, username, estado: 'pendente', via: 'pedido', criado_em: agora, tratado_em: null },
    { onConflict: 'grupo_id,tg_user_id' },
  )
  await garantirLead(db, uid, nome, username)
  await enviar(pedido.user_chat_id ?? uid, textoDoPedidoPendente(pedido.chat?.title ?? null, MTMCOPY_BOT_USERNAME()))
  return true
}

/**
 * Aprova os pedidos pendentes desta pessoa. Chamado quando valida a corretora ou confirma que é
 * membro. Um pedido que o Telegram já deu por perdido (expirou/retirado) fica marcado e não volta.
 */
export async function aprovarPedidosPendentes(db: Supa, tgUserId: string): Promise<number> {
  const { data } = await db.from(T_PEDIDOS).select('grupo_id').eq('tg_user_id', tgUserId).eq('estado', 'pendente')
  let aprovados = 0
  for (const p of (data ?? []) as { grupo_id: string }[]) {
    const r = await tg('approveChatJoinRequest', { chat_id: p.grupo_id, user_id: Number(tgUserId) })
    const ok = r?.ok === true
    if (ok) aprovados++
    await db
      .from(T_PEDIDOS)
      .update({ estado: ok ? 'aprovado' : 'recusado', tratado_em: new Date().toISOString() })
      .eq('grupo_id', p.grupo_id)
      .eq('tg_user_id', tgUserId)
  }
  return aprovados
}

interface AtualizacaoDeMembro {
  chat?: { id?: number | string; title?: string | null }
  new_chat_member?: { status?: string; user?: { id?: number | string; is_bot?: boolean; first_name?: string | null; last_name?: string | null; username?: string | null } }
  old_chat_member?: { status?: string }
  via_join_request?: boolean
}

/**
 * Update `chat_member`: alguém ENTROU num grupo de sinais sem passar por um pedido (link antigo,
 * grupo público, adicionado por outro membro). Quem tem direito passa; os outros dependem do modo.
 */
export async function tratarEntradaDireta(db: Supa, u: AtualizacaoDeMembro): Promise<void> {
  const grupoId = u.chat?.id != null ? String(u.chat.id) : ''
  const pessoa = u.new_chat_member?.user
  const uid = pessoa?.id != null ? String(pessoa.id) : ''
  if (!grupoId || !uid || pessoa?.is_bot || !ehGrupoDeSinais(grupoId)) return
  // Só ENTRADAS: de fora para dentro. Pedidos aprovados já passaram pela porta.
  const antes = String(u.old_chat_member?.status ?? '')
  const depois = String(u.new_chat_member?.status ?? '')
  if (!['left', 'kicked'].includes(antes) || depois !== 'member' || u.via_join_request) return

  const decisao = await podeEntrarNosSinais(db, uid)
  if (decisao.pode) return

  const modo = await modoPorta(db)
  const nome = nomeDe(pessoa)
  const agora = new Date().toISOString()
  let estado: 'expulso' | 'avisado' = 'avisado'
  if (modo === 'expulsar') {
    const ban = await tg('banChatMember', { chat_id: grupoId, user_id: Number(uid), until_date: Math.floor(Date.now() / 1000) + 60 })
    if (ban?.ok) {
      await tg('unbanChatMember', { chat_id: grupoId, user_id: Number(uid), only_if_banned: true })
      estado = 'expulso'
      // Só chega se a pessoa já falou com o bot; senão o Telegram recusa e fica só o registo.
      await enviar(uid, textoDoPedidoPendente(u.chat?.title ?? null, MTMCOPY_BOT_USERNAME()))
    }
  }
  await db.from(T_PEDIDOS).upsert(
    { grupo_id: grupoId, tg_user_id: uid, nome, username: pessoa?.username ?? null, estado, via: 'direta', criado_em: agora, tratado_em: agora },
    { onConflict: 'grupo_id,tg_user_id' },
  )
  await garantirLead(db, uid, nome, pessoa?.username ?? null)

  const admin = await adminChatId(db)
  if (admin) {
    const quem = `${nome ?? 'sem nome'}${pessoa?.username ? ` (@${pessoa.username})` : ''} · <code>${uid}</code>`
    await enviar(
      admin,
      estado === 'expulso'
        ? `🚪 Tirei do grupo «${u.chat?.title ?? grupoId}» quem entrou sem validação: ${quem}. Pode voltar a pedir e entra quando validar.`
        : `👀 Entrou no grupo «${u.chat?.title ?? grupoId}» sem validação: ${quem}. (Modo aviso: não tirei ninguém.)`,
    )
  }
}

const resumo = (codigo: string) => createHash('sha256').update(codigo).digest('hex')

async function enviarCodigoPorEmail(email: string, codigo: string): Promise<boolean> {
  try {
    const mt = await import('@/lib/mail-transport')
    await mt.createMailTransporter().sendMail({
      from: mt.mailFrom(),
      to: email,
      subject: `O teu código MTM para o Telegram: ${codigo}`,
      html: mt.prepareBrandedEmailHtml(
        `<p>Olá!</p><p>Pediste no Telegram para confirmar que és membro MTM e entrar nos grupos de sinais.</p>` +
          `<p>O teu código é <b style="font-size:22px;letter-spacing:3px">${codigo}</b></p>` +
          `<p>Escreve ao bot: <code>/codigo ${codigo}</code></p>` +
          `<p>O código vale ${CODIGO_MINUTOS} minutos. Se não foste tu, ignora este email.</p>`,
      ),
      attachments: mt.brandedMailAttachments(),
    })
    return true
  } catch (e) {
    console.error('[porta-sinais] email do código falhou:', e)
    return false
  }
}

/** `/membro email`: manda o código ao email da conta, se a conta for de um membro com direito. */
export async function pedirCodigoDeMembro(db: Supa, tgUserId: string, email: string | null): Promise<string> {
  if (!email) return 'Escreve assim: <code>/membro o-teu-email@exemplo.com</code> (o email da tua conta MTM).'
  const { data: perfil } = await db
    .from('profiles')
    .select('id, is_active')
    .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .maybeSingle()
  const p = perfil as { id?: string; is_active?: boolean | null } | null

  // A mesma resposta exista ou não a conta: não se confirma a ninguém que um email é nosso cliente.
  const neutra =
    `📧 Se <b>${mascararEmail(email)}</b> for de uma conta MTM ativa, acabou de receber um código de 6 dígitos.\n` +
    `Escreve aqui <code>/codigo 123456</code> (com o teu código). Vale ${CODIGO_MINUTOS} minutos.\n\n` +
    `Não chegou? Vê o spam, ou valida pela corretora: /start broker`
  if (!p?.id) return neutra

  let temDireito = p.is_active === true
  if (!temDireito) {
    try {
      const { direitoMtmAuto } = await import('@/lib/entitlements')
      temDireito = (await direitoMtmAuto(p.id)).tem
    } catch {
      temDireito = false
    }
  }
  if (!temDireito) return neutra

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db.from(T_CODIGOS).upsert(
    {
      tg_user_id: tgUserId,
      profile_id: p.id,
      codigo_hash: resumo(codigo),
      expira_em: new Date(Date.now() + CODIGO_MINUTOS * 60_000).toISOString(),
      tentativas: 0,
      criado_em: new Date().toISOString(),
    },
    { onConflict: 'tg_user_id' },
  )
  await enviarCodigoPorEmail(email, codigo)
  return neutra
}

/** `/codigo 123456`: confere, liga a conta e aprova os pedidos pendentes. */
export async function confirmarCodigoDeMembro(db: Supa, tgUserId: string, codigo: string | null): Promise<string> {
  if (!codigo) return 'Escreve assim: <code>/codigo 123456</code> (o código que recebeste no email).'
  const { data } = await db.from(T_CODIGOS).select('profile_id, codigo_hash, expira_em, tentativas').eq('tg_user_id', tgUserId).maybeSingle()
  const c = data as { profile_id: string; codigo_hash: string; expira_em: string; tentativas: number } | null
  if (!c) return 'Não tenho nenhum código pendente para ti. Começa por <code>/membro o-teu-email</code>.'
  if (Date.parse(c.expira_em) < Date.now() || c.tentativas >= CODIGO_TENTATIVAS) {
    await db.from(T_CODIGOS).delete().eq('tg_user_id', tgUserId)
    return 'Esse código já não vale. Pede outro com <code>/membro o-teu-email</code>.'
  }
  if (resumo(codigo) !== c.codigo_hash) {
    await db.from(T_CODIGOS).update({ tentativas: c.tentativas + 1 }).eq('tg_user_id', tgUserId)
    return `Código errado. Tens mais ${Math.max(0, CODIGO_TENTATIVAS - c.tentativas - 1)} tentativa(s).`
  }

  await db.from(T_CODIGOS).delete().eq('tg_user_id', tgUserId)
  await db.from(T_LIGADOS).upsert({ tg_user_id: tgUserId, profile_id: c.profile_id, ligado_em: new Date().toISOString() }, { onConflict: 'tg_user_id' })
  const aprovados = await aprovarPedidosPendentes(db, tgUserId)
  return aprovados
    ? `✅ Confirmado, és membro MTM. Já te aprovei em ${aprovados} grupo(s) de sinais. Bons trades! 🚀`
    : `✅ Confirmado, és membro MTM. A partir de agora os teus pedidos para entrar nos grupos de sinais são aprovados na hora.`
}

/**
 * Funil broker-gated do Telegram — acesso aos grupos de sinais + app SÓ após:
 *  1) abrir conta na PU Prime (link),
 *  2) enviar o UID da corretora,
 *  3) provar depósito ≥ $300 (auto-match em broker_clients OU print screen aprovado).
 * Ao validar: gera links pessoais (Forex/Sensei) + cupão Premium individual (ativa app + onboarding).
 * Sem promessas de lucro. Estado em telegram_leads.
 */
import { avaliarUidLead, validarUidBroker } from '@/lib/broker/dados-corretora'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  resolvedForexIdeasChatId,
  resolvedTradeIdeasChatId,
  resolvedPremiumSignalsChatId,
  resolvedGoldkillerScannerChatId,
  resolvedPerpsChatId,
} from '@/lib/telegram-channel-ids'

type Supa = ReturnType<typeof getSupabaseAdmin>

export const PUPRIME_LINK = 'https://www.puprime.com/campaign?cs=morethanmoney'
/**
 * Depósito mínimo para o broker-gate, em USD.
 *
 * É a ÚNICA fonte deste número — o `mensagens-funil` reexporta-o em vez de o repetir. Havia duas
 * constantes independentes com 300, e mais quatro sítios com o valor escrito à mão nos guiões do
 * bot e dos closers: mudar a regra obrigava a acertar seis sítios, e bastava esquecer um para o
 * bot prometer uma coisa e a validação exigir outra.
 *
 * 350 desde 2026-09-01 (era 300), para bater certo com o bónus da PU Prime.
 */
export const MIN_DEPOSIT = 350
// TELEGRAM_BOT_TOKEN estava a devolver 401 (token rodado e nunca reposto) — o gate do broker
// deixou de conseguir gerar os convites dos grupos. O token canónico é o do @MoreThanMoney_aibot,
// que é o MESMO bot que o funil já anuncia; getMtmcopyBotToken() tenta-o primeiro.
const BOT = () => getMtmcopyBotToken()

/**
 * Os 4 grupos de sinais libertados após validação. chatId canónico (resolvido por env) +
 * link estático de fallback (para grupos que não geram convite pessoal, ex.: Basic group).
 */
const FOREX_SWINGS_CHAT = process.env.TELEGRAM_FOREX_SWINGS_CHAT || '-1004362819270'
function accessGroups(): { label: string; chatId: string; fallback: string | null }[] {
  return [
    { label: '💱 Grupo Forex', chatId: resolvedForexIdeasChatId(), fallback: process.env.TELEGRAM_FOREX_LINK || 'https://t.me/+cVcMbCRt2rlmNzg0' },
    { label: '🌊 Grupo Forex Swings', chatId: FOREX_SWINGS_CHAT, fallback: process.env.TELEGRAM_FOREX_SWINGS_LINK || null },
    { label: '🧠 Grupo Sensei', chatId: resolvedTradeIdeasChatId(), fallback: process.env.TELEGRAM_SENSEI_LINK || 'https://t.me/+mbqBggXniu5lNTBk' },
    { label: '👑 Grupo Premium', chatId: resolvedPremiumSignalsChatId(), fallback: process.env.TELEGRAM_PREMIUM_LINK || 'https://t.me/MTMgold' },
    { label: '🥇 Grupo GoldKiller', chatId: resolvedGoldkillerScannerChatId(), fallback: process.env.TELEGRAM_GOLDKILLER_LINK || null },
    // Perpétuos cripto: faz parte da comunidade agrupada no Telegram, por isso entra no MESMO
    // gate. Um grupo que existe mas não é libertado é um grupo que ninguém encontra.
    { label: '🪙 Ideias de Perpétuos Cripto', chatId: resolvedPerpsChatId() ?? '', fallback: process.env.TELEGRAM_PERPS_LINK || 'https://t.me/+ue9JuMRwMv0zMGQ0' },
  ]
}

async function tg(method: string, body: Record<string, unknown>) {
  const token = BOT()
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
const send = (chatId: string | number, text: string, extra: Record<string, unknown> = {}) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra })

/**
 * Um UID de corretora = número com 5–12 dígitos.
 *
 * A regra vive em `validarUidBroker` e é a MESMA que o importador do export usa. Estavam
 * escritas duas vezes, e duas regras que se podem afastar são pessoas em limbo: um número que o
 * bot aceita mas o importador rejeita (ou ao contrário) é um lead que fica a meio do funil sem
 * que apareça erro nenhum a ninguém.
 */
export function looksLikeBrokerUid(text: string): string | null {
  const v = validarUidBroker(text)
  return v.ok ? v.uid : null
}

async function getAdminChatId(supabase: Supa): Promise<string | null> {
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'telegram_admin_chat_id')
    .maybeSingle()
  const v = (data?.value as { chat_id?: string } | null)?.chat_id
  return v ? String(v) : null
}

/** Auto-match: o UID existe em broker_clients com depósito E saldo ≥ mínimo? */
async function autoValidated(supabase: Supa, uid: string): Promise<boolean> {
  const { data } = await supabase
    .from('broker_clients')
    .select('deposits_usd, balance_usd')
    .eq('uid', uid)
    .maybeSingle()
  if (!data) return false
  return Number(data.deposits_usd ?? 0) >= MIN_DEPOSIT && Number(data.balance_usd ?? 0) >= MIN_DEPOSIT
}

/**
 * O UID que o lead enviou não existe em `broker_clients` — diz-se ao admin, em vez de deixar a
 * pessoa a apodrecer em grace.
 *
 * A 2026-09-24 os dois únicos leads com acesso tinham UIDs que não existiam na tabela: um com 7
 * dígitos (os nossos têm 8 ou 9 — engano a escrever) e outro só inexistente. Nenhum dos dois
 * podia ser validado por mérito nem revogado, e ninguém sabia. Não muda o funil: o lead continua
 * a seguir pelo print screen, como antes. Só deixa de ser invisível.
 */
async function avisarAdminSeUidNaoCasa(
  supabase: Supa,
  chatId: string,
  uid: string,
  firstName?: string | null,
): Promise<void> {
  try {
    const { data: existe } = await supabase.from('broker_clients').select('uid').eq('uid', uid).maybeSingle()
    if (existe) return
    const { data: todos } = await supabase.from('broker_clients').select('uid')
    const { aviso } = avaliarUidLead(uid, (todos ?? []).map((c) => String(c.uid)))
    if (!aviso) return
    const adminChat = await getAdminChatId(supabase)
    if (!adminChat) return
    await send(
      adminChat,
      `🔗 <b>UID sem correspondência</b>\n${firstName ?? chatId} (chat <code>${chatId}</code>)\n\n${aviso}\n\n` +
        `Ou os dados da corretora estão velhos (importa o export em /admin/sales-machine), ou o UID está mal escrito.`,
    )
  } catch {
    /* o funil não pode parar por causa de um aviso */
  }
}

/** Lead enviou o UID. Guarda; se auto-validado liberta, senão pede o print screen. */
export async function handleBrokerUid(
  supabase: Supa,
  chatId: string,
  uid: string,
  firstName?: string | null,
): Promise<void> {
  await supabase.from('telegram_leads').upsert(
    {
      chat_id: chatId,
      first_name: firstName ?? null,
      broker_uid: uid,
      stage: 'awaiting_proof',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'chat_id' },
  )
  if (await autoValidated(supabase, uid)) {
    await grantBrokerAccess(supabase, chatId)
    return
  }
  await avisarAdminSeUidNaoCasa(supabase, chatId, uid, firstName)
  await send(
    chatId,
    `✅ Recebi o teu UID <b>${uid}</b>.\n\n` +
      `Agora envia-me um <b>print screen</b> da tua conta PU Prime a mostrar o <b>depósito de ≥ $${MIN_DEPOSIT}</b>. ` +
      `Assim que confirmar, liberto o acesso aos grupos de sinais + cupão Premium para a app. 📸`,
  )
}

/** Lead enviou o print screen (foto). Guarda e envia ao admin para aprovar. */
export async function handleProofPhoto(
  supabase: Supa,
  chatId: string,
  fileId: string,
  firstName?: string | null,
): Promise<void> {
  const { data: lead } = await supabase
    .from('telegram_leads')
    .select('broker_uid, stage')
    .eq('chat_id', chatId)
    .maybeSingle()
  const uid = (lead as { broker_uid?: string } | null)?.broker_uid
  if (!uid) {
    await send(chatId, `Primeiro envia-me o teu <b>UID</b> da PU Prime (só o número). Ainda não abriste conta? 👉 ${PUPRIME_LINK}`)
    return
  }
  // auto-match tem prioridade
  if (await autoValidated(supabase, uid)) {
    await grantBrokerAccess(supabase, chatId)
    return
  }
  await supabase
    .from('telegram_leads')
    .update({ proof_file_id: fileId, stage: 'pending_review', first_name: firstName ?? null, updated_at: new Date().toISOString() })
    .eq('chat_id', chatId)
  await send(chatId, '📸 Recebido! Estou a validar o teu depósito — em breve liberto o acesso. 🙌')

  const adminChat = await getAdminChatId(supabase)
  if (!adminChat) {
    console.warn('[broker-gate] telegram_admin_chat_id não configurado — não é possível notificar aprovação')
    return
  }
  await tg('sendPhoto', {
    chat_id: adminChat,
    photo: fileId,
    caption: `🆕 <b>Pedido de acesso</b>\nUID: <code>${uid}</code>\nLead: ${firstName ?? chatId} (chat ${chatId})\n\nDepósito ≥ $${MIN_DEPOSIT}?`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Aprovar', callback_data: `bkapprove:${chatId}` },
          { text: '❌ Rejeitar', callback_data: `bkreject:${chatId}` },
        ],
      ],
    },
  })
}

/** Cria um cupão Premium individual e devolve o código. */
async function createPremiumCoupon(supabase: Supa, chatId: string, uid?: string | null): Promise<string | null> {
  const rand = Math.abs((Number(chatId) || 0) ^ (Date.parse(new Date().toISOString()) & 0xffffff))
    .toString(36)
    .toUpperCase()
    .slice(0, 6)
  const code = `MTM-BROKER-${(uid || chatId).toString().slice(-6)}-${rand}`
  const { error } = await supabase.from('coupons').insert({
    code,
    type: 'free_subscription',
    discount_value: 0,
    plan_override: 'premium',
    max_uses: 1,
    used_count: 0,
    is_active: true,
    grant_days: 30,
    grants_vip: false,
    description: `Broker-gated (PU Prime UID ${uid ?? '?'}) — Premium enquanto saldo ≥ $${MIN_DEPOSIT}`,
  })
  if (error) {
    console.error('[broker-gate] criar cupão falhou:', error.message)
    return null
  }
  return code
}

/** VALIDADO → gera links pessoais Forex+Sensei + cupão Premium e entrega ao lead. */
export async function grantBrokerAccess(supabase: Supa, chatId: string): Promise<void> {
  const { data: lead } = await supabase
    .from('telegram_leads')
    .select('broker_uid, coupon_code, stage')
    .eq('chat_id', chatId)
    .maybeSingle()
  if ((lead as { stage?: string } | null)?.stage === 'granted') return
  const uid = (lead as { broker_uid?: string } | null)?.broker_uid ?? null

  // Link de convite pessoal (one-time) por grupo; fallback estático se o grupo não gerar.
  const mkLink = async (chat: string) => {
    const r = await tg('createChatInviteLink', { chat_id: chat, member_limit: 1, name: `lead ${chatId}` })
    return (r as { result?: { invite_link?: string } } | null)?.result?.invite_link ?? null
  }
  const linkLines: string[] = []
  for (const g of accessGroups()) {
    const url = (await mkLink(g.chatId)) || g.fallback
    if (url) linkLines.push(`<a href="${url}">${g.label}</a>`)
  }

  const coupon = (lead as { coupon_code?: string } | null)?.coupon_code || (await createPremiumCoupon(supabase, chatId, uid))

  await supabase
    .from('telegram_leads')
    .update({ stage: 'granted', coupon_code: coupon, granted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('chat_id', chatId)

  const links = linkLines.join('\n')
  await send(
    chatId,
    `🎉 <b>Acesso libertado!</b>\n\n` +
      `Entra nos grupos de sinais (links pessoais):\n${links}\n\n` +
      (coupon
        ? `📲 O teu cupão Premium para a app: <code>${coupon}</code>\n` +
          `Descarrega a app, cria conta e usa o cupão para ativar + fazer onboarding: https://www.morethanmoney.pt/register\n\n`
        : '') +
      `Mantém o saldo ≥ $${MIN_DEPOSIT} na PU Prime para continuares com acesso. Bons trades! 🚀`,
  )

  /*
   * Quem veio pelo caminho do MTM AUTO precisa de outro cupão — e de outro sítio para o usar.
   *
   * O cupão de cima é da app MoreThanMoney; o MTM Auto é um sistema à parte, com a sua própria
   * tabela de cupões, e ninguém liga um ao outro por magia. Sem isto, a pessoa validava a conta
   * aqui, ia à app, e continuava a ver a mensalidade — que é exatamente o momento em que desiste,
   * convencida de que lhe prometemos uma coisa e entregámos outra.
   */
  try {
    const { data: perfilLead } = await supabase
      .from('telegram_leads')
      .select('interesse')
      .eq('chat_id', chatId)
      .maybeSingle()
    if ((perfilLead as { interesse?: string } | null)?.interesse === 'mtmauto') {
      const mf = await import('@/lib/telegram-mtmauto-funnel')
      const cupaoApp = await mf.criarCupaoMtmAuto(chatId, uid)
      if (cupaoApp) {
        await mf.marcarPassoMtmAuto(chatId, 'validado')
        const m = mf.mtmAutoCupaoValidado(cupaoApp)
        await send(chatId, m.texto, { reply_markup: m.teclado })
      }
    }
  } catch {
    /* o acesso aos grupos já foi dado — o cupão da app é um passo a mais, não um bloqueio */
  }
}

/** Callback dos botões Aprovar/Rejeitar do admin. Devolve texto p/ editar a caption. */
export async function handleBrokerApproval(
  supabase: Supa,
  data: string,
  adminChatId: string,
  messageId: number,
): Promise<boolean> {
  const m = data.match(/^bk(approve|reject):(.+)$/)
  if (!m) return false
  const [, action, leadChat] = m
  if (action === 'approve') {
    await grantBrokerAccess(supabase, leadChat)
    await tg('editMessageCaption', { chat_id: adminChatId, message_id: messageId, caption: `✅ APROVADO (chat ${leadChat})`, parse_mode: 'HTML' })
  } else {
    await supabase.from('telegram_leads').update({ stage: 'rejected', updated_at: new Date().toISOString() }).eq('chat_id', leadChat)
    await send(leadChat, `Não consegui confirmar o depósito de ≥ $${MIN_DEPOSIT}. Verifica e reenvia o print screen, ou fala comigo. 🙏`)
    await tg('editMessageCaption', { chat_id: adminChatId, message_id: messageId, caption: `❌ REJEITADO (chat ${leadChat})`, parse_mode: 'HTML' })
  }
  return true
}

// ============================ PAINEL DE ADMIN ============================
//
// O painel vive em `lib/telegram-admin-menu.ts`. Este ficheiro é o funil da corretora; ter aqui
// os botões do dono era juntar duas coisas que mudam por razões diferentes.

/** É o chat do admin (Ricardo)? Só ele vê/usa o painel e a máquina de vendas. */
export async function isAdminChat(supabase: Supa, chatId: string | number | null | undefined): Promise<boolean> {
  const { ehChatDeAdmin } = await import('@/lib/telegram-admin-menu')
  return ehChatDeAdmin(supabase, chatId)
}

export const APP_REGISTER_LINK = 'https://www.morethanmoney.pt/register'
export const APP_ANDROID_LINK = 'https://www.morethanmoney.pt/downloads/MoreThanMoney.apk'
export const TRIAL_CODE = '14DayTrial'

/** O passo da corretora, como ele vai mesmo sair (editado no /admin/social ou o do código). */
export async function brokerStepMessageEditavel(): Promise<string> {
  const { lerMensagem } = await import('@/lib/mensagens-funil')
  return lerMensagem('passo_corretora')
}

/**
 * Os TEXTOS por defeito destas mensagens vivem em `lib/mensagens-funil.ts` (`MENSAGENS`), e é de
 * lá que saem — editados no /admin/social ou, quando ninguém os editou, do código.
 *
 * Havia aqui uma segunda cópia de cada um (`trialStepMessage`, `brokerStepMessage`) que já
 * ninguém enviava. Um texto duplicado que não se envia não é código morto inofensivo: é a
 * versão que alguém vai encontrar primeiro e corrigir, convencido de que corrigiu a mensagem.
 */

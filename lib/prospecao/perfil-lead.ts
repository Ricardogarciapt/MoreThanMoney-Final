/**
 * O PERFIL DE UM LEAD — tudo o que sabemos de uma pessoa, numa folha.
 *
 * Hoje, para responder a «este quem é?», é preciso abrir quatro sítios: a conversa no Telegram, a
 * linha do lead, a lista da corretora e o perfil do site. Quatro sítios são quatro oportunidades
 * de responder com meia informação — e a pior coisa que se pode fazer a um lead quente é
 * prometer-lhe uma coisa que ele já tem, ou pedir-lhe um passo que já deu.
 *
 * Isto responde, para a mesma pessoa e ao mesmo tempo:
 *   • por onde entrou;
 *   • que passos deu, e quando;
 *   • se tem conta na corretora, com que UID, e se esse UID bate certo com a lista real;
 *   • se já paga;
 *   • o que lhe foi prometido (o cupão emitido, com dias e plano);
 *   • qual é o próximo passo concreto — e porquê (via `pontuacao-fecho`).
 *
 * ── AS JUNÇÕES, QUE NÃO SÃO ÓBVIAS ─────────────────────────────────────────────────────────────
 *   telegram_leads.broker_uid   → broker_clients.uid       (o que a pessoa escreveu vs. a lista real)
 *   telegram_leads.coupon_code  → profiles.coupon_code     (é ASSIM que o lead se liga à conta do
 *                                                           site; não há chat_id nem email no meio)
 *   telegram_leads.coupon_code  → coupons.code             (o que lhe foi prometido)
 *   telegram_leads.chat_id      → mtmauto_users.telegram_user_id → mtmauto_subscriptions.user_id
 *
 * A última junção existe em coluna e está VAZIA em produção — ninguém preenche
 * `mtmauto_users.telegram_user_id`. Fica aqui na mesma, a ler com jeito: no dia em que a app a
 * preencher, o perfil fecha-se sozinho. Enquanto não preencher, o perfil diz «não sei», que é a
 * verdade, em vez de dizer «não tem», que seria mentira.
 *
 * Lógica pura em `montarPerfil` e `textoPerfil`; a leitura do Supabase está separada de propósito
 * para os testes não precisarem de rede.
 *
 *   npx tsx lib/__tests__/perfil-lead.check.ts
 */
import type { DadosDeFecho, ProntidaoDeFecho } from './pontuacao-fecho'
import { prontidaoDeFecho } from './pontuacao-fecho'

// ─────────────────────────────── O QUE SE LÊ ───────────────────────────────

/** A linha do lead, tal como vem de `telegram_leads`. */
export interface LinhaLead {
  chat_id: string
  username?: string | null
  first_name?: string | null
  stage?: string | null
  interesse?: string | null
  mtmauto_passo?: string | null
  broker_uid?: string | null
  coupon_code?: string | null
  source?: string | null
  message_count?: number | null
  followup_count?: number | null
  created_at?: string | null
  updated_at?: string | null
  granted_at?: string | null
  proof_file_id?: string | null
}

/** A linha da corretora — a lista real, não o que a pessoa escreveu. */
export interface LinhaCorretora {
  uid: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  deposits_usd?: number | null
  balance_usd?: number | null
  updated_at?: string | null
}

/** O perfil no site, encontrado pelo cupão. */
export interface LinhaPerfil {
  id: string
  email?: string | null
  full_name?: string | null
  member_category?: string | null
  subscription_status?: string | null
  subscription_expires_at?: string | null
  is_active?: boolean | null
}

/** O cupão emitido — a promessa que lhe foi feita, em texto. */
export interface LinhaCupao {
  code: string
  plan_override?: string | null
  grant_days?: number | null
  grants_vip?: boolean | null
  is_active?: boolean | null
  used_count?: number | null
}

export interface FontesDoPerfil {
  lead: LinhaLead
  corretora: LinhaCorretora | null
  perfil: LinhaPerfil | null
  cupao: LinhaCupao | null
  /** `null` = não sabemos (a ponte MTM Auto ainda não está preenchida); `true`/`false` = sabemos. */
  contaACopiar: boolean | null
  /** Data de referência, para os testes não dependerem do relógio. */
  agoraMs?: number
}

// ─────────────────────────────── O QUE SAI ───────────────────────────────

export interface PassoDoPercurso {
  quando: string | null
  o_que: string
}

export interface PerfilDeLead {
  chatId: string
  nome: string
  username: string | null
  /** Por onde entrou, em português e não em código. */
  entrada: string
  caminho: string
  passos: PassoDoPercurso[]
  corretora: {
    uid: string | null
    confirmado: boolean
    /** O nome que a corretora tem — se for diferente do do Telegram, é preciso olhar. */
    nome: string | null
    depositoUsd: number | null
    saldoUsd: number | null
  }
  conta: {
    tem: boolean
    email: string | null
    categoria: string | null
    pagante: boolean
    expiraEm: string | null
  }
  prometido: string | null
  prontidao: ProntidaoDeFecho
  /** O que NÃO sabemos — dito em voz alta, para não se confundir com «não tem». */
  lacunas: string[]
}

const TRADUCAO_ENTRADA: Record<string, string> = {
  telegram_dm: 'mensagem directa ao bot',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
}

const TRADUCAO_CAMINHO: Record<string, string> = {
  ecossistema: 'ecossistema completo',
  mtmauto: 'só a app MTM Auto',
  indeciso: 'ainda não escolheu',
}

const TRADUCAO_ESTADO: Record<string, string> = {
  new: 'chegou e ainda não disse nada',
  qualifying: 'a conversar',
  routed: 'já disse o que quer',
  awaiting_proof: 'deu o UID, falta o print',
  pending_review: 'à espera da tua aprovação',
  granted: 'acesso libertado',
  rejected: 'recusado',
  revoked: 'acesso retirado (saldo abaixo do mínimo)',
}

const dias = (iso: string | null | undefined, agoraMs: number): number | null =>
  iso ? Math.floor((agoraMs - Date.parse(iso)) / 86_400_000) : null

/** Monta o perfil. Puro: o que entra é o que se leu, o que sai é o que se mostra. */
export function montarPerfil(f: FontesDoPerfil): PerfilDeLead {
  const agoraMs = f.agoraMs ?? Date.now()
  const l = f.lead

  const uidConfirmado = !!f.corretora
  const deposito = f.corretora?.deposits_usd ?? null
  const pagante = f.perfil?.subscription_status === 'active' && f.perfil?.is_active !== false

  /**
   * Os passos, por ordem de acontecimento e não por ordem de tabela.
   *
   * Só entram passos com prova — uma data gravada. «Parece interessado» não é um passo.
   */
  const passos: PassoDoPercurso[] = []
  if (l.created_at) passos.push({ quando: l.created_at, o_que: 'Primeiro contacto' })
  if (l.message_count) {
    passos.push({ quando: null, o_que: `Trocou ${l.message_count} mensagem(ns) com o bot` })
  }
  if (l.interesse && l.interesse !== 'indeciso') {
    passos.push({ quando: null, o_que: `Escolheu o caminho: ${TRADUCAO_CAMINHO[l.interesse] ?? l.interesse}` })
  }
  if (l.broker_uid) {
    passos.push({
      quando: null,
      o_que: `Entregou o UID ${l.broker_uid}${uidConfirmado ? ' (confirmado na corretora)' : ' (ainda não bate certo com a lista)'}`,
    })
  }
  if (l.proof_file_id) passos.push({ quando: null, o_que: 'Enviou o print do depósito' })
  if (l.granted_at) passos.push({ quando: l.granted_at, o_que: 'Acesso libertado (convites + cupão)' })
  if (l.mtmauto_passo) {
    passos.push({ quando: null, o_que: `MTM Auto: ${l.mtmauto_passo}` })
  }
  if (l.followup_count) {
    passos.push({ quando: l.updated_at ?? null, o_que: `${l.followup_count} seguimento(s) automático(s) enviados` })
  }

  const dadosFecho: DadosDeFecho = {
    // Está na `telegram_leads` com um chat_id numérico ⇒ escreveu ao bot em privado. Um
    // `wa:` é WhatsApp, e aí o bot do Telegram continua sem lhe poder escrever.
    falouEmPrivado: /^\d+$/.test(l.chat_id),
    interesse: l.interesse ?? null,
    estado: l.stage ?? null,
    passoMtmAuto: l.mtmauto_passo ?? null,
    uidCorretora: l.broker_uid ?? null,
    uidConfirmado,
    depositoUsd: deposito,
    temConta: !!f.perfil,
    contaACopiar: f.contaACopiar === true,
    pagante,
    diasSemSinal: dias(l.updated_at, agoraMs),
    seguimentosSemResposta: l.followup_count ?? 0,
  }

  const lacunas: string[] = []
  if (!l.broker_uid) lacunas.push('não sabemos se tem conta na corretora — nunca deu UID')
  else if (!uidConfirmado) lacunas.push('o UID que deu não aparece na lista importada da corretora')
  if (f.corretora && f.corretora.deposits_usd == null) {
    lacunas.push('a corretora não trouxe o valor de depósito desta conta')
  }
  if (f.contaACopiar === null) {
    lacunas.push('não sabemos se tem conta a copiar: a ponte MTM Auto ↔ Telegram está por preencher')
  }
  if (!l.coupon_code) lacunas.push('nunca lhe foi emitido cupão — não há promessa registada')
  else if (!f.perfil) lacunas.push('tem cupão emitido e ninguém o resgatou: não há conta no site')

  return {
    chatId: l.chat_id,
    nome: l.first_name?.trim() || f.corretora?.first_name?.trim() || f.perfil?.full_name?.trim() || 'sem nome',
    username: l.username ?? null,
    entrada: TRADUCAO_ENTRADA[l.source ?? ''] ?? l.source ?? 'desconhecida',
    caminho: TRADUCAO_CAMINHO[l.interesse ?? ''] ?? 'ainda não escolheu',
    passos,
    corretora: {
      uid: l.broker_uid ?? null,
      confirmado: uidConfirmado,
      nome: f.corretora ? [f.corretora.first_name, f.corretora.last_name].filter(Boolean).join(' ') || null : null,
      depositoUsd: deposito,
      saldoUsd: f.corretora?.balance_usd ?? null,
    },
    conta: {
      tem: !!f.perfil,
      email: f.perfil?.email ?? null,
      categoria: f.perfil?.member_category ?? null,
      pagante,
      expiraEm: f.perfil?.subscription_expires_at ?? null,
    },
    prometido: f.cupao
      ? `${f.cupao.code} — ${f.cupao.plan_override ?? 'acesso'}${f.cupao.grant_days ? ` durante ${f.cupao.grant_days} dias` : ''}${f.cupao.grants_vip ? ' + VIP' : ''}${f.cupao.used_count ? ' (já resgatado)' : ' (por resgatar)'}`
      : null,
    prontidao: prontidaoDeFecho(dadosFecho),
    lacunas,
  }
}

// ─────────────────────────────── O TEXTO PARA O TELEMÓVEL ───────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const EMOJI_NIVEL: Record<string, string> = {
  pagante: '💚',
  'a fechar': '🔥',
  quente: '🟠',
  morno: '🟡',
  frio: '🔵',
}

/** O perfil em HTML do Telegram. Puro — dá-se a uma pessoa ou a um teste. */
export function textoPerfil(p: PerfilDeLead): string {
  const linhas: string[] = [
    `${EMOJI_NIVEL[p.prontidao.nivel] ?? '•'} <b>${esc(p.nome)}</b>${p.username ? ` (@${esc(p.username)})` : ''}`,
    `<code>${esc(p.chatId)}</code> · entrou por ${esc(p.entrada)} · ${esc(p.caminho)}`,
    '',
    `<b>Prontidão: ${p.prontidao.pontos}/100 — ${p.prontidao.nivel}</b>`,
  ]

  // Só os critérios que pontuaram: uma lista de doze «não» não ajuda ninguém no telemóvel.
  const contam = p.prontidao.criterios.filter((c) => c.pontos !== 0)
  for (const c of contam) linhas.push(`  ${c.pontos > 0 ? '✅' : '⚠️'} ${esc(c.nome)} ${c.pontos > 0 ? '+' : ''}${c.pontos}`)

  linhas.push('', '<b>Percurso</b>')
  for (const s of p.passos.slice(0, 8)) {
    const q = s.quando ? new Date(s.quando).toLocaleDateString('pt-PT') : null
    linhas.push(`  • ${q ? `${q} — ` : ''}${esc(s.o_que)}`)
  }
  if (!p.passos.length) linhas.push('  • nenhum passo registado')

  linhas.push('', '<b>Corretora</b>')
  linhas.push(
    p.corretora.uid
      ? `  UID <code>${esc(p.corretora.uid)}</code> — ${p.corretora.confirmado ? '✅ confirmado' : '⚠️ não bate certo'}` +
        (p.corretora.depositoUsd != null ? ` · depósito ${p.corretora.depositoUsd} USD` : '') +
        (p.corretora.saldoUsd != null ? ` · saldo ${p.corretora.saldoUsd} USD` : '')
      : '  sem UID',
  )

  linhas.push('', '<b>Conta no site</b>')
  linhas.push(
    p.conta.tem
      ? `  ${esc(p.conta.email ?? '—')} · ${esc(p.conta.categoria ?? '—')} · ${p.conta.pagante ? '💚 paga' : '⚪ não paga'}`
      : '  não tem conta no site',
  )

  if (p.prometido) linhas.push('', `<b>Prometido</b>\n  ${esc(p.prometido)}`)

  linhas.push('', `<b>➡️ Próximo passo</b>\n  ${esc(p.prontidao.proximoPasso)}`)

  if (p.lacunas.length) {
    linhas.push('', '<i>O que não sabemos:</i>')
    for (const g of p.lacunas) linhas.push(`  <i>· ${esc(g)}</i>`)
  }

  return linhas.join('\n')
}

// ─────────────────────────────── A LEITURA ───────────────────────────────

type Supa = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, v: unknown) => {
        maybeSingle: () => Promise<{ data: unknown }>
        limit: (n: number) => Promise<{ data: unknown }>
      }
      ilike: (col: string, v: string) => { limit: (n: number) => Promise<{ data: unknown }> }
    }
  }
}

/**
 * Carrega o perfil de uma pessoa a partir de uma chave qualquer.
 *
 * Aceita o chat_id, o @username ou o UID da corretora — porque no telemóvel escreve-se o que se
 * tem à mão, e obrigar a lembrar do chat_id de alguém é garantir que ninguém usa a função.
 */
export async function carregarPerfil(
  supabase: unknown,
  chave: string,
): Promise<PerfilDeLead | null> {
  const db = supabase as Supa
  const limpa = chave.trim().replace(/^@/, '')

  let lead: LinhaLead | null = null

  if (/^\d+$/.test(limpa)) {
    const porChat = await db.from('telegram_leads').select('*').eq('chat_id', limpa).maybeSingle()
    lead = (porChat.data as LinhaLead | null) ?? null
    if (!lead) {
      const porUid = await db.from('telegram_leads').select('*').eq('broker_uid', limpa).limit(1)
      lead = ((porUid.data as LinhaLead[] | null) ?? [])[0] ?? null
    }
  }
  if (!lead) {
    const porUser = await db.from('telegram_leads').select('*').ilike('username', limpa).limit(1)
    lead = ((porUser.data as LinhaLead[] | null) ?? [])[0] ?? null
  }
  if (!lead) return null

  const [corretora, cupao, perfil, mtmauto] = await Promise.all([
    lead.broker_uid
      ? db.from('broker_clients').select('*').eq('uid', lead.broker_uid).maybeSingle().then((r) => r.data as LinhaCorretora | null)
      : Promise.resolve(null),
    lead.coupon_code
      ? db.from('coupons').select('code, plan_override, grant_days, grants_vip, is_active, used_count').eq('code', lead.coupon_code).maybeSingle().then((r) => r.data as LinhaCupao | null)
      : Promise.resolve(null),
    lead.coupon_code
      ? db
          .from('profiles')
          .select('id, email, full_name, member_category, subscription_status, subscription_expires_at, is_active')
          .eq('coupon_code', lead.coupon_code)
          .limit(1)
          .then((r) => ((r.data as LinhaPerfil[] | null) ?? [])[0] ?? null)
      : Promise.resolve(null),
    // A ponte que ainda não está preenchida. Falha em silêncio e vira «não sei».
    db
      .from('mtmauto_users')
      .select('user_id')
      .eq('telegram_user_id', lead.chat_id)
      .limit(1)
      .then((r) => ((r.data as Array<{ user_id?: string }> | null) ?? [])[0] ?? null)
      .catch(() => null),
  ])

  let contaACopiar: boolean | null = null
  if (mtmauto?.user_id) {
    const subs = await db
      .from('mtmauto_subscriptions')
      .select('id')
      .eq('user_id', mtmauto.user_id)
      .limit(1)
      .then((r) => (r.data as unknown[] | null) ?? [])
      .catch(() => null)
    contaACopiar = subs ? subs.length > 0 : null
  }

  return montarPerfil({ lead, corretora, perfil, cupao, contaACopiar })
}

export { TRADUCAO_ESTADO }

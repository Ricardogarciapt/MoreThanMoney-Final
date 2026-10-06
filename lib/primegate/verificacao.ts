/**
 * PrimeGate — verificar(email, uid) → grava e devolve o estado.
 *
 * A verdade vive em `primegate_verificacoes` (uma linha por par email+UID, com o corpo cru
 * SEMPRE guardado). O perfil só espelha (`primegate_estado`, `primegate_confirmado_em`).
 *
 * Regras que não podem cair (guardadas em `__tests__/primegate.check.ts`):
 *  - `undetermined` nunca é recusa: nada é revogado, fechado ou rejeitado por causa dele.
 *  - Um par já `confirmed` não volta para trás por uma resposta pior: o espelho no perfil mantém-se.
 *  - Sem chave, `verificar` devolve `ativo:false` e quem chama segue o caminho antigo.
 *  - Só respostas reais (confirmed/undetermined) gastam uma das 5 tentativas; erros (quota,
 *    5xx, rede, chave) reagendam sem gastar — senão uma chave por aprovar esgotava toda a gente.
 *
 * `confirmed` → `profiles.broker_verified = true` (o mesmo requisito «cliente da corretora» que o
 * login PrimeVerse já dá) e `profiles.broker_uid` preenchido se estiver vazio. NÃO se escreve em
 * `broker_clients`: essa tabela é a do export (saldos/depósitos) e o `broker-gate-renew` lê um
 * saldo em falta como 0 — uma linha nova sem saldo era uma REVOGAÇÃO no dia seguinte.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import { chamarPrimeGate, type RespostaPrimeGate } from './cliente'
import { lerConfig } from './config'
import { quotaNaBase } from './quota'
import { MAX_TENTATIVAS, normalizarPar, proximaTentativa, type EstadoPrimeGate } from './resultado'
import { mensagemParaCliente } from './mensagens'

type Supa = ReturnType<typeof getSupabaseAdmin>

export type Origem = 'site' | 'telegram' | 'admin' | 'cron' | 'teste'

export interface ResultadoVerificacao {
  ativo: boolean
  estado: EstadoPrimeGate | null
  motivo: string
  aviso?: string
  proximaTentativaEm: string | null
  tentativas: number
  verificacaoId: string | null
  httpStatus: number | null
  corpo: unknown
  /** Mensagem honesta para mostrar ao cliente. */
  mensagem: string
}

/** Quanto conta para o backoff: só respostas verdadeiras. */
export function contaComoTentativa(r: Pick<RespostaPrimeGate, 'estado' | 'naoEnviado'>): boolean {
  return !r.naoEnviado && (r.estado === 'confirmed' || r.estado === 'undetermined')
}

/** O estado que o perfil deve mostrar: confirmed nunca desce. */
export function estadoDoEspelho(anterior: string | null | undefined, novo: EstadoPrimeGate): EstadoPrimeGate {
  if (anterior === 'confirmed') return 'confirmed'
  return novo
}

export async function verificar(p: {
  email: unknown
  uid: unknown
  userId?: string | null
  chatId?: string | null
  origem: Origem
  db?: Supa
  /** Para o botão «Testar» do admin: não toca em perfis nem agenda nada. */
  soTeste?: boolean
}): Promise<ResultadoVerificacao> {
  const db = p.db ?? getSupabaseAdmin()
  const cfg = await lerConfig()
  const vazio = (motivo: string, ativo: boolean): ResultadoVerificacao => ({
    ativo, estado: null, motivo, proximaTentativaEm: null, tentativas: 0, verificacaoId: null, httpStatus: null, corpo: null, mensagem: motivo,
  })
  if (!cfg.chave) return vazio('PrimeGate sem chave configurada', false)
  const par = normalizarPar(p.email, p.uid)
  if (!par) return vazio('email ou UID inválido', true)

  const resp = await chamarPrimeGate(par, { chave: cfg.chave, quota: quotaNaBase(db, cfg.limites) })
  const agora = new Date()

  if (p.soTeste) {
    return {
      ativo: true, estado: resp.estado, motivo: resp.motivo, aviso: resp.aviso, proximaTentativaEm: null, tentativas: 0,
      verificacaoId: null, httpStatus: resp.httpStatus, corpo: resp.corpo, mensagem: mensagemParaCliente(resp.estado, null),
    }
  }

  const { data: existente } = await db
    .from('primegate_verificacoes')
    .select('id, estado, tentativas, user_id, chat_id, confirmado_em')
    .eq('email', par.email)
    .eq('uid_puprime', par.uid)
    .maybeSingle()

  const tentativas = Number(existente?.tentativas ?? 0) + (contaComoTentativa(resp) ? 1 : 0)
  const jaConfirmado = existente?.estado === 'confirmed'
  const estadoFinal: EstadoPrimeGate = jaConfirmado ? 'confirmed' : resp.estado
  const proxima =
    estadoFinal === 'confirmed' ? null : proximaTentativa(Math.max(1, tentativas), agora.getTime(), resp.reagendarEmSeg)
  const confirmadoEm = estadoFinal === 'confirmed' ? (existente?.confirmado_em as string | null) ?? agora.toISOString() : null

  const linha = {
    email: par.email,
    uid_puprime: par.uid,
    user_id: p.userId ?? (existente?.user_id as string | null) ?? null,
    chat_id: p.chatId ?? (existente?.chat_id as string | null) ?? null,
    estado: estadoFinal,
    motivo: [resp.motivo, resp.aviso].filter(Boolean).join(' · ').slice(0, 300),
    http_status: resp.httpStatus,
    // Corpo cru SEMPRE — mesmo num par já confirmado, para se ver o que a PrimeVerse disse hoje.
    corpo_cru: resp.corpo ?? null,
    origem: p.origem,
    tentativas,
    verificado_em: resp.naoEnviado ? undefined : agora.toISOString(),
    confirmado_em: confirmadoEm,
    proxima_tentativa_em: proxima ? proxima.toISOString() : null,
    atualizado_em: agora.toISOString(),
  }

  let verificacaoId: string | null = (existente?.id as string | null) ?? null
  if (existente) {
    await db.from('primegate_verificacoes').update(linha).eq('id', existente.id as string)
  } else {
    const { data: nova } = await db.from('primegate_verificacoes').insert(linha).select('id').maybeSingle()
    verificacaoId = (nova?.id as string | null) ?? null
  }

  if (linha.user_id) await espelharNoPerfil(db, linha.user_id, par.uid, estadoFinal, confirmadoEm)

  return {
    ativo: true,
    estado: estadoFinal,
    motivo: resp.motivo,
    aviso: resp.aviso,
    proximaTentativaEm: linha.proxima_tentativa_em,
    tentativas,
    verificacaoId,
    httpStatus: resp.httpStatus,
    corpo: resp.corpo,
    mensagem: mensagemParaCliente(estadoFinal, proxima),
  }
}

async function espelharNoPerfil(db: Supa, userId: string, uid: string, estado: EstadoPrimeGate, confirmadoEm: string | null) {
  const { data: perfil } = await db
    .from('profiles')
    .select('primegate_estado, broker_uid')
    .eq('id', userId)
    .maybeSingle()
  if (!perfil) return
  const novo = estadoDoEspelho(perfil.primegate_estado as string | null, estado)
  const upd: Record<string, unknown> = { primegate_estado: novo }
  if (novo === 'confirmed') {
    upd.primegate_confirmado_em = confirmadoEm ?? new Date().toISOString()
    // A regra que já existe para «cliente da corretora» (a mesma do login PrimeVerse).
    upd.broker_verified = true
    if (!String(perfil.broker_uid ?? '').trim()) upd.broker_uid = uid
  }
  // undetermined/erro: só o espelho muda. Nada se fecha, nada se revoga.
  await db.from('profiles').update(upd).eq('id', userId)
}

// ───────────────────────────── avisos no Telegram ─────────────────────────────

async function tg(chatId: string, text: string) {
  const token = getMtmcopyBotToken()
  if (!token || !chatId) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  }).catch(() => {})
}

async function chatDoAdmin(db: Supa): Promise<string | null> {
  const { data } = await db.from('site_settings').select('value').eq('key', 'telegram_admin_chat_id').maybeSingle()
  const v = (data?.value as { chat_id?: string } | null)?.chat_id
  return v ? String(v) : null
}

export async function avisarAdmin(db: Supa, texto: string) {
  const chat = await chatDoAdmin(db)
  if (chat) await tg(chat, texto)
}

export async function avisarLead(chatId: string, texto: string) {
  await tg(chatId, texto)
}

// ───────────────────────────── reverificação (cron) ─────────────────────────────

/**
 * Volta a verificar os pares cuja hora chegou. Fica abaixo do limite por minuto (o cron corre
 * de hora a hora; 8 por passagem deixa margem para os pedidos ao vivo do site e do Telegram).
 */
export async function reverificarPendentes(limite = 8, db: Supa = getSupabaseAdmin()) {
  if (!(await lerConfig()).chave) return { ativo: false, feitos: 0, confirmados: 0, esgotados: 0 }
  const { data: pendentes } = await db
    .from('primegate_verificacoes')
    .select('id, email, uid_puprime, user_id, chat_id, estado')
    .neq('estado', 'confirmed')
    .not('proxima_tentativa_em', 'is', null)
    .lte('proxima_tentativa_em', new Date().toISOString())
    .order('proxima_tentativa_em', { ascending: true })
    .limit(Math.min(limite, 9))

  let feitos = 0
  let confirmados = 0
  let esgotados = 0
  for (const v of pendentes ?? []) {
    const r = await verificar({
      email: v.email, uid: v.uid_puprime, userId: v.user_id as string | null, chatId: v.chat_id as string | null, origem: 'cron', db,
    })
    feitos++
    if (r.motivo.startsWith('quota')) break // não insistir: a quota é partilhada com o site
    if (r.estado === 'confirmed') {
      confirmados++
      if (v.chat_id) {
        await avisarLead(String(v.chat_id), mensagemParaCliente('confirmed', null, 'html') + '\n\nO acesso continua a seguir os passos de sempre (depósito validado).')
      }
      await avisarAdmin(db, `✅ <b>PrimeGate confirmou</b> ${v.email} (UID <code>${v.uid_puprime}</code>) no ramo MTM.`)
    } else if (!r.proximaTentativaEm) {
      esgotados++
    }
  }
  await alertarEsgotados(db)
  return { ativo: true, feitos, confirmados, esgotados }
}

/** Fim das 5 tentativas sem confirmação → UM alerta ao admin por par (nunca recusa automática). */
async function alertarEsgotados(db: Supa) {
  const { data: fim } = await db
    .from('primegate_verificacoes')
    .select('id, email, uid_puprime, chat_id, tentativas, motivo')
    .neq('estado', 'confirmed')
    .is('proxima_tentativa_em', null)
    .is('alerta_enviado_em', null)
    .gte('tentativas', MAX_TENTATIVAS)
    .limit(20)
  if (!fim?.length) return
  const linhas = fim.map((v) => `• ${v.email} · UID <code>${v.uid_puprime}</code>${v.chat_id ? ` · chat ${v.chat_id}` : ''}`)
  await avisarAdmin(
    db,
    `⚠️ <b>PrimeGate — ${fim.length} registo(s) por confirmar após ${MAX_TENTATIVAS} tentativas</b>\n\n${linhas.join('\n')}\n\n` +
      `Não foram recusados. Confirma à mão (link MTM usado? email/UID certos?) ou volta a verificar em /admin/sales-machine.`,
  )
  await db
    .from('primegate_verificacoes')
    .update({ alerta_enviado_em: new Date().toISOString() })
    .in('id', fim.map((v) => v.id as string))
}

// ───────────────────────────── leitura (admin / agentes) ─────────────────────────────

export async function resumoPrimeGate(db: Supa = getSupabaseAdmin()) {
  const conta = async (filtro: (q: any) => any) => {
    const { count } = await filtro(db.from('primegate_verificacoes').select('id', { count: 'exact', head: true }))
    return count ?? 0
  }
  const agora = new Date().toISOString()
  const hoje = 'd:' + agora.slice(0, 10)
  const [confirmed, undetermined, erro, pendentes, esgotados, quota, cfg] = await Promise.all([
    conta((q) => q.eq('estado', 'confirmed')),
    conta((q) => q.eq('estado', 'undetermined')),
    conta((q) => q.eq('estado', 'erro')),
    conta((q) => q.neq('estado', 'confirmed').not('proxima_tentativa_em', 'is', null)),
    conta((q) => q.neq('estado', 'confirmed').is('proxima_tentativa_em', null)),
    db.from('primegate_quota').select('contagem').eq('janela', hoje).maybeSingle(),
    lerConfig(),
  ])
  return {
    ativo: Boolean(cfg.chave),
    confirmed,
    undetermined,
    erro,
    pendentes,
    esgotados,
    quotaHoje: { usados: Number(quota.data?.contagem ?? 0), limite: cfg.limites.porDia, porMinuto: cfg.limites.porMinuto },
  }
}

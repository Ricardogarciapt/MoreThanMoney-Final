/**
 * EXECUTOR DO PIPELINE — o que faltava para os negócios saírem de «lead» sozinhos, dentro da lei.
 *
 * ═══ O QUE SE MEDIU A 10/11/2026 ═══════════════════════════════════════════════════════════
 *
 * 4.117 de 4.125 negócios em «lead». Desses, 3.969 são `whatsapp_import` — uma lista de contactos
 * importada, só telefone, sem consentimento nenhum: NÃO se podem contactar por iniciativa (Lei
 * 41/2004 art. 13.º-A; regras da Meta). Este executor não lhes toca. O funil real são ~156.
 *
 * E nesses ~156 nada saía porque:
 *  · o follow-up do Telegram só olhava para `new/qualifying/routed`, e 57 dos 62 leads estão em
 *    `no_grupo`/`pedido_sinais` (corrigido no funil + opt-in de um toque, lib/telegram-optin.ts);
 *  · a passagem legal que aprova envios (`autoAprovarFilaSite`) só corria quando o AIOS do Mac a
 *    chamava — Mac desligado, nada saía. Agora corre aqui, no cron do servidor;
 *  · não havia seguimento por email para quem deu consentimento de email;
 *  · ninguém mexia o estado do negócio quando uma mensagem saía.
 *
 * ═══ A REGRA ═══════════════════════════════════════════════════════════════════════════════
 *
 * Nada sai por este ficheiro directamente. Ele ESCREVE rascunhos na fila (`aios_tasks`, kinds
 * `envio:*`) e chama a passagem legal de sempre (`autoAprovarFilaSite` → `decidirContacto` com a
 * evidência da base: exclusão global, consentimento por canal, soft opt-in, tectos diários). Só o
 * que ela marca «sai» sai. Interruptor: `site_settings.pipeline_executor.ligado`; `limite` é o
 * máximo de mensagens por corrida (por omissão 20). Desligado → não escreve nem envia nada.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'
import { KIND_ENVIO } from '@/lib/envios-aprovacao'
import { linkAssinado } from '@/lib/agentes/codigos'
import { AGENTE_DO_PASSO } from '@/lib/vendas/escada-followup'
import { PRECO_MEMBRO } from '@/lib/escada-precos'
import { MIN_DEPOSIT } from '@/lib/broker/deposito-minimo'

type Db = SupabaseClient

export const CHAVE_CONFIG = 'pipeline_executor'
export const MAX_TOQUES_EMAIL = 3
/** Dias entre toques de email: 1.º logo, 2.º 3 dias depois, 3.º 5 dias depois do 2.º. */
export const DIAS_ENTRE_TOQUES = [0, 3, 5] as const
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').replace(/\/$/, '')

// ── Puro ────────────────────────────────────────────────────────────────────────────────────

/** Assinatura do link de saída (sem login: quem recebe o email tem de conseguir sair num clique). */
export function assinaturaSaida(email: string): string {
  const seg = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'mtm'
  return createHmac('sha256', seg).update(String(email).trim().toLowerCase()).digest('hex').slice(0, 24)
}

export function linkSaida(email: string): string {
  const e = String(email).trim().toLowerCase()
  return `${SITE}/api/sair?e=${encodeURIComponent(e)}&t=${assinaturaSaida(e)}`
}

/** O email de cada toque. Tom do framework: sem promessas de lucro, preço dito, saída em todos. */
export function emailDoToque(toque: number, primeiroNome: string | null, email: string): { assunto: string; texto: string } {
  const ola = primeiroNome ? `Olá ${primeiroNome},` : 'Olá,'
  const membro = linkAssinado('/register?plano=membro', AGENTE_DO_PASSO.membro)
  const corretora = linkAssinado('/abrir-conta', AGENTE_DO_PASSO.corretora)
  const rodape =
    `\n\n—\nRicardo Garcia · MoreThanMoney (morethanmoney.pt)\n` +
    `Conteúdo educativo, não constitui consultoria financeira. Resultados passados não garantem resultados futuros.\n` +
    `Recebes isto porque aceitaste receber novidades da MoreThanMoney. Para deixar de receber: ${linkSaida(email)}`
  if (toque <= 1) {
    return {
      assunto: 'O próximo passo na MoreThanMoney',
      texto:
        `${ola}\n\nObrigado pelo interesse na MoreThanMoney. O caminho mais simples para começar é entrar como Membro (${PRECO_MEMBRO}): ` +
        `formação, sessões ao vivo e a comunidade, com cada sinal mostrado do início ao fim em pips e percentagem.\n\n` +
        `Entras aqui: ${membro}\n\nSe tiveres dúvidas, responde a este email.` + rodape,
    }
  }
  if (toque === 2) {
    return {
      assunto: 'Premium incluído com a tua conta na corretora',
      texto:
        `${ola}\n\nHá outro caminho: abrir a tua conta na PU Prime (corretora regulada) e depositar a partir de $${MIN_DEPOSIT}. ` +
        `Com a conta validada, o Premium e os grupos de sinais ficam incluídos enquanto a conta estiver financiada. ` +
        `O dinheiro fica sempre na tua conta, em teu nome.\n\nAbres aqui: ${corretora}` + rodape,
    }
  }
  return {
    assunto: 'Fico por aqui',
    texto:
      `${ola}\n\nNão te volto a escrever sobre isto. Se um dia quiseres avançar, o pack Membro está em ${membro} ` +
      `e a rota da corretora em ${corretora}. Qualquer dúvida, é só responder.` + rodape,
  }
}

/** Já é altura do toque `n` (1-based), dado quando saiu o anterior? */
export function toqueDevido(n: number, ultimoEnvioIso: string | null, agora = Date.now()): boolean {
  if (n < 1 || n > MAX_TOQUES_EMAIL) return false
  if (n === 1) return true
  if (!ultimoEnvioIso) return false
  return agora - Date.parse(ultimoEnvioIso) >= DIAS_ENTRE_TOQUES[n - 1] * 86_400_000
}

// ── Base de dados ───────────────────────────────────────────────────────────────────────────

export interface ConfigExecutor { ligado: boolean; limite: number }

export async function lerConfig(db: Db): Promise<ConfigExecutor> {
  try {
    const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_CONFIG).maybeSingle()
    const v = (typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value) ?? {}
    const limite = Number(v.limite)
    return { ligado: v.ligado === true, limite: Number.isFinite(limite) && limite > 0 ? Math.min(limite, 60) : 20 }
  } catch {
    return { ligado: false, limite: 0 }
  }
}

/**
 * Quem carregou no opt-in (ou escreveu ao bot) abriu a conversa: garante a linha em
 * `telegram_leads` e tira-a de `no_grupo`/`pedido_sinais`, para o follow-up a poder ver.
 */
export async function garantirConversaAberta(
  db: Db,
  chatId: string,
  from: { first_name?: string | null; username?: string | null } | null,
): Promise<void> {
  try {
    const { data } = await db.from('telegram_leads').select('chat_id, stage').eq('chat_id', chatId).maybeSingle()
    const agora = new Date().toISOString()
    if (!data) {
      await db.from('telegram_leads').insert({
        chat_id: chatId,
        first_name: from?.first_name ?? null,
        username: from?.username ?? null,
        stage: 'qualifying',
        source: 'optin-seguimento',
        message_count: 0,
        followup_count: 0,
        updated_at: agora,
      })
    } else if (['no_grupo', 'pedido_sinais', 'new'].includes(String((data as { stage: string | null }).stage ?? ''))) {
      await db.from('telegram_leads').update({ stage: 'qualifying', updated_at: agora }).eq('chat_id', chatId)
    }
  } catch (e) {
    console.error('[executor-pipeline] garantirConversaAberta', e)
  }
}

/** Emails com consentimento de email vivo (inclui a caixa do checkout/marketplace). */
async function emailsComConsentimento(db: Db): Promise<Set<string>> {
  const { data } = await db
    .from('captacao_consentimento')
    .select('email, canal, base_legal, retirado_em')
    .not('email', 'is', null)
    .limit(5000)
  const vivos = new Set<string>()
  const retirados = new Set<string>()
  for (const c of (data ?? []) as Array<{ email: string; canal: string | null; base_legal: string; retirado_em: string | null }>) {
    const e = String(c.email).trim().toLowerCase()
    if (c.retirado_em) retirados.add(e)
    else if (c.base_legal === 'consentimento' && ['email', 'checkout', 'marketplace'].includes(String(c.canal ?? ''))) vivos.add(e)
  }
  for (const e of retirados) vivos.delete(e)
  return vivos
}

/** Rascunhos de email de seguimento para negócios abertos cujo email consentiu. Nunca envia. */
export async function rascunharEmails(db: Db, max: number): Promise<number> {
  const consent = await emailsComConsentimento(db)
  if (!consent.size) return 0
  const { data: negocios } = await db
    .from('vendas_negocios')
    .select('id, nome, email, estado')
    .in('estado', ['lead', 'contactado', 'qualificado'])
    .not('email', 'is', null)
    .limit(1000)
  const alvo = ((negocios ?? []) as Array<{ id: string; nome: string | null; email: string; estado: string }>)
    .filter((n) => consent.has(String(n.email).trim().toLowerCase()))
  if (!alvo.length) return 0

  const { data: tarefas } = await db
    .from('aios_tasks')
    .select('payload, status, enviado_em')
    .eq('kind', KIND_ENVIO.EMAIL_SEGUIMENTO)
    .in('payload->>negocio_id', alvo.map((n) => n.id))
  const historico = new Map<string, { toque: number; enviado_em: string | null; aberto: boolean }>()
  for (const t of (tarefas ?? []) as Array<{ payload: { negocio_id: string; toque: number }; status: string; enviado_em: string | null }>) {
    const h = historico.get(t.payload.negocio_id) ?? { toque: 0, enviado_em: null, aberto: false }
    if (['pendente', 'aprovado'].includes(t.status)) h.aberto = true
    if (t.status === 'enviado' && Number(t.payload.toque) > h.toque) { h.toque = Number(t.payload.toque); h.enviado_em = t.enviado_em }
    if (['rejeitado', 'falhou'].includes(t.status) && Number(t.payload.toque) > h.toque) h.toque = MAX_TOQUES_EMAIL // parou: não insiste
    historico.set(t.payload.negocio_id, h)
  }

  const { criarEnvioPorAprovar } = await import('@/lib/envios-fila')
  let criados = 0
  for (const n of alvo) {
    if (criados >= max) break
    const h = historico.get(n.id) ?? { toque: 0, enviado_em: null, aberto: false }
    if (h.aberto) continue
    const toque = h.toque + 1
    if (!toqueDevido(toque, h.enviado_em)) continue
    const email = String(n.email).trim().toLowerCase()
    const nome = (n.nome ?? '').split(' ')[0] || null
    const m = emailDoToque(toque, nome, email)
    const r = await criarEnvioPorAprovar({
      kind: KIND_ENVIO.EMAIL_SEGUIMENTO,
      chave: `email-seguimento:${n.id}:${toque}`,
      titulo: `Email de seguimento · toque ${toque}/${MAX_TOQUES_EMAIL} · ${nome ?? email}`,
      detalhes: `Negócio em «${n.estado}» com consentimento de email. Assunto: ${m.assunto}\n\n${m.texto}`,
      payload: {
        email,
        assunto: m.assunto,
        texto: m.texto,
        link: `${SITE}/register?plano=membro`,
        origem: 'vendas_negocios',
        referencia: n.id,
        negocio_id: n.id,
        toque,
        agente: AGENTE_DO_PASSO.membro,
        familia_oferta: 'formacao',
      } as never,
    })
    if (r.criado) criados++
  }
  return criados
}

/**
 * Negócios em «lead» a quem JÁ saiu uma mensagem (Telegram ou email) passam a «contactado», com o
 * evento no histórico. Só sobe de «lead»: nunca mexe num estado que uma pessoa já pôs.
 */
export async function sincronizarEstados(db: Db): Promise<number> {
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: saidas } = await db
    .from('aios_tasks')
    .select('kind, payload')
    .like('kind', 'envio:%')
    .eq('status', 'enviado')
    .gte('enviado_em', desde)
    .limit(2000)
  const chats = new Set<string>()
  const emails = new Set<string>()
  for (const s of (saidas ?? []) as Array<{ kind: string; payload: Record<string, unknown> }>) {
    if (s.payload?.chat_id) chats.add(String(s.payload.chat_id))
    if (s.payload?.email) emails.add(String(s.payload.email).trim().toLowerCase())
  }
  const ors = [
    ...(chats.size ? [`telegram_id.in.(${[...chats].map((c) => `"${c.replace(/"/g, '')}"`).join(',')})`] : []),
    ...(emails.size ? [`email.in.(${[...emails].map((e) => `"${e.replace(/"/g, '')}"`).join(',')})`] : []),
  ]
  if (!ors.length) return 0
  const { data: negocios } = await db.from('vendas_negocios').select('id').eq('estado', 'lead').or(ors.join(',')).limit(500)
  let n = 0
  for (const x of (negocios ?? []) as Array<{ id: string }>) {
    const { data: mudou } = await db
      .from('vendas_negocios')
      .update({ estado: 'contactado', atualizado_em: new Date().toISOString() })
      .eq('id', x.id)
      .eq('estado', 'lead')
      .select('id')
    if (mudou?.length) {
      await db.from('vendas_negocio_eventos').insert({ negocio_id: x.id, de: 'lead', para: 'contactado', nota: 'executor do pipeline: mensagem de seguimento enviada' })
      n++
    }
  }
  return n
}

export interface ResultadoExecutor {
  ok: boolean
  ligado: boolean
  rascunhosTelegram: number
  rascunhosEmail: number
  enviados: number
  ficam: number
  contactados: number
  porDestino: Record<string, number>
  erros: string[]
}

export async function correrExecutor(db: Db): Promise<ResultadoExecutor> {
  const cfg = await lerConfig(db)
  const r: ResultadoExecutor = { ok: true, ligado: cfg.ligado, rascunhosTelegram: 0, rascunhosEmail: 0, enviados: 0, ficam: 0, contactados: 0, porDestino: {}, erros: [] }
  if (!cfg.ligado) return r
  try {
    const { runLeadFollowups } = await import('@/lib/telegram-lead-followup')
    r.rascunhosTelegram = (await runLeadFollowups()).rascunhos
  } catch (e) { r.erros.push(`telegram: ${e instanceof Error ? e.message : String(e)}`) }
  try {
    r.rascunhosEmail = await rascunharEmails(db, cfg.limite)
  } catch (e) { r.erros.push(`email: ${e instanceof Error ? e.message : String(e)}`) }
  try {
    const { autoAprovarFilaSite } = await import('@/lib/envios-auto-aprovar')
    const a = await autoAprovarFilaSite(db, { quem: 'executor-pipeline', limite: cfg.limite })
    r.enviados = a.enviados
    r.ficam = a.ficam
    r.porDestino = a.porDestino
    r.erros.push(...a.erros)
  } catch (e) { r.erros.push(`aprovar: ${e instanceof Error ? e.message : String(e)}`) }
  try {
    r.contactados = await sincronizarEstados(db)
  } catch (e) { r.erros.push(`estados: ${e instanceof Error ? e.message : String(e)}`) }
  return r
}

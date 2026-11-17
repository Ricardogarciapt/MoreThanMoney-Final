/**
 * A FICHA ÚNICA DO CONTACTO (360°) — CRM Fase 3, 17/11/2026.
 *
 * Um contacto vive espalhado por oito tabelas: o negócio, o histórico dele, as tarefas, a agenda,
 * a conversa de WhatsApp, o lead do Telegram, os comentários no Instagram, a conta no site, as
 * vendas e o consentimento. Até aqui quem trabalhava o negócio via só a primeira. Esta leitura junta
 * tudo pelo que identifica a pessoa (email, telefone, Telegram, Instagram), SÓ PARA LER.
 *
 * Cada bloco lê-se à parte e falha à parte: uma tabela em baixo deixa esse bloco com a frase «não
 * consegui ler», e o resto da ficha continua de pé. Um erro nunca se mostra como lista vazia.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type Bloco<T> = { ok: true; linhas: T[] } | { ok: false; erro: string }

export interface NegocioDaFicha {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  telegram_username: string | null
  telegram_id: string | number | null
  instagram_handle: string | null
  pack_previsto: string | null
  origem: string | null
  estado: string
  motivo_perda: string | null
  nota: string | null
  prospector_id: string | null
  setter_id: string | null
  closer_id: string | null
  team_leader_id: string | null
  afiliado_id: string | null
  agente_id: string | null
  agente_pontuacao: number | null
  agente_qualificacao: string | null
  criado_em: string
  atualizado_em: string
  fechado_em: string | null
  /** `undefined` quando a migração 262 ainda não está aplicada. */
  funil?: string | null
}

const COLUNAS_BASE =
  'id, nome, email, telefone, telegram_username, telegram_id, instagram_handle, pack_previsto, origem, ' +
  'estado, motivo_perda, nota, prospector_id, setter_id, closer_id, team_leader_id, afiliado_id, ' +
  'agente_id, agente_pontuacao, agente_qualificacao, criado_em, atualizado_em, fechado_em'

/** A coluna `funil` não existe (migração 262 por aplicar)? Então lê-se sem ela, e diz-se. */
export function faltaColunaFunil(erro: { message?: string } | null | undefined): boolean {
  return !!erro?.message && /funil/i.test(erro.message) && /column|coluna/i.test(erro.message)
}

export async function lerNegocioDaFicha(
  db: SupabaseClient,
  id: string,
): Promise<{ negocio: NegocioDaFicha | null; semFunil: boolean; erro?: string }> {
  const com = await db.from('vendas_negocios').select(`${COLUNAS_BASE}, funil`).eq('id', id).maybeSingle()
  if (!com.error) return { negocio: (com.data ?? null) as unknown as NegocioDaFicha | null, semFunil: false }
  if (!faltaColunaFunil(com.error)) return { negocio: null, semFunil: false, erro: com.error.message }
  const sem = await db.from('vendas_negocios').select(COLUNAS_BASE).eq('id', id).maybeSingle()
  if (sem.error) return { negocio: null, semFunil: true, erro: sem.error.message }
  return { negocio: (sem.data ?? null) as unknown as NegocioDaFicha | null, semFunil: true }
}

/** Só os dígitos, e os últimos 9: «+351 912 …» e «912…» são o mesmo telemóvel. */
export function finalDoTelefone(t: string | null | undefined): string | null {
  const d = String(t ?? '').replace(/\D/g, '')
  return d.length >= 9 ? d.slice(-9) : null
}

function limparHandle(h: string | null | undefined): string | null {
  const v = String(h ?? '').trim().replace(/^@/, '').toLowerCase()
  return /^[a-z0-9._]{2,40}$/.test(v) ? v : null
}

function limparEmail(e: string | null | undefined): string | null {
  const v = String(e ?? '').trim().toLowerCase()
  return /^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/.test(v) ? v : null
}

async function bloco<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Bloco<T>> {
  try {
    const { data, error } = await p
    if (error) return { ok: false, erro: error.message }
    return { ok: true, linhas: (data ?? []) as T[] }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falhou' }
  }
}

function vazio<T>(): Promise<Bloco<T>> {
  return Promise.resolve({ ok: true, linhas: [] as T[] })
}

export interface Ficha {
  eventos: Bloco<{ id: number; de: string | null; para: string | null; nota: string | null; em: string; por: string | null; agente_id: string | null }>
  tarefas: Bloco<{ id: string; titulo: string; estado: string; prazo: string | null; responsavel_id: string | null; feita_em: string | null }>
  agenda: Bloco<{ id: string; inicio: string; estado: string; join_url: string | null; local: string | null }>
  whatsapp: Bloco<{ id: string; telefone: string; estado: string | null; por_responder: number | null; ultima_entrada: string | null; ultima_saida: string | null; etiquetas: string[] | null }>
  telegram: Bloco<{ chat_id: string | number; username: string | null; stage: string | null; interest: string | null; message_count: number | null; updated_at: string | null; broker_uid: string | null }>
  instagram: Bloco<{ comment_id: string; keyword: string | null; intent: string | null; comment_text: string | null; dm_status: string | null; created_at: string }>
  conta: Bloco<{ id: string; email: string | null; user_type: string | null; subscription_status: string | null; subscription_plan: string | null; trial_expires_at: string | null; broker_verified: boolean | null; created_at: string; last_login: string | null }>
  vendas: Bloco<{ id: string; pack: string | null; valor_cents: number | null; moeda: string | null; pago_em: string | null; estornada_em: string | null }>
  consentimentos: Bloco<{ id: string; canal: string | null; base_legal: string | null; pedido_em: string | null; retirado_em: string | null }>
}

/** Junta tudo o que se sabe deste contacto. Nada aqui escreve. */
export async function lerFicha(db: SupabaseClient, n: NegocioDaFicha): Promise<Ficha> {
  const email = limparEmail(n.email)
  const tel = finalDoTelefone(n.telefone)
  const tgUser = limparHandle(n.telegram_username)
  const tgId = n.telegram_id != null && /^-?\d+$/.test(String(n.telegram_id)) ? String(n.telegram_id) : null
  const ig = limparHandle(n.instagram_handle)

  const [eventos, tarefas, agenda, whatsapp, telegram, instagram, conta, vendas, consentimentos] = await Promise.all([
    bloco<Ficha['eventos'] extends Bloco<infer T> ? T : never>(
      db.from('vendas_negocio_eventos').select('id, de, para, nota, em, por, agente_id').eq('negocio_id', n.id).order('em', { ascending: false }).limit(30),
    ),
    bloco<Ficha['tarefas'] extends Bloco<infer T> ? T : never>(
      db.from('vendas_tarefas').select('id, titulo, estado, prazo, responsavel_id, feita_em').eq('negocio_id', n.id).neq('estado', 'cancelada').order('prazo', { ascending: false, nullsFirst: false }).limit(20),
    ),
    bloco<Ficha['agenda'] extends Bloco<infer T> ? T : never>(
      email
        ? db.from('agenda_marcacoes').select('id, inicio, estado, join_url, local').or(`negocio_id.eq.${n.id},email.eq.${email}`).order('inicio', { ascending: false }).limit(10)
        : db.from('agenda_marcacoes').select('id, inicio, estado, join_url, local').eq('negocio_id', n.id).order('inicio', { ascending: false }).limit(10),
    ),
    bloco<Ficha['whatsapp'] extends Bloco<infer T> ? T : never>(
      tel
        ? db.from('whatsapp_conversas').select('id, telefone, estado, por_responder, ultima_entrada, ultima_saida, etiquetas').or(`negocio_id.eq.${n.id},telefone.like.%${tel}`).limit(5)
        : db.from('whatsapp_conversas').select('id, telefone, estado, por_responder, ultima_entrada, ultima_saida, etiquetas').eq('negocio_id', n.id).limit(5),
    ),
    tgId || tgUser
      ? bloco<Ficha['telegram'] extends Bloco<infer T> ? T : never>(
          db
            .from('telegram_leads')
            .select('chat_id, username, stage, interest, message_count, updated_at, broker_uid')
            .or([tgId ? `chat_id.eq.${tgId}` : null, tgUser ? `username.ilike.${tgUser}` : null].filter(Boolean).join(','))
            .limit(3),
        )
      : vazio<Ficha['telegram'] extends Bloco<infer T> ? T : never>(),
    ig
      ? bloco<Ficha['instagram'] extends Bloco<infer T> ? T : never>(
          db.from('ig_leads').select('comment_id, keyword, intent, comment_text, dm_status, created_at').ilike('commenter', ig).order('created_at', { ascending: false }).limit(10),
        )
      : vazio<Ficha['instagram'] extends Bloco<infer T> ? T : never>(),
    email
      ? bloco<Ficha['conta'] extends Bloco<infer T> ? T : never>(
          db.from('profiles').select('id, email, user_type, subscription_status, subscription_plan, trial_expires_at, broker_verified, created_at, last_login').ilike('email', email).limit(1),
        )
      : vazio<Ficha['conta'] extends Bloco<infer T> ? T : never>(),
    bloco<Ficha['vendas'] extends Bloco<infer T> ? T : never>(
      db.from('vendas_vendas').select('id, pack, valor_cents, moeda, pago_em, estornada_em').eq('negocio_id', n.id).order('pago_em', { ascending: false }).limit(10),
    ),
    email || tel || tgId || ig
      ? bloco<Ficha['consentimentos'] extends Bloco<infer T> ? T : never>(
          db
            .from('captacao_consentimento')
            .select('id, canal, base_legal, pedido_em, retirado_em')
            .or(
              [
                email ? `email.eq.${email}` : null,
                tel ? `telefone.like.%${tel}` : null,
                tgId ? `telegram_chat_id.eq.${tgId}` : null,
                ig ? `instagram_handle.ilike.${ig}` : null,
              ]
                .filter(Boolean)
                .join(','),
            )
            .limit(10),
        )
      : vazio<Ficha['consentimentos'] extends Bloco<infer T> ? T : never>(),
  ])

  return { eventos, tarefas, agenda, whatsapp, telegram, instagram, conta, vendas, consentimentos }
}

import { randomBytes } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { gerarTokenAuditoria } from './auditoria'

/**
 * Os links de auditoria (`funded_auditoria_links`, migração 249): ler o activo, criar/rodar e revogar.
 * Usado pela ficha «Partilhar» do dono da conta e pelo painel de admin das rotas de estratégia.
 * Quem pode o quê decide a rota que chama — aqui não se verifica dono nem admin.
 */

export interface LinkAuditoria { url: string; mostrarLogin: boolean; criadoEm: string | null; visitas: number }

export const caminhoAuditoria = (token: string) => `/mtmfunded/auditoria/${token}`

export async function linkActivo(accountId: string): Promise<LinkAuditoria | null> {
  const { data } = await getSupabaseAdmin().from('funded_auditoria_links')
    .select('token, mostrar_login, created_at, visitas').eq('account_id', accountId).eq('ativo', true).is('revogado_em', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data ? { url: caminhoAuditoria(String(data.token)), mostrarLogin: !!data.mostrar_login, criadoEm: (data.created_at as string) ?? null, visitas: Number(data.visitas ?? 0) } : null
}

/** Links activos de várias contas de uma vez (accountId → link). */
export async function linksActivos(accountIds: string[]): Promise<Map<string, LinkAuditoria>> {
  const out = new Map<string, LinkAuditoria>()
  if (!accountIds.length) return out
  const { data } = await getSupabaseAdmin().from('funded_auditoria_links')
    .select('account_id, token, mostrar_login, created_at, visitas').in('account_id', accountIds).eq('ativo', true).is('revogado_em', null)
  for (const d of data ?? []) {
    out.set(String(d.account_id), { url: caminhoAuditoria(String(d.token)), mostrarLogin: !!d.mostrar_login, criadoEm: (d.created_at as string) ?? null, visitas: Number(d.visitas ?? 0) })
  }
  return out
}

// ── Contas REAIS ligadas (migração 250): o alvo é a referência do WebTrader e o dono ──────────

export async function linkActivoRef(ref: string, donoId: string): Promise<LinkAuditoria | null> {
  const { data } = await getSupabaseAdmin().from('funded_auditoria_links')
    .select('token, mostrar_login, created_at, visitas').eq('conta_ref', ref).eq('dono_id', donoId).eq('ativo', true).is('revogado_em', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data ? { url: caminhoAuditoria(String(data.token)), mostrarLogin: false, criadoEm: (data.created_at as string) ?? null, visitas: Number(data.visitas ?? 0) } : null
}

export async function revogarLinkRef(ref: string, donoId: string): Promise<void> {
  await getSupabaseAdmin().from('funded_auditoria_links').update({ ativo: false, revogado_em: new Date().toISOString() })
    .eq('conta_ref', ref).eq('dono_id', donoId).eq('ativo', true).is('revogado_em', null)
}

/** Como `garantirLink`, para uma conta real. Nunca mostra o login da corretora. */
export async function garantirLinkRef(ref: string, donoId: string, opts: { novo?: boolean }): Promise<LinkAuditoria | null> {
  const atual = await linkActivoRef(ref, donoId)
  if (atual && !opts.novo) return atual
  // O índice é por referência: um link activo de outro dono (conta mudou de mãos) também sai.
  await getSupabaseAdmin().from('funded_auditoria_links').update({ ativo: false, revogado_em: new Date().toISOString() })
    .eq('conta_ref', ref).eq('ativo', true).is('revogado_em', null)
  const token = gerarTokenAuditoria((n) => randomBytes(n))
  const { error } = await getSupabaseAdmin().from('funded_auditoria_links').insert({
    conta_ref: ref, dono_id: donoId, token, mostrar_login: false, criado_por: donoId,
  })
  if (error) throw error
  return linkActivoRef(ref, donoId)
}

export async function revogarLink(accountId: string): Promise<void> {
  await getSupabaseAdmin().from('funded_auditoria_links').update({ ativo: false, revogado_em: new Date().toISOString() })
    .eq('account_id', accountId).eq('ativo', true).is('revogado_em', null)
}

/**
 * Devolve o link activo (e muda o «mostrar login» se vier pedido) ou cria um. Com `novo`, o activo é
 * revogado e nasce um token novo — o endereço antigo deixa de abrir.
 */
export async function garantirLink(accountId: string, opts: { mostrarLogin?: boolean; novo?: boolean; criadoPor: string | null }): Promise<LinkAuditoria | null> {
  const db = getSupabaseAdmin()
  const atual = await linkActivo(accountId)
  if (atual && !opts.novo) {
    if (typeof opts.mostrarLogin === 'boolean' && opts.mostrarLogin !== atual.mostrarLogin) {
      await db.from('funded_auditoria_links').update({ mostrar_login: opts.mostrarLogin })
        .eq('account_id', accountId).eq('ativo', true).is('revogado_em', null)
    }
    return linkActivo(accountId)
  }
  if (atual) await revogarLink(accountId)
  const token = gerarTokenAuditoria((n) => randomBytes(n))
  const { error } = await db.from('funded_auditoria_links').insert({
    account_id: accountId, token, mostrar_login: !!opts.mostrarLogin, criado_por: opts.criadoPor,
  })
  if (error) throw error
  return linkActivo(accountId)
}

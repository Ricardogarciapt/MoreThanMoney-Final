import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { SITE, type Marca, type Rede } from './regras'

/**
 * OAuth das três redes. As credenciais da APP vêm das variáveis de ambiente (Vercel); os tokens
 * de cada CONTA ficam em `redes_contas` (só a service role lê). Nada disto vai para o código.
 *
 *  · YouTube  — YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET (a mesma app Google do videocliper).
 *  · TikTok   — TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET (app em developers.tiktok.com com
 *               Login Kit + Content Posting API).
 *  · LinkedIn — LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET (app em linkedin.com/developers,
 *               ligada à página da empresa; publicar na página exige o produto
 *               «Community Management API» aprovado).
 */

export const callbackDe = (rede: Rede) => `${SITE}/api/redes/callback/${rede}`

type Credenciais = { id: string; segredo: string }
const ENV: Record<Rede, [string, string]> = {
  youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
}

export function credenciais(rede: Rede): Credenciais | null {
  const [a, b] = ENV[rede]
  const id = process.env[a]?.trim()
  const segredo = process.env[b]?.trim()
  return id && segredo ? { id, segredo } : null
}
export const variaveisEmFalta = (rede: Rede) => (credenciais(rede) ? [] : ENV[rede])

/** LinkedIn: página da empresa (organização) ou perfil pessoal. A marca decide. */
export const linkedinEhPagina = (marca: Marca) => marca === 'morethanmoney'
export const LINKEDIN_VERSAO = () => process.env.LINKEDIN_API_VERSION?.trim() || '202510'

export function urlDeLigacao(rede: Rede, marca: Marca, state: string): string {
  const c = credenciais(rede)
  if (!c) throw new Error(`Faltam ${ENV[rede].join(' e ')} na Vercel.`)
  const cb = callbackDe(rede)
  if (rede === 'youtube') {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    u.search = new URLSearchParams({
      client_id: c.id, redirect_uri: cb, response_type: 'code', access_type: 'offline', prompt: 'consent select_account',
      include_granted_scopes: 'true', state,
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    }).toString()
    return u.toString()
  }
  if (rede === 'tiktok') {
    const u = new URL('https://www.tiktok.com/v2/auth/authorize/')
    u.search = new URLSearchParams({
      client_key: c.id, redirect_uri: cb, response_type: 'code', state,
      scope: 'user.info.basic,video.upload,video.publish',
    }).toString()
    return u.toString()
  }
  const u = new URL('https://www.linkedin.com/oauth/v2/authorization')
  u.search = new URLSearchParams({
    response_type: 'code', client_id: c.id, redirect_uri: cb, state,
    scope: linkedinEhPagina(marca)
      ? 'r_organization_social w_organization_social rw_organization_admin'
      : 'openid profile w_member_social',
  }).toString()
  return u.toString()
}

type Tokens = { access: string; refresh?: string | null; expiraS?: number | null; refreshExpiraS?: number | null; escopos?: string | null }

async function postForm(url: string, corpo: Record<string, string>) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corpo),
    cache: 'no-store',
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, any>
  return { ok: r.ok, j, status: r.status }
}

export async function trocarCodigo(rede: Rede, code: string): Promise<Tokens> {
  const c = credenciais(rede)
  if (!c) throw new Error('credenciais da app em falta')
  const cb = callbackDe(rede)
  if (rede === 'youtube') {
    const { ok, j } = await postForm('https://oauth2.googleapis.com/token', {
      code, client_id: c.id, client_secret: c.segredo, redirect_uri: cb, grant_type: 'authorization_code',
    })
    if (!ok || !j.access_token) throw new Error(`Google: ${j.error_description || j.error || 'sem token'}`)
    return { access: j.access_token, refresh: j.refresh_token ?? null, expiraS: j.expires_in ?? null, escopos: j.scope ?? null }
  }
  if (rede === 'tiktok') {
    const { ok, j } = await postForm('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: c.id, client_secret: c.segredo, code, grant_type: 'authorization_code', redirect_uri: cb,
    })
    if (!ok || !j.access_token) throw new Error(`TikTok: ${j.error_description || j.error || 'sem token'}`)
    return { access: j.access_token, refresh: j.refresh_token, expiraS: j.expires_in, refreshExpiraS: j.refresh_expires_in, escopos: j.scope ?? null }
  }
  const { ok, j } = await postForm('https://www.linkedin.com/oauth/v2/accessToken', {
    grant_type: 'authorization_code', code, client_id: c.id, client_secret: c.segredo, redirect_uri: cb,
  })
  if (!ok || !j.access_token) throw new Error(`LinkedIn: ${j.error_description || j.error || 'sem token'}`)
  return { access: j.access_token, refresh: j.refresh_token ?? null, expiraS: j.expires_in, refreshExpiraS: j.refresh_token_expires_in ?? null, escopos: j.scope ?? null }
}

async function renovar(rede: Rede, refresh: string): Promise<Tokens> {
  const c = credenciais(rede)
  if (!c) throw new Error('credenciais da app em falta')
  if (rede === 'youtube') {
    const { ok, j } = await postForm('https://oauth2.googleapis.com/token', {
      client_id: c.id, client_secret: c.segredo, refresh_token: refresh, grant_type: 'refresh_token',
    })
    if (!ok || !j.access_token) throw new Error(`Google: ${j.error_description || j.error || 'não renovou'}`)
    return { access: j.access_token, refresh, expiraS: j.expires_in }
  }
  if (rede === 'tiktok') {
    const { ok, j } = await postForm('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: c.id, client_secret: c.segredo, grant_type: 'refresh_token', refresh_token: refresh,
    })
    if (!ok || !j.access_token) throw new Error(`TikTok: ${j.error_description || j.error || 'não renovou'}`)
    return { access: j.access_token, refresh: j.refresh_token ?? refresh, expiraS: j.expires_in, refreshExpiraS: j.refresh_expires_in }
  }
  const { ok, j } = await postForm('https://www.linkedin.com/oauth/v2/accessToken', {
    grant_type: 'refresh_token', refresh_token: refresh, client_id: c.id, client_secret: c.segredo,
  })
  if (!ok || !j.access_token) throw new Error(`LinkedIn: ${j.error_description || j.error || 'não renovou'}`)
  return { access: j.access_token, refresh: j.refresh_token ?? refresh, expiraS: j.expires_in, refreshExpiraS: j.refresh_token_expires_in }
}

const depois = (s?: number | null) => (s ? new Date(Date.now() + s * 1000).toISOString() : null)

export function linhaDeTokens(t: Tokens) {
  return {
    access_token: t.access,
    refresh_token: t.refresh ?? null,
    expira_em: depois(t.expiraS),
    refresh_expira_em: depois(t.refreshExpiraS),
    escopos: t.escopos ?? null,
  }
}

export type Conta = {
  id: string; rede: Rede; marca: Marca; nome: string | null; conta_externa_id: string | null
  access_token: string | null; refresh_token: string | null; expira_em: string | null; ativa: boolean
}

/** Token válido para a conta; renova e grava se faltar menos de 5 minutos. */
export async function tokenDa(conta: Conta): Promise<string> {
  const falta = conta.expira_em ? new Date(conta.expira_em).getTime() - Date.now() : Infinity
  if (conta.access_token && falta > 5 * 60_000) return conta.access_token
  if (!conta.refresh_token) throw new Error('o token expirou e não há renovação: volta a ligar a conta em /admin/redes')
  const t = await renovar(conta.rede, conta.refresh_token)
  const linha = linhaDeTokens(t)
  await getSupabaseAdmin().from('redes_contas').update({ ...linha, atualizado_em: new Date().toISOString() }).eq('id', conta.id)
  conta.access_token = linha.access_token
  conta.expira_em = linha.expira_em
  return linha.access_token
}

/** Quem é a conta acabada de ligar: nome e id na rede (para o painel e para publicar). */
export async function identificar(rede: Rede, marca: Marca, access: string): Promise<{ nome: string; id: string; nota?: string }> {
  if (rede === 'youtube') {
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${access}` } })
    const j = (await r.json().catch(() => ({}))) as { items?: { id: string; snippet?: { title?: string } }[] }
    const c = j.items?.[0]
    if (!c) throw new Error('esta conta Google não tem canal de YouTube')
    return { nome: c.snippet?.title || c.id, id: c.id }
  }
  if (rede === 'tiktok') {
    const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { Authorization: `Bearer ${access}` } })
    const j = (await r.json().catch(() => ({}))) as { data?: { user?: { open_id?: string; display_name?: string } } }
    const u = j.data?.user
    if (!u?.open_id) throw new Error('o TikTok não devolveu a conta')
    return { nome: u.display_name || u.open_id, id: u.open_id }
  }
  const h = { Authorization: `Bearer ${access}`, 'LinkedIn-Version': LINKEDIN_VERSAO(), 'X-Restli-Protocol-Version': '2.0.0' }
  if (!linkedinEhPagina(marca)) {
    const r = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${access}` } })
    const j = (await r.json().catch(() => ({}))) as { sub?: string; name?: string }
    if (!j.sub) throw new Error('o LinkedIn não devolveu o perfil')
    return { nome: j.name || 'Perfil LinkedIn', id: `urn:li:person:${j.sub}` }
  }
  const r = await fetch('https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED', { headers: h })
  const j = (await r.json().catch(() => ({}))) as { elements?: { organization?: string }[] }
  const orgs = (j.elements ?? []).map((e) => e.organization).filter(Boolean) as string[]
  if (!orgs.length) throw new Error('esta conta LinkedIn não administra nenhuma página de empresa')
  const org = orgs[0]
  let nome = org
  try {
    const o = await fetch(`https://api.linkedin.com/rest/organizations/${org.split(':').pop()}`, { headers: h })
    const oj = (await o.json().catch(() => ({}))) as { localizedName?: string }
    if (oj.localizedName) nome = oj.localizedName
  } catch { /* fica o urn */ }
  return { nome, id: org, nota: orgs.length > 1 ? `administra ${orgs.length} páginas; ficou a primeira (${org})` : undefined }
}

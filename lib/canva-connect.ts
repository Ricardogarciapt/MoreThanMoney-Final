import { uploadBufferToBucket } from '@/lib/instagram/publish'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Canva Connect API (headless) — autofill de um brand template + export → imagem no bucket.
 * Gere o token sozinho: guarda o refresh_token em site_settings.canva_connect (obtido no "Ligar Canva",
 * /api/admin/canva/connect) e troca-o por um access_token fresco a cada uso. Alternativa simples:
 * um token estático em CANVA_CONNECT_TOKEN (expira em horas — só p/ testes).
 *
 * Config:
 *   - CANVA_CLIENT_ID / CANVA_CLIENT_SECRET : credenciais da integração Canva Connect (dev portal).
 *   - CANVA_BRAND_TEMPLATE_ID               : id do brand template COM dataset (campos de texto).
 *   - CANVA_FIELDS (opcional)               : JSON {hook,cta,proof} → nomes dos campos do template.
 *   - (opcional) CANVA_CONNECT_TOKEN        : access token estático (bypassa o refresh).
 *
 * Requer plano Canva PAGO (autofill dá "requires paid plan" no free). Falha → devolve null → card gerado.
 */
const BASE = 'https://api.canva.com/rest/v1'
const OAUTH_TOKEN = `${BASE}/oauth/token`
/**
 * O que pedimos ao Canva.
 *
 * `design:meta:read` e `folder:read` entraram a 2026-08-29 para se poder LISTAR o que existe na
 * conta. Sem eles a API respondia 403 a tudo o que não fosse autofill, e não havia como descobrir
 * que templates lá estão — só adivinhar ids à mão, que é o que se quer evitar.
 *
 * Mudar esta lista obriga a autorizar outra vez: o token que já existe carrega os âmbitos com que
 * foi emitido, não os que passámos a pedir.
 */
export const CANVA_SCOPES =
  'design:content:read design:content:write design:meta:read brandtemplate:meta:read brandtemplate:content:read folder:read'
const SETTINGS_KEY = 'canva_connect'

interface CanvaStore {
  refresh_token?: string
  access_token?: string
  access_expires_at?: number // epoch ms
}

async function readStore(): Promise<CanvaStore> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
    return (data?.value as CanvaStore) || {}
  } catch {
    return {}
  }
}

async function writeStore(patch: CanvaStore): Promise<void> {
  const cur = await readStore()
  await getSupabaseAdmin().from('site_settings').upsert({ key: SETTINGS_KEY, value: { ...cur, ...patch } }, { onConflict: 'key' })
}

function basicAuth(): string {
  const id = process.env.CANVA_CLIENT_ID?.trim() || ''
  const secret = process.env.CANVA_CLIENT_SECRET?.trim() || ''
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
}

/** Guarda os tokens vindos do fluxo OAuth (usado pelo callback). */
export async function saveCanvaTokens(t: { refresh_token?: string; access_token?: string; expires_in?: number }): Promise<void> {
  await writeStore({
    refresh_token: t.refresh_token,
    access_token: t.access_token,
    access_expires_at: t.expires_in ? Date.now() + (t.expires_in - 60) * 1000 : undefined,
  })
}

/** Troca code→tokens (authorization_code) — usado pelo callback OAuth. */
export async function exchangeCanvaCode(code: string, codeVerifier: string, redirectUri: string): Promise<any> {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: codeVerifier, redirect_uri: redirectUri })
  const r = await fetch(OAUTH_TOKEN, { method: 'POST', headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const j = await r.json()
  if (!r.ok) throw new Error(`Canva token ${r.status}: ${JSON.stringify(j).slice(0, 160)}`)
  return j
}

/** Devolve um access_token válido: estático (env), em cache, ou refrescado do refresh_token. */
export async function getAccessToken(): Promise<string | null> {
  const stat = process.env.CANVA_CONNECT_TOKEN?.trim()
  if (stat) return stat
  const store = await readStore()
  if (store.access_token && store.access_expires_at && store.access_expires_at > Date.now()) return store.access_token
  if (!store.refresh_token || !process.env.CANVA_CLIENT_ID) return null
  try {
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: store.refresh_token })
    const r = await fetch(OAUTH_TOKEN, { method: 'POST', headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    const j = await r.json()
    if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 160))
    await writeStore({
      access_token: j.access_token,
      refresh_token: j.refresh_token || store.refresh_token, // Canva roda o refresh_token
      access_expires_at: Date.now() + ((j.expires_in || 14400) - 60) * 1000,
    })
    return j.access_token
  } catch (e) {
    console.error('[canva-connect] refresh falhou:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Configurado se há template + uma via de token (estático ou client+refresh). */
export function canvaConfigured(): boolean {
  if (!process.env.CANVA_BRAND_TEMPLATE_ID?.trim()) return false
  return Boolean(process.env.CANVA_CONNECT_TOKEN?.trim() || process.env.CANVA_CLIENT_ID?.trim())
}

/**
 * O template a usar, por CONTA e por FORMATO.
 *
 * Havia um só (`CANVA_BRAND_TEMPLATE_ID`) e a função nem recebia a conta: saía o mesmo cartão
 * para a marca e para o pessoal. Mas são duas vozes diferentes — a @morethanmoney.pt fala como
 * empresa e a @ricardogarciapt fala na primeira pessoa — e um cartão com a assinatura errada é
 * pior do que um cartão feio.
 *
 * A configuração vive em `site_settings.canva_templates` para se mudar sem deploy: um template
 * novo no Canva é trabalho de dois minutos, e não deve exigir uma publicação do site.
 *
 *   { "morethanmoney.pt": { "post": "TAxxx" },
 *     "ricardogarciapt":  { "post": "TAyyy", "reel": "TAzzz" } }
 *
 * Sem entrada para a conta, cai no template geral do ambiente. Sem esse, devolve null e o
 * chamador faz o cartão dele — nunca se publica com o desenho da conta errada.
 */
export type FormatoCanva = 'post' | 'reel' | 'story'

export async function templatePara(conta: string, formato: FormatoCanva = 'post'): Promise<string | null> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
    const { data } = await getSupabaseAdmin()
      .from('site_settings')
      .select('value')
      .eq('key', 'canva_templates')
      .maybeSingle()
    const v = data?.value
    const m = ((typeof v === 'string' ? JSON.parse(v) : v) ?? {}) as Record<string, Record<string, string>>
    const daConta = m[conta] ?? {}
    // Um reel sem template próprio usa o de post da MESMA conta — a voz certa importa mais do
    // que o formato certo. O que nunca se faz é ir buscar o da outra conta.
    const id = daConta[formato] || daConta.post
    if (id) return id
  } catch {
    /* sem configuração, cai no ambiente */
  }
  return process.env.CANVA_BRAND_TEMPLATE_ID?.trim() || null
}

function fieldMap(): { hook: string; cta: string; proof: string } {
  try {
    const m = JSON.parse(process.env.CANVA_FIELDS || '{}')
    return { hook: m.hook || 'hook', cta: m.cta || 'cta', proof: m.proof || 'proof' }
  } catch {
    return { hook: 'hook', cta: 'cta', proof: 'proof' }
  }
}

async function api(path: string, token: string, init?: RequestInit): Promise<any> {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Canva ${r.status}: ${JSON.stringify(j).slice(0, 160)}`)
  return j
}

async function pollJob(getPath: string, token: string, tries = 8): Promise<any> {
  for (let i = 0; i < tries; i++) {
    const j = await api(getPath, token)
    const job = j.job || j
    if (job.status === 'success') return job
    if (job.status === 'failed') throw new Error(`job falhou: ${JSON.stringify(job.error || {}).slice(0, 120)}`)
    await new Promise((res) => setTimeout(res, 1500))
  }
  throw new Error('job não concluiu a tempo')
}

/** Autofila o template, exporta PNG e devolve o URL público (bucket). null em falha → fallback card. */
export async function canvaAutofillImage(
  hook: string,
  cta: string,
  facto?: string,
  /** A conta para quem é o cartão — decide o template, logo o desenho e a assinatura. */
  conta?: string,
  formato: FormatoCanva = 'post',
): Promise<string | null> {
  const token = await getAccessToken()
  if (!token) return null
  const templateId = await templatePara(conta ?? '', formato)
  if (!templateId) return null
  try {
    const f = fieldMap()
    const data: Record<string, unknown> = {
      [f.hook]: { type: 'text', text: hook },
      [f.cta]: { type: 'text', text: cta ? `Comenta «${cta}»` : '' },
      // A linha de prova vem VIVA de `factoDoDia()`. Era fixa — "675 trades · 63% win rate ·
      // +7.060€" — congelada em 30/06 e em euros, que não são comparáveis entre lotes. Sem
      // facto, fica vazia: melhor um cartão sem número do que um número velho.
      [f.proof]: { type: 'text', text: facto ?? '' },
    }
    const start = await api('/autofills', token, { method: 'POST', body: JSON.stringify({ brand_template_id: templateId, data }) })
    const done = await pollJob(`/autofills/${(start.job || start).id}`, token)
    const designId = done.result?.design?.id || done.design?.id
    if (!designId) return null
    const exp = await api('/exports', token, { method: 'POST', body: JSON.stringify({ design_id: designId, format: { type: 'png' } }) })
    const expDone = await pollJob(`/exports/${(exp.job || exp).id}`, token)
    const url: string | undefined = (expDone.urls || expDone.result?.urls || [])[0]
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return await uploadBufferToBucket(buf, 'image/png', 'canva')
  } catch (e) {
    console.error('[canva-connect] autofill falhou (fallback p/ card):', e instanceof Error ? e.message : e)
    return null
  }
}

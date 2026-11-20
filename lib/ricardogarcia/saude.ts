// App do Ricardo: movimento vindo de fora da app.
// Uma PWA não lê a Apple Saúde nem o Health Connect. Há três caminhos que funcionam sem app na loja:
//  1. iPhone: um Atalho (app Atalhos da Apple) lê os passos e os minutos de exercício da app Saúde
//     e envia-os para um link pessoal do membro (token só para isto, guardado como hash).
//  2. Strava (iPhone e Android): ligação OAuth; os minutos das actividades de hoje contam.
//     Precisa de STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET na Vercel (app criada em strava.com/settings/api).
//  3. A ponte nativa (docs/app-ricardo-saude.md), quando a app sair nas lojas.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { db, hoje } from '@/lib/ricardogarcia/app'
import { XP_DIA } from '@/lib/ricardogarcia/diario'

export const FONTES = ['apple', 'google', 'manual', 'atalho', 'strava'] as const
const hash = (t: string) => createHash('sha256').update(t).digest('hex')

/** Regista o movimento do dia (fica o maior valor de cada medida) e diz quanto XP dar (uma vez por dia). */
export async function registarMovimento(membroId: string, passos: number, minutos: number, fonte: string, dia = hoje()) {
  passos = Math.min(100_000, Math.max(0, Math.round(passos || 0)))
  minutos = Math.min(600, Math.max(0, Math.round(minutos || 0)))
  const { data: ja } = await db().from('rg_app_diarios').select('id, xp, dados').eq('membro_id', membroId).eq('dia', dia).eq('item', 'saude').maybeSingle()
  const antes: any = ja?.dados || {}
  // O registo à mão substitui; o que vem sincronizado nunca baixa o que já lá estava.
  const auto = fonte !== 'manual'
  const dados = { passos: auto ? Math.max(passos, antes.passos || 0) : passos, minutos: auto ? Math.max(minutos, antes.minutos || 0) : minutos, fonte, hora: new Date().toISOString() }
  const conta = dados.passos >= 5000 || dados.minutos >= 20
  const xp = conta && !(ja?.xp) ? XP_DIA.saude : 0
  if (ja) await db().from('rg_app_diarios').update({ dados, xp: (ja.xp || 0) + xp }).eq('id', ja.id)
  else await db().from('rg_app_diarios').insert({ membro_id: membroId, dia, item: 'saude', xp, dados })
  return { xp, dados }
}

export async function ligacoes(membroId: string) {
  const { data } = await db().from('rg_app_saude_ligacoes').select('fonte, ultimo_sync').eq('membro_id', membroId)
  const de = (f: string) => (data || []).find(l => l.fonte === f)
  return {
    strava: !!de('strava'), strava_sync: de('strava')?.ultimo_sync || null, strava_disponivel: !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET),
    atalho: !!de('atalho'), atalho_sync: de('atalho')?.ultimo_sync || null,
  }
}

// ── Atalho do iPhone ──────────────────────────────────────────────────────
/** Cria (ou troca) o token pessoal do Atalho. O link só se mostra uma vez; na base fica o hash. */
export async function novoTokenAtalho(membroId: string) {
  const token = randomBytes(24).toString('hex')
  await db().from('rg_app_saude_ligacoes').upsert({ membro_id: membroId, fonte: 'atalho', token: hash(token), ultimo_sync: null }, { onConflict: 'membro_id,fonte' })
  return token
}
export async function membroDoToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token || '')) return null
  const { data } = await db().from('rg_app_saude_ligacoes').select('membro_id').eq('fonte', 'atalho').eq('token', hash(token)).maybeSingle()
  return data?.membro_id || null
}
/** Os Atalhos mandam números em formatos variados («6 421», «6421,0», «6.421»). */
export function numero(v: unknown) {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/\s/g, '')
  if (!s) return 0
  const limpo = /^\d{1,3}([.,]\d{3})+$/.test(s) ? s.replace(/[.,]/g, '') : s.replace(',', '.')
  const n = parseFloat(limpo)
  return Number.isFinite(n) ? n : 0
}

// ── Strava ────────────────────────────────────────────────────────────────
const segredo = () => process.env.STRAVA_CLIENT_SECRET || ''
export function estadoStrava(membroId: string) {
  const t = Date.now().toString(36)
  return `${membroId}.${t}.${createHmac('sha256', segredo()).update(membroId + '.' + t).digest('hex').slice(0, 32)}`
}
export function membroDoEstado(estado: string) {
  const [id, t, sig] = String(estado || '').split('.')
  if (!id || !t || !sig || Date.now() - parseInt(t, 36) > 30 * 60_000) return null
  const ok = createHmac('sha256', segredo()).update(id + '.' + t).digest('hex').slice(0, 32)
  return ok.length === sig.length && timingSafeEqual(Buffer.from(ok), Buffer.from(sig)) ? id : null
}
export function urlAutorizarStrava(origem: string, membroId: string) {
  const q = new URLSearchParams({ client_id: process.env.STRAVA_CLIENT_ID || '', redirect_uri: `${origem}/api/ricardogarcia/app/saude/strava`, response_type: 'code', approval_prompt: 'auto', scope: 'activity:read', state: estadoStrava(membroId) })
  return 'https://www.strava.com/oauth/authorize?' + q
}
async function tokenStrava(corpo: Record<string, string>) {
  const r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: segredo(), ...corpo }), signal: AbortSignal.timeout(10_000) })
  return r.ok ? r.json() : null
}
export async function ligarStrava(membroId: string, code: string) {
  const j: any = await tokenStrava({ code, grant_type: 'authorization_code' })
  if (!j?.access_token) return false
  await db().from('rg_app_saude_ligacoes').upsert({ membro_id: membroId, fonte: 'strava', token: j.access_token, refresh: j.refresh_token, expira: new Date(j.expires_at * 1000).toISOString(), externo_id: String(j.athlete?.id || '') }, { onConflict: 'membro_id,fonte' })
  return true
}
/** Soma os minutos das actividades de hoje no Strava e regista-os. */
export async function sincronizarStrava(membroId: string) {
  const { data: l } = await db().from('rg_app_saude_ligacoes').select('*').eq('membro_id', membroId).eq('fonte', 'strava').maybeSingle()
  if (!l) return null
  let token = l.token
  if (!l.expira || Date.parse(l.expira) < Date.now() + 60_000) {
    const j: any = await tokenStrava({ refresh_token: l.refresh, grant_type: 'refresh_token' })
    if (!j?.access_token) return null
    token = j.access_token
    await db().from('rg_app_saude_ligacoes').update({ token, refresh: j.refresh_token, expira: new Date(j.expires_at * 1000).toISOString() }).eq('membro_id', membroId).eq('fonte', 'strava')
  }
  const inicio = Math.floor(Date.parse(hoje() + 'T00:00:00Z') / 1000)
  const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${inicio}&per_page=50`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
  if (!r.ok) return null
  const acts: any[] = await r.json()
  const minutos = Math.round(acts.reduce((s, a) => s + (a.moving_time || 0), 0) / 60)
  await db().from('rg_app_saude_ligacoes').update({ ultimo_sync: new Date().toISOString() }).eq('membro_id', membroId).eq('fonte', 'strava')
  return { ...(await registarMovimento(membroId, 0, minutos, 'strava')), actividades: acts.length }
}

/**
 * A LIGAÇÃO AO YOUTUBE — o refresh token vive no cofre, não só na Vercel.
 *
 * O YOUTUBE_REFRESH_TOKEN da Vercel morreu a 24/11/2026 (invalid_grant) e só se trocava a mexer no
 * painel da Vercel e a fazer redeploy. Agora há um botão: /api/admin/youtube/ligar manda o admin ao
 * Google, o regresso (o mesmo endereço já registado para a agenda, com state «youtube:…») guarda o
 * refresh token em `integracoes_privadas.youtube` (RLS sem políticas: só o servidor lê). Quem pede um
 * token lê primeiro o cofre e só depois a variável de ambiente.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { clienteId, clienteSegredo, enderecoDeRetorno } from '@/lib/agenda/google'

const CHAVE = 'youtube'
const AMBITOS = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
].join(' ')

export const ESTADO_PREFIXO = 'youtube'

const cid = () => (process.env.YOUTUBE_CLIENT_ID || '').trim() || clienteId()
const segredo = () => (process.env.YOUTUBE_CLIENT_SECRET || '').trim() || clienteSegredo()

export function consentimentoYoutube(estado: string): string {
  const p = new URLSearchParams({
    client_id: cid(),
    redirect_uri: enderecoDeRetorno(),
    response_type: 'code',
    scope: AMBITOS,
    access_type: 'offline',
    prompt: 'consent',
    state: `${ESTADO_PREFIXO}:${estado}`,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

async function trocar(corpo: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid(), client_secret: segredo(), ...corpo }).toString(),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new Error(`Google recusou (${r.status}): ${String(j.error ?? '')} ${String(j.error_description ?? '')}`.trim())
  return j
}

/** Regresso do consentimento: código → refresh token no cofre. Devolve o nome do canal, se der. */
export async function guardarLigacaoYoutube(codigo: string): Promise<{ canal: string | null }> {
  const j = await trocar({ code: codigo, grant_type: 'authorization_code', redirect_uri: enderecoDeRetorno() })
  const refresh = String(j.refresh_token ?? '')
  if (!refresh) throw new Error('O Google não devolveu refresh_token. Revoga o acesso em myaccount.google.com/permissions e liga outra vez.')
  let canal: string | null = null
  try {
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${String(j.access_token)}` } })
    if (r.ok) canal = ((await r.json()) as { items?: { snippet?: { title?: string } }[] }).items?.[0]?.snippet?.title ?? null
  } catch { /* o nome do canal é conforto */ }
  const { error } = await getSupabaseAdmin().from('integracoes_privadas').upsert(
    { chave: CHAVE, valor: { refresh_token: refresh, canal, ligado_em: new Date().toISOString() }, atualizado_em: new Date().toISOString() },
    { onConflict: 'chave' },
  )
  if (error) throw new Error(`não gravou no cofre: ${error.message}`)
  return { canal }
}

/** O refresh token em vigor: o do cofre (ligado pelo botão) e, na falta dele, o da Vercel. */
export async function refreshTokenYoutube(): Promise<string> {
  try {
    const { data } = await getSupabaseAdmin().from('integracoes_privadas').select('valor').eq('chave', CHAVE).maybeSingle()
    const t = String((data?.valor as { refresh_token?: string } | null)?.refresh_token ?? '').trim()
    if (t) return t
  } catch { /* cai para a variável de ambiente */ }
  return (process.env.YOUTUBE_REFRESH_TOKEN || '').trim()
}

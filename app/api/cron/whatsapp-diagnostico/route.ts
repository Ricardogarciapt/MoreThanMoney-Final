import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { TEMPLATES_MTM } from '@/lib/whatsapp/templates-mtm'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * DIAGNÓSTICO DO WHATSAPP CLOUD API — o estado real, perguntado à Meta a partir da Vercel.
 *
 * Porquê aqui: o token de sistema só vive nas variáveis da Vercel e não deve sair de lá. Esta rota
 * pergunta à Meta o estado do token, do número, da WABA, das apps subscritas e dos templates, e
 * devolve SÓ estados (nunca o token). Grava o resultado em `site_settings.whatsapp_diagnostico`.
 *
 * Acesso: `Authorization: Bearer CRON_SECRET` ou `?chave=` igual a `site_settings.whatsapp_diag_chave`
 * (chave aleatória que só o service role lê).
 *
 * Acções opcionais (todas reversíveis, nenhuma envia mensagens a pessoas):
 *   ?acao=subscrever → POST /{waba}/subscribed_apps (liga o webhook da app à WABA)
 *   ?acao=templates  → submete à Meta, para aprovação, os templates de `TEMPLATES_MTM` que faltem
 */
const GRAPH = 'https://graph.facebook.com/v21.0'
const WABA_PADRAO = '1090379237043440'

async function autorizado(req: NextRequest): Promise<boolean> {
  const segredo = process.env.CRON_SECRET
  if (segredo && req.headers.get('authorization') === `Bearer ${segredo}`) return true
  const chave = req.nextUrl.searchParams.get('chave') ?? ''
  if (chave.length < 24) return false
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'whatsapp_diag_chave').maybeSingle()
  const guardada = (data?.value as { chave?: string } | null)?.chave
  return !!guardada && guardada === chave
}

async function g(caminho: string, token: string, init?: RequestInit): Promise<{ ok: boolean; status: number; corpo: any }> {
  try {
    const r = await fetch(`${GRAPH}/${caminho}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    })
    const corpo = await r.json().catch(() => ({}))
    return { ok: r.ok, status: r.status, corpo }
  } catch (e) {
    return { ok: false, status: 0, corpo: { erro: String(e) } }
  }
}

/** Erros da Meta sem nada sensível: só código, tipo e mensagem. */
function limpo(r: { ok: boolean; status: number; corpo: any }) {
  if (r.ok) return r.corpo
  const e = r.corpo?.error ?? r.corpo
  return { erro: true, status: r.status, code: e?.code, subcode: e?.error_subcode, type: e?.type, message: e?.message }
}

export async function GET(req: NextRequest) {
  if (!(await autorizado(req))) return NextResponse.json({ ok: false, erro: 'nao_autorizado' }, { status: 401 })

  const token = (process.env.WHATSAPP_TOKEN ?? '').trim()
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim()
  const waba = (process.env.WHATSAPP_WABA_ID ?? '').trim() || WABA_PADRAO
  const acao = req.nextUrl.searchParams.get('acao')

  const env = {
    WHATSAPP_TOKEN: token ? 'definido' : 'EM FALTA',
    WHATSAPP_PHONE_NUMBER_ID: phoneId || 'EM FALTA',
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN ? 'definido' : 'EM FALTA',
    WHATSAPP_WABA_ID: process.env.WHATSAPP_WABA_ID ? 'definido' : `por omissão ${WABA_PADRAO}`,
    WHATSAPP_RELAY_URL: process.env.WHATSAPP_RELAY_URL ? 'definido' : 'não',
  }
  if (!token) return NextResponse.json({ ok: false, env })

  const out: Record<string, unknown> = { quando: new Date().toISOString(), env }

  const dbg = await g(`debug_token?input_token=${encodeURIComponent(token)}`, token)
  const d = dbg.corpo?.data
  out.token = dbg.ok && d
    ? {
        valido: d.is_valid,
        tipo: d.type,
        app_id: d.app_id,
        app: d.application,
        expira: d.expires_at === 0 ? 'nunca' : d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
        scopes: d.scopes,
        wabas_com_acesso: (d.granular_scopes ?? []).find((s: any) => s.scope === 'whatsapp_business_messaging')?.target_ids ?? null,
      }
    : limpo(dbg)

  if (phoneId) {
    out.numero = limpo(
      await g(
        `${phoneId}?fields=display_phone_number,verified_name,name_status,new_name_status,code_verification_status,quality_rating,platform_type,throughput,messaging_limit_tier,account_mode,status,is_official_business_account,last_onboarded_time`,
        token,
      ),
    )
  }
  out.waba = limpo(
    await g(
      `${waba}?fields=name,account_review_status,business_verification_status,currency,timezone_id,message_template_namespace,primary_funding_id,owner_business_info,ownership_type,health_status`,
      token,
    ),
  )
  // 23/11: chamadas de voz (WhatsApp Business Calling). Diz se o número tem chamadas ligadas.
  out.chamadas = limpo(await g(`${phoneId}/settings`, token))
  out.numeros_da_waba = limpo(await g(`${waba}/phone_numbers?fields=id,display_phone_number,verified_name,status,quality_rating,code_verification_status,platform_type`, token))

  if (acao === 'subscrever') {
    out.subscrever = limpo(await g(`${waba}/subscribed_apps`, token, { method: 'POST' }))
  }
  out.apps_subscritas = limpo(await g(`${waba}/subscribed_apps`, token))

  const tpl = await g(`${waba}/message_templates?fields=name,status,language,category,rejected_reason,quality_score&limit=100`, token)
  const existentes: Array<{ name: string; language: string; status: string }> = tpl.ok ? tpl.corpo?.data ?? [] : []

  if (acao === 'templates' && tpl.ok) {
    const submetidos: Record<string, unknown> = {}
    for (const t of TEMPLATES_MTM) {
      if (existentes.some((e) => e.name === t.name && e.language === t.language)) {
        submetidos[t.name] = 'já existe'
        continue
      }
      submetidos[t.name] = limpo(await g(`${waba}/message_templates`, token, { method: 'POST', body: JSON.stringify(t) }))
    }
    out.templates_submetidos = submetidos
    const de_novo = await g(`${waba}/message_templates?fields=name,status,language,category,rejected_reason,quality_score&limit=100`, token)
    out.templates = limpo(de_novo)
  } else {
    out.templates = limpo(tpl)
  }

  // App (modo de desenvolvimento vs. live) — pode falhar com token de sistema; nesse caso fica o erro.
  const appId = (out.token as any)?.app_id
  if (appId) out.app = limpo(await g(`${appId}?fields=name,link,category`, token))

  await getSupabaseAdmin()
    .from('site_settings')
    .upsert(
      { key: 'whatsapp_diagnostico', value: out, description: 'Estado do WhatsApp Cloud API perguntado à Meta (sem token)', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

  return NextResponse.json({ ok: true, ...out })
}

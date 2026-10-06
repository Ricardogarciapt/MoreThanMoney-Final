import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { IG_ACCOUNTS, tokenForAccount } from '@/lib/instagram/publish'
import { AG } from '@/lib/agentes/codigos'
import {
  assinaturaMetaValida,
  eventosLeadgen,
  pedidoDoLeadMeta,
  type CaixaDoFormulario,
  type LeadMeta,
} from '@/lib/pedido-contacto'
import { registarPedidoDeContacto } from '@/lib/pedido-contacto-registo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Webhook do Meta Lead Ads (campo `leadgen` do objecto `page`) → a mesma lista do «Quero que me
 * liguem». Ver docs/meta-lead-ads.md para o formulário instantâneo e a subscrição.
 *
 * GET  → verificação (hub.challenge), com o mesmo verify token dos webhooks do Instagram.
 * POST → assinatura X-Hub-Signature-256 verificada com o segredo da app (o mesmo guardado no
 *        /admin/social → Ligações). Assinatura inválida ou segredo em falta → 401, nada lido.
 *        Depois: lead pela Graph API com o token de Página → consentimento por caixa marcada →
 *        tarefa de contacto imediato para o setter.
 */

const GRAPH = 'https://graph.facebook.com/v21.0'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const verify =
    process.env.META_LEADGEN_VERIFY_TOKEN?.trim() || process.env.IG_WEBHOOK_VERIFY_TOKEN?.trim() || 'mtm-ig-webhook-2026'
  if (mode === 'subscribe' && token === verify) return new NextResponse(challenge ?? '', { status: 200 })
  return NextResponse.json({ error: 'verify failed' }, { status: 403 })
}

async function segredoDaApp(): Promise<string | null> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'instagram_app_secret').maybeSingle()
    const v = data?.value as string | { segredo?: string } | null
    const s = typeof v === 'string' ? v : v?.segredo
    if (s && s.trim()) return s.trim()
  } catch {
    /* cai para o ambiente */
  }
  return process.env.META_APP_SECRET?.trim() || process.env.INSTAGRAM_APP_SECRET?.trim() || null
}

/** Tokens de Página candidatos, por ordem. O primeiro que a Graph API aceitar ganha. */
async function tokensDePagina(): Promise<string[]> {
  const out: string[] = []
  const add = (t?: string | null) => {
    const v = (t ?? '').trim()
    if (v && !out.includes(v)) out.push(v)
  }
  add(process.env.META_LEADS_PAGE_TOKEN)
  for (const acc of IG_ACCOUNTS) add(await tokenForAccount(acc.id))
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'instagram_tokens').maybeSingle()
    const v = data?.value
    const obj = (typeof v === 'string' ? JSON.parse(v) : v) as Record<string, string> | null
    for (const t of Object.values(obj ?? {})) add(t)
  } catch {
    /* sem mais candidatos */
  }
  return out
}

async function graph<T>(caminho: string, tokens: string[]): Promise<T | null> {
  for (const t of tokens) {
    try {
      const sep = caminho.includes('?') ? '&' : '?'
      const r = await fetch(`${GRAPH}/${caminho}${sep}access_token=${encodeURIComponent(t)}`, { cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (r.ok && j && !j.error) return j as T
    } catch {
      /* próximo token */
    }
  }
  return null
}

interface FormMeta {
  name?: string
  legal_content?: {
    custom_disclaimer?: {
      title?: string
      body?: { text?: string }
      checkboxes?: { data?: Array<{ key?: string; text?: string; is_checked_by_default?: boolean }> } | Array<{ key?: string; text?: string; is_checked_by_default?: boolean }>
    }
  }
}

export async function POST(req: NextRequest) {
  const cru = await req.text()
  const segredo = await segredoDaApp()
  if (!assinaturaMetaValida(cru, req.headers.get('x-hub-signature-256'), segredo)) {
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 })
  }

  let corpo: unknown = null
  try {
    corpo = JSON.parse(cru)
  } catch {
    return NextResponse.json({ ok: true, ignorado: 'json' })
  }
  const eventos = eventosLeadgen(corpo)
  if (!eventos.length) return NextResponse.json({ ok: true, ignorado: 'sem leadgen' })

  const tokens = await tokensDePagina()
  const resultados: Array<{ leadgen: string; estado: string }> = []
  for (const ev of eventos) {
    const lead = await graph<LeadMeta & { form_id?: string; ad_id?: string }>(
      `${ev.leadgenId}?fields=field_data,custom_disclaimer_responses,form_id,ad_id,created_time`,
      tokens,
    )
    if (!lead) {
      resultados.push({ leadgen: ev.leadgenId, estado: 'sem acesso ao lead (token de Página / leads_retrieval)' })
      continue
    }
    const formId = ev.formId || lead.form_id || null
    const form = formId
      ? await graph<FormMeta>(
          `${formId}?fields=name,legal_content{custom_disclaimer{title,body,checkboxes{key,text,is_checked_by_default}}}`,
          tokens,
        )
      : null
    const cd = form?.legal_content?.custom_disclaimer
    const lista = Array.isArray(cd?.checkboxes) ? cd?.checkboxes : cd?.checkboxes?.data ?? []
    const caixas: CaixaDoFormulario[] = (lista ?? []).map((c) => ({
      key: String(c.key ?? ''),
      text: String(c.text ?? ''),
      preMarcada: c.is_checked_by_default === true,
    }))

    const { pedido, linhas, motivo } = pedidoDoLeadMeta(lead, caixas, {
      origem: `meta_lead_ads:${formId ?? 'form'}`,
      ag: AG.SOCIAL,
      avisoLegal: cd?.body?.text ?? null,
    })
    if (!pedido) {
      resultados.push({ leadgen: ev.leadgenId, estado: motivo ?? 'inválido' })
      continue
    }
    const r = await registarPedidoDeContacto({
      pedido,
      linhas,
      fonte: 'meta_lead_ads',
      meta: { leadgenId: ev.leadgenId, formId, pageId: ev.pageId, adId: ev.adId || lead.ad_id || null },
    })
    resultados.push({ leadgen: ev.leadgenId, estado: r.duplicado ? 'duplicado' : r.ok ? `ok (${r.consentimentos ?? 0} canais)` : r.erro ?? 'erro' })
  }
  // 200 sempre que a assinatura é válida: um 5xx faz a Meta reentregar, e o id único trava o duplicado.
  return NextResponse.json({ ok: true, resultados })
}

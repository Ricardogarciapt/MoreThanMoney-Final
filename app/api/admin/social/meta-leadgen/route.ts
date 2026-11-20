import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirDonoSocial } from '@/lib/social-acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O webhook de leads da Meta, visto e afinado do Centro Social → Ligações. Só o dono.
 *
 * GET  → estado: URL de callback, verify token (de onde vem), segredo da app, Páginas e se cada uma
 *        tem o campo `leadgen` subscrito, e os últimos leads que entraram.
 * POST → { acao: 'guardar_token', token } · { acao: 'gerar_token' } · { acao: 'testar' }
 *        · { acao: 'ligar_paginas' } (junta `leadgen` aos campos já subscritos — nunca tira `messages`).
 *
 * O verify token não é um segredo forte (só prova à Meta que o callback é nosso), mas vive em
 * `site_settings`, nunca no código. O segredo da app e os tokens de Página nunca saem daqui.
 */

const GRAPH = 'https://graph.facebook.com/v21.0'
const CHAVE_TOKEN = 'meta_leadgen_verify_token'
const CALLBACK = 'https://www.morethanmoney.pt/api/webhooks/meta-leadgen'

type Pagina = { id: string; nome: string; leadgen: boolean; campos: string[]; erro?: string }

async function lerSetting(chave: string): Promise<unknown> {
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', chave).maybeSingle()
  return data?.value ?? null
}

function texto(v: unknown, campo?: string): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (v && typeof v === 'object' && campo) {
    const x = (v as Record<string, unknown>)[campo]
    return typeof x === 'string' && x.trim() ? x.trim() : null
  }
  return null
}

async function verifyToken(): Promise<{ valor: string; origem: 'painel' | 'ambiente' | 'omissao' }> {
  const doPainel = texto(await lerSetting(CHAVE_TOKEN), 'token')
  if (doPainel) return { valor: doPainel, origem: 'painel' }
  const env = process.env.META_LEADGEN_VERIFY_TOKEN?.trim() || process.env.IG_WEBHOOK_VERIFY_TOKEN?.trim()
  if (env) return { valor: env, origem: 'ambiente' }
  return { valor: 'mtm-ig-webhook-2026', origem: 'omissao' }
}

async function temSegredo(): Promise<boolean> {
  const v = await lerSetting('instagram_app_secret')
  return Boolean(texto(v, 'segredo') || process.env.META_APP_SECRET?.trim() || process.env.INSTAGRAM_APP_SECRET?.trim())
}

async function tokensDePagina(): Promise<string[]> {
  const out: string[] = []
  const add = (t?: unknown) => {
    const v = typeof t === 'string' ? t.trim() : ''
    if (v && !out.includes(v)) out.push(v)
  }
  add(process.env.META_LEADS_PAGE_TOKEN)
  try {
    const v = await lerSetting('instagram_tokens')
    const obj = (typeof v === 'string' ? JSON.parse(v) : v) as Record<string, unknown> | null
    for (const t of Object.values(obj ?? {})) add(t)
  } catch {
    /* sem tokens */
  }
  return out
}

async function g<T>(caminho: string, token: string, init?: RequestInit): Promise<T & { error?: { message?: string } }> {
  const sep = caminho.includes('?') ? '&' : '?'
  const r = await fetch(`${GRAPH}/${caminho}${sep}access_token=${encodeURIComponent(token)}`, { cache: 'no-store', ...init })
  return (await r.json().catch(() => ({ error: { message: `HTTP ${r.status}` } }))) as T & { error?: { message?: string } }
}

/** Uma linha por Página distinta que os tokens guardados alcançam. */
async function paginas(ligar = false): Promise<Pagina[]> {
  const vistas = new Map<string, Pagina>()
  for (const t of await tokensDePagina()) {
    try {
      const eu = await g<{ id?: string; name?: string }>('me?fields=id,name', t)
      if (!eu.id || vistas.has(eu.id)) continue
      // Só tokens de PÁGINA têm subscribed_apps; um token de utilizador falha aqui e é ignorado.
      const subs = await g<{ data?: Array<{ subscribed_fields?: string[] }> }>(`${eu.id}/subscribed_apps`, t)
      if (subs.error) continue
      let campos = [...new Set((subs.data ?? []).flatMap((a) => a.subscribed_fields ?? []))]
      let erro: string | undefined
      if (ligar && !campos.includes('leadgen')) {
        const novos = [...new Set([...campos, 'leadgen'])]
        const r = await g<{ success?: boolean }>(`${eu.id}/subscribed_apps?subscribed_fields=${novos.join(',')}`, t, { method: 'POST' })
        if (r.success) campos = novos
        else erro = r.error?.message ?? 'a Meta recusou'
      }
      vistas.set(eu.id, { id: eu.id, nome: eu.name ?? eu.id, leadgen: campos.includes('leadgen'), campos, erro })
    } catch {
      /* próximo token */
    }
  }
  return [...vistas.values()]
}

async function estado() {
  const db = getSupabaseAdmin()
  const tk = await verifyToken()
  const [segredo, lista, ultimos, total] = await Promise.all([
    temSegredo(),
    paginas(false),
    db
      .from('pedidos_contacto')
      .select('id, nome, origem, criado_em, tarefa_estado')
      .eq('fonte', 'meta_lead_ads')
      .order('criado_em', { ascending: false })
      .limit(6),
    db.from('pedidos_contacto').select('id', { count: 'exact', head: true }).eq('fonte', 'meta_lead_ads'),
  ])
  return {
    callback: CALLBACK,
    campo: 'leadgen',
    objeto: 'page',
    verifyToken: tk.valor,
    verifyTokenOrigem: tk.origem,
    segredoDaApp: segredo,
    paginas: lista,
    leads: {
      total: total.count ?? 0,
      ultimos: (ultimos.data ?? []).map((l) => ({
        id: l.id,
        nome: l.nome,
        marca: String(l.origem ?? '').includes(':rg:') ? 'Ricardo Garcia' : 'MoreThanMoney',
        quando: l.criado_em,
        tarefa: l.tarefa_estado,
      })),
    },
  }
}

export async function GET(req: NextRequest) {
  const negado = await exigirDonoSocial(req)
  if (negado) return negado
  try {
    return NextResponse.json(await estado())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const negado = await exigirDonoSocial(req)
  if (negado) return negado
  const corpo = (await req.json().catch(() => ({}))) as { acao?: string; token?: string }
  const db = getSupabaseAdmin()

  if (corpo.acao === 'guardar_token' || corpo.acao === 'gerar_token') {
    const token = corpo.acao === 'gerar_token' ? `mtm-${randomBytes(12).toString('hex')}` : String(corpo.token ?? '').trim()
    if (!/^[\w.\-:]{8,120}$/.test(token)) {
      return NextResponse.json({ error: 'O verify token precisa de 8 a 120 caracteres (letras, números, - _ . :).' }, { status: 400 })
    }
    const { error } = await db.from('site_settings').upsert({ key: CHAVE_TOKEN, value: { token } }, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...(await estado()) })
  }

  if (corpo.acao === 'testar') {
    // O mesmo pedido que a Meta faz ao carregar em «Verificar e guardar».
    const tk = await verifyToken()
    const desafio = randomBytes(6).toString('hex')
    const base = new URL(req.url).origin
    const r = await fetch(
      `${base}/api/webhooks/meta-leadgen?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(tk.valor)}&hub.challenge=${desafio}`,
      { cache: 'no-store' },
    ).catch(() => null)
    const devolveu = r ? await r.text().catch(() => '') : ''
    const ok = Boolean(r?.ok && devolveu === desafio)
    return NextResponse.json({ ok, estado: r?.status ?? 0, mensagem: ok ? 'O callback responde à verificação da Meta.' : 'O callback não devolveu o desafio — confirma o token.' })
  }

  if (corpo.acao === 'ligar_paginas') {
    const lista = await paginas(true)
    if (!lista.length) {
      return NextResponse.json({ error: 'Nenhum token de Página guardado alcança uma Página. Cola o token em Ligações → Instagram.' }, { status: 400 })
    }
    return NextResponse.json({ ok: lista.every((p) => p.leadgen), paginas: lista })
  }

  return NextResponse.json({ error: 'acção desconhecida' }, { status: 400 })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { callbackDe, credenciais, urlDeLigacao, variaveisEmFalta } from '@/lib/redes/oauth'
import { enfileirar, lerEspelho, publicarFila } from '@/lib/redes/espelho'
import { MARCAS, REDES, assinarState, type Marca, type Rede } from '@/lib/redes/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * /admin/redes — ligar TikTok, YouTube e LinkedIn por marca, ver a fila do espelho e o que falta.
 * Os tokens NUNCA saem daqui: o GET devolve só nome, validade e estado.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard
  const db = getSupabaseAdmin()
  const [{ data: contas }, { data: fila }, espelho] = await Promise.all([
    db.from('redes_contas').select('id, rede, marca, nome, conta_externa_id, expira_em, refresh_expira_em, refresh_token, ativa, nota, atualizado_em'),
    db.from('redes_publicacoes').select('id, conta_id, estado, url, nota, erro, tentativas, criado_em, publicado_em').order('criado_em', { ascending: false }).limit(40),
    lerEspelho(),
  ])
  return NextResponse.json({
    ok: true,
    espelho,
    apps: Object.fromEntries(REDES.map((r) => [r, { pronta: Boolean(credenciais(r)), falta: variaveisEmFalta(r), callback: callbackDe(r) }])),
    contas: (contas ?? []).map(({ refresh_token, ...c }) => ({ ...c, renova: Boolean(refresh_token) })),
    fila: fila ?? [],
  })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard
  const b = await req.json().catch(() => ({}))
  const db = getSupabaseAdmin()
  const rede = String(b.rede) as Rede
  const marca = String(b.marca) as Marca
  const valido = (REDES as readonly string[]).includes(rede) && (MARCAS as readonly string[]).includes(marca)

  if (b.accao === 'ligar') {
    if (!valido) return NextResponse.json({ erro: 'rede ou marca inválida' }, { status: 400 })
    const segredo = process.env.CRON_SECRET?.trim()
    if (!segredo) return NextResponse.json({ erro: 'CRON_SECRET em falta' }, { status: 500 })
    try {
      return NextResponse.json({ ok: true, url: urlDeLigacao(rede, marca, assinarState(rede, marca, segredo)) })
    } catch (e) {
      return NextResponse.json({ erro: e instanceof Error ? e.message : 'não deu' }, { status: 400 })
    }
  }
  if (b.accao === 'desligar') {
    if (!valido) return NextResponse.json({ erro: 'rede ou marca inválida' }, { status: 400 })
    await db.from('redes_contas').update({ ativa: false, access_token: null, refresh_token: null, atualizado_em: new Date().toISOString() }).eq('rede', rede).eq('marca', marca)
    return NextResponse.json({ ok: true })
  }
  if (b.accao === 'espelho') {
    if (!(MARCAS as readonly string[]).includes(marca)) return NextResponse.json({ erro: 'marca inválida' }, { status: 400 })
    const atual = await lerEspelho()
    const novo = { ...atual, [marca]: Boolean(b.ligado) }
    const { data } = await db.from('site_settings').select('id').eq('key', 'redes_espelho').maybeSingle()
    if (data) await db.from('site_settings').update({ value: novo, updated_at: new Date().toISOString() }).eq('key', 'redes_espelho')
    else await db.from('site_settings').insert({ key: 'redes_espelho', value: novo })
    return NextResponse.json({ ok: true, espelho: novo })
  }
  if (b.accao === 'correr') {
    const novas = await enfileirar()
    const feitas = await publicarFila(3)
    return NextResponse.json({ ok: true, novas, feitas })
  }
  return NextResponse.json({ erro: 'acção desconhecida' }, { status: 400 })
}

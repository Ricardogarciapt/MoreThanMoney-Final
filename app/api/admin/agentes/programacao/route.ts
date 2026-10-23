import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CAMPOS_GLOBAIS, QUOTA_MAX, aplicarAgente, aplicarGlobais, programacaoDoAgente } from '@/lib/agentes/programacao'
import { RITMO_MIN } from '@/lib/agentes/os/ciclo-vida'
import { lerObjectivos } from '@/lib/agentes/os/objectivos'
import { diaLisboa } from '@/lib/agentes/orcamento-agente'

/**
 * AS PROGRAMAÇÕES DO MOTOR — horas, ritmos, tetos de ciclos, a quota do OS v2 e o ritmo/horas
 * próprios de cada agente. Escreve em `site_settings` (agentes_motor, os_objectivos), que o motor
 * do AIOS lê a cada tique: vale no minuto seguinte.
 */
export const dynamic = 'force-dynamic'

const obj = (v: unknown): Record<string, unknown> => {
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return {} } }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

async function lerSettings(db: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await db.from('site_settings').select('key, value').in('key', ['agentes_motor', 'agentes_os_v2', 'os_objectivos'])
  const m = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]))
  return { error, motor: obj(m.get('agentes_motor')), osV2: obj(m.get('agentes_os_v2')), objectivos: obj(m.get('os_objectivos')) }
}

export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()

  const [s, ags, ciclos] = await Promise.all([
    lerSettings(db),
    db.from('agentes_equipa').select('id, nome, pilar, pai_id, estado, pausado, ciclo, recursos_mult').order('pilar').order('criado_em'),
    db.from('agentes_eventos').select('agente_id, criado_em').eq('tipo', 'ciclo')
      .gte('criado_em', new Date(Date.now() - 7 * 86_400_000).toISOString()).order('criado_em', { ascending: false }).limit(3000),
  ])
  if (s.error) return NextResponse.json({ ok: false, error: s.error.message }, { status: 500 })
  if (ags.error) return NextResponse.json({ ok: false, error: ags.error.message }, { status: 500 })

  const ultimo = new Map<string, string>()
  const hoje = new Map<string, number>()
  const diaDeHoje = diaLisboa(new Date())
  for (const e of (ciclos.data ?? []) as Array<{ agente_id: string; criado_em: string }>) {
    if (!ultimo.has(e.agente_id)) ultimo.set(e.agente_id, e.criado_em)
    if (diaLisboa(new Date(e.criado_em)) === diaDeHoje) hoje.set(e.agente_id, (hoje.get(e.agente_id) ?? 0) + 1)
  }

  return NextResponse.json({
    ok: true,
    osV2Ligado: s.osV2.ligado === true,
    campos: CAMPOS_GLOBAIS,
    globais: Object.fromEntries(CAMPOS_GLOBAIS.map((c) => [c.chave, s.motor[c.chave] ?? null])),
    quota: { valor: lerObjectivos(s.objectivos).recursos.claudeCiclosDiaMax, max: QUOTA_MAX },
    ritmosPorCiclo: RITMO_MIN,
    agentes: (ags.data ?? []).map((a) => ({
      id: String(a.id),
      nome: String(a.nome ?? ''),
      pilar: String(a.pilar ?? ''),
      ceo: a.pilar === 'ceo' && !a.pai_id,
      estado: String(a.estado ?? ''),
      pausado: a.pausado === true,
      ciclo: a.ciclo ?? null,
      recursos_mult: Number(a.recursos_mult ?? 1),
      proprio: programacaoDoAgente(s.motor, String(a.id)),
      ultimo_ciclo: ultimo.get(String(a.id)) ?? null,
      ciclos_hoje: hoje.get(String(a.id)) ?? 0,
    })),
  })
}

export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const acao = String(body.acao ?? '')
  const s = await lerSettings(db)
  if (s.error) return NextResponse.json({ ok: false, error: s.error.message }, { status: 500 })

  const gravar = async (key: string, value: Record<string, unknown>) =>
    db.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (acao === 'globais') {
    const r = aplicarGlobais(s.motor, obj(body.mudancas))
    if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 })
    const { error } = await gravar('agentes_motor', r.valor)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, porque: 'Programação da equipa gravada. O motor usa-a no próximo minuto.' })
  }

  if (acao === 'agente') {
    const id = String(body.id ?? '')
    const { data: ag } = await db.from('agentes_equipa').select('id, nome').eq('id', id).maybeSingle()
    if (!ag) return NextResponse.json({ ok: false, error: 'Agente não existe.' }, { status: 404 })
    const m: { ritmo_min?: unknown; horas_trabalho?: unknown } = {}
    if ('ritmo_min' in body) m.ritmo_min = body.ritmo_min
    if ('horas_trabalho' in body) m.horas_trabalho = body.horas_trabalho
    const r = aplicarAgente(s.motor, id, m)
    if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 })
    const { error } = await gravar('agentes_motor', r.valor)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const p = programacaoDoAgente(r.valor, id)
    const txt = `ritmo ${p.ritmo_min ? `${p.ritmo_min} min` : 'da equipa'} · horas ${p.horas_trabalho ? p.horas_trabalho.join('–') : 'da equipa'}`
    await db.from('agentes_eventos').insert({ agente_id: id, tipo: 'motor', detalhe: `programação mudada pelo dono: ${txt}` })
    return NextResponse.json({ ok: true, porque: `«${ag.nome}»: ${txt}.` })
  }

  if (acao === 'quota') {
    const n = Number(body.valor)
    if (!Number.isInteger(n) || n < 1 || n > QUOTA_MAX) return NextResponse.json({ ok: false, error: `A quota é um inteiro entre 1 e ${QUOTA_MAX}.` }, { status: 400 })
    const novo = { ...s.objectivos, recursos: { ...obj(s.objectivos.recursos), claude_ciclos_dia_max: n } }
    const { error } = await gravar('os_objectivos', novo)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, porque: `Teto da quota diária: ${n} ciclos.` })
  }

  return NextResponse.json({ ok: false, error: 'Acção desconhecida.' }, { status: 400 })
}

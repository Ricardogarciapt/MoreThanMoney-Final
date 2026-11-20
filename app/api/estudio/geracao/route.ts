import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirEstudio } from '@/lib/estudio/acesso'
import { ehMotor } from '@/lib/conteudo-magnetico/acesso'
import { enviarHeygen, heygenConfig, sincronizarHeygen } from '@/lib/estudio/heygen'
import { CLIPE_ENSAIO, DESCRICAO_TIPOS, motorOnline, validarPedido } from '@/lib/estudio/geracao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * MOTOR DE ATIVOS — pedidos de geração (o nosso Higgsfield). Contrato em services/motor-ativos/README.md.
 *
 * POST   { tipo, ativo_id?|imagem_url?, prompt?, texto?, audio_ativo_id?, aspecto?, duracao_s?,
 *          movimento?, azimute?, elevacao?, distancia?, seed?, marca?, origem?, ensaio? }
 *        → { ok, id, estado, motor_online }   (ensaio: estado 'pronto' na hora, com url de teste)
 * GET    ?id=…  → { id, tipo, estado, url?, ativo_id?, erro?, motor_online }
 * GET          → { motor_online, motores, tipos, recentes[30] }
 * DELETE ?id=… → cancela um pedido ainda na fila.
 *
 * Entram: a equipa do estúdio com a área «ativos», ou servidores com Bearer CRON_SECRET (reels diários).
 */
async function quem(request: NextRequest): Promise<{ userId: string | null } | { erro: NextResponse }> {
  if (ehMotor(request)) return { userId: null }
  const r = await exigirEstudio(request, 'ativos', 'editor')
  return 'erro' in r && r.erro ? { erro: r.erro } : { userId: r.quem!.userId }
}

/** `online` só conta motores ligados que sabem fazer o tipo pedido (o Mac à noite só faz voz/imagem). */
async function estadoMotores(db: ReturnType<typeof getSupabaseAdmin>, tipo?: string) {
  const { data } = await db.from('estudio_motores').select('nome, visto_em, gpu, capacidades').order('visto_em', { ascending: false }).limit(5)
  const motores = (data ?? []).map((m) => ({ ...m, online: motorOnline(m.visto_em) }))
  const servem = motores.filter((m) => m.online && (!tipo || (m.capacidades ?? []).includes(tipo)))
  return { motores, online: servem.length > 0 }
}

/**
 * Acorda a máquina GPU parada (RunPod) quando entra trabalho e nenhum motor está ligado. Sem
 * RUNPOD_API_KEY + RUNPOD_POD_ID não faz nada. A máquina desliga-se sozinha (worker, 10 min parada).
 */
async function acordarGpu(): Promise<string | null> {
  const chave = process.env.RUNPOD_API_KEY?.trim()
  const pod = process.env.RUNPOD_POD_ID?.trim()
  if (!chave || !pod) return null
  try {
    const r = await fetch(`https://rest.runpod.io/v1/pods/${encodeURIComponent(pod)}/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${chave}` },
      signal: AbortSignal.timeout(4000),
    })
    return r.ok ? 'a_ligar' : `runpod ${r.status}`
  } catch {
    return 'runpod sem resposta'
  }
}

function origemDoSite(request: NextRequest) {
  return (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '')
}

async function urlDaSaida(db: ReturnType<typeof getSupabaseAdmin>, request: NextRequest, g: { ensaio: boolean; saida_caminho: string | null }) {
  if (g.ensaio) return `${origemDoSite(request)}${CLIPE_ENSAIO}`
  if (!g.saida_caminho) return null
  const { data } = await db.storage.from('estudio').createSignedUrl(g.saida_caminho, 24 * 3600)
  return data?.signedUrl ?? null
}

export async function POST(request: NextRequest) {
  const q = await quem(request)
  if ('erro' in q) return q.erro
  const b = await request.json().catch(() => ({}))
  const v = validarPedido(b)
  if ('erro' in v) return NextResponse.json({ erro: v.erro }, { status: 400 })
  const p = v.pedido
  const db = getSupabaseAdmin()

  // As referências do estúdio têm de existir e estar prontas.
  for (const id of [p.ativo_id, p.audio_ativo_id].filter(Boolean) as string[]) {
    const { data: a } = await db.from('estudio_ativos').select('id, estado').eq('id', id).maybeSingle()
    if (!a || a.estado !== 'pronto') return NextResponse.json({ erro: `Ativo ${id} não existe ou ainda não acabou de subir.` }, { status: 400 })
  }

  const agora = new Date().toISOString()
  const { data: g, error } = await db
    .from('estudio_geracoes')
    .insert({
      tipo: p.tipo,
      params: p.params,
      ativo_id: p.ativo_id,
      audio_ativo_id: p.audio_ativo_id,
      ensaio: p.ensaio,
      origem: p.origem,
      pedido_por: q.userId,
      ...(p.ensaio ? { estado: 'pronto', terminado_em: agora, motor: 'ensaio' } : {}),
    })
    .select('id, estado, ensaio, saida_caminho')
    .single()
  if (error || !g) return NextResponse.json({ erro: 'Não consegui registar o pedido.' }, { status: 500 })

  // «falar» com a HeyGen configurada: vai já para lá (o Digital Twin do Ricardo), sem GPU.
  if (p.tipo === 'falar' && !g.ensaio && heygenConfig() && p.params.texto) {
    const h = await enviarHeygen(p.params.texto, p.params.aspecto)
    const upd = 'id' in h
      ? { estado: 'a_gerar', motor: 'heygen', params: { ...p.params, heygen_id: h.id } }
      : { estado: 'erro', motor: 'heygen', erro: h.erro, terminado_em: agora }
    await db.from('estudio_geracoes').update(upd).eq('id', g.id)
    return NextResponse.json({ ok: 'id' in h, id: g.id, estado: upd.estado, motor_online: true, motor: 'heygen', ...('erro' in h ? { erro: h.erro } : {}) }, { status: 'id' in h ? 200 : 502 })
  }

  const { online } = await estadoMotores(db, p.tipo)
  const gpu = !online && !g.ensaio ? await acordarGpu() : null
  return NextResponse.json({
    ok: true,
    id: g.id,
    estado: g.estado,
    motor_online: online,
    ...(gpu ? { gpu } : {}),
    ...(g.ensaio ? { url: await urlDaSaida(db, request, g) } : {}),
  })
}

export async function GET(request: NextRequest) {
  const q = await quem(request)
  if ('erro' in q) return q.erro
  const db = getSupabaseAdmin()
  const { online, motores } = await estadoMotores(db)
  const id = request.nextUrl.searchParams.get('id')

  if (id) {
    const { data: g } = await db
      .from('estudio_geracoes')
      .select('id, tipo, estado, params, ensaio, saida_caminho, saida_ativo_id, erro, criado_em, terminado_em, segundos_gpu, motor, pedido_por')
      .eq('id', id)
      .maybeSingle()
    if (!g) return NextResponse.json({ erro: 'Pedido desconhecido.' }, { status: 404 })
    if (g.motor === 'heygen' && g.estado === 'a_gerar' && (await sincronizarHeygen(db, g)) !== 'a_gerar') {
      const { data: f } = await db.from('estudio_geracoes').select('estado, saida_caminho, saida_ativo_id, erro, terminado_em').eq('id', g.id).maybeSingle()
      if (f) Object.assign(g, f)
    }
    return NextResponse.json({
      id: g.id,
      tipo: g.tipo,
      estado: g.estado,
      url: g.estado === 'pronto' ? await urlDaSaida(db, request, g) : null,
      ativo_id: g.saida_ativo_id,
      erro: g.erro,
      criado_em: g.criado_em,
      terminado_em: g.terminado_em,
      segundos_gpu: g.segundos_gpu,
      motor_online: online || g.motor === 'heygen',
    })
  }

  // ?sincronizar=heygen (robô cinemático, com o segredo do motor): fecha os vídeos da HeyGen que já
  // acabaram mesmo sem ninguém com o /estudio aberto — é isto que cria os projectos cinemáticos.
  if (request.nextUrl.searchParams.get('sincronizar') === 'heygen' && ehMotor(request)) {
    const { data: pend } = await db.from('estudio_geracoes')
      .select('id, estado, motor, params, pedido_por').eq('motor', 'heygen').eq('estado', 'a_gerar')
      .order('criado_em', { ascending: true }).limit(4)
    const estados = await Promise.all((pend ?? []).map((g) => sincronizarHeygen(db, g)))
    return NextResponse.json({ ok: true, vistos: estados.length, prontos: estados.filter((e) => e === 'pronto').length })
  }

  const { data: recentes } = await db
    .from('estudio_geracoes')
    .select('id, tipo, estado, params, origem, ensaio, saida_ativo_id, erro, criado_em, terminado_em')
    .order('criado_em', { ascending: false })
    .limit(30)
  return NextResponse.json({ motor_online: online, motores, tipos: DESCRICAO_TIPOS, recentes: recentes ?? [] })
}

export async function DELETE(request: NextRequest) {
  const q = await quem(request)
  if ('erro' in q) return q.erro
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const { data } = await getSupabaseAdmin()
    .from('estudio_geracoes')
    .update({ estado: 'cancelado', terminado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'fila')
    .select('id')
    .maybeSingle()
  if (!data) return NextResponse.json({ erro: 'Só se cancela um pedido que ainda está na fila.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ehMotor } from '@/lib/conteudo-magnetico/acesso'
import { MAX_TENTATIVAS, RECLAMO_EXPIRA_MS, nomeDoAtivo, saidaDe, type ParamsGeracao, type TipoGeracao } from '@/lib/estudio/geracao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * MOTOR DE ATIVOS — só o worker da GPU (services/motor-ativos/worker.py) fala com esta rota.
 * Autenticação: Bearer CRON_SECRET (ou x-caption-secret, como os outros motores fora da Vercel).
 *
 * GET  ?motor=nome&gpu=…&caps=cena,mover,… → regista o pulso e reclama o pedido mais antigo que a
 *      máquina sabe fazer. Devolve { trabalho: null } ou o trabalho com URLs assinados de leitura
 *      (imagem/áudio de referência) e o URL assinado para subir a saída no bucket `estudio`.
 * POST { id, ok, erro?, segundos_gpu?, duracao_s? } → fecha. Com ok cria o ativo novo
 *      (estudio_ativos, estado 'pronto') e liga-o ao pedido; sem ok volta à fila até 3 tentativas.
 */
export async function GET(request: NextRequest) {
  if (!ehMotor(request)) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  const sp = request.nextUrl.searchParams
  const motor = (sp.get('motor') || 'gpu').slice(0, 60)
  const caps = (sp.get('caps') || 'cena,angulo,mover,voz,falar').split(',').map((c) => c.trim()).filter(Boolean)
  const db = getSupabaseAdmin()

  await db.from('estudio_motores').upsert({
    nome: motor,
    visto_em: new Date().toISOString(),
    gpu: sp.get('gpu')?.slice(0, 120) ?? null,
    versao: sp.get('versao')?.slice(0, 40) ?? null,
    capacidades: caps,
  })

  // Pedidos presos (a máquina caiu a meio) voltam à fila.
  await db
    .from('estudio_geracoes')
    .update({ estado: 'fila', erro: 'motor: reclamo expirou' })
    .eq('estado', 'a_gerar')
    .lt('reclamado_em', new Date(Date.now() - RECLAMO_EXPIRA_MS).toISOString())

  const { data: cand } = await db
    .from('estudio_geracoes')
    .select('id, tipo, params, ativo_id, audio_ativo_id, tentativas')
    .eq('estado', 'fila')
    .in('tipo', caps)
    .order('criado_em', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!cand) return NextResponse.json({ ok: true, trabalho: null })

  const { data: meu } = await db
    .from('estudio_geracoes')
    .update({ estado: 'a_gerar', reclamado_em: new Date().toISOString(), motor, tentativas: cand.tentativas + 1 })
    .eq('id', cand.id)
    .eq('estado', 'fila')
    .select('id')
    .maybeSingle()
  if (!meu) return NextResponse.json({ ok: true, trabalho: null })

  const refs = [cand.ativo_id, cand.audio_ativo_id].filter(Boolean) as string[]
  const { data: ativos } = refs.length
    ? await db.from('estudio_ativos').select('id, caminho, mime, tipo').in('id', refs)
    : { data: [] as { id: string; caminho: string; mime: string; tipo: string }[] }
  const assinar = async (id: string | null) => {
    const a = (ativos ?? []).find((x) => x.id === id)
    if (!a) return null
    const { data } = await db.storage.from('estudio').createSignedUrl(a.caminho, 3600)
    return data ? { url: data.signedUrl, mime: a.mime, tipo: a.tipo } : null
  }

  const tipo = cand.tipo as TipoGeracao
  const { ext, mime } = saidaDe(tipo)
  const caminho = `ativos/ia/${new Date().toISOString().slice(0, 10)}/${cand.id}.${ext}`
  const { data: subida } = await db.storage.from('estudio').createSignedUploadUrl(caminho, { upsert: true })
  if (!subida) {
    await db.from('estudio_geracoes').update({ estado: 'fila', erro: 'motor: falhou o URL de subida' }).eq('id', cand.id)
    return NextResponse.json({ erro: 'Não consegui preparar a subida.' }, { status: 500 })
  }
  await db.from('estudio_geracoes').update({ saida_caminho: caminho }).eq('id', cand.id)

  const params = cand.params as ParamsGeracao
  return NextResponse.json({
    ok: true,
    trabalho: {
      id: cand.id,
      tipo,
      params,
      imagem: (await assinar(cand.ativo_id)) ?? (params.imagem_url ? { url: params.imagem_url, mime: null, tipo: 'imagem' } : null),
      audio: await assinar(cand.audio_ativo_id),
      saida: { subir_url: subida.signedUrl, caminho, mime, ext },
    },
  })
}

export async function POST(request: NextRequest) {
  if (!ehMotor(request)) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  const b = await request.json().catch(() => ({}))
  if (typeof b.id !== 'string') return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: g } = await db
    .from('estudio_geracoes')
    .select('id, tipo, estado, params, saida_caminho, pedido_por, tentativas')
    .eq('id', b.id)
    .maybeSingle()
  if (!g || g.estado !== 'a_gerar') return NextResponse.json({ erro: 'Trabalho desconhecido ou já fechado.' }, { status: 409 })
  const segundos_gpu = Number.isFinite(Number(b.segundos_gpu)) ? Number(b.segundos_gpu) : null
  const agora = new Date().toISOString()

  if (!b.ok) {
    const desiste = g.tentativas >= MAX_TENTATIVAS
    await db
      .from('estudio_geracoes')
      .update({
        estado: desiste ? 'erro' : 'fila',
        erro: `motor: ${String(b.erro || 'erro').slice(0, 500)}`,
        segundos_gpu,
        ...(desiste ? { terminado_em: agora } : {}),
      })
      .eq('id', g.id)
    return NextResponse.json({ ok: true, estado: desiste ? 'erro' : 'fila' })
  }

  const tipo = g.tipo as TipoGeracao
  const { mime, tipoAtivo } = saidaDe(tipo)
  const { data: ativo, error } = await db
    .from('estudio_ativos')
    .insert({
      user_id: g.pedido_por,
      tipo: tipoAtivo,
      nome: nomeDoAtivo(tipo, g.params as ParamsGeracao),
      caminho: g.saida_caminho,
      mime,
      tamanho: Number.isFinite(Number(b.tamanho)) ? Number(b.tamanho) : null,
      estado: 'pronto',
      notas: `Motor de ativos (${g.id})`,
    })
    .select('id')
    .single()
  if (error || !ativo) return NextResponse.json({ erro: 'Não consegui criar o ativo.' }, { status: 500 })

  await db
    .from('estudio_geracoes')
    .update({ estado: 'pronto', saida_ativo_id: ativo.id, erro: null, segundos_gpu, terminado_em: agora })
    .eq('id', g.id)
  return NextResponse.json({ ok: true, ativo_id: ativo.id })
}

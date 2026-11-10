import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ehMotor } from '@/lib/conteudo-magnetico/acesso'
import { normalizarProjeto } from '@/lib/estudio/projeto'
import { normalizarPalavras } from '@/lib/estudio/texto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * MOTOR DO EDITOR — o Mac (services/estudio-editor → renderProjeto) monta aqui os projectos da
 * timeline do /estudio.
 *
 * GET  → reclama o projecto 'a_render' mais antigo (passa a 'a_montar') e devolve o `projeto`
 *        normalizado com URL assinado (2 h) em cada clip e na música, as palavras do Whisper de
 *        cada take usado (para as legendas) e o URL assinado para subir o MP4.
 * POST { id, ok, erro?, duracao_s? } → 'pronto' com o URL público, ou 'erro' com a nota.
 * Autenticação: Bearer CRON_SECRET ou x-caption-secret (ehMotor).
 */
export async function GET(request: NextRequest) {
  if (!ehMotor(request)) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  const db = getSupabaseAdmin()
  await db.from('estudio_projetos').update({ estado: 'a_render' }).eq('estado', 'a_montar')
    .lt('reclamado_em', new Date(Date.now() - 40 * 60_000).toISOString())

  const { data: cand } = await db.from('estudio_projetos').select('id, titulo, marca, projeto')
    .eq('estado', 'a_render').order('atualizado_em', { ascending: true }).limit(1).maybeSingle()
  if (!cand) return NextResponse.json({ ok: true, trabalho: null })
  const { data: meu } = await db.from('estudio_projetos')
    .update({ estado: 'a_montar', reclamado_em: new Date().toISOString() })
    .eq('id', cand.id).eq('estado', 'a_render').select('id').maybeSingle()
  if (!meu) return NextResponse.json({ ok: true, trabalho: null })

  const p = normalizarProjeto(cand.projeto)
  const caminhos = [...new Set([...p.clips.map((c) => c.fonte.caminho), p.musica?.fonte.caminho].filter(Boolean) as string[])]
  const { data: urls } = caminhos.length ? await db.storage.from('estudio').createSignedUrls(caminhos, 7200) : { data: [] }
  const mapa = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]))
  const comUrl = <T extends { fonte: { caminho: string | null; url: string | null } }>(x: T): T =>
    x.fonte.caminho ? { ...x, fonte: { ...x.fonte, url: mapa.get(x.fonte.caminho) ?? null } } : x

  const takeIds = [...new Set(p.clips.filter((c) => c.fonte.tipo === 'take' && c.fonte.ref).map((c) => c.fonte.ref as string))]
  const { data: takes } = takeIds.length
    ? await db.from('estudio_gravacoes').select('id, transcricao').in('id', takeIds)
    : { data: [] as { id: string; transcricao: unknown }[] }
  const palavras: Record<string, unknown> = {}
  for (const t of takes ?? []) palavras[t.id] = normalizarPalavras((t.transcricao as any)?.palavras)

  const destino = `estudio/projetos/${cand.id}.mp4`
  const { data: subida } = await db.storage.from('uploads').createSignedUploadUrl(destino, { upsert: true })
  if (!subida) {
    await db.from('estudio_projetos').update({ estado: 'erro', erro: 'motor: falhou a preparar o upload' }).eq('id', cand.id)
    return NextResponse.json({ erro: 'Não consegui preparar o upload.' }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    trabalho: {
      id: cand.id,
      titulo: cand.titulo,
      marca: cand.marca,
      projeto: { ...p, clips: p.clips.map(comUrl), musica: p.musica ? comUrl(p.musica) : null },
      palavras,
      subir_url: subida.signedUrl,
    },
  })
}

export async function POST(request: NextRequest) {
  if (!ehMotor(request)) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  const b = await request.json().catch(() => ({}))
  if (typeof b.id !== 'string') return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: p } = await db.from('estudio_projetos').select('id, estado').eq('id', b.id).maybeSingle()
  if (!p || p.estado !== 'a_montar') return NextResponse.json({ erro: 'Trabalho desconhecido ou já fechado.' }, { status: 409 })
  if (!b.ok) {
    await db.from('estudio_projetos').update({ estado: 'erro', erro: String(b.erro || 'erro').slice(0, 500) }).eq('id', p.id)
    return NextResponse.json({ ok: true })
  }
  const url = db.storage.from('uploads').getPublicUrl(`estudio/projetos/${p.id}.mp4`).data.publicUrl
  await db.from('estudio_projetos').update({ estado: 'pronto', erro: null, video_url: `${url}?v=${Date.now()}`, atualizado_em: new Date().toISOString() }).eq('id', p.id)
  return NextResponse.json({ ok: true, video_url: url })
}

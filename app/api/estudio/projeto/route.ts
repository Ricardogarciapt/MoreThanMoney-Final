import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirEstudio } from '@/lib/estudio/acesso'
import { normalizarCortes } from '@/lib/estudio/texto'
import { montarDeTake, normalizarProjeto, PROJETO_VAZIO, type Projeto } from '@/lib/estudio/projeto'
import { MARCAS_CASA } from '@/lib/conteudo-magnetico/acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PROJECTOS DO EDITOR DE VÍDEO (/estudio → Editor). Biblioteca partilhada pela equipa do estúdio.
 *
 * GET                → lista (sem o jsonb pesado) + a biblioteca para a timeline (takes, ativos, renders).
 * GET ?id=           → o projecto, com URLs assinados (2 h) para cada clip e a música.
 * POST {titulo, marca, take_id?} → cria. Com take_id faz «Montar com IA» (zonas mantidas, gancho,
 *                      CTA, ativos da peça como b-roll, música).
 * PUT  {id, titulo?, marca?, projeto} → guarda (passa por normalizarProjeto; tira os URLs assinados).
 * PATCH {id, accao:'exportar'|'cancelar'} → manda para o Mac montar (estado a_render) ou cancela.
 * DELETE ?id=        → apaga o projecto e o MP4 exportado.
 */
const BUCKET = 'estudio'
const DUR_URL = 7200

async function assinar(p: Projeto): Promise<Projeto> {
  const db = getSupabaseAdmin()
  const caminhos = [...new Set([...p.clips.map((c) => c.fonte.caminho), p.musica?.fonte.caminho].filter(Boolean) as string[])]
  if (!caminhos.length) return p
  const { data } = await db.storage.from(BUCKET).createSignedUrls(caminhos, DUR_URL)
  const mapa = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
  const comUrl = <T extends { fonte: { caminho: string | null; url: string | null } }>(x: T): T =>
    x.fonte.caminho ? { ...x, fonte: { ...x.fonte, url: mapa.get(x.fonte.caminho) ?? null } } : x
  return { ...p, clips: p.clips.map(comUrl), musica: p.musica ? comUrl(p.musica) : null }
}

/** Ao guardar, um clip do bucket privado nunca leva o URL assinado (expira). */
const semUrlsAssinados = (p: Projeto): Projeto => {
  const limpar = <T extends { fonte: { caminho: string | null; url: string | null } }>(x: T): T =>
    x.fonte.caminho ? { ...x, fonte: { ...x.fonte, url: null } } : x
  return { ...p, clips: p.clips.map(limpar), musica: p.musica ? limpar(p.musica) : null }
}

async function biblioteca() {
  const db = getSupabaseAdmin()
  const [takes, ativos, renders] = await Promise.all([
    db.from('estudio_gravacoes').select('id, peca_id, marca, caminho, mime, duracao_s, estado, editado_url, cortes, criado_em')
      .not('estado', 'in', '(a_subir,descartado)').order('criado_em', { ascending: false }).limit(40),
    db.from('estudio_ativos').select('id, peca_id, tipo, nome, caminho, mime, animacao, criado_em')
      .eq('estado', 'pronto').order('criado_em', { ascending: false }).limit(80),
    db.from('conteudo_magnetico_renders').select('id, peca_id, video_url, estado, criado_em')
      .eq('estado', 'pronto').order('criado_em', { ascending: false }).limit(20),
  ])
  const lista = [...(takes.data ?? []).map((t) => t.caminho), ...(ativos.data ?? []).map((a) => a.caminho)]
  const { data: urls } = lista.length ? await db.storage.from(BUCKET).createSignedUrls(lista, DUR_URL) : { data: [] }
  const mapa = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]))
  return {
    takes: (takes.data ?? []).map((t) => ({ ...t, url: mapa.get(t.caminho) ?? null })),
    ativos: (ativos.data ?? []).map((a) => ({ ...a, url: mapa.get(a.caminho) ?? null })),
    renders: (renders.data ?? []).filter((r) => r.video_url),
  }
}

export async function GET(request: NextRequest) {
  const r = await exigirEstudio(request, 'editor')
  if ('erro' in r) return r.erro
  const db = getSupabaseAdmin()
  const id = request.nextUrl.searchParams.get('id')
  if (id) {
    const { data } = await db.from('estudio_projetos').select('*').eq('id', id).maybeSingle()
    if (!data) return NextResponse.json({ erro: 'Projecto não encontrado.' }, { status: 404 })
    return NextResponse.json({ ok: true, projeto: { ...data, projeto: await assinar(normalizarProjeto(data.projeto)) } })
  }
  const [{ data }, bib] = await Promise.all([
    db.from('estudio_projetos').select('id, titulo, marca, estado, video_url, erro, criado_em, atualizado_em')
      .order('atualizado_em', { ascending: false }).limit(50),
    request.nextUrl.searchParams.get('biblioteca') ? biblioteca() : Promise.resolve(null),
  ])
  return NextResponse.json({ ok: true, projetos: data ?? [], biblioteca: bib })
}

export async function POST(request: NextRequest) {
  const r = await exigirEstudio(request, 'editor')
  if ('erro' in r) return r.erro
  const b = await request.json().catch(() => ({}))
  const db = getSupabaseAdmin()
  let marca = MARCAS_CASA.includes(b.marca) ? b.marca : 'morethanmoney'
  let titulo = String(b.titulo || '').trim().slice(0, 120) || 'Projecto sem título'
  let projeto: Projeto = normalizarProjeto({ ...PROJETO_VAZIO, formato: b.formato })

  if (typeof b.take_id === 'string') {
    const { data: t } = await db.from('estudio_gravacoes')
      .select('id, peca_id, marca, caminho, duracao_s, cortes').eq('id', b.take_id).maybeSingle()
    if (!t) return NextResponse.json({ erro: 'Take não encontrado.' }, { status: 404 })
    marca = MARCAS_CASA.includes(t.marca) ? t.marca : marca
    const [{ data: peca }, { data: ativos }] = await Promise.all([
      t.peca_id ? db.from('conteudo_magnetico_pecas').select('guiao').eq('id', t.peca_id).maybeSingle() : Promise.resolve({ data: null }),
      t.peca_id
        ? db.from('estudio_ativos').select('id, tipo, nome, caminho, animacao, segmento').eq('peca_id', t.peca_id).eq('estado', 'pronto').order('segmento', { ascending: true }).limit(20)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const g = (peca?.guiao ?? {}) as any
    const seg0 = Array.isArray(g.reel?.segmentos) ? g.reel.segmentos[0] : null
    const gancho = (seg0?.texto_ecra || g.laminas?.[0]?.titulo || '').toString().slice(0, 90) || null
    const cta = g.palavra_chave ? `Comenta «${String(g.palavra_chave)}»` : null
    const lista = (ativos ?? []) as any[]
    const musica = lista.find((a) => a.tipo === 'audio') ?? null
    projeto = montarDeTake({
      take: { id: t.id, caminho: t.caminho, duracao_s: Number(t.duracao_s) || 30, cortes: normalizarCortes(t.cortes), nome: 'Take' },
      gancho, cta, ativos: lista, musica, formato: projeto.formato,
    })
    if (titulo === 'Projecto sem título') titulo = (g.nicho ? `Reel · ${String(g.nicho).slice(0, 60)}` : 'Reel montado com IA')
  }

  const { data, error } = await db.from('estudio_projetos')
    .insert({ user_id: r.quem.userId, titulo, marca, projeto }).select('id').maybeSingle()
  if (error || !data) return NextResponse.json({ erro: 'Não consegui criar o projecto.' }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PUT(request: NextRequest) {
  const r = await exigirEstudio(request, 'editor')
  if ('erro' in r) return r.erro
  const b = await request.json().catch(() => ({}))
  if (typeof b.id !== 'string') return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const upd: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (b.projeto) upd.projeto = semUrlsAssinados(normalizarProjeto(b.projeto))
  if (typeof b.titulo === 'string') upd.titulo = b.titulo.trim().slice(0, 120) || 'Projecto sem título'
  if (MARCAS_CASA.includes(b.marca)) upd.marca = b.marca
  const { error } = await getSupabaseAdmin().from('estudio_projetos').update(upd).eq('id', b.id).not('estado', 'in', '(a_render,a_montar)')
  if (error) return NextResponse.json({ erro: 'Não guardou.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest) {
  const r = await exigirEstudio(request, 'editor')
  if ('erro' in r) return r.erro
  const b = await request.json().catch(() => ({}))
  if (typeof b.id !== 'string') return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: p } = await db.from('estudio_projetos').select('id, estado, projeto').eq('id', b.id).maybeSingle()
  if (!p) return NextResponse.json({ erro: 'Projecto não encontrado.' }, { status: 404 })
  if (b.accao === 'exportar') {
    if (!normalizarProjeto(p.projeto).clips.length) return NextResponse.json({ erro: 'A timeline está vazia.' }, { status: 400 })
    if (p.estado === 'a_montar') return NextResponse.json({ erro: 'O Mac já está a montar este.' }, { status: 409 })
    await db.from('estudio_projetos').update({ estado: 'a_render', erro: null, reclamado_em: null, atualizado_em: new Date().toISOString() }).eq('id', p.id)
    return NextResponse.json({ ok: true, estado: 'a_render' })
  }
  if (b.accao === 'cancelar') {
    await db.from('estudio_projetos').update({ estado: 'rascunho', reclamado_em: null }).eq('id', p.id).in('estado', ['a_render', 'a_montar', 'erro'])
    return NextResponse.json({ ok: true, estado: 'rascunho' })
  }
  return NextResponse.json({ erro: 'Acção desconhecida.' }, { status: 400 })
}

export async function DELETE(request: NextRequest) {
  const r = await exigirEstudio(request, 'editor')
  if ('erro' in r) return r.erro
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ erro: 'Falta o id.' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: p } = await db.from('estudio_projetos').select('id, marca').eq('id', id).maybeSingle()
  if (!p) return NextResponse.json({ ok: true })
  await db.storage.from('uploads').remove([`estudio/projetos/${p.id}.mp4`])
  await db.from('estudio_projetos').delete().eq('id', p.id)
  return NextResponse.json({ ok: true })
}

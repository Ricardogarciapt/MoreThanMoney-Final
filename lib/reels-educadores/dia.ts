import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { tokenForAccount } from '@/lib/instagram/publish'
import { AVISO, EDUCADORES, HORA_CORTE, HORAS_ANIMADOS, educador, type EducadorReel } from './config'
import { gerarRoteiro, textoDoGancho, type Historico, type Roteiro } from './roteiro'

/**
 * O DIA DOS REELS — o que o robô do GitHub pede de manhã e o que entrega no fim.
 *
 * Por dia: 3 reels animados (um por educador publicável) + 1 corte de uma sessão gravada.
 * Educadores com `publicar: false` recebem reels na mesma, mas como RASCUNHO na fila — para o
 * dono ver e ligar quando quiser.
 *
 * Tudo idempotente: correr duas vezes no mesmo dia não duplica nada (`unique (dia, slot)`).
 */

const IG = { channel: 'instagram', ig_account_id: '17841474872672009', ig_username: 'morethanmoney.pt' }
const SLOT_CORTE = 9
const RASCUNHOS_POR_EDUCADOR = 2
/** Os clips de uma sessão aprovam-se de uma vez: o ficheiro do DVR é reescrito na sessão seguinte. */
const CLIPS_POR_SESSAO = 7

type Db = ReturnType<typeof getSupabaseAdmin>

export interface ParaRender {
  id: string
  roteiro: Roteiro
  educador: { nome: string; area: string; marca?: string; foto: string }
}

/** Amanhã, em Lisboa (fuso de quem vê os posts). */
export function amanha(): string {
  const d = new Date(Date.now() + 24 * 3600_000)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
}

async function publicaveis(db: Db): Promise<Set<string>> {
  const { data } = await db.from('site_settings').select('value').eq('key', 'reels_educadores').maybeSingle()
  const extra = ((data?.value as { publicar?: Record<string, boolean> } | null)?.publicar) ?? {}
  return new Set(EDUCADORES.filter((e) => extra[e.slug] ?? e.publicar).map((e) => e.slug))
}

function quando(dia: string, hora: string): Date {
  const t = new Date(`${dia}T${hora}:00Z`)
  // Um horário que já passou sai daqui a 20 minutos, em vez de se perder.
  return t.getTime() < Date.now() + 10 * 60_000 ? new Date(Date.now() + 20 * 60_000) : t
}

async function historico(db: Db, slug: string): Promise<Historico[]> {
  const { data } = await db.from('reels_auto')
    .select('tema, gancho, nota').eq('educador', slug).eq('tipo', 'animado')
    .order('created_at', { ascending: false }).limit(30)
  return (data ?? []).map((r) => ({ tema: r.tema as string | null, gancho: String(r.gancho ?? ''), nota: r.nota == null ? null : Number(r.nota) }))
}

/**
 * O orçamento de IA de uma chamada ao plano. Os fornecedores gratuitos limitam por minuto (o Groq
 * dá 8000 tokens/min, ~2 roteiros), por isso os roteiros saem espaçados e uma chamada só escreve o
 * que cabe em ~3 minutos; o robô volta a pedir o plano até ele dizer `completo`.
 */
interface Orcamento { fim: number; ultima: number; parado: boolean }
const PAUSA_ENTRE_ROTEIROS = 25_000

async function novoRoteiro(db: Db, dia: string, slot: number, ed: EducadorReel, orc: Orcamento): Promise<boolean> {
  if (orc.parado) return false
  const espera = orc.ultima + PAUSA_ENTRE_ROTEIROS - Date.now()
  if (orc.ultima && Date.now() + Math.max(0, espera) + 60_000 > orc.fim) { orc.parado = true; return false }
  if (orc.ultima && espera > 0) await new Promise((r) => setTimeout(r, espera))
  orc.ultima = Date.now()
  const id = `${ed.slug}-${dia}-${slot}`
  try {
    const r = await gerarRoteiro(ed, await historico(db, ed.slug), id)
    await db.from('reels_auto').insert({ dia, slot, tipo: 'animado', educador: ed.slug, tema: r.tema, gancho: textoDoGancho(r), roteiro: r, estado: 'roteiro' })
    return true
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    // Fornecedores esgotados: parar já, em vez de queimar o resto do minuto com pedidos recusados.
    if (/indispon/i.test(erro)) orc.parado = true
    await db.from('reels_auto').insert({ dia, slot, tipo: 'animado', educador: ed.slug, estado: 'erro', erro: erro.slice(0, 1000) })
    return false
  }
}

/** Os reels de educadores que JÁ estão na fila nesse dia (os feitos à mão contam). */
async function jaNaFila(db: Db, dia: string): Promise<Set<string>> {
  const { data } = await db.from('social_scheduled_posts').select('caption')
    .eq('pillar', 'reels-educadores').eq('media_type', 'REELS')
    .gte('scheduled_at', `${dia}T00:00:00Z`).lt('scheduled_at', `${dia}T23:59:59Z`)
    .not('created_by', 'eq', 'reels-auto')
  const s = new Set<string>()
  for (const p of data ?? []) for (const e of EDUCADORES) if (String(p.caption ?? '').includes(e.nome)) s.add(e.slug)
  return s
}

/** Planeia o dia e devolve o que falta desenhar. */
export async function planearDia(dia: string): Promise<{ dia: string; renders: ParaRender[]; notas: string[]; completo: boolean }> {
  const db = getSupabaseAdmin()
  const notas: string[] = []
  const orc: Orcamento = { fim: Date.now() + 200_000, ultima: 0, parado: false }
  const pub = await publicaveis(db)
  // Roteiros que falharam numa corrida anterior voltam a tentar-se (o slot fica livre).
  await db.from('reels_auto').delete().eq('dia', dia).eq('tipo', 'animado').eq('estado', 'erro').is('post_id', null)
  const { data: existentes } = await db.from('reels_auto').select('slot, educador').eq('dia', dia)
  const usados = new Set((existentes ?? []).map((r) => Number(r.slot)))

  // ── 3 animados: um por educador publicável, a ordem roda todos os dias ──
  const ja = await jaNaFila(db, dia)
  const ordem = EDUCADORES.filter((e) => pub.has(e.slug))
  const rot = Math.floor(new Date(`${dia}T00:00:00Z`).getTime() / 86_400_000) % Math.max(1, ordem.length)
  const doDia = [...ordem.slice(rot), ...ordem.slice(0, rot)].filter((e) => !ja.has(e.slug))
  const faltam = Math.max(0, HORAS_ANIMADOS.length - ja.size)
  for (let i = 0; i < faltam; i++) {
    const slot = i + 1
    if (usados.has(slot)) continue
    const ed = doDia[i % Math.max(1, doDia.length)]
    if (ed) await novoRoteiro(db, dia, slot, ed, orc)
  }
  if (ja.size) notas.push(`${ja.size} reel(s) de educadores já estavam na fila: ${[...ja].join(', ')}`)

  // ── rascunhos dos educadores ainda não publicáveis ──
  for (const ed of EDUCADORES.filter((e) => !pub.has(e.slug))) {
    const { count } = await db.from('reels_auto').select('id', { count: 'exact', head: true })
      .eq('educador', ed.slug).in('estado', ['roteiro', 'rascunho'])
    for (let n = count ?? 0, k = 0; n < RASCUNHOS_POR_EDUCADOR && k < 5 && !orc.parado; k++) {
      const slot = 100 + EDUCADORES.indexOf(ed) * 10 + k
      if (usados.has(slot)) continue
      usados.add(slot)
      if (await novoRoteiro(db, dia, slot, ed, orc)) n++
      else break
    }
  }

  await garantirCortes(db, dia, pub, notas)

  const { data: porFazer } = await db.from('reels_auto').select('id, roteiro, educador')
    .eq('tipo', 'animado').eq('estado', 'roteiro').gte('dia', dia).order('slot')
  const renders: ParaRender[] = []
  for (const r of porFazer ?? []) {
    const ed = educador(String(r.educador))
    if (!ed || !r.roteiro) continue
    renders.push({ id: r.id as string, roteiro: r.roteiro as Roteiro, educador: { nome: ed.nome, area: ed.area, marca: ed.marca, foto: ed.foto } })
  }
  if (orc.parado) notas.push('roteiros por acabar: a IA está no limite ou o tempo acabou; o robô volta a pedir')
  return { dia, renders, notas, completo: !orc.parado }
}

/** Depois de o robô subir o vídeo: entra na fila (aprovado) ou fica como rascunho. */
export async function entregar(id: string, videoUrl: string, capaUrl: string | null): Promise<{ estado: string; postId?: string }> {
  const db = getSupabaseAdmin()
  const { data: r } = await db.from('reels_auto').select('*').eq('id', id).maybeSingle()
  if (!r) throw new Error('reel desconhecido')
  if (r.post_id) return { estado: r.estado as string, postId: r.post_id as string }
  const pub = await publicaveis(db)
  const vai = pub.has(String(r.educador))
  const slot = Number(r.slot)
  const hora = slot <= HORAS_ANIMADOS.length ? HORAS_ANIMADOS[slot - 1] : HORAS_ANIMADOS[1]
  const agora = new Date().toISOString()
  const { data: post, error } = await db.from('social_scheduled_posts').insert({
    ...IG,
    pillar: 'reels-educadores',
    media_type: 'REELS',
    media_urls: [videoUrl],
    caption: (r.roteiro as Roteiro).legenda,
    scheduled_at: quando(String(r.dia), hora).toISOString(),
    status: vai ? 'approved' : 'draft',
    approved_by: vai ? 'reels-auto' : null,
    approved_at: vai ? agora : null,
    created_by: 'reels-auto',
    agente_codigo: 'AG-SOCIAL',
  }).select('id').single()
  if (error) throw new Error(error.message)
  const estado = vai ? 'agendado' : 'rascunho'
  await db.from('reels_auto').update({ estado, video_url: videoUrl, capa_url: capaUrl, post_id: post.id, updated_at: agora }).eq('id', id)
  return { estado, postId: post.id as string }
}

/**
 * OS CORTES DAS SESSÕES — pelo videocliper que já existe.
 *
 * Uma sessão dá 10 momentos propostos; aprovam-se os 7 melhores de uma vez (o ficheiro do DVR é
 * reescrito na sessão seguinte, e um clipe cortado mais tarde sairia de outra aula) e cada um fica
 * com o seu dia. O robô corta-os e, quando estão prontos, entram na fila às 21:00.
 */
async function garantirCortes(db: Db, dia: string, pub: Set<string>, notas: string[]): Promise<void> {
  const agora = new Date().toISOString()

  // 1. clips cortados → fila
  const { data: prontos } = await db.from('reels_auto').select('id, dia, clip_id, educador').eq('tipo', 'corte').eq('estado', 'a_render')
  for (const r of prontos ?? []) {
    const { data: c } = await db.from('videocliper_clips').select('estado, video_url, thumbnail_url, caption, titulo, hook, erro').eq('id', r.clip_id as string).maybeSingle()
    if (!c) continue
    if (c.estado === 'erro') { await db.from('reels_auto').update({ estado: 'erro', erro: c.erro, updated_at: agora }).eq('id', r.id); continue }
    if (c.estado !== 'renderizado' || !c.video_url) continue
    const ed = educador(String(r.educador))
    let caption = String(c.caption ?? c.titulo ?? '').trim()
    if (ed && !caption.includes(ed.nome)) caption = `${ed.nome} · ${ed.area}\n\n${caption}`
    if (!caption.includes('não constitui consultoria')) caption += `\n\n${AVISO}`
    if (ed && !caption.includes('#morethanmoney')) caption += `\n\n${ed.hashtags}`
    const { data: post, error } = await db.from('social_scheduled_posts').insert({
      ...IG, pillar: 'reels-educadores', media_type: 'REELS', media_urls: [c.video_url], caption,
      scheduled_at: quando(String(r.dia), HORA_CORTE).toISOString(),
      status: 'approved', approved_by: 'reels-auto', approved_at: agora, created_by: 'reels-auto', agente_codigo: 'AG-SOCIAL',
    }).select('id').single()
    if (error) { notas.push(`corte ${r.id}: ${error.message}`); continue }
    await db.from('videocliper_clips').update({ ig_post_id: post.id, estado: 'agendado', updated_at: agora }).eq('id', r.clip_id as string)
    await db.from('reels_auto').update({ estado: 'agendado', video_url: c.video_url, capa_url: c.thumbnail_url, post_id: post.id, gancho: c.hook, tema: c.titulo, updated_at: agora }).eq('id', r.id)
  }

  // 2. sessões analisadas → aprovar os melhores momentos e dar-lhes dias
  const { data: jobs } = await db.from('videocliper_jobs').select('id, estado, reels_educador, erro')
    .like('criado_por', 'auto:%').order('created_at')
  for (const j of jobs ?? []) {
    if (j.estado !== 'pronto') continue
    const { data: clips } = await db.from('videocliper_clips').select('id, score, inicio_seg, fim_seg, estado')
      .eq('job_id', j.id).eq('estado', 'proposto').order('score', { ascending: false })
    const { count: jaUsados } = await db.from('videocliper_clips').select('id', { count: 'exact', head: true })
      .eq('job_id', j.id).neq('estado', 'proposto')
    const escolhidos: Array<{ id: string; i: number; f: number }> = []
    for (const c of clips ?? []) {
      if (escolhidos.length + (jaUsados ?? 0) >= CLIPS_POR_SESSAO) break
      const i = Number(c.inicio_seg), f = Number(c.fim_seg)
      if (escolhidos.some((e) => i < e.f && f > e.i)) continue
      escolhidos.push({ id: c.id as string, i, f })
    }
    for (const c of escolhidos) {
      const d = await proximoDiaDeCorte(db, dia)
      const { error } = await db.from('reels_auto').insert({ dia: d, slot: SLOT_CORTE, tipo: 'corte', educador: j.reels_educador ?? 'mtm', estado: 'a_render', clip_id: c.id })
      if (error) break
      await db.from('videocliper_clips').update({ estado: 'aprovado', updated_at: agora }).eq('id', c.id)
    }
    await db.from('videocliper_jobs').update({ estado: 'concluido', updated_at: agora }).eq('id', j.id)
  }

  // 3. pouca reserva e nenhuma sessão a ser analisada → pedir a próxima
  const { count: futuros } = await db.from('reels_auto').select('id', { count: 'exact', head: true })
    .eq('tipo', 'corte').gte('dia', dia).in('estado', ['a_render', 'agendado'])
  const emCurso = (jobs ?? []).some((j) => ['pedido', 'a_descarregar', 'a_transcrever', 'a_analisar', 'pronto'].includes(String(j.estado)))
  if ((futuros ?? 0) >= 3 || emCurso) return
  const fonte = await proximaSessao(db, pub)
  if (!fonte) { notas.push('cortes: não há mais sessões gravadas por cortar'); return }
  await db.from('videocliper_jobs').insert({
    origem: 'youtube', youtube_url: fonte.url, titulo: fonte.titulo, estado: 'pedido',
    criado_por: `auto:${fonte.chave}`, reels_educador: fonte.educador, idioma: 'pt',
  })
  notas.push(`cortes: pedida a sessão «${fonte.titulo}» (${fonte.educador})`)
}

async function proximoDiaDeCorte(db: Db, desde: string): Promise<string> {
  const { data } = await db.from('reels_auto').select('dia').eq('slot', SLOT_CORTE).gte('dia', desde)
  const ocupados = new Set((data ?? []).map((r) => String(r.dia)))
  const d = new Date(`${desde}T12:00:00Z`)
  while (ocupados.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * A próxima sessão gravada por cortar: primeiro o ficheiro do DVR (descarrega-se sempre — é
 * nosso), depois as gravações no YouTube (que podem recusar o IP do robô; se recusarem, passa à
 * seguinte no dia seguinte). Só de educadores publicáveis, e nunca a mesma duas vezes.
 */
async function proximaSessao(db: Db, pub: Set<string>): Promise<{ url: string; titulo: string; educador: string; chave: string } | null> {
  const { data: eds } = await db.from('lms_educators').select('id, display_name')
  const slugDe = new Map((eds ?? []).map((e) => [e.id as string, EDUCADORES.find((x) => x.nome === e.display_name)?.slug]))
  const { data: dvr } = await db.from('lms_dvr_jobs')
    .select('educator_id, download_url, youtube_video_url, duration_s, requested_at, stream_id')
    .eq('status', 'ready').order('requested_at', { ascending: false })
  const { data: feitos } = await db.from('videocliper_jobs').select('criado_por').like('criado_por', 'auto:%')
  const usadas = new Set((feitos ?? []).map((j) => String(j.criado_por).slice(5)))
  const { data: streams } = await db.from('lms_streams').select('id, title')
  const tituloDe = new Map((streams ?? []).map((s) => [s.id as string, String(s.title ?? 'Sessão')]))

  const vistos = new Set<string>()
  const candidatos: Array<{ url: string; titulo: string; educador: string; chave: string }> = []
  // O ficheiro do DVR guarda só a ÚLTIMA sessão de cada chave: vale a linha mais recente.
  for (const r of dvr ?? []) {
    const slug = slugDe.get(r.educator_id as string)
    if (!slug || !pub.has(slug) || !r.download_url || vistos.has(r.download_url as string)) continue
    vistos.add(r.download_url as string)
    if (Number(r.duration_s) < 600) continue
    candidatos.push({ url: r.download_url as string, titulo: tituloDe.get(r.stream_id as string) ?? 'Sessão', educador: slug, chave: `dvr:${r.download_url}:${r.requested_at}` })
  }
  for (const r of dvr ?? []) {
    const slug = slugDe.get(r.educator_id as string)
    if (!slug || !pub.has(slug) || !r.youtube_video_url || Number(r.duration_s) < 600) continue
    candidatos.push({ url: r.youtube_video_url as string, titulo: tituloDe.get(r.stream_id as string) ?? 'Sessão', educador: slug, chave: `yt:${r.youtube_video_url}` })
  }
  return candidatos.find((c) => !usadas.has(c.chave)) ?? null
}

/**
 * A NOTA de cada reel publicado, lida do Instagram — é ela que ensina o próximo roteiro.
 *
 * nota = (comentários×6 + partilhas×5 + guardados×4 + gostos) ÷ alcance × 100.
 * Comentários pesam mais porque é o comentário que abre a conversa do funil.
 */
export async function atualizarMetricas(): Promise<number> {
  const db = getSupabaseAdmin()
  const token = await tokenForAccount(IG.ig_account_id)
  if (!token) return 0
  const limite = new Date(Date.now() - 21 * 86_400_000).toISOString()
  const velho = new Date(Date.now() - 20 * 3600_000).toISOString()
  const { data } = await db.from('reels_auto').select('id, post_id, metricas_em')
    .eq('estado', 'agendado').gte('created_at', limite).not('post_id', 'is', null)
  let n = 0
  for (const r of data ?? []) {
    if (r.metricas_em && String(r.metricas_em) > velho) continue
    const { data: p } = await db.from('social_scheduled_posts').select('published_media_id').eq('id', r.post_id as string).maybeSingle()
    const media = p?.published_media_id as string | undefined
    if (!media) continue
    const g = (q: string) => fetch(`https://graph.facebook.com/v21.0/${q}${q.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`).then((x) => x.json()).catch(() => ({}))
    const base = await g(`${media}?fields=like_count,comments_count`)
    const ins = await g(`${media}/insights?metric=reach,saved,shares,views`)
    const m: Record<string, number> = { gostos: Number(base.like_count) || 0, comentarios: Number(base.comments_count) || 0 }
    for (const x of ins.data ?? []) m[x.name] = Number(x.values?.[0]?.value ?? x.total_value?.value) || 0
    const alcance = Math.max(50, m.reach || m.views || 0)
    const nota = ((m.comentarios * 6 + (m.shares || 0) * 5 + (m.saved || 0) * 4 + m.gostos) / alcance) * 100
    await db.from('reels_auto').update({ metricas: m, nota: Number(nota.toFixed(2)), metricas_em: new Date().toISOString() }).eq('id', r.id)
    n++
  }
  return n
}

/** Endereço assinado para o robô subir o vídeo direto ao storage (a rota tem tecto de 4,5 MB). */
export async function urlDeUpload(ext: 'mp4' | 'jpg'): Promise<{ signedUrl: string; publicUrl: string }> {
  const bucket = getSupabaseAdmin().storage.from('uploads')
  const caminho = `reels-auto/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
  const { data, error } = await bucket.createSignedUploadUrl(caminho)
  if (error || !data) throw new Error(error?.message ?? 'sem endereço')
  return { signedUrl: data.signedUrl, publicUrl: bucket.getPublicUrl(caminho).data.publicUrl }
}

export async function marcarErro(id: string, erro: string): Promise<void> {
  await getSupabaseAdmin().from('reels_auto').update({ estado: 'erro', erro: erro.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', id)
}

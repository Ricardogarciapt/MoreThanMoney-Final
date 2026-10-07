import { lerConfigOs, orcamentoSocialDb } from '@/lib/agentes/os/os-db'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAgentAccess } from '@/lib/agent-site-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { marcarConteudo } from '@/lib/agentes/marca-conteudo'
import {
  CHAVE_AUTO_PUBLICAR, CONTA_MARCA, HANDLE_MARCA, PALETA_CARTAO_CASA, decidirEntrada, diaLisboa, eDoSocial, eHistoria,
  lerAutoPublicar, type Contagem,
} from '@/lib/agentes/social-agente'

/**
 * OS POSTS DOS AGENTES — a porta por onde o Social (AG-SOCIAL) põe posts na fila nativa do Instagram.
 *
 * Auth: Bearer AGENT_SITE_API_KEY (motor do AIOS, painel do AIOS) ou sessão de admin (/admin/social).
 *  GET   → o botão «Auto-publicar posts dos agentes», as contagens de hoje e os últimos posts dos agentes.
 *  PATCH → { ligado: boolean } — o botão (único: o mesmo no AIOS e em /admin/social).
 *  POST  → um post: { agente_codigo, media_type IMAGE|CAROUSEL|STORIES, caption, scheduled_at?,
 *          cartao?: { hook, cta?, laminas?: string[] } (template da casa, renderizado aqui) | media_urls + paleta }.
 *          A legenda leva o ?ag= do agente; a guarda da marca e o tecto diário decidem aprovado/rascunho.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function autorizar(req: NextRequest) {
  const a = await verifyAgentAccess(req)
  return 'error' in a ? { negado: NextResponse.json({ ok: false, erro: a.error }, { status: a.status }) } : { quem: a }
}

type Db = ReturnType<typeof getSupabaseAdmin>

async function lerCfg(db: Db) {
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_AUTO_PUBLICAR).maybeSingle()
  const cfg = lerAutoPublicar(data?.value)
  // OS v2 (07/10): posts/histórias por dia DINÂMICOS (chão 2/1 sem dados; tecto duro 6/10 por conta).
  if ((await lerConfigOs(db)).ligado) {
    const o = await orcamentoSocialDb(db)
    return { ...cfg, posts_dia_conta: o.posts.valor, historias_dia_conta: o.historias.valor }
  }
  return cfg
}

/** Posts/histórias de AGENTES na fila para a conta, no dia de Lisboa de `quando`. null = não se leu. */
async function contar(db: Db, conta: string, quando: string): Promise<Contagem | null> {
  const dia = diaLisboa(quando)
  const ini = new Date(new Date(quando).getTime() - 36 * 3_600_000).toISOString()
  const fim = new Date(new Date(quando).getTime() + 36 * 3_600_000).toISOString()
  const { data, error } = await db
    .from('social_scheduled_posts')
    .select('media_type, scheduled_at, status')
    .eq('ig_account_id', conta)
    .like('created_by', 'agente:%')
    .in('status', ['approved', 'publishing', 'processing', 'published'])
    .gte('scheduled_at', ini)
    .lte('scheduled_at', fim)
  if (error) return null
  const doDia = (data ?? []).filter((r) => r.scheduled_at && diaLisboa(r.scheduled_at) === dia)
  return {
    posts: doDia.filter((r) => !eHistoria(r.media_type)).length,
    historias: doDia.filter((r) => eHistoria(r.media_type)).length,
  }
}

export async function GET(req: NextRequest) {
  const a = await autorizar(req)
  if (a.negado) return a.negado
  const db = getSupabaseAdmin()
  const cfg = await lerCfg(db)
  const agora = new Date().toISOString()
  const [hoje, recentes] = await Promise.all([
    contar(db, CONTA_MARCA, agora),
    db.from('social_scheduled_posts')
      .select('id, media_type, status, scheduled_at, agente_codigo, agente_motivo, error, permalink, created_by, created_at')
      .like('created_by', 'agente:%').order('created_at', { ascending: false }).limit(20),
  ])
  return NextResponse.json({ ok: true, chave: CHAVE_AUTO_PUBLICAR, config: cfg, hoje, recentes: recentes.data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const a = await autorizar(req)
  if (a.negado) return a.negado
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof b.ligado !== 'boolean') return NextResponse.json({ ok: false, erro: 'falta ligado: boolean' }, { status: 400 })
  const db = getSupabaseAdmin()
  const atual = await lerCfg(db)
  const valor = { ...atual, ligado: b.ligado, em: new Date().toISOString(), por: a.quem?.actor === 'admin' ? 'admin/social' : String(b.por || 'aios') }
  const { error } = await db.from('site_settings').upsert({ key: CHAVE_AUTO_PUBLICAR, value: valor, updated_at: valor.em, updated_by: valor.por }, { onConflict: 'key' })
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  // Desligar = pausar tudo o que os agentes têm aprovado e ainda não saiu: volta a rascunho.
  let pausados = 0
  if (!b.ligado) {
    const { data } = await db.from('social_scheduled_posts')
      .update({ status: 'draft', error: 'Pausado pelo dono (auto-publicar dos agentes desligado).', updated_at: valor.em })
      .like('created_by', 'agente:%').eq('status', 'approved').select('id')
    pausados = data?.length ?? 0
  }
  return NextResponse.json({ ok: true, config: lerAutoPublicar(valor), pausados })
}

export async function POST(req: NextRequest) {
  const a = await autorizar(req)
  if (a.negado) return a.negado
  const b = (await req.json().catch(() => ({}))) as Record<string, any>
  const codigo = String(b.agente_codigo ?? '').trim().toUpperCase()
  if (!eDoSocial(codigo)) return NextResponse.json({ ok: false, erro: 'Só o agente Social (AG-SOCIAL) põe posts aqui.' }, { status: 403 })
  const mediaType = String(b.media_type ?? 'IMAGE').toUpperCase()
  if (!['IMAGE', 'CAROUSEL', 'STORIES'].includes(mediaType)) return NextResponse.json({ ok: false, erro: 'media_type IMAGE|CAROUSEL|STORIES' }, { status: 400 })
  const conta = CONTA_MARCA // a conta pessoal nunca recebe automação
  const db = getSupabaseAdmin()

  // Hora: a pedida, se for futura; senão daqui a 15 min.
  const pedida = b.scheduled_at ? new Date(String(b.scheduled_at)) : null
  const quando = (pedida && !isNaN(pedida.getTime()) && pedida.getTime() > Date.now() ? pedida : new Date(Date.now() + 15 * 60_000)).toISOString()

  // A imagem: o template da casa (renderizado aqui, paleta conhecida) ou URLs do agente com a paleta declarada.
  let mediaUrls: string[] = []
  let paleta: string[] = []
  try {
    const { uploadBufferToBucket, rehostMedia } = await import('@/lib/instagram/publish')
    if (b.cartao && typeof b.cartao === 'object') {
      const { renderSocialCardBuffer, renderCarrossel } = await import('@/lib/social-card')
      const hook = String(b.cartao.hook ?? '').slice(0, 220)
      if (!hook) return NextResponse.json({ ok: false, erro: 'cartao.hook em falta' }, { status: 400 })
      if (mediaType === 'CAROUSEL') {
        const textos: string[] = (Array.isArray(b.cartao.laminas) ? b.cartao.laminas : []).map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 10)
        if (textos.length < 3) return NextResponse.json({ ok: false, erro: 'carrossel precisa de pelo menos 3 lâminas' }, { status: 400 })
        const pngs = await renderCarrossel(textos.map((texto, i) => ({
          papel: i === 0 ? 'capa' : i === textos.length - 1 ? 'fim' : 'meio', texto,
          ...(i === textos.length - 1 && b.cartao.cta ? { cta: String(b.cartao.cta) } : {}),
        })), HANDLE_MARCA)
        for (const png of pngs) mediaUrls.push(await uploadBufferToBucket(png, 'image/png', 'agentes'))
      } else {
        const png = await renderSocialCardBuffer({ hook, cta: b.cartao.cta ? String(b.cartao.cta) : '', handle: HANDLE_MARCA, proof: false, formato: mediaType === 'STORIES' ? 'reel' : 'post' })
        mediaUrls = [await uploadBufferToBucket(png, 'image/png', 'agentes')]
      }
      paleta = PALETA_CARTAO_CASA
    } else {
      const urls: string[] = (Array.isArray(b.media_urls) ? b.media_urls : []).map(String).filter((u: string) => /^https:\/\//.test(u)).slice(0, 10)
      if (!urls.length) return NextResponse.json({ ok: false, erro: 'falta cartao ou media_urls' }, { status: 400 })
      for (const u of urls) mediaUrls.push(await rehostMedia(u, { prefix: 'agentes' }))
      paleta = (Array.isArray(b.paleta) ? b.paleta : []).map(String)
    }
  } catch (e) {
    return NextResponse.json({ ok: false, erro: 'imagem: ' + (e instanceof Error ? e.message : String(e)) }, { status: 502 })
  }

  const marcada = marcarConteudo({ legenda: String(b.caption ?? '').slice(0, 2200), codigoExplicito: codigo })
  const post = { ig_account_id: conta, media_type: mediaType, caption: marcada.legenda, paleta, agente_codigo: codigo }
  const cfg = await lerCfg(db)
  const contagem = await contar(db, conta, quando)
  const d = decidirEntrada(post, cfg, contagem)
  const agora = new Date().toISOString()

  const { data, error } = await db.from('social_scheduled_posts').insert({
    channel: 'instagram', ig_account_id: conta, ig_username: HANDLE_MARCA, pillar: String(b.pillar ?? 'agente').slice(0, 60),
    media_type: mediaType, media_urls: mediaUrls, caption: marcada.legenda, scheduled_at: quando, status: d.status,
    approved_by: d.status === 'approved' ? 'auto:agentes' : null, approved_at: d.status === 'approved' ? agora : null,
    error: d.status === 'draft' ? d.motivo : null, created_by: `agente:${codigo}`,
    agente_codigo: codigo, agente_motivo: d.motivo, agente_links_marcados: marcada.marcados,
  }).select('id, status, scheduled_at').single()
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, post: data, decisao: d, media_urls: mediaUrls })
}

// Comunidade da app do Ricardo: stories de 24 h e chat entre membros.
// Ideias trazidas do chat da app MTM: respostas com citação, imagens, reações, patente ao lado do
// nome, apagar a própria mensagem e moderação pela equipa. Sem tempo real no browser: a app pede
// as novidades de poucos em poucos segundos com ?desde=, o que chega para este volume.
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/admin-api-helpers'
import { avisarAdmin } from '@/lib/primegate/verificacao'
import { db, membroDaSessao, PATENTES, patenteDe } from '@/lib/ricardogarcia/app'
import { eSuperAdmin } from '@/lib/super-admin-regras'
import { awardXp } from '@/lib/xp-service'

export const dynamic = 'force-dynamic'

const BUCKET = 'rg-app-media'
const EMOJIS = ['🔥', '💪', '👏', '😂', '❤️', '🎯']
const FUNDOS = ['ouro', 'ciano', 'carvao', 'azul']
const t = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n)
const erro = (m: string, s = 400) => NextResponse.json({ ok: false, erro: m }, { status: s })
const primeiro = (n: string) => String(n || '').trim().split(/\s+/)[0].slice(0, 20) || 'Membro'

async function guardarImagem(membroId: string, pasta: string, dataUrl: string) {
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '')
  if (!m) return { erro: 'A imagem não é válida. Usa JPG, PNG ou WebP.' }
  const buf = Buffer.from(m[3], 'base64')
  if (buf.length > 4 * 1024 * 1024) return { erro: 'A imagem é grande demais (máx. 4 MB).' }
  const caminho = `${pasta}/${membroId}/${Date.now().toString(36)}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`
  const { error } = await db().storage.from(BUCKET).upload(caminho, buf, { contentType: m[1] })
  return error ? { erro: 'Não consegui guardar a imagem. Tenta outra vez.' } : { caminho }
}

async function assinar(caminhos: (string | null | undefined)[]) {
  const l = Array.from(new Set(caminhos.filter(Boolean) as string[]))
  if (!l.length) return new Map<string, string>()
  const { data } = await db().storage.from(BUCKET).createSignedUrls(l, 3600)
  return new Map((data || []).filter(d => d.signedUrl).map(d => [d.path as string, d.signedUrl]))
}

/** Nome, patente e selo (Ricardo / Equipa) de cada autor, a partir do perfil e do XP únicos da MTM. */
async function autores(ids: string[]) {
  const u = Array.from(new Set(ids))
  if (!u.length) return new Map<string, any>()
  const [pf, xp] = await Promise.all([
    db().from('profiles').select('id, full_name, email, user_type, avatar_url').in('id', u),
    db().from('user_xp').select('user_id, total_xp').in('user_id', u),
  ])
  const x = new Map((xp.data || []).map(r => [r.user_id, r.total_xp || 0]))
  return new Map((pf.data || []).map(p => {
    const total = x.get(p.id) || 0, pat = patenteDe(total)
    const selo = eSuperAdmin(p.email) ? 'Ricardo' : p.user_type === 'admin' ? 'Equipa' : null
    return [p.id, { nome: selo === 'Ricardo' ? 'Ricardo Garcia' : primeiro(p.full_name || String(p.email || '').split('@')[0]), patente: pat, patente_nome: PATENTES[pat].nome, selo, avatar: p.avatar_url || null }]
  }))
}

const ehEquipa = (m: any) => m.user_type === 'admin' || eSuperAdmin(m.email)

async function stories(m: any) {
  const agora = new Date().toISOString()
  const { data } = await db().from('rg_app_stories').select('*').eq('oculta', false).gt('expira', agora).order('criado', { ascending: true }).limit(300)
  const l = data || []
  const [quem, urls, vistas] = await Promise.all([
    autores(l.map(s => s.membro_id)), assinar(l.map(s => s.imagem_path)),
    l.length ? db().from('rg_app_stories_vistas').select('story_id, membro_id, reacao').in('story_id', l.map(s => s.id)) : Promise.resolve({ data: [] as any[] }),
  ])
  const V = vistas.data || []
  // Agrupadas por pessoa (como no Instagram): primeiro quem tem stories por ver, depois as minhas.
  const grupos = new Map<string, any>()
  for (const s of l) {
    const a = quem.get(s.membro_id) || { nome: 'Membro', patente: 0, patente_nome: PATENTES[0].nome }
    const g = grupos.get(s.membro_id) || { membro: s.membro_id, eu: s.membro_id === m.id, ...a, itens: [] as any[] }
    const minhas = V.filter(v => v.story_id === s.id)
    g.itens.push({ id: s.id, imagem: s.imagem_path ? urls.get(s.imagem_path) || null : null, texto: s.texto, fundo: s.fundo, criado: s.criado,
      vista: minhas.some(v => v.membro_id === m.id), minha_reacao: minhas.find(v => v.membro_id === m.id)?.reacao || null,
      ...(s.membro_id === m.id ? { vistas: minhas.filter(v => v.membro_id !== m.id).length, reacoes: minhas.filter(v => v.reacao).map(v => v.reacao) } : {}) })
    grupos.set(s.membro_id, g)
  }
  const lista = Array.from(grupos.values()).map(g => ({ ...g, por_ver: g.itens.some((i: any) => !i.vista) }))
  return lista.sort((a, b) => Number(b.eu) - Number(a.eu) || Number(b.por_ver) - Number(a.por_ver) || (b.selo ? 1 : 0) - (a.selo ? 1 : 0))
}

async function mensagens(m: any, desde?: string | null) {
  let q = db().from('rg_app_chat').select('*').order('criado', { ascending: false }).limit(desde ? 100 : 60)
  if (desde && !isNaN(Date.parse(desde))) q = q.gt('criado', desde)
  const { data } = await q
  const l = (data || []).reverse()
  const citadas = l.map(x => x.resposta_a).filter(Boolean) as string[]
  const { data: cit } = citadas.length ? await db().from('rg_app_chat').select('id, membro_id, texto, imagem_path, apagado').in('id', citadas) : { data: [] as any[] }
  const [quem, urls, reac] = await Promise.all([
    autores([...l.map(x => x.membro_id), ...(cit || []).map(c => c.membro_id)]),
    assinar(l.filter(x => !x.apagado).map(x => x.imagem_path)),
    l.length ? db().from('rg_app_chat_reacoes').select('mensagem_id, membro_id, emoji').in('mensagem_id', l.map(x => x.id)) : Promise.resolve({ data: [] as any[] }),
  ])
  const citMap = new Map((cit || []).map(c => [c.id, c]))
  return l.map(x => {
    const r = (reac.data || []).filter(k => k.mensagem_id === x.id)
    const cont: Record<string, { n: number; eu: boolean }> = {}
    r.forEach(k => { cont[k.emoji] = cont[k.emoji] || { n: 0, eu: false }; cont[k.emoji].n++; if (k.membro_id === m.id) cont[k.emoji].eu = true })
    const c: any = x.resposta_a ? citMap.get(x.resposta_a) : null
    return {
      id: x.id, criado: x.criado, eu: x.membro_id === m.id, autor: quem.get(x.membro_id) || { nome: 'Membro', patente: 0, patente_nome: PATENTES[0].nome },
      apagado: x.apagado, texto: x.apagado ? null : x.texto, imagem: x.apagado || !x.imagem_path ? null : urls.get(x.imagem_path) || null,
      resposta: c ? { id: c.id, nome: quem.get(c.membro_id)?.nome || 'Membro', texto: c.apagado ? 'Mensagem apagada' : (c.texto || (c.imagem_path ? '📷 Foto' : '')).slice(0, 140) } : null,
      reacoes: Object.entries(cont).map(([emoji, v]) => ({ emoji, ...v })),
    }
  })
}

export async function GET(req: NextRequest) {
  const m = await membroDaSessao(req)
  if (!m) return erro('Sessão terminada. Entra outra vez.', 401)
  const desde = req.nextUrl.searchParams.get('desde')
  const so = req.nextUrl.searchParams.get('so')
  // Com ?desde= só vêm as mensagens novas, e as reações das últimas para actualizar contagens.
  const [st, msgs] = await Promise.all([so === 'chat' ? Promise.resolve(null) : stories(m), mensagens(m, desde)])
  return NextResponse.json({ ok: true, equipa: ehEquipa(m), emojis: EMOJIS, fundos: FUNDOS, stories: st, mensagens: msgs })
}

export async function POST(req: NextRequest) {
  const m = await membroDaSessao(req)
  if (!m) return erro('Sessão terminada. Entra outra vez.', 401)
  let b: any = {}
  try { b = await req.json() } catch {}
  const accao = String(b?.accao || '')
  const darXp = async (tipo: string, n: number, desc: string) => { try { await awardXp(db(), m.id, tipo, { amount: n, actionDescription: desc }) } catch {} }

  if (accao === 'story') {
    if (!checkRateLimit('rg-story:' + m.id, 6, 24 * 3600_000).allowed) return erro('Já publicaste 6 stories hoje. Amanhã há mais.', 429)
    const texto = t(b?.texto, 220), fundo = FUNDOS.includes(b?.fundo) ? b.fundo : 'ouro'
    let caminho: string | null = null
    if (b?.imagem) { const g = await guardarImagem(m.id, 'stories', String(b.imagem)); if (g.erro) return erro(g.erro); caminho = g.caminho! }
    if (!caminho && texto.length < 3) return erro('Escreve alguma coisa ou junta uma foto.')
    const { error } = await db().from('rg_app_stories').insert({ membro_id: m.id, imagem_path: caminho, texto: texto || null, fundo })
    if (error) return erro('Não consegui publicar. Tenta outra vez.', 500)
    await darXp('app_story', 5, 'Story publicada')
    return NextResponse.json({ ok: true, stories: await stories(m) })
  }

  if (accao === 'story_vista' || accao === 'story_reagir') {
    const id = t(b?.id, 40)
    const reacao = accao === 'story_reagir' && EMOJIS.includes(b?.emoji) ? b.emoji : undefined
    const linha: any = { story_id: id, membro_id: m.id }
    if (reacao) linha.reacao = reacao
    await db().from('rg_app_stories_vistas').upsert(linha, { onConflict: 'story_id,membro_id', ignoreDuplicates: !reacao })
    return NextResponse.json({ ok: true })
  }

  if (accao === 'story_apagar') {
    const q = db().from('rg_app_stories').update({ oculta: true }).eq('id', t(b?.id, 40))
    await (ehEquipa(m) ? q : q.eq('membro_id', m.id))
    return NextResponse.json({ ok: true, stories: await stories(m) })
  }

  if (accao === 'mensagem') {
    if (!checkRateLimit('rg-chat:' + m.id, 12, 60_000).allowed) return erro('Mais devagar. Espera um minuto.', 429)
    const texto = t(b?.texto, 1000)
    let caminho: string | null = null
    if (b?.imagem) { const g = await guardarImagem(m.id, 'chat', String(b.imagem)); if (g.erro) return erro(g.erro); caminho = g.caminho! }
    if (!texto && !caminho) return erro('Escreve uma mensagem.')
    let resposta: string | null = t(b?.resposta_a, 40) || null
    if (resposta) { const { data: r } = await db().from('rg_app_chat').select('id').eq('id', resposta).maybeSingle(); if (!r) resposta = null }
    const { error } = await db().from('rg_app_chat').insert({ membro_id: m.id, texto: texto || null, imagem_path: caminho, resposta_a: resposta })
    if (error) return erro('Não consegui enviar. Tenta outra vez.', 500)
    if (texto.length >= 15 || caminho) await darXp('app_chat', 2, 'Mensagem na comunidade')
    return NextResponse.json({ ok: true, mensagens: await mensagens(m, t(b?.desde, 40) || null) })
  }

  if (accao === 'reagir') {
    const id = t(b?.id, 40), emoji = String(b?.emoji || '')
    if (!EMOJIS.includes(emoji)) return erro('Reação inválida.')
    const { data: ja } = await db().from('rg_app_chat_reacoes').select('emoji').eq('mensagem_id', id).eq('membro_id', m.id).eq('emoji', emoji).maybeSingle()
    if (ja) await db().from('rg_app_chat_reacoes').delete().eq('mensagem_id', id).eq('membro_id', m.id).eq('emoji', emoji)
    else await db().from('rg_app_chat_reacoes').insert({ mensagem_id: id, membro_id: m.id, emoji })
    return NextResponse.json({ ok: true })
  }

  if (accao === 'apagar') {
    const q = db().from('rg_app_chat').update({ apagado: true }).eq('id', t(b?.id, 40))
    await (ehEquipa(m) ? q : q.eq('membro_id', m.id))
    return NextResponse.json({ ok: true })
  }

  if (accao === 'denunciar') {
    const alvo = b?.alvo === 'story' ? 'story' : 'mensagem', id = t(b?.id, 40)
    const tabela = alvo === 'story' ? 'rg_app_stories' : 'rg_app_chat'
    const { data: x } = await db().from(tabela).select('id, membro_id, denuncias, texto').eq('id', id).maybeSingle()
    if (!x) return erro('Já não existe.', 404)
    if (x.membro_id === m.id) return erro('Não podes denunciar o que é teu.')
    const { error } = await db().from('rg_app_denuncias').insert({ alvo, alvo_id: id, membro_id: m.id, motivo: t(b?.motivo, 200) || null })
    if (error) return erro('Já denunciaste isto. Obrigado.')
    // Com 3 denúncias sai logo do ar; a equipa revê no painel.
    const n = (x.denuncias || 0) + 1
    await db().from(tabela).update(alvo === 'story' ? { denuncias: n, ...(n >= 3 ? { oculta: true } : {}) } : { denuncias: n, ...(n >= 3 ? { apagado: true } : {}) }).eq('id', id)
    try { await avisarAdmin(db(), `🚩 Denúncia na comunidade da app (${alvo}, ${n}.ª)\n${m.nome} denunciou: «${String(x.texto || 'foto').slice(0, 200)}»${n >= 3 ? '\nSaiu do ar automaticamente.' : ''}\nRevê em morethanmoney.pt/ricardogarcia/painel`) } catch {}
    return NextResponse.json({ ok: true })
  }

  return erro('Acção desconhecida.')
}

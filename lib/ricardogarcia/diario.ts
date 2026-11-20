// App do Ricardo, fase 3: o que acontece no dia fora das missões.
// Curiosidade e quiz do dia (iguais para todos, a rodar pelo número do dia), hábitos do membro,
// presença numa aula com comprovativo, movimento (Saúde), desafios/eventos do Ricardo e rotas
// com pontos seguros. O XP vai sempre para o registo único da MTM (awardXp), com tectos diários.
import { db, hoje } from '@/lib/ricardogarcia/app'
import conteudoBase from '@/lib/ricardogarcia/conteudo-app.json'

export const XP_DIA = {
  curiosidade: 5,
  quiz_certo: 15,
  quiz_errado: 5,
  presenca_prova: 20,   // com print ou comprovativo
  presenca_sem: 10,     // sem prova: metade
  habito: 3,
  habitos_max: 6,       // hábitos que contam XP por dia
  rota_ponto: 15,
  rota_max_dia: 3,
  saude: 10,            // 5000 passos ou 20 minutos de exercício
}

export const SUGESTOES_HABITOS = [
  { nome: 'Beber 2,5 L de água', icone: '💧' },
  { nome: 'Exercício (30 min)', icone: '🏃' },
  { nome: 'Ler 10 páginas', icone: '📖' },
  { nome: 'Dormir 7 horas', icone: '😴' },
  { nome: 'Sem redes antes das 10h', icone: '📵' },
  { nome: 'Escrever 3 gratidões', icone: '🙏' },
  { nome: 'Rever o plano do dia', icone: '🗒️' },
  { nome: 'Meditar 5 minutos', icone: '🧘' },
  { nome: 'Estudar 20 minutos', icone: '🎓' },
  { nome: 'Caminhar 8000 passos', icone: '👟' },
]

export const AREAS_ROTA = [
  { id: 'trading', nome: 'Trading consciente' },
  { id: 'conteudo', nome: 'Conteúdo e faceless' },
  { id: 'ia', nome: 'IA no dia-a-dia' },
  { id: 'mindset', nome: 'Mindset' },
  { id: 'corpo', nome: 'Corpo e energia' },
  { id: 'financas', nome: 'Finanças pessoais' },
]

const numDia = (dia: string) => Math.floor(Date.parse(dia) / 86_400_000)

// Na primeira vez, o banco de conteúdo entra a partir do ficheiro do repositório.
let semeado = false
async function semear() {
  if (semeado) return
  const { count } = await db().from('rg_app_conteudo').select('id', { count: 'exact', head: true })
  if (!count) {
    const base: any = conteudoBase
    const linhas = [
      ...(base.curiosidades || []).map((c: any, k: number) => ({ tipo: 'curiosidade', categoria: c.categoria || 'geral', titulo: c.titulo, texto: c.texto, ano: Number.isInteger(c.ano) ? c.ano : null, ordem: k + 1 })),
      ...(base.quiz || []).map((q: any, k: number) => ({ tipo: 'quiz', categoria: q.categoria || 'geral', pergunta: q.pergunta, opcoes: q.opcoes, correta: q.correta, explicacao: q.explicacao, ordem: k + 1 })),
      ...(base.dicas || []).map((d: any, k: number) => ({ tipo: 'dica', categoria: d.categoria || 'mindset', titulo: d.titulo, texto: d.texto, ordem: k + 1 })),
    ]
    for (let i = 0; i < linhas.length; i += 200) {
      const { error } = await db().from('rg_app_conteudo').insert(linhas.slice(i, i + 200))
      if (error) { console.error('[app-ricardo] semear conteúdo:', error.message); return }
    }
  }
  const { count: prod } = await db().from('rg_app_missoes').select('id', { count: 'exact', head: true }).eq('tipo', 'produtividade')
  if (!prod && (conteudoBase as any).produtividade?.length) {
    await db().from('rg_app_missoes').upsert((conteudoBase as any).produtividade.map((p: any, k: number) => ({
      id: String(p.id).slice(0, 40), tipo: 'produtividade', titulo: p.titulo, resumo: p.resumo || null,
      conteudo: { texto: p.texto, acao: p.acao }, xp: 20, min_seg: 0, ordem: k + 1, activo: true,
    })), { onConflict: 'id', ignoreDuplicates: true })
  }
  semeado = true
}

/** Um item do banco (curiosidade ou quiz), o mesmo para todos no mesmo dia. */
async function doDia(tipo: 'curiosidade' | 'quiz', dia: string) {
  await semear()
  const { count } = await db().from('rg_app_conteudo').select('id', { count: 'exact', head: true }).eq('tipo', tipo).eq('activo', true)
  if (!count) return null
  // O quiz anda desfasado da curiosidade para não repetirem o mesmo tema no mesmo dia.
  const n = (numDia(dia) + (tipo === 'quiz' ? 7 : 0)) % count
  const { data } = await db().from('rg_app_conteudo').select('*').eq('tipo', tipo).eq('activo', true).order('ordem').order('id').range(n, n)
  return data?.[0] || null
}
export const curiosidadeDoDia = (dia = hoje()) => doDia('curiosidade', dia)
export const quizDoDia = (dia = hoje()) => doDia('quiz', dia)

/** Dica para um ponto da rota: da área escolhida, a rodar para o membro não repetir. */
export async function dicaPara(area: string, membroId: string) {
  await semear()
  const cat = AREAS_ROTA.some(a => a.id === area) ? area : 'mindset'
  const { data } = await db().from('rg_app_conteudo').select('id, titulo, texto, categoria').eq('tipo', 'dica').eq('categoria', cat).eq('activo', true).order('ordem').order('id')
  if (!data?.length) return null
  const { count } = await db().from('rg_app_diarios').select('id', { count: 'exact', head: true }).eq('membro_id', membroId).like('item', 'rota:%')
  return data[(count || 0) % data.length]
}

// ── Rotas: pontos seguros à volta do membro ──────────────────────────────
// Só lugares públicos onde se está fora da estrada: parques, jardins, praças, bibliotecas,
// miradouros e museus (OpenStreetMap). Sem nome não entra; com poucos pontos à volta, a zona é
// tratada como isolada e não se propõe rota.
const TIPOS_OSM: Record<string, string> = {
  'leisure=park': 'Parque', 'leisure=garden': 'Jardim', 'place=square': 'Praça',
  'amenity=library': 'Biblioteca', 'tourism=viewpoint': 'Miradouro', 'tourism=museum': 'Museu',
}
export function distanciaM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6_371_000, r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export async function pontosPerto(lat: number, lon: number, raio = 1500) {
  const filtros = Object.keys(TIPOS_OSM).map(k => { const [a, v] = k.split('='); return `nwr["${a}"="${v}"]["name"](around:${raio},${lat},${lon});` }).join('')
  const q = `[out:json][timeout:15];(${filtros});out center 60;`
  let elementos: any[] = []
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: 'data=' + encodeURIComponent(q),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'MoreThanMoney-app/1.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (r.ok) elementos = (await r.json()).elements || []
  } catch (e) { console.error('[app-ricardo] overpass:', e) }
  const pontos = elementos.map(e => {
    const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon
    const chave = Object.keys(TIPOS_OSM).find(k => { const [a, v] = k.split('='); return e.tags?.[a] === v })
    if (la == null || lo == null || !chave || e.tags?.access === 'private') return null
    return { id: `osm:${e.type}/${e.id}`, nome: String(e.tags.name).slice(0, 80), tipo: TIPOS_OSM[chave], lat: la, lon: lo, dist: Math.round(distanciaM({ lat, lon }, { lat: la, lon: lo })) }
  }).filter(Boolean) as any[]
  // Um ponto por nome (um parque grande aparece às vezes em vários bocados).
  const vistos = new Set<string>()
  const unicos = pontos.sort((a, b) => a.dist - b.dist).filter(p => { const k = p.nome.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true })
  const isolada = unicos.length < 3
  const escolhidos = isolada ? [] : unicos.slice(0, 8)
  if (escolhidos.length) await db().from('rg_app_pontos').upsert(escolhidos.map(({ dist, ...p }) => p), { onConflict: 'id' })
  return { isolada, pontos: escolhidos }
}

/** Guarda o comprovativo da presença (imagem em data URL, já reduzida no telemóvel). */
export async function guardarProva(membroId: string, dia: string, dataUrl: string) {
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '')
  if (!m) return { erro: 'A imagem não é válida. Usa JPG, PNG ou WebP.' }
  const buf = Buffer.from(m[3], 'base64')
  if (buf.length > 4 * 1024 * 1024) return { erro: 'A imagem é grande demais (máx. 4 MB).' }
  const caminho = `${membroId}/${dia}-${Date.now().toString(36)}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`
  const { error } = await db().storage.from('rg-app-provas').upload(caminho, buf, { contentType: m[1], upsert: false })
  if (error) return { erro: 'Não consegui guardar a imagem. Tenta outra vez.' }
  return { caminho }
}

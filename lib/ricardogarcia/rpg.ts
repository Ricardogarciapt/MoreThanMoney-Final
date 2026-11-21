// RPG «Operação Liberdade» da app Missão: personagem, kits, campanha a solo com dados d20,
// escape rooms rotativos (com uma fechadura em realidade aumentada) e mesas de jogo.
// Os atributos crescem com o que a pessoa faz na app (treinos, mente, rede, melhoria, quiz, desafios),
// e o nível é a patente: continua a haver um só XP. Os dados lançam-se sempre no servidor.
import { randomInt, createHash } from 'crypto'
import dados from './rpg.json'
import { db } from '@/lib/ricardogarcia/app'
import { chamarIA, chamarIAGratis, type ImagemIA } from '@/lib/ia/chamar'

export const RPG: any = dados
export type Atr = 'dis' | 'foc' | 'ene' | 'con' | 'cor' | 'red'
export const ATRS: Atr[] = ['dis', 'foc', 'ene', 'con', 'cor', 'red']
export const mod = (v: number) => Math.floor((v - 10) / 2)
export const d = (lados: number) => randomInt(1, lados + 1)
export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const classe = (id: string) => RPG.classes.find((c: any) => c.id === id)
const origem = (id: string) => RPG.origens.find((o: any) => o.id === id)
export const capitulo = (n: number) => RPG.capitulos.find((c: any) => c.n === n)

// Talentos: o de nível 1 usa-se uma vez por capítulo (repetir um teste ou +4); o de nível 4 dá +2 fixo.
const TALENTO1: Record<string, 'repetir' | 'mais4'> = { trader: 'repetir', arquitecto: 'repetir', mentor: 'repetir', criador: 'mais4', atleta: 'mais4', estratega: 'mais4' }
const TALENTO4: Record<string, Atr> = { trader: 'dis', criador: 'cor', arquitecto: 'con', atleta: 'ene', mentor: 'red', estratega: 'con' }
const PISTA_GRATIS = new Set(['trader', 'arquitecto', 'estratega'])

/** O que a pessoa já fez na app e que faz crescer os atributos. */
export async function progresso(membroId: string) {
  const [regs, diarios, evs, dms, esc] = await Promise.all([
    db().from('rg_app_registos').select('missao_id').eq('membro_id', membroId).not('concluido', 'is', null).limit(3000),
    db().from('rg_app_diarios').select('item').eq('membro_id', membroId).or('item.eq.quiz,item.eq.curiosidade,item.like.rota:%').limit(3000),
    db().from('rg_app_eventos_membros').select('evento_id', { count: 'exact', head: true }).eq('membro_id', membroId).eq('estado', 'concluido'),
    db().from('rg_app_desafios_m_adesoes').select('desafio_id', { count: 'exact', head: true }).eq('membro_id', membroId).not('concluido', 'is', null),
    db().from('rg_app_rpg_escape').select('sala_id', { count: 'exact', head: true }).eq('membro_id', membroId).not('fim', 'is', null),
  ])
  const ids = [...new Set((regs.data || []).map(r => r.missao_id))]
  const { data: tipos } = ids.length ? await db().from('rg_app_missoes').select('id, tipo').in('id', ids) : { data: [] as any[] }
  const tipo = new Map((tipos || []).map(t => [t.id, t.tipo]))
  const p = { treino: 0, mente: 0, rede: 0, melhoria: 0, saber: (diarios.data || []).length, desafios: (evs.count || 0) + (dms.count || 0), escape: esc.count || 0 }
  for (const r of regs.data || []) {
    const t = tipo.get(r.missao_id)
    if (t === 'treino') p.treino++
    else if (t === 'mindset') p.mente++
    else if (t === 'networking' || t === 'digital') p.rede++
    else if (t === 'produtividade') p.melhoria++
  }
  return p
}
export type Progresso = Awaited<ReturnType<typeof progresso>>

export function atributos(f: any, p: Progresso) {
  const c = classe(f.classe), o = origem(f.origem)
  const cresce: Record<Atr, number> = { dis: p.melhoria, foc: p.mente, ene: p.treino, con: p.saber, cor: p.desafios * 2 + p.escape * 2, red: p.rede }
  const out = {} as Record<Atr, { v: number; base: number; cresceu: number }>
  for (const a of ATRS) {
    const base = 10 + (c?.principal.includes(a) ? 2 : 0) + (o?.bonus === a ? 1 : 0)
    const cresceu = Math.min(8, Math.floor(cresce[a] / 5))
    out[a] = { v: Math.min(20, base + cresceu), base, cresceu }
  }
  return out
}

function reqOk(req: any, nivel: number, p: Progresso) {
  if (!req) return true
  return (!req.nivel || nivel >= req.nivel) && (!req.treino || p.treino >= req.treino) && (!req.rede || p.rede >= req.rede)
    && (!req.saber || p.saber >= req.saber) && (!req.escape || p.escape >= req.escape) && (!req.melhoria || p.melhoria >= req.melhoria)
}
const REQ_TXT: Record<string, (n: number) => string> = {
  nivel: n => `Nível ${n}`, treino: n => `${n} treinos`, rede: n => `${n} missões de rede`, saber: n => `${n} quiz, curiosidades ou rotas`,
  escape: n => `${n} escape room${n > 1 ? 's' : ''}`, melhoria: n => `${n} missões de melhoria`,
}
export function kits(f: any, nivel: number, p: Progresso) {
  return RPG.kits.filter((k: any) => !k.classe || k.classe === f.classe).map((k: any) => ({
    id: k.id, nome: k.nome, emoji: k.emoji, texto: k.texto, bonus: k.bonus,
    disponivel: !!k.classe || reqOk(k.req, nivel, p), equipado: (f.equipados || []).includes(k.id),
    requisito: k.req ? Object.entries(k.req).map(([t, n]) => REQ_TXT[t]?.(n as number) || '').join(' · ') : 'Kit inicial da classe',
  }))
}
export function bonusKits(f: any, nivel: number, p: Progresso) {
  const b = { dis: 0, foc: 0, ene: 0, con: 0, cor: 0, red: 0 } as Record<Atr, number>
  for (const k of kits(f, nivel, p)) if (k.equipado && k.disponivel) for (const [a, n] of Object.entries(k.bonus)) b[a as Atr] += n as number
  return b
}

/** Ficha completa para o ecrã. */
export function verFicha(f: any, nivel: number, p: Progresso) {
  const c = classe(f.classe), cap = capitulo(f.capitulo), cena = cap && f.cena ? cap.cenas[f.cena] : null
  const at = atributos(f, p), bk = bonusKits(f, nivel, p)
  return {
    nome: f.nome, classe: f.classe, origem: f.origem, nivel,
    atributos: ATRS.map(a => ({ id: a, v: at[a].v, mod: mod(at[a].v), kit: bk[a], cresceu: at[a].cresceu, talento: nivel >= 4 && TALENTO4[f.classe] === a ? 2 : 0 })),
    kits: kits(f, nivel, p), talentos: (c?.talentos || []).map((t: any) => ({ ...t, activo: nivel >= t.nivel })),
    talento_disponivel: f.talento_usado !== f.capitulo, talento_tipo: TALENTO1[f.classe],
    capitulo: f.capitulo, capitulos_feitos: f.capitulos_feitos || [],
    cena: cena ? { id: f.cena, titulo: cena.titulo, texto: cena.texto, licao: cena.licao || null, fim: !!cena.fim,
      opcoes: (cena.opcoes || []).map((o: any) => ({ t: o.t, teste: o.teste || null })) } : null,
    diario: (f.diario || []).slice(-12).reverse(), progresso: p,
  }
}

export async function lerFicha(membroId: string) {
  const { data } = await db().from('rg_app_rpg_fichas').select('*').eq('membro_id', membroId).maybeSingle()
  return data
}

/** Um teste na campanha: d20 + modificador + kits + talento contra a CD. */
export function testar(f: any, nivel: number, p: Progresso, teste: { atr: Atr; cd: number }, usarTalento: boolean) {
  const at = atributos(f, p), bk = bonusKits(f, nivel, p)
  const t4 = nivel >= 4 && TALENTO4[f.classe] === teste.atr ? 2 : 0
  const t1 = usarTalento ? TALENTO1[f.classe] : null
  const extra = t1 === 'mais4' ? 4 : 0
  let rolo = d(20), repetiu: number | null = null
  const total = (r: number) => r + mod(at[teste.atr].v) + bk[teste.atr] + t4 + extra
  if (t1 === 'repetir' && total(rolo) < teste.cd && rolo !== 20) { repetiu = rolo; rolo = d(20) }
  const tot = total(rolo)
  const ok = rolo === 20 || (rolo !== 1 && tot >= teste.cd)
  return { d20: rolo, repetiu, mod: mod(at[teste.atr].v), kit: bk[teste.atr], talento: t4 + extra, total: tot, cd: teste.cd, atr: teste.atr, ok, critico: rolo === 20, falhanco: rolo === 1 }
}

// ── Escape rooms rotativos: 4 salas activas; todos os meses entra uma nova e sai a mais antiga. ──
export function cicloAtual(agora = new Date()) { return agora.toISOString().slice(0, 7) }
export function salasActivas(agora = new Date()) {
  const k = (agora.getUTCFullYear() * 12 + agora.getUTCMonth()) - (2026 * 12 + 10)
  const n = RPG.salas.length
  return [0, 1, 2, 3].map(i => ({ sala: RPG.salas[(((k + i) % n) + n) % n], nova: i === 3, sai: i === 0 }))
}
export const salaActiva = (id: string) => salasActivas().find(s => s.sala.id === id)?.sala || null
/** Direção (graus) onde está o objeto dourado da fechadura RA, diferente para cada pessoa e mês. */
export function alvoRA(membroId: string, salaId: string, ciclo: string) {
  return parseInt(createHash('sha256').update(`${membroId}:${salaId}:${ciclo}`).digest('hex').slice(0, 6), 16) % 360
}
export function verSala(s: any, reg: any, membroId: string, ciclo: string) {
  return {
    id: s.id, titulo: s.titulo, area: s.area, emoji: s.emoji, historia: s.historia, minutos: s.minutos,
    enigmas: s.enigmas.map((e: any, i: number) => ({
      tipo: e.tipo, pergunta: e.pergunta, opcoes: e.opcoes || null, imagem: e.imagem || null, legenda: e.legenda || null,
      resolvido: (reg?.resolvidos || []).includes(i), pista: (reg?.pistas || []).includes(i) ? e.pista : null,
      ...(e.tipo === 'ra' ? { alvo: alvoRA(membroId, s.id, ciclo), codigo: s.codigo_ra } : {}),
    })),
    meu: reg ? { inicio: reg.inicio, fim: reg.fim, segundos: reg.segundos, xp: reg.xp, pistas: (reg.pistas || []).length } : null,
  }
}
export function respostaCerta(s: any, i: number, resposta: unknown) {
  const e = s.enigmas[i]
  if (!e || e.tipo === 'foto') return false
  if (e.tipo === 'ra') return norm(resposta) === norm(s.codigo_ra)
  return (e.respostas || []).some((r: string) => norm(r) === norm(resposta))
}
/**
 * Fechadura de foto: a pessoa fotografa algo do mundo real (um gráfico, a fachada de um prédio, uma montra…)
 * e a IA com visão confirma se a foto cumpre o critério. Grátis primeiro; sem fornecedor com visão, diz para
 * tentar mais tarde em vez de abrir a fechadura às cegas.
 */
export async function verificarFoto(e: any, dataUrl: unknown): Promise<{ ok: boolean; motivo: string; indisponivel?: boolean }> {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''))
  if (!m) return { ok: false, motivo: 'Não recebi a foto. Tira-a outra vez.' }
  if (m[2].length > 2_800_000) return { ok: false, motivo: 'A foto é grande demais. Tenta outra vez.' }
  const imagens: ImagemIA[] = [{ mediaType: m[1] as ImagemIA['mediaType'], dataBase64: m[2] }]
  const pedido = {
    tarefa: 'missao-escape-foto', prioridade: 'interativo' as const, json: true, maxTokens: 200, temperatura: 0, timeoutMs: 20_000, imagens,
    sistema: 'És o guardião de um escape room educativo numa app portuguesa. Verificas se a foto enviada cumpre um critério. '
      + 'Sê justo e tolerante com fotos tiradas ao telemóvel (tortas, com reflexos, de ecrãs), mas recusa fotos que não mostram o que se pede, '
      + 'imagens em branco, capturas sem relação ou fotos com pessoas em primeiro plano. Responde só JSON: {"ok": true|false, "motivo": "uma frase curta em português de Portugal, a tratar por tu"}.',
    mensagens: [{ role: 'user' as const, content: `Critério: ${e.criterio}\nA foto cumpre o critério?` }],
  }
  let texto = ''
  try { texto = (await chamarIAGratis(pedido)).texto } catch {
    try { texto = (await chamarIA(pedido)).texto } catch { return { ok: false, indisponivel: true, motivo: 'O guardião não consegue ver fotos agora. Tenta daqui a uns minutos.' } }
  }
  try {
    const j = JSON.parse(texto)
    return { ok: j.ok === true, motivo: String(j.motivo || (j.ok ? 'Foto aceite.' : 'Esta foto não mostra o que se pede.')).slice(0, 200) }
  } catch { return { ok: false, motivo: 'Não percebi a foto. Tenta com mais luz e mais perto.' } }
}

export function xpEscape(s: any, reg: any, classeId: string, nivel: number) {
  const pistas = (reg.pistas || []).length - (PISTA_GRATIS.has(classeId) && nivel >= 7 && (reg.pistas || []).length ? 1 : 0)
  const seg = Math.round((Date.now() - Date.parse(reg.inicio)) / 1000)
  const noTempo = seg <= s.minutos * 60
  return { seg, xp: noTempo ? Math.max(20, 60 - 10 * pistas) : 20, noTempo }
}

export function codigoMesa() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => A[randomInt(0, A.length)]).join('')
}

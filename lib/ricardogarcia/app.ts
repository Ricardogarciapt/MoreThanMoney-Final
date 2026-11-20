// App «Missão» do Ricardo: contas próprias (email + palavra-passe), missões diárias, patentes, moedas e recompensas.
// Economia pensada para criar hábito e alimentar leads, sem oferecer valor a quem acabou de chegar.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const COOKIE = 'rg_app'
export const PATENTES = [
  { nome: 'Recruta', xp: 0 }, { nome: 'Cadete', xp: 150 }, { nome: 'Soldado', xp: 400 }, { nome: 'Cabo', xp: 800 },
  { nome: 'Furriel', xp: 1400 }, { nome: 'Sargento', xp: 2200 }, { nome: 'Alferes', xp: 3300 }, { nome: 'Tenente', xp: 4700 },
  { nome: 'Capitão', xp: 6500 }, { nome: 'Major', xp: 8800 }, { nome: 'Coronel', xp: 11500 }, { nome: 'General', xp: 15000 },
]
// Valores por omissão; o Ricardo afina-os no painel (rg_dados → app_economia).
export const ECONOMIA_BASE = {
  xp_dia_max: 100,          // tecto de XP por dia (missões + bónus)
  bonus_dia_completo: 10,   // XP extra por fazer as 3 missões do dia
  moedas_dia_completo: 1,   // 1 moeda por dia completo
  moedas_semana: 5,         // a cada 7 dias seguidos
  moedas_patente: 5,        // ao subir de patente
  moedas_insignia: 3,       // por insígnia nova
  min_resposta: 20,         // caracteres mínimos numa reflexão ou acção
}
export type Economia = typeof ECONOMIA_BASE

export const INSIGNIAS: { id: string; nome: string; desc: string; teste: (m: any) => boolean }[] = [
  { id: 'primeiro-passo', nome: 'Primeiro passo', desc: 'Concluíste a primeira missão.', teste: m => m.xp > 0 },
  { id: 'dia-completo', nome: 'Dia completo', desc: 'Fizeste as três missões num dia.', teste: m => m.dias_ativos >= 1 && m._completo },
  { id: 'semana', nome: 'Sete dias seguidos', desc: 'Uma semana sem falhar.', teste: m => m.sequencia >= 7 },
  { id: 'quinzena', nome: 'Quinze dias seguidos', desc: 'Já é hábito.', teste: m => m.sequencia >= 15 },
  { id: 'mes', nome: 'Trinta dias seguidos', desc: 'Disciplina de verdade.', teste: m => m.sequencia >= 30 },
  { id: 'dez-dias', nome: '10 dias activos', desc: 'Dez dias com missões feitas.', teste: m => m.dias_ativos >= 10 },
  { id: 'cinquenta-dias', nome: '50 dias activos', desc: 'Cinquenta dias de constância.', teste: m => m.dias_ativos >= 50 },
  { id: 'soldado', nome: 'Soldado', desc: 'Chegaste a Soldado.', teste: m => m.patente >= 2 },
  { id: 'sargento', nome: 'Sargento', desc: 'Chegaste a Sargento.', teste: m => m.patente >= 5 },
]

export const db = () => getSupabaseAdmin()
export const hoje = () => new Date().toISOString().slice(0, 10)
export const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
export const patenteDe = (xp: number) => { let i = 0; PATENTES.forEach((p, k) => { if (xp >= p.xp) i = k }); return i }

export function hashPass(p: string) { const s = randomBytes(16); return 's1$' + s.toString('hex') + '$' + scryptSync(p, s, 32).toString('hex') }
export function confere(p: string, h: string) {
  const [, s, k] = h.split('$'); if (!s || !k) return false
  const a = scryptSync(p, Buffer.from(s, 'hex'), 32), b = Buffer.from(k, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
const sha = (t: string) => createHash('sha256').update(t).digest('hex')

export async function criarSessao(membroId: string) {
  const token = randomBytes(32).toString('base64url')
  await db().from('rg_app_sessoes').insert({ token_hash: sha(token), membro_id: membroId, expira: new Date(Date.now() + 90 * 86_400_000).toISOString() })
  return token
}
export async function membroDaSessao(req: NextRequest) {
  const t = req.cookies.get(COOKIE)?.value; if (!t) return null
  const { data: s } = await db().from('rg_app_sessoes').select('membro_id, expira').eq('token_hash', sha(t)).maybeSingle()
  if (!s || Date.parse(s.expira) < Date.now()) return null
  const { data: m } = await db().from('rg_app_membros').select('*').eq('id', s.membro_id).maybeSingle()
  return m && m.estado === 'ativo' ? m : null
}
export async function terminarSessao(req: NextRequest) {
  const t = req.cookies.get(COOKIE)?.value; if (t) await db().from('rg_app_sessoes').delete().eq('token_hash', sha(t))
}
export async function economia(): Promise<Economia> {
  const { data } = await db().from('rg_dados').select('v').eq('k', 'app_economia').maybeSingle()
  return { ...ECONOMIA_BASE, ...((data?.v as any) || {}) }
}

// Missões do dia: uma de cada tipo, a rodar pelo número do dia (igual para todos).
export async function missoesDoDia(dia = hoje()) {
  const { data } = await db().from('rg_app_missoes').select('*').eq('activo', true).order('ordem')
  const n = Math.floor(Date.parse(dia) / 86_400_000)
  return (['treino', 'mindset', 'digital'] as const).map(t => {
    const l = (data || []).filter(m => m.tipo === t); return l.length ? l[n % l.length] : null
  }).filter(Boolean) as any[]
}

// Ligação ao CRM MTM: cada membro da app entra (ou é ligado) no pipeline de vendas, e vice-versa.
export async function ligarAoCrm(m: { id: string; nome: string; email: string; telefone?: string | null }) {
  try {
    const { data: ex } = await db().from('vendas_negocios').select('id, etiquetas').ilike('email', m.email).limit(1).maybeSingle()
    let id = ex?.id as string | undefined
    if (id) {
      const et = Array.from(new Set([...(ex?.etiquetas || []), 'app-ricardo']))
      await db().from('vendas_negocios').update({ etiquetas: et, atualizado_em: new Date().toISOString() }).eq('id', id)
    } else {
      const { data: novo } = await db().from('vendas_negocios').insert({
        nome: m.nome.slice(0, 120), email: m.email, telefone: m.telefone || null, estado: 'lead', funil: 'educacao',
        origem: 'app-ricardo', chave_origem: `app-ricardo:${m.id}`, etiquetas: ['app-ricardo'], contactavel: true,
        nota: 'Entrou pela app «Missão» do Ricardo.',
      }).select('id').maybeSingle()
      id = novo?.id
    }
    if (id) await db().from('rg_app_membros').update({ negocio_id: id }).eq('id', m.id)
  } catch (e) { console.error('[app-ricardo] não ligou ao CRM:', e) }
}

// Pode resgatar? Devolve o motivo quando não pode (o servidor decide; o ecrã só mostra).
export async function podeResgatar(m: any, r: any): Promise<string | null> {
  if (!r.activo) return 'Recompensa indisponível.'
  const idade = diasEntre(String(m.criado).slice(0, 10), hoje())
  if (idade < r.min_dias_conta) return `Disponível ao fim de ${r.min_dias_conta} dias na app (vais em ${idade}).`
  if (m.dias_ativos < r.min_dias_ativos) return `Precisas de ${r.min_dias_ativos} dias activos (tens ${m.dias_ativos}).`
  if (m.patente < r.min_patente) return `Precisas da patente ${PATENTES[r.min_patente].nome}.`
  if (m.moedas < r.custo) return `Faltam ${r.custo - m.moedas} moedas.`
  const desde = new Date(Date.now() - r.cooldown_dias * 86_400_000).toISOString()
  const { count: rec } = await db().from('rg_app_resgates').select('id', { count: 'exact', head: true }).eq('membro_id', m.id).eq('recompensa_id', r.id).neq('estado', 'recusado').gte('criado', desde)
  if (rec) return `Já pediste esta recompensa. Volta a estar disponível ${r.cooldown_dias} dias depois.`
  if (r.stock_mes) {
    const mes = hoje().slice(0, 7) + '-01'
    const { count } = await db().from('rg_app_resgates').select('id', { count: 'exact', head: true }).eq('recompensa_id', r.id).neq('estado', 'recusado').gte('criado', mes)
    if ((count || 0) >= r.stock_mes) return 'Esgotada este mês. Volta no início do próximo.'
  }
  return null
}

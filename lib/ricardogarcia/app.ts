// App do Ricardo: missões diárias, moedas e recompensas, em cima do sistema que a MTM já tem.
// Uma só conta (Supabase Auth, a mesma da app-mobile), um só XP (user_xp / xp_log) e as patentes
// de lib/xp-config.ts. Aqui só vive o que é novo: a carteira (rg_app_membros, id = profiles.id),
// as missões, as insígnias e as recompensas.
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { PATENTES, patenteDe } from '@/lib/xp-config'

export { PATENTES, patenteDe }
// Valores por omissão; o Ricardo afina-os no painel (rg_dados → app_economia).
export const ECONOMIA_BASE = {
  xp_dia_max: 100,          // tecto de XP por dia nas missões (+ bónus)
  bonus_dia_completo: 10,   // XP extra por fazer as 4 missões do dia
  moedas_dia_completo: 1,   // 1 moeda por dia completo
  moedas_semana: 5,         // a cada 7 dias seguidos
  moedas_patente: 5,        // ao subir de patente (com XP de qualquer parte da MTM)
  moedas_insignia: 3,       // por insígnia nova
  min_resposta: 20,         // caracteres mínimos numa reflexão ou acção
}
export type Economia = typeof ECONOMIA_BASE

export const INSIGNIAS: { id: string; nome: string; desc: string; teste: (m: any) => boolean }[] = [
  { id: 'primeiro-passo', nome: 'Primeiro passo', desc: 'Concluíste a primeira missão.', teste: m => m.xp > 0 },
  { id: 'dia-completo', nome: 'Dia completo', desc: 'Fizeste todas as missões do dia.', teste: m => m.dias_ativos >= 1 && m._completo },
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

/** Cliente com a sessão do site (cookies sb-*): entrar aqui é entrar na app-mobile e vice-versa. */
export async function clienteSessao() {
  const jar = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (lista) => { try { lista.forEach(({ name, value, options }) => jar.set(name, value, options)) } catch {} },
    },
  })
}

/** Garante a carteira de uma conta MTM (quem já é membro entra na app sem registo novo). */
export async function carteira(userId: string, origem = 'mtm') {
  const { data } = await db().from('rg_app_membros').select('*').eq('id', userId).maybeSingle()
  if (data) return data
  const { data: nova } = await db().from('rg_app_membros').upsert({ id: userId, origem, consentimento: true }, { onConflict: 'id' }).select('*').single()
  return nova
}

/** O membro com sessão: carteira + nome/email do perfil + XP e patente do sistema da MTM. */
export async function membroDaSessao(_req?: NextRequest) {
  const sb = await clienteSessao()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const [c, perfil, xp] = await Promise.all([
    carteira(user.id),
    db().from('profiles').select('full_name, email, phone, user_type').eq('id', user.id).maybeSingle(),
    db().from('user_xp').select('total_xp').eq('user_id', user.id).maybeSingle(),
  ])
  if (!c || c.estado !== 'ativo') return null
  const total = xp.data?.total_xp ?? 0
  return { ...c, nome: perfil.data?.full_name || String(user.email || '').split('@')[0], email: perfil.data?.email || user.email,
    telefone: perfil.data?.phone || null, user_type: perfil.data?.user_type || null, xp: total, patente: patenteDe(total) }
}

export async function economia(): Promise<Economia> {
  const { data } = await db().from('rg_dados').select('v').eq('k', 'app_economia').maybeSingle()
  return { ...ECONOMIA_BASE, ...((data?.v as any) || {}) }
}

export async function somarMoedas(userId: string, n: number) {
  if (!n) return
  const { error } = await db().rpc('rg_app_somar_moedas', { p_id: userId, p_n: n })
  if (error) console.error('[app-ricardo] moedas:', error.message)
}

/** Chamado pelo xp-service quando alguém sobe de patente, venha o XP de onde vier. */
export async function aoSubirPatente(userId: string, subidas: number) {
  const eco = await economia()
  const c = await carteira(userId)
  if (!c || subidas <= 0) return
  await somarMoedas(userId, eco.moedas_patente * subidas)
}

// Missões do dia: uma de cada tipo, a rodar pelo número do dia (igual para todos).
export async function missoesDoDia(dia = hoje()) {
  const { data } = await db().from('rg_app_missoes').select('*').eq('activo', true).order('ordem')
  const n = Math.floor(Date.parse(dia) / 86_400_000)
  // Os desafios da semana (ids «semana-…», publicados no plano de 30 dias do painel) não rodam:
  // aparecem em cima, como missão extra, só entre as datas do próprio desafio.
  const rotacao = (data || []).filter(m => !String(m.id).startsWith('semana-'))
  const desafio = (data || []).find(m => String(m.id).startsWith('semana-') && (!m.conteudo?.de || m.conteudo.de <= dia) && (!m.conteudo?.ate || m.conteudo.ate >= dia))
  const diarias = (['treino', 'mindset', 'digital', 'produtividade'] as const).map(t => {
    const l = rotacao.filter(m => m.tipo === t); return l.length ? l[n % l.length] : null
  }).filter(Boolean) as any[]
  return desafio ? [{ ...desafio, desafio: true }, ...diarias] : diarias
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

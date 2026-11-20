// Plano de 39 dias da app Missão. Cada membro tem o seu dia (conta a partir de quando entrou)
// e quatro missões por dia: corpo (treino), mente (desenvolvimento pessoal), rede (networking e
// presença digital) e melhoria (produtividade e auto-melhoramento). Três fases de 13 dias; no fim,
// recomeça noutro ciclo com mais intensidade nos treinos.
import plano from './plano39.json'
import { db, diasEntre, missoesDoDia } from '@/lib/ricardogarcia/app'

export const DIAS_PLANO = 39
const P: any = plano

export function diaDoPlano(m: { plano_inicio?: string | null; criado?: string | null }, dia: string) {
  const inicio = (m.plano_inicio || String(m.criado || dia).slice(0, 10))
  const passados = Math.max(0, diasEntre(inicio, dia))
  const n = (passados % DIAS_PLANO) + 1
  const ciclo = Math.floor(passados / DIAS_PLANO) + 1
  const fase = P.fases.find((f: any) => n >= f.de && n <= f.ate) || P.fases[0]
  return { dia: n, ciclo, total: DIAS_PLANO, fase: { n: fase.n, nome: fase.nome, lema: fase.lema, de: fase.de, ate: fase.ate } }
}

/** Os ids das 4 missões do dia N do plano. */
export function idsDoDia(n: number) {
  const k = n - 1
  return { treino: P.dias.treino[k % 13], mente: P.dias.mente[k], rede: P.dias.rede[k], melhoria: P.dias.melhoria[k] }
}

/** Nota de intensidade para os treinos, conforme a fase e o ciclo. */
export function notaIntensidade(fase: number, ciclo: number) {
  const nivel = Math.min(2, fase - 1 + (ciclo - 1))
  return P.intensidade[nivel] || ''
}

export const FASES = P.fases as { n: number; nome: string; de: number; ate: number; lema: string }[]

// As missões novas do plano entram no banco uma vez por instância (não mexe nas que o Ricardo editou).
let semeado: Promise<void> | null = null
export function semearPlano() {
  return (semeado ||= (async () => {
    const ids = P.novas.map((x: any) => x.id)
    const { data } = await db().from('rg_app_missoes').select('id').in('id', ids)
    const ja = new Set((data || []).map(x => x.id))
    const falta = P.novas.filter((x: any) => !ja.has(x.id)).map((x: any, k: number) => ({
      id: x.id, tipo: x.tipo, titulo: x.titulo, resumo: x.resumo, conteudo: x.conteudo,
      xp: x.xp || 20, min_seg: x.min_seg || 0, ordem: 100 + k, activo: true,
    }))
    if (falta.length) {
      const { error } = await db().from('rg_app_missoes').upsert(falta, { onConflict: 'id', ignoreDuplicates: true })
      if (error) { semeado = null; console.error('[plano39] semear:', error.message) }
    }
  })().catch(e => { semeado = null; console.error('[plano39]', e) }))
}

/**
 * As missões de hoje para um membro: as 4 do dia dele no plano, mais o desafio da semana se houver.
 * Se uma missão do plano estiver desligada no painel, entra a da rotação geral do mesmo tipo.
 */
export async function missoesDoMembro(m: { plano_inicio?: string | null; criado?: string | null }, dia: string) {
  await semearPlano()
  const pd = diaDoPlano(m, dia)
  const ids = idsDoDia(pd.dia)
  const [{ data }, geral] = await Promise.all([
    db().from('rg_app_missoes').select('*').in('id', Object.values(ids)).eq('activo', true),
    missoesDoDia(dia),
  ])
  const porId = new Map((data || []).map(x => [x.id, x]))
  const nota = notaIntensidade(pd.fase.n, pd.ciclo)
  const tipoGeral: Record<string, string> = { treino: 'treino', mente: 'mindset', rede: 'digital', melhoria: 'produtividade' }
  const diarias = (['treino', 'mente', 'rede', 'melhoria'] as const).map(slot => {
    let x: any = porId.get(ids[slot]) || geral.find((g: any) => !g.desafio && g.tipo === tipoGeral[slot])
    if (!x) return null
    if (x.tipo === 'treino' && nota) x = { ...x, conteudo: { ...(x.conteudo || {}), nota: [x.conteudo?.nota, nota].filter(Boolean).join(' ') } }
    return { ...x, slot }
  }).filter(Boolean) as any[]
  const desafio = geral.find((g: any) => g.desafio)
  return { missoes: desafio ? [desafio, ...diarias] : diarias, plano: pd }
}

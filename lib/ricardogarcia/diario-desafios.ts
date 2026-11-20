// Diário livre e desafios criados pelos membros da app Missão.
// Diário: páginas soltas (título, texto, humor) que se juntam às respostas das missões no Diário de campo.
// Desafios: qualquer membro cria um desafio de 3, 7, 14 ou 30 dias, público ou só para si; os outros
// juntam-se, fazem check-in uma vez por dia e ganham XP. Três denúncias tiram um desafio do ar.
import { db } from '@/lib/ricardogarcia/app'

export const DIAS_DESAFIO = [3, 7, 14, 30]

/** Texto com quebras de linha preservadas (o diário é para escrever à vontade). */
export const textoLivre = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n)

export async function diarioLivre(membroId: string) {
  const { data } = await db().from('rg_app_diario_livre').select('id, dia, titulo, texto, humor, criado').eq('membro_id', membroId).order('criado', { ascending: false }).limit(40)
  return data || []
}

/** Desafios que o membro vê: os seus, aqueles em que entrou e os públicos mais recentes. */
export async function desafiosDoMembro(membroId: string, dia: string) {
  const [pub, minhas] = await Promise.all([
    db().from('rg_app_desafios_m').select('id, autor_id, titulo, descricao, dias, publico, criado').eq('publico', true).eq('oculto', false).order('criado', { ascending: false }).limit(30),
    db().from('rg_app_desafios_m_adesoes').select('desafio_id, inicio, checkins, ultimo, concluido').eq('membro_id', membroId),
  ])
  const adesao = new Map((minhas.data || []).map(a => [a.desafio_id, a]))
  const { data: meus } = await db().from('rg_app_desafios_m').select('id, autor_id, titulo, descricao, dias, publico, criado, oculto')
    .or(`autor_id.eq.${membroId}${adesao.size ? `,id.in.(${[...adesao.keys()].join(',')})` : ''}`).limit(60)
  const todos = new Map<string, any>()
  for (const d of [...(meus || []).filter(x => !x.oculto || x.autor_id === membroId), ...(pub.data || [])]) todos.set(d.id, d)
  const ids = [...todos.keys()]
  const [{ data: ades }, { data: autores }] = await Promise.all([
    ids.length ? db().from('rg_app_desafios_m_adesoes').select('desafio_id, concluido').in('desafio_id', ids) : Promise.resolve({ data: [] as any[] }),
    db().from('rg_app_membros').select('id, nome').in('id', [...new Set([...todos.values()].map(d => d.autor_id))]),
  ])
  const nome = new Map((autores || []).map(a => [a.id, String(a.nome || 'Recruta').split(/\s+/)[0]]))
  const conta = new Map<string, { n: number; fim: number }>()
  for (const a of ades || []) { const c = conta.get(a.desafio_id) || { n: 0, fim: 0 }; c.n++; if (a.concluido) c.fim++; conta.set(a.desafio_id, c) }
  return [...todos.values()].map(d => {
    const a = adesao.get(d.id)
    return {
      id: d.id, titulo: d.titulo, descricao: d.descricao, dias: d.dias, publico: d.publico, oculto: !!d.oculto,
      autor: nome.get(d.autor_id) || 'Recruta', meu: d.autor_id === membroId,
      pessoas: conta.get(d.id)?.n || 0, concluiram: conta.get(d.id)?.fim || 0,
      eu: a ? { checkins: a.checkins, hoje: a.ultimo === dia, concluido: !!a.concluido, inicio: a.inicio } : null,
    }
  }).sort((x, y) => {
    const r = (d: any) => (d.eu ? (d.eu.concluido ? 1 : 2) : 0)
    return (r(y) - r(x)) || (y.pessoas - x.pessoas)
  })
}

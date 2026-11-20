import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { db, hoje } from '@/lib/ricardogarcia/app'
import { chamarIAGratis } from '@/lib/ia/chamar'
import { blocoFramework } from '@/lib/framework-mtm'
import { regrasParaPrompt, verificarTexto } from '@/lib/conteudo-magnetico/regras'
import { corrigirPtPt } from '@/lib/pt-pt'
import { validarPedidoPV } from '@/lib/publico-virtual/regras'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Plano de 30 dias do Ricardo (separador Metas do painel). Um só sítio liga três coisas:
 *  · o conteúdo de cada dia abre no /estudio já preenchido, e o guião criado lá volta aqui
 *    (acção «ligar»), com o estado lido do próprio estúdio: guião → gravado → vídeo pronto;
 *  · o desafio de cada semana publica-se como missão na app de missões (ids «semana-…»);
 *  · as ideias de cada semana podem ir ao público virtual (MiroFish) antes de se gravarem.
 * Guardado em rg_dados.plano30. Só o super admin.
 */

type Formato = 'reel' | 'carrossel' | 'story' | 'post'
type Dia = { d: number; formato: Formato; tema: string; gancho: string; objectivo: string; accao: string; peca_id?: string | null; feito?: boolean; publicado?: boolean; accao_feita?: boolean }
type Semana = { tema: string; desafio: { titulo: string; resumo: string; tipo: 'treino' | 'mindset' | 'digital'; passos: string[] }; missao_id?: string | null; teste_id?: string | null }
type Plano = { inicio: string; objetivo: string; foco: string[]; semanas: Semana[]; dias: Dia[]; gerado_por?: string; criado: string }

const K = 'plano30'
const FORMATOS: Formato[] = ['reel', 'carrossel', 'story', 'post']
const OBJ = ['atracao', 'autoridade', 'conversao']
const TIPOS = ['treino', 'mindset', 'digital'] as const
const t = (v: unknown, n: number) => corrigirPtPt(String(v ?? '').trim()).texto.slice(0, n)
const maisDias = (iso: string, n: number) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10)

async function lerPlano(): Promise<Plano | null> {
  const { data } = await db().from('rg_dados').select('v').eq('k', K).maybeSingle()
  return (data?.v as Plano) || null
}
async function gravarPlano(p: Plano) {
  const { error } = await db().from('rg_dados').upsert({ k: K, v: p, atualizado: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

// Plano de reserva, para nunca ficar sem nada quando a IA gratuita não responde.
function planoBase(objetivo: string, foco: string[], inicio: string): Plano {
  const temas = [
    'A história: de onde vim e porque mudei',
    'Mindset: disciplina antes de motivação',
    'Ferramentas de IA que poupam horas',
    'Trading consciente: gestão de risco primeiro',
  ]
  const desafios: Semana['desafio'][] = [
    { titulo: 'Escreve a tua carta de saída', resumo: 'O que deixas para trás nos próximos 30 dias.', tipo: 'mindset', passos: ['Escreve 3 hábitos que te travam', 'Escolhe 1 para cortar esta semana', 'Diz a alguém de confiança o que vais mudar'] },
    { titulo: '7 dias de manhãs sem telemóvel', resumo: 'A primeira hora do dia é tua.', tipo: 'mindset', passos: ['Telemóvel fora do quarto', '10 minutos de movimento ao acordar', 'Escreve a prioridade do dia antes de abrir mensagens'] },
    { titulo: 'Automatiza uma tarefa com IA', resumo: 'Uma tarefa repetida, resolvida de vez.', tipo: 'digital', passos: ['Lista 3 tarefas que repetes todas as semanas', 'Escolhe uma e pede a uma IA que a faça contigo', 'Partilha quanto tempo poupaste'] },
    { titulo: 'Treino de 15 minutos, 5 dias', resumo: 'Corpo forte, cabeça clara.', tipo: 'treino', passos: ['15 minutos de circuito sem pesos', 'Regista os dias feitos', 'No 5.º dia, tenta mais uma ronda'] },
  ]
  const ganchos = ['Ninguém te conta isto sobre', 'Fiz isto durante 30 dias e', 'O erro que mais me custou foi', 'Se começasse hoje, fazia assim:', 'Para de fazer isto se queres']
  const accoes = ['Responde a todos os comentários e DMs do dia', 'Convida 3 pessoas para a app', 'Marca uma conversa com um lead quente', 'Revê os números da semana no painel', 'Grava 2 conteúdos de reserva']
  const dias: Dia[] = Array.from({ length: 30 }, (_, i) => {
    const s = Math.min(3, Math.floor(i / 7))
    return { d: i + 1, formato: FORMATOS[i % 4 === 3 ? 1 : i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2], tema: `${temas[s]} (${i + 1})`, gancho: `${ganchos[i % ganchos.length]} ${temas[s].split(':')[0].toLowerCase()}`, objectivo: OBJ[(i % 7 === 6) ? 2 : i % 2], accao: accoes[i % accoes.length] }
  })
  return { inicio, objetivo, foco, semanas: temas.map((tema, i) => ({ tema, desafio: desafios[i] })), dias, gerado_por: 'modelo-base', criado: new Date().toISOString() }
}

function limpar(j: any, base: Plano): Plano {
  const semanas: Semana[] = base.semanas.map((b, i) => {
    const s = Array.isArray(j?.semanas) ? j.semanas[i] : null
    const d = s?.desafio || {}
    const passos = (Array.isArray(d.passos) ? d.passos : []).map((x: unknown) => t(x, 140)).filter(Boolean).slice(0, 6)
    return {
      tema: t(s?.tema, 90) || b.tema,
      desafio: { titulo: t(d.titulo, 80) || b.desafio.titulo, resumo: t(d.resumo, 160) || b.desafio.resumo, tipo: (TIPOS as readonly string[]).includes(d.tipo) ? d.tipo : b.desafio.tipo, passos: passos.length >= 2 ? passos : b.desafio.passos },
    }
  })
  const dias: Dia[] = base.dias.map((b, i) => {
    const x = Array.isArray(j?.dias) ? j.dias.find((y: any) => Number(y?.d) === i + 1) || j.dias[i] : null
    const dia: Dia = {
      d: i + 1,
      formato: FORMATOS.includes(x?.formato) ? x.formato : b.formato,
      tema: t(x?.tema, 120) || b.tema,
      gancho: t(x?.gancho, 140) || b.gancho,
      objectivo: OBJ.includes(x?.objectivo) ? x.objectivo : b.objectivo,
      accao: t(x?.accao, 140) || b.accao,
    }
    // Regras da casa (promessas, nomes proibidos…): se a IA as partir, fica o texto de reserva.
    if (verificarTexto(`${dia.tema} ${dia.gancho}`).length) { dia.tema = b.tema; dia.gancho = b.gancho }
    return dia
  })
  return { ...base, semanas, dias }
}

async function gerar(objetivo: string, foco: string[], inicio: string): Promise<Plano> {
  const base = planoBase(objetivo, foco, inicio)
  const sistema = [
    'És o estratega de conteúdo e de crescimento pessoal do Ricardo Garcia (@ricardogarciapt, MoreThanMoney). Escreves em português de Portugal, com «tu».',
    'O Ricardo é ex-militar, trader e empreendedor; fala de liberdade, disciplina, mindset, IA e trading consciente. Tem uma app gratuita de missões diárias (treino sem pesos, mindset, digital) onde os seguidores sobem de patente.',
    blocoFramework('conteudo'),
    regrasParaPrompt(),
    'Responde APENAS com JSON válido.',
  ].join('\n\n')
  const pedido = [
    `Objetivo dos próximos 30 dias: ${objetivo || 'crescer a audiência e levar pessoas para a app gratuita'}.`,
    foco.length ? `Focos escolhidos: ${foco.join(', ')}.` : '',
    `Começa a ${inicio}. Cria um plano de 30 dias com 4 semanas temáticas que contam uma história contínua (semana 4 inclui os dias 22 a 30).`,
    'Cada semana tem um desafio para a comunidade da app (tipo treino, mindset ou digital) com 3 a 5 passos concretos.',
    'Cada dia tem: formato (reel, carrossel, story ou post; pelo menos 12 reels), tema concreto, gancho (até 12 palavras, dito em voz alta), objectivo (atracao, autoridade ou conversao; 1 de conversão por semana, a levar para a app ou para /agendar) e uma acção de negócio do dia para o Ricardo (curta).',
    'Nada de promessas de lucro, números inventados ou nomes de empresas.',
    'JSON: {"semanas":[{"tema":"...","desafio":{"titulo":"...","resumo":"...","tipo":"mindset","passos":["..."]}}],"dias":[{"d":1,"formato":"reel","tema":"...","gancho":"...","objectivo":"atracao","accao":"..."}]}',
  ].filter(Boolean).join('\n\n')
  try {
    const r = await chamarIAGratis({ sistema, mensagens: [{ role: 'user', content: pedido }], json: true, maxTokens: 6000, temperatura: 0.8, tarefa: 'painel-plano30', preferencia: 'qualidade', timeoutMs: 45_000 })
    const txt = r.texto
    const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1))
    return { ...limpar(j, base), gerado_por: `${r.fornecedor} · ${r.modelo}` }
  } catch {
    return base
  }
}

export async function GET(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  const p = await lerPlano()
  const desde30 = new Date(Date.now() - 30 * 864e5).toISOString()
  const [membros, novos, leads] = await Promise.all([
    db().from('rg_app_membros').select('id', { count: 'exact', head: true }),
    db().from('rg_app_membros').select('id', { count: 'exact', head: true }).gte('criado', desde30),
    db().from('vendas_negocios').select('id', { count: 'exact', head: true }).eq('origem', 'app-ricardo'),
  ])
  const app = { membros: membros.count ?? 0, novos30: novos.count ?? 0, leads: leads.count ?? 0 }
  if (!p) return NextResponse.json({ ok: true, plano: null, app, hoje: hoje() })

  // Estado de cada peça lido do estúdio: guião → gravado → vídeo pronto.
  const ids = p.dias.map(d => d.peca_id).filter(Boolean) as string[]
  const testes = p.semanas.map(s => s.teste_id).filter(Boolean) as string[]
  const missoes = p.semanas.map(s => s.missao_id).filter(Boolean) as string[]
  const [pecas, grav, rend, pv, mis] = await Promise.all([
    ids.length ? db().from('conteudo_magnetico_pecas').select('id, formato, criado_em').in('id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db().from('estudio_gravacoes').select('peca_id, estado').in('peca_id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db().from('conteudo_magnetico_renders').select('peca_id, estado, video_url').in('peca_id', ids) : Promise.resolve({ data: [] as any[] }),
    testes.length ? db().from('publico_virtual_testes').select('id, estado, motivo, relatorio, actualizado_em').in('id', testes) : Promise.resolve({ data: [] as any[] }),
    missoes.length ? db().from('rg_app_registos').select('missao_id, concluido').in('missao_id', missoes).not('concluido', 'is', null).limit(5000) : Promise.resolve({ data: [] as any[] }),
  ])
  const temPeca = new Set((pecas.data || []).map((x: any) => x.id))
  const gravado = new Set((grav.data || []).map((x: any) => x.peca_id))
  const video = new Set((rend.data || []).filter((x: any) => x.video_url).map((x: any) => x.peca_id))
  const estudio: Record<string, string> = {}
  for (const id of ids) estudio[id] = video.has(id) ? 'video' : gravado.has(id) ? 'gravado' : temPeca.has(id) ? 'guiao' : 'perdido'
  const feitasPorMissao: Record<string, number> = {}
  for (const r of (mis.data || []) as any[]) feitasPorMissao[r.missao_id] = (feitasPorMissao[r.missao_id] || 0) + 1
  const relatorios: Record<string, any> = {}
  for (const x of (pv.data || []) as any[]) {
    const rel = x.relatorio
    relatorios[x.id] = { estado: x.estado, motivo: x.motivo, resumo: typeof rel === 'string' ? rel.slice(0, 1200) : rel?.resumo || rel?.sintese || (rel ? JSON.stringify(rel).slice(0, 1200) : null), quando: x.actualizado_em }
  }
  return NextResponse.json({ ok: true, plano: p, estudio, desafios: feitasPorMissao, testes: relatorios, app, hoje: hoje() })
}

export async function POST(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  let b: any = {}
  try { b = await req.json() } catch {}
  const ok = (x: object = {}) => NextResponse.json({ ok: true, ...x })
  const falha = (e: string, s = 400) => NextResponse.json({ ok: false, erro: e }, { status: s })

  if (b?.acao === 'gerar') {
    const inicio = /^\d{4}-\d{2}-\d{2}$/.test(String(b.inicio)) ? String(b.inicio) : hoje()
    const foco = (Array.isArray(b.foco) ? b.foco : []).map((x: unknown) => t(x, 40)).filter(Boolean).slice(0, 6)
    const plano = await gerar(t(b.objetivo, 300), foco, inicio)
    // Desafios publicados de um plano anterior saem da app.
    await db().from('rg_app_missoes').update({ activo: false }).like('id', 'semana-%')
    await gravarPlano(plano)
    return ok({ plano })
  }

  const p = await lerPlano()
  if (!p) return falha('Ainda não há plano. Gera um primeiro.', 404)
  const n = Math.round(Number(b?.dia))
  const dia = p.dias.find(d => d.d === n)

  switch (b?.acao) {
    case 'ligar': { // vem do /estudio quando se cria o guião de um dia do plano
      if (!dia) return falha('Dia inválido.')
      const peca = String(b.peca_id || '')
      if (!/^[0-9a-f-]{36}$/i.test(peca)) return falha('Peça inválida.')
      dia.peca_id = peca
      await gravarPlano(p)
      return ok()
    }
    case 'marcar': {
      if (!dia) return falha('Dia inválido.')
      const campo = String(b.campo)
      if (!['publicado', 'accao_feita'].includes(campo)) return falha('Campo inválido.')
      ;(dia as any)[campo] = !!b.v
      await gravarPlano(p)
      return ok({ plano: p })
    }
    case 'editar': {
      if (!dia) return falha('Dia inválido.')
      const x = b.campos || {}
      if (x.tema != null) dia.tema = t(x.tema, 120) || dia.tema
      if (x.gancho != null) dia.gancho = t(x.gancho, 140)
      if (x.accao != null) dia.accao = t(x.accao, 140)
      if (FORMATOS.includes(x.formato)) dia.formato = x.formato
      if (OBJ.includes(x.objectivo)) dia.objectivo = x.objectivo
      await gravarPlano(p)
      return ok({ plano: p })
    }
    case 'missao_app': { // o desafio da semana entra na app como missão extra, só nessa semana
      const i = Math.round(Number(b.semana))
      const s = p.semanas[i]
      if (!s) return falha('Semana inválida.')
      const de = maisDias(p.inicio, i * 7), ate = i === 3 ? maisDias(p.inicio, 29) : maisDias(p.inicio, i * 7 + 6)
      const id = `semana-${p.inicio}-${i + 1}`
      await db().from('rg_app_missoes').update({ activo: false }).like('id', 'semana-%').neq('id', id)
      const { error } = await db().from('rg_app_missoes').upsert({
        id, tipo: s.desafio.tipo, titulo: s.desafio.titulo, resumo: s.desafio.resumo,
        conteudo: { passos: s.desafio.passos, nota: `Desafio da semana do Ricardo · ${s.tema}`, desafio: true, de, ate },
        xp: 40, min_seg: s.desafio.tipo === 'treino' ? 600 : 0, ordem: -1, activo: true,
      })
      if (error) return falha(error.message, 500)
      s.missao_id = id
      await gravarPlano(p)
      return ok({ plano: p })
    }
    case 'mirofish': { // as ideias da semana vão ao público virtual antes de se gravarem
      const i = Math.round(Number(b.semana))
      const s = p.semanas[i]
      if (!s) return falha('Semana inválida.')
      const dias = p.dias.filter(d => Math.min(3, Math.floor((d.d - 1) / 7)) === i)
      const texto = [`Semana ${i + 1} do plano de conteúdo de @ricardogarciapt: ${s.tema}.`, ...dias.map(d => `Dia ${d.d} (${d.formato}): ${d.tema}. Gancho: «${d.gancho}»`)].join('\n')
      const v = validarPedidoPV({ alvo: 'conteudo:texto', texto, pergunta: 'Que ganchos e temas desta semana te fariam parar, guardar ou comentar? Quais ignoravas? Que tema falta?', rondas: 20, pedido_por: 'painel-ricardo' })
      if (!v.ok) return falha(v.erro)
      const { data, error } = await db().from('publico_virtual_testes').insert(v.pedido).select('id').single()
      if (error) return falha(error.message, 500)
      s.teste_id = data.id
      await gravarPlano(p)
      return ok({ plano: p })
    }
    default:
      return falha('Acção desconhecida.')
  }
}

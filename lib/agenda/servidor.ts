/**
 * A AGENDA — a parte que fala com a base de dados.
 *
 * A decisão de que horas existem é pura e vive em `horas.ts`. Isto vai buscar os factos (janelas,
 * marcações, bloqueios, e o «ocupado» do Google quando estiver ligado), entrega-os à decisão, e
 * escreve o que ficou marcado.
 *
 * ═══ O QUE ACONTECE QUANDO ALGUÉM MARCA, POR ORDEM ═════════════════════════════════════════
 *
 *  1. Confirma-se que a hora ainda está livre. Não porque se confie nisso — confia-se no índice
 *     único da base — mas para a pessoa receber «essa hora acabou de ser ocupada» em vez de um erro
 *     de base de dados.
 *  2. Escreve-se a marcação. Se o índice recusar, alguém chegou primeiro: diz-se isso, em português.
 *  3. Só DEPOIS se faz o resto — negócio no pipeline, evento no Google, avisos. Por esta ordem, e
 *     sem deixar nenhum deles fazer a marcação falhar: a chamada está marcada, e uma linha de
 *     pipeline que não se escreveu resolve-se à mão; uma marcação que se perdeu porque o Google
 *     estava em baixo é uma pessoa que vai aparecer a uma chamada que nós não sabemos que existe.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { escolherAnfitriao, horasLivres, type Intervalo, type JanelaSemanal, type RegrasDoAnfitriao } from './horas'

const db = () => getSupabaseAdmin()

export interface Anfitriao {
  id: string
  nome: string
  email: string
  telefone: string | null
  fuso: string
  zoom_url: string | null
  janelas: JanelaSemanal[]
  intervalo_min: number
  antecedencia_horas: number
  horizonte_dias: number
  max_por_dia: number
  ativo: boolean
  ordem: number
  google_email: string | null
  google_calendar_id: string | null
  google_refresh_token: string | null
}

export interface TipoDeChamada {
  id: string
  slug: string
  nome: string
  descricao: string | null
  para_quem: string | null
  duracao_min: number
  local: 'whatsapp' | 'zoom' | 'meet' | 'presencial'
  perguntas: Array<{ chave: string; rotulo: string; tipo: 'texto' | 'escolha'; opcoes?: string[]; obrigatoria?: boolean }>
  pipeline_estado: string
  pack_previsto: string | null
  anfitrioes: string[]
  cor: string
  ativo: boolean
  ordem: number
}

/** O que a montra pública pode saber. Sem tokens, sem emails da equipa, sem telefones. */
export type TipoPublico = Pick<TipoDeChamada, 'slug' | 'nome' | 'descricao' | 'para_quem' | 'duracao_min' | 'local' | 'perguntas' | 'cor'>

export function tipoPublico(t: TipoDeChamada): TipoPublico {
  return {
    slug: t.slug, nome: t.nome, descricao: t.descricao, para_quem: t.para_quem,
    duracao_min: t.duracao_min, local: t.local, perguntas: t.perguntas, cor: t.cor,
  }
}

export async function tiposActivos(): Promise<TipoDeChamada[]> {
  const { data } = await db().from('agenda_tipos').select('*').eq('ativo', true).order('ordem')
  return (data ?? []) as unknown as TipoDeChamada[]
}

export async function tipoPorSlug(slug: string): Promise<TipoDeChamada | null> {
  const { data } = await db().from('agenda_tipos').select('*').eq('slug', slug).eq('ativo', true).maybeSingle()
  return (data as unknown as TipoDeChamada) ?? null
}

/** Quem pode atender este tipo. Lista vazia no tipo = qualquer anfitrião activo. */
export async function anfitrioesDoTipo(tipo: TipoDeChamada): Promise<Anfitriao[]> {
  let q = db().from('agenda_anfitrioes').select('*').eq('ativo', true)
  if (tipo.anfitrioes?.length) q = q.in('id', tipo.anfitrioes)
  const { data } = await q.order('ordem')
  return (data ?? []) as unknown as Anfitriao[]
}

function regrasDe(a: Anfitriao, tipo: TipoDeChamada): RegrasDoAnfitriao {
  return {
    fuso: a.fuso || 'Europe/Lisbon',
    janelas: Array.isArray(a.janelas) ? a.janelas : [],
    duracaoMin: tipo.duracao_min,
    intervaloMin: a.intervalo_min,
    antecedenciaHoras: a.antecedencia_horas,
    horizonteDias: a.horizonte_dias,
    maxPorDia: a.max_por_dia,
  }
}

/**
 * Tudo o que ocupa a agenda de alguém entre duas datas.
 *
 * As TRÊS origens entram na mesma lista: as nossas marcações, os bloqueios à mão e o «ocupado» do
 * Google. Para quem procura uma hora livre, a origem da ocupação não muda nada — e separá-las dava
 * três caminhos para o mesmo engano.
 *
 * Quando o Google está ligado mas não responde, as marcações e os bloqueios continuam a contar e o
 * pedido NÃO falha: uma agenda que se recusa a abrir porque uma API externa está lenta é uma
 * agenda que perde a marcação. O risco que fica (marcar por cima de um evento privado) é menor do
 * que o de não deixar marcar nada — e está dito aqui para não ser uma surpresa.
 */
export async function ocupadoDoAnfitriao(a: Anfitriao, de: Date, ate: Date): Promise<Intervalo[]> {
  const [{ data: marcadas }, { data: bloqueios }] = await Promise.all([
    db().from('agenda_marcacoes').select('inicio, fim')
      .eq('anfitriao_id', a.id).eq('estado', 'marcada')
      .gte('inicio', new Date(de.getTime() - 86_400_000).toISOString())
      .lte('inicio', ate.toISOString()),
    db().from('agenda_bloqueios').select('inicio, fim')
      .eq('anfitriao_id', a.id)
      .gte('fim', de.toISOString())
      .lte('inicio', ate.toISOString()),
  ])

  const out: Intervalo[] = []
  for (const linha of [...(marcadas ?? []), ...(bloqueios ?? [])]) {
    out.push({ inicio: new Date(String(linha.inicio)), fim: new Date(String(linha.fim)) })
  }

  if (a.google_refresh_token) {
    try {
      const { ocupadoNoGoogle } = await import('./google')
      out.push(...(await ocupadoNoGoogle(a, de, ate)))
    } catch (e) {
      console.error('[agenda] o Google não respondeu; a agenda segue com o que sabe:', e instanceof Error ? e.message : e)
    }
  }
  return out
}

export interface HorasDeUmAnfitriao {
  anfitriao: { id: string; nome: string; fuso: string }
  horas: string[]
}

/** As horas livres de cada anfitrião que atende este tipo, já em ISO. */
export async function horasDoTipo(tipo: TipoDeChamada, de: Date, ate: Date): Promise<HorasDeUmAnfitriao[]> {
  const equipa = await anfitrioesDoTipo(tipo)
  const agora = new Date()
  return Promise.all(equipa.map(async (a) => ({
    anfitriao: { id: a.id, nome: a.nome, fuso: a.fuso },
    horas: horasLivres({ regras: regrasDe(a, tipo), agora, de, ate, ocupado: await ocupadoDoAnfitriao(a, de, ate) })
      .map((d) => d.toISOString()),
  })))
}

export type ResultadoMarcacao =
  | { ok: true; id: string; token: string; inicio: string; fim: string; anfitriao: string; local: string; joinUrl: string | null }
  | { ok: false; codigo: 'hora_ocupada' | 'tipo_desconhecido' | 'sem_equipa' | 'hora_invalida' | 'falhou'; mensagem: string }

export async function marcar(p: {
  slugTipo: string
  inicioIso: string
  anfitriaoId?: string | null
  nome: string
  email: string
  telefone?: string | null
  fusoConvidado?: string | null
  respostas?: Record<string, unknown>
  utm?: Record<string, unknown>
  userId?: string | null
}): Promise<ResultadoMarcacao> {
  const tipo = await tipoPorSlug(p.slugTipo)
  if (!tipo) return { ok: false, codigo: 'tipo_desconhecido', mensagem: 'Esse tipo de chamada não existe.' }

  const inicio = new Date(p.inicioIso)
  if (!Number.isFinite(inicio.getTime())) return { ok: false, codigo: 'hora_invalida', mensagem: 'A hora escolhida não é válida.' }
  const fim = new Date(inicio.getTime() + tipo.duracao_min * 60_000)

  const equipa = await anfitrioesDoTipo(tipo)
  if (!equipa.length) return { ok: false, codigo: 'sem_equipa', mensagem: 'Não há ninguém disponível para este assunto. Escreve-nos e marcamos à mão.' }

  // Quem atende: o que o convidado escolheu, ou quem tiver menos marcado.
  let anfitriao: Anfitriao | null = p.anfitriaoId ? equipa.find((a) => a.id === p.anfitriaoId) ?? null : null
  if (!anfitriao) {
    const contagem = new Map<string, number>()
    const { data } = await db().from('agenda_marcacoes')
      .select('anfitriao_id').eq('estado', 'marcada').gte('inicio', new Date().toISOString())
    for (const linha of data ?? []) {
      const id = String(linha.anfitriao_id)
      contagem.set(id, (contagem.get(id) ?? 0) + 1)
    }
    anfitriao = escolherAnfitriao(equipa, contagem)
  }
  if (!anfitriao) return { ok: false, codigo: 'sem_equipa', mensagem: 'Não há ninguém disponível para este assunto.' }

  /**
   * A HORA AINDA ESTÁ LIVRE? Esta verificação não é a garantia — a garantia é o índice único da
   * base, logo a seguir. É para a pessoa receber uma frase em português em vez de um erro de
   * violação de restrição, e para apanhar o caso comum: um separador aberto há vinte minutos com
   * uma lista de horas que entretanto encolheu.
   */
  const livres = horasLivres({
    regras: regrasDe(anfitriao, tipo),
    agora: new Date(),
    de: new Date(inicio.getTime() - 60_000),
    ate: new Date(inicio.getTime() + 60_000),
    ocupado: await ocupadoDoAnfitriao(anfitriao, new Date(inicio.getTime() - 86_400_000), new Date(inicio.getTime() + 86_400_000)),
  })
  if (!livres.some((d) => d.getTime() === inicio.getTime())) {
    return { ok: false, codigo: 'hora_ocupada', mensagem: 'Essa hora deixou de estar livre. Escolhe outra, por favor.' }
  }

  const joinUrl = tipo.local === 'zoom' ? anfitriao.zoom_url ?? null : null

  const { data: criada, error } = await db().from('agenda_marcacoes').insert({
    tipo_id: tipo.id,
    anfitriao_id: anfitriao.id,
    user_id: p.userId ?? null,
    nome: p.nome.slice(0, 160),
    email: p.email.toLowerCase().slice(0, 200),
    telefone: p.telefone?.slice(0, 40) ?? null,
    fuso_convidado: p.fusoConvidado?.slice(0, 64) ?? null,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    local: tipo.local,
    join_url: joinUrl,
    respostas: p.respostas ?? {},
    utm: p.utm ?? {},
  }).select('id, token').maybeSingle()

  if (error) {
    // 23505 = o índice único. Significa exactamente uma coisa: alguém chegou primeiro.
    if (String((error as { code?: string }).code) === '23505') {
      return { ok: false, codigo: 'hora_ocupada', mensagem: 'Essa hora acabou de ser ocupada. Escolhe outra, por favor.' }
    }
    console.error('[agenda] a marcação não foi escrita:', error.message)
    return { ok: false, codigo: 'falhou', mensagem: 'Não foi possível marcar. Tenta outra vez.' }
  }

  const id = String(criada?.id)
  const token = String(criada?.token)

  // ── Daqui para baixo, NADA pode fazer a marcação falhar. Ela já existe. ──
  await Promise.allSettled([
    ligarAoPipeline({ id, tipo, nome: p.nome, email: p.email, telefone: p.telefone ?? null, inicio, utm: p.utm ?? {} }),
    escreverNoGoogle({ id, anfitriao, tipo, inicio, fim, nome: p.nome, email: p.email, telefone: p.telefone ?? null }),
  ])

  return {
    ok: true, id, token,
    inicio: inicio.toISOString(), fim: fim.toISOString(),
    anfitriao: anfitriao.nome, local: tipo.local, joinUrl,
  }
}

/**
 * A MARCAÇÃO ENTRA NO PIPELINE. É isto que faltava ao Calendly e que fazia as chamadas não valerem
 * nada no dia seguinte: alguém marcava, aparecia, e não havia linha nenhuma para trabalhar a seguir.
 *
 * Não se sobrepõe a um negócio que já exista para aquele email — pode estar a ser trabalhado por
 * alguém da equipa, e um negócio novo por cima dividia a mesma pessoa em dois.
 */
async function ligarAoPipeline(p: {
  id: string
  tipo: TipoDeChamada
  nome: string
  email: string
  telefone: string | null
  inicio: Date
  utm: Record<string, unknown>
}): Promise<void> {
  try {
    const email = p.email.toLowerCase()
    const { data: existente } = await db().from('vendas_negocios').select('id').ilike('email', email).limit(1).maybeSingle()

    if (existente?.id) {
      await db().from('agenda_marcacoes').update({ negocio_id: existente.id }).eq('id', p.id)
      await db().from('vendas_negocios').update({
        nota: `Marcou «${p.tipo.nome}» para ${p.inicio.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
        atualizado_em: new Date().toISOString(),
      }).eq('id', existente.id)
      return
    }

    const { data: novo } = await db().from('vendas_negocios').insert({
      nome: p.nome.slice(0, 120),
      email,
      telefone: p.telefone,
      estado: p.tipo.pipeline_estado,
      pack_previsto: p.tipo.pack_previsto,
      origem: 'agenda',
      chave_origem: `agenda:${p.id}`,
      nota: `Marcou «${p.tipo.nome}» para ${p.inicio.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    }).select('id').maybeSingle()

    if (novo?.id) await db().from('agenda_marcacoes').update({ negocio_id: novo.id }).eq('id', p.id)
  } catch (e) {
    console.error('[agenda] a marcação não entrou no pipeline (a chamada está marcada na mesma):', e)
  }
}

async function escreverNoGoogle(p: {
  id: string
  anfitriao: Anfitriao
  tipo: TipoDeChamada
  inicio: Date
  fim: Date
  nome: string
  email: string
  telefone: string | null
}): Promise<void> {
  if (!p.anfitriao.google_refresh_token) return
  try {
    const { criarEventoNoGoogle } = await import('./google')
    const r = await criarEventoNoGoogle(p)
    if (r?.eventId) {
      await db().from('agenda_marcacoes')
        .update({ google_event_id: r.eventId, ...(r.meetUrl ? { join_url: r.meetUrl } : {}) })
        .eq('id', p.id)
    }
  } catch (e) {
    console.error('[agenda] o evento não foi criado no Google (a chamada está marcada na mesma):', e)
  }
}

/** Cancelar pelo link que o convidado recebeu. O token é a única prova que ele tem — e chega. */
export async function cancelarPorToken(token: string, motivo?: string | null): Promise<{ ok: boolean; mensagem: string }> {
  const { data: m } = await db().from('agenda_marcacoes')
    .select('id, estado, anfitriao_id, google_event_id')
    .eq('token', token).maybeSingle()
  if (!m) return { ok: false, mensagem: 'Não encontrámos essa marcação.' }
  if (m.estado === 'cancelada') return { ok: true, mensagem: 'Essa chamada já estava cancelada.' }

  const { error } = await db().from('agenda_marcacoes').update({
    estado: 'cancelada',
    cancelada_em: new Date().toISOString(),
    cancel_motivo: (motivo ?? '').slice(0, 400) || null,
    updated_at: new Date().toISOString(),
  }).eq('id', m.id)
  if (error) return { ok: false, mensagem: 'Não foi possível cancelar. Tenta outra vez.' }

  if (m.google_event_id) {
    try {
      const { apagarEventoNoGoogle } = await import('./google')
      const { data: a } = await db().from('agenda_anfitrioes').select('*').eq('id', m.anfitriao_id).maybeSingle()
      if (a) await apagarEventoNoGoogle(a as unknown as Anfitriao, String(m.google_event_id))
    } catch (e) {
      console.error('[agenda] o evento ficou no Google depois de cancelado:', e)
    }
  }
  return { ok: true, mensagem: 'Chamada cancelada. Podes marcar outra quando quiseres.' }
}

/** Um ficheiro .ics — o que faz a chamada entrar na agenda DE QUEM MARCOU, seja ela qual for. */
export function ics(p: {
  id: string
  titulo: string
  descricao: string
  inicio: Date
  fim: Date
  organizador: string
  local: string
}): string {
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  // As quebras de linha de um .ics são CRLF, e o texto tem de ter as vírgulas escapadas: um ics
  // mal formado não dá erro — simplesmente não abre, e a pessoa fica sem o lembrete.
  const esc = (t: string) => t.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MoreThanMoney//Agenda//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${p.id}@morethanmoney.pt`,
    `DTSTAMP:${z(new Date())}`,
    `DTSTART:${z(p.inicio)}`,
    `DTEND:${z(p.fim)}`,
    `SUMMARY:${esc(p.titulo)}`,
    `DESCRIPTION:${esc(p.descricao)}`,
    `LOCATION:${esc(p.local)}`,
    `ORGANIZER;CN=${esc(p.organizador)}:mailto:geral@morethanmoney.pt`,
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

export type { SupabaseClient }

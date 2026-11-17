/**
 * AS AULAS AO VIVO NAS AGENDAS GOOGLE — a parte pura (sem rede, sem base de dados).
 *
 * Pedido do Ricardo, 17/11/2026: «as aulas que eu dou contam como ocupado; as dos outros
 * educadores ficam na agenda mas livres, com o nome de quem dá». E: «a agenda da MoreThanMoney
 * sincronizada automaticamente com a minha; se for feita alguma alteração, é refletida nas duas».
 *
 * A FONTE é o horário do site (lms_stream_schedules + aulas avulsas em lms_streams), o mesmo que a
 * app mostra aos alunos. O Google é um espelho: o cron `agenda-aulas-google` lê o horário, decide
 * aqui o que cada agenda devia ter, e acerta a diferença. Mudar uma aula no site muda-a nas duas
 * agendas na corrida seguinte. Mudar à mão no Google não sobe para o site (seria a agenda a mandar
 * nas aulas que os alunos veem) e é desfeito na corrida seguinte.
 *
 * QUEM FICA OCUPADO não está escrito aqui com nomes. Cada anfitrião da agenda (agenda_anfitrioes)
 * pode ter um `lms_educador_id`: as aulas desse educador vão para a agenda dessa pessoa como
 * ocupado. Hoje é o Ricardo; amanhã a Mentoria VIP pode passar para outra pessoa e basta mudar o
 * educador da sala. Na agenda da MTM (a da equipa) entram TODAS as aulas, e só as de educadores
 * que são anfitriões contam como ocupado.
 */

export const ORIGEM = 'aulas'

/** Uma ocorrência concreta de uma aula, já projetada no tempo. */
export interface AulaConcreta {
  /** `${streamId}:${inicio ISO}` — a chave que liga a aula ao evento do Google. */
  chave: string
  titulo: string
  educadorId: string | null
  educadorNome: string | null
  inicio: Date
  duracaoMin: number
  /** access_tier do slot ou da sala: free, all, app_member, premium, vip… */
  tier: string | null
}

/** O que um evento do Google devia ser. Só os campos que a sincronização gere. */
export interface EventoDesejado {
  chave: string
  summary: string
  description: string
  inicio: string
  fim: string
  /** opaque = ocupado; transparent = livre. */
  transparency: 'opaque' | 'transparent'
}

/** Um evento que já está no Google e que foi a sincronização que lá pôs. */
export interface EventoExistente {
  id: string
  chave: string
  summary: string
  description: string
  inicio: string
  fim: string
  transparency: 'opaque' | 'transparent'
}

const ROTULO_TIER: Record<string, string> = {
  free: 'Todos',
  all: 'Todos',
  app_member: 'Membro €35+',
  member: 'Membro €35+',
  premium: 'Premium €65',
  vip: 'VIP',
}

export function rotuloDoTier(tier: string | null | undefined): string {
  if (!tier) return 'Todos'
  return ROTULO_TIER[tier] ?? tier
}

/**
 * «🔴 [MTM · Ruben Pereira] Império Cripto (Membro €35+)».
 * Educadores colectivos já se chamam «MTM …» (ex.: «MTM Mindset & Liderança»): não se repete o MTM.
 */
export function tituloDoEvento(a: Pick<AulaConcreta, 'titulo' | 'educadorNome' | 'tier'>): string {
  const nome = (a.educadorNome ?? '').trim()
  const quem = !nome ? 'MTM' : /^MTM\b/i.test(nome) ? nome : `MTM · ${nome}`
  return `🔴 [${quem}] ${a.titulo.trim() || 'Aula ao vivo'} (${rotuloDoTier(a.tier)})`
}

/**
 * O evento que a aula devia ser numa agenda.
 * `ocupado` decide-se fora: é ocupado na agenda de quem dá a aula, ou na da MTM se quem dá for um
 * anfitrião (alguém da casa cujo tempo conta).
 */
export function eventoDaAula(a: AulaConcreta, ocupado: boolean): EventoDesejado {
  const fim = new Date(a.inicio.getTime() + Math.max(15, a.duracaoMin || 60) * 60_000)
  return {
    chave: a.chave,
    summary: tituloDoEvento(a),
    description: [
      a.educadorNome ? `Educador: ${a.educadorNome}` : 'Educador: MTM',
      `Acesso: ${rotuloDoTier(a.tier)}`,
      'Sessão ao vivo MoreThanMoney — abre a app: https://www.morethanmoney.pt/app-mobile',
      'Sincronizado do horário do site. Para mudar, muda a aula no site (o Google é só espelho).',
    ].join('\n'),
    inicio: a.inicio.toISOString(),
    fim: fim.toISOString(),
    transparency: ocupado ? 'opaque' : 'transparent',
  }
}

/** Instantes comparam-se como instantes: o Google devolve «…+00:00» e nós guardamos «…Z». */
const mesmoInstante = (x: string, y: string) => new Date(x).getTime() === new Date(y).getTime()

export interface PlanoDeSincronizacao {
  criar: EventoDesejado[]
  actualizar: Array<{ id: string; evento: EventoDesejado }>
  apagar: string[]
}

/**
 * A diferença entre o que a agenda devia ter e o que tem. Pura, para se poder testar.
 *
 * `existentes` são SÓ os eventos marcados com a nossa origem: um evento que alguém criou à mão
 * nunca entra aqui e nunca é apagado. Duplicados da mesma chave (uma corrida que caiu a meio)
 * ficam um e os outros saem.
 */
export function planear(desejados: EventoDesejado[], existentes: EventoExistente[]): PlanoDeSincronizacao {
  const plano: PlanoDeSincronizacao = { criar: [], actualizar: [], apagar: [] }
  const porChave = new Map<string, EventoExistente>()
  for (const e of existentes) {
    if (porChave.has(e.chave)) plano.apagar.push(e.id)
    else porChave.set(e.chave, e)
  }
  const vistos = new Set<string>()
  for (const d of desejados) {
    if (vistos.has(d.chave)) continue
    vistos.add(d.chave)
    const e = porChave.get(d.chave)
    if (!e) {
      plano.criar.push(d)
      continue
    }
    const igual =
      e.summary === d.summary &&
      e.description === d.description &&
      e.transparency === d.transparency &&
      mesmoInstante(e.inicio, d.inicio) &&
      mesmoInstante(e.fim, d.fim)
    if (!igual) plano.actualizar.push({ id: e.id, evento: d })
  }
  for (const [chave, e] of porChave) if (!vistos.has(chave)) plano.apagar.push(e.id)
  return plano
}

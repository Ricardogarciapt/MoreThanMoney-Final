/**
 * AS 7 FASES DO FUNIL E OS 5 PAPÉIS (21/11/2026, pedido do Ricardo).
 *
 *   Prospeção → Qualificação → Convite → Apresentação → Edificação → Fecho → Onboarding
 *   prospector    setter        setter     closer         closer       closer   onboarder
 *
 * E à parte, o RECRUTADOR: traz parceiros e educadores (marketplace, mentor IA com a marca deles).
 * Nunca linguagem de rede/MLM: é uma parceria de negócio, com contrato e produto.
 *
 * Não há coluna nova: a fase lê-se do `estado` que o CRM já tem (lead, contactado, qualificado,
 * marcado, apresentado, no_show, ganho, perdido) mais duas etiquetas:
 *   · `edificado`     — depois da apresentação, já recebeu a prova (como se mede, origem dos pips);
 *                       o negócio passa de Edificação para Fecho;
 *   · `onboarding_ok` — o ganho já fez o onboarding; sai do funil (fica «Cliente»).
 * E `recruta` marca quem entra na via do recrutador.
 *
 * Tudo puro: provado em `funil-fases.check.ts`.
 */
import type { Funil } from '@/lib/backoffice-funis'

export const FASES = ['prospecao', 'qualificacao', 'convite', 'apresentacao', 'edificacao', 'fecho', 'onboarding'] as const
export type Fase = (typeof FASES)[number]

export const FASE_NOME: Record<Fase, string> = {
  prospecao: 'Prospeção',
  qualificacao: 'Qualificação',
  convite: 'Convite',
  apresentacao: 'Apresentação',
  edificacao: 'Edificação',
  fecho: 'Fecho',
  onboarding: 'Onboarding',
}

export const PAPEIS_FUNIL = ['prospector', 'setter', 'closer', 'onboarder', 'recrutador'] as const
export type PapelFunil = (typeof PAPEIS_FUNIL)[number]

export const PAPEL_FUNIL_NOME: Record<PapelFunil, string> = {
  prospector: 'Prospector',
  setter: 'Setter',
  closer: 'Closer',
  onboarder: 'Onboarder',
  recrutador: 'Recrutador',
}

export const PAPEL_DA_FASE: Record<Fase, PapelFunil> = {
  prospecao: 'prospector',
  qualificacao: 'setter',
  convite: 'setter',
  apresentacao: 'closer',
  edificacao: 'closer',
  fecho: 'closer',
  onboarding: 'onboarder',
}

/** O que o papel faz nessa fase — uma frase, para o painel e para quem pega no trabalho. */
export const FASE_ACCAO: Record<Fase, string> = {
  prospecao: 'Abrir conversa com quem chegou (comentário, formulário, Telegram, anúncio).',
  qualificacao: 'Perceber objectivo, obstáculo e timing. Decide o funil.',
  convite: 'Convidar para ver a apresentação ou marcar conversa em /agendar.',
  apresentacao: 'Mostrar o caminho certo para a pessoa (corretora, membro, Funded ou B2B).',
  edificacao: 'Dar a prova: como se mede, pips com origem, quem já fez. Sem promessas de lucro.',
  fecho: 'Pedir decisão sem pressão. Até 65 €/mês e anuais fecha o agente; acima sobe ao Ricardo.',
  onboarding: 'Conta, app, corretora, sinais e chamada de boas-vindas em /onboarding/mtm.',
}

export const ETQ_EDIFICADO = 'edificado'
export const ETQ_ONBOARDING_OK = 'onboarding_ok'
export const ETQ_RECRUTA = 'recruta'
/** Candidato à equipa comercial (formulário /work): recebe a proposta de função, não a de educador. */
export const ETQ_CANDIDATO_EQUIPA = 'candidato_equipa'

/**
 * A fase de um negócio. `null` = fora do funil (perdido, ou cliente com onboarding feito).
 * No-show volta a ser trabalho do setter: é Convite outra vez.
 */
export function faseDoNegocio(estado: string, etiquetas: readonly string[] | null | undefined): Fase | null {
  const etq = etiquetas ?? []
  switch (estado) {
    case 'lead':
      return 'prospecao'
    case 'contactado':
      return 'qualificacao'
    case 'qualificado':
    case 'no_show':
      return 'convite'
    case 'marcado':
      return 'apresentacao'
    case 'apresentado':
      return etq.includes(ETQ_EDIFICADO) ? 'fecho' : 'edificacao'
    case 'ganho':
      return etq.includes(ETQ_ONBOARDING_OK) ? null : 'onboarding'
    default:
      return null
  }
}

export type SinaisNegocio = {
  origem: string | null
  interesse: string | null
  broker_uid: string | null
  etiquetas: readonly string[] | null
}

const RE_RECRUTA = /educador|educator|parceir|partner|afiliad|affiliate|criador|creator|mentor de|infoprodut/i

/** Quem vem para ser parceiro/educador entra na via do recrutador. Só sinais explícitos. */
export function ehRecruta(s: SinaisNegocio): boolean {
  const etq = s.etiquetas ?? []
  if (etq.includes(ETQ_RECRUTA)) return true
  if (etq.some((e) => /^form:.*educator/i.test(e))) return true
  return RE_RECRUTA.test(s.interesse ?? '')
}

/**
 * O funil a partir de sinais EXPLÍCITOS (o catálogo diz: não se deduz por palpite).
 * Devolve `null` quando nada é claro — a qualificação do setter é que decide.
 */
export function classificarFunil(s: SinaisNegocio): Funil | null {
  const i = (s.interesse ?? '').toLowerCase()
  if (ehRecruta(s)) return 'b2b'
  if (s.broker_uid) return 'corretora'
  if (s.origem === 'corretora') return 'corretora'
  if (/corretora|pu ?prime|broker|abrir conta|conta real|\bib\b/.test(i)) return 'corretora'
  if (/funded|capital|sem dinheiro|patroc/.test(i)) return 'funded'
  if (/neg[oó]cio|empresa|solu[cç][oõ]es|b2b|loja|restaurante|gin[aá]sio/.test(i)) return 'b2b'
  if (/curso|aprender|forma[cç][aã]o|membro|premium|bootcamp|academia/.test(i)) return 'educacao'
  return null
}

export type LinhaFunil = {
  estado: string
  funil: string | null
  origem: string | null
  interesse: string | null
  broker_uid: string | null
  etiquetas: string[] | null
  criado_em: string
  fechado_em: string | null
}

export type ResumoFases = {
  fases: Array<{ fase: Fase; nome: string; papel: PapelFunil; total: number; novos7d: number; porFunil: Record<string, number> }>
  papeis: Array<{ papel: PapelFunil; nome: string; total: number }>
  recrutas: number
  clientes: number
  perdidos: number
  ganhos7d: number
  entradas7d: number
  conversao: number | null
}

/** Agrega as linhas do CRM em fases, papéis e conversão. Os importados WhatsApp ficam de fora. */
export function resumirFases(linhas: readonly LinhaFunil[], agora = Date.now()): ResumoFases {
  const h7 = agora - 7 * 86_400_000
  const porFase = new Map<Fase, { total: number; novos7d: number; porFunil: Record<string, number> }>()
  for (const f of FASES) porFase.set(f, { total: 0, novos7d: 0, porFunil: {} })
  let recrutas = 0, clientes = 0, perdidos = 0, ganhos7d = 0, entradas7d = 0, ganhosTotal = 0
  for (const l of linhas) {
    if (l.origem === 'whatsapp_import') continue
    const novo = Date.parse(l.criado_em) >= h7
    if (novo) entradas7d++
    if (l.estado === 'ganho') {
      ganhosTotal++
      if (l.fechado_em && Date.parse(l.fechado_em) >= h7) ganhos7d++
    }
    if (l.estado === 'perdido') perdidos++
    if (ehRecruta(l)) recrutas++
    const fase = faseDoNegocio(l.estado, l.etiquetas)
    if (!fase) {
      if (l.estado === 'ganho') clientes++
      continue
    }
    const c = porFase.get(fase)!
    c.total++
    if (novo) c.novos7d++
    const k = l.funil ?? 'sem'
    c.porFunil[k] = (c.porFunil[k] ?? 0) + 1
  }
  const fases = FASES.map((f) => ({ fase: f, nome: FASE_NOME[f], papel: PAPEL_DA_FASE[f], ...porFase.get(f)! }))
  const papeis = PAPEIS_FUNIL.map((p) => ({
    papel: p,
    nome: PAPEL_FUNIL_NOME[p],
    total: p === 'recrutador' ? recrutas : fases.filter((f) => f.papel === p).reduce((a, f) => a + f.total, 0),
  }))
  const base = linhas.filter((l) => l.origem !== 'whatsapp_import').length
  return {
    fases,
    papeis,
    recrutas,
    clientes,
    perdidos,
    ganhos7d,
    entradas7d,
    conversao: base > 0 ? Math.round((ganhosTotal / base) * 1000) / 10 : null,
  }
}

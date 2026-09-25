/**
 * O VOCABULÁRIO das páginas do backoffice — puro, sem base de dados e sem `next/*`.
 *
 * PORQUÊ EXISTE
 * As quatro páginas (extracto, pipeline, tarefas, equipa) fazem as mesmas três perguntas:
 * «como se chama este estado em português?», «isto está atrasado?» e «quanto é isto em euros?».
 * Se cada página respondesse por si, o dia em que o estado `no_show` mudasse de nome mudava em
 * três sítios e ficava esquecido no quarto — e uma tarefa que uma página diz atrasada e outra diz
 * em prazo é pior do que não ter etiqueta nenhuma.
 *
 * Ser PURO é deliberado: «esta tarefa está atrasada» e «este valor é negativo porque foi devolvido»
 * são regras que se provam num `npx tsx` de dois segundos (`lib/backoffice-vista.check.ts`), sem
 * sessão, sem rede e sem base semeada.
 */

// ═══════════════════════ PIPELINE ═══════════════════════
//
// A ordem é a do avanço real do negócio e não alfabética: a página desenha as colunas por esta
// lista, por isso a ordem AQUI é a ordem no ecrã. `no_show` vive entre «marcado» e «apresentado»
// porque é exactamente onde acontece — a reunião estava marcada e a pessoa não apareceu.

export const ESTADOS_PIPELINE = [
  'lead',
  'contactado',
  'qualificado',
  'marcado',
  'no_show',
  'apresentado',
  'ganho',
  'perdido',
] as const
export type EstadoPipeline = (typeof ESTADOS_PIPELINE)[number]

export function ehEstadoPipeline(valor: unknown): valor is EstadoPipeline {
  return typeof valor === 'string' && (ESTADOS_PIPELINE as readonly string[]).includes(valor)
}

export const ESTADO_PIPELINE_NOME: Record<EstadoPipeline, string> = {
  lead: 'Lead',
  contactado: 'Contactado',
  qualificado: 'Qualificado',
  marcado: 'Reunião marcada',
  no_show: 'Não apareceu',
  apresentado: 'Apresentado',
  ganho: 'Ganho',
  perdido: 'Perdido',
}

/**
 * Os estados em que o negócio já não anda. Serve para a página os mostrar à parte: um pipeline
 * que conta os perdidos junto com os vivos diz à pessoa que tem trabalho onde não tem.
 *
 * `ganho` é fechado no pipeline mas NÃO significa que entrou dinheiro — isso é `vendas_vendas`.
 */
export function ehEstadoFechado(estado: EstadoPipeline): boolean {
  return estado === 'ganho' || estado === 'perdido'
}

// ═══════════════════════ COMISSÕES ═══════════════════════
//
// O MLM fala inglês desde 2024 e o livro da equipa fala português. Quem soma já normaliza
// (`lib/vendas/extracto.ts`); quem MOSTRA precisa do mesmo mapa, senão a mesma linha aparece
// «paid» no extracto e «paga» no resumo.

export type EstadoComissao = 'pendente' | 'aprovada' | 'paga' | 'cancelada' | 'estornada' | 'outro'

export function estadoComissao(estado: string): EstadoComissao {
  switch (estado) {
    case 'pending':
    case 'pendente':
      return 'pendente'
    case 'approved':
    case 'aprovada':
      return 'aprovada'
    case 'paid':
    case 'paga':
      return 'paga'
    case 'cancelled':
    case 'cancelada':
      return 'cancelada'
    case 'estornada':
      return 'estornada'
    default:
      return 'outro'
  }
}

export const ESTADO_COMISSAO_NOME: Record<EstadoComissao, string> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  paga: 'Paga',
  cancelada: 'Cancelada',
  estornada: 'Devolvida',
  outro: 'Sem estado',
}

/**
 * A ORIGEM de cada linha, dita a quem a lê. «papel» e «mlm» são nomes de coluna, não explicações:
 * a pessoa precisa de saber se aquele dinheiro veio do trabalho dela na equipa ou da árvore.
 */
export const ORIGEM_NOME: Record<'papel' | 'mlm', string> = {
  papel: 'Equipa de vendas',
  mlm: 'Rede (binário)',
}

/**
 * O valor COM SINAL, que é o que a pessoa tem de ver.
 *
 * A vista `vendas_extracto` traz `sinal` = −1 quando a comissão foi paga e depois DEVOLVIDA pelo
 * cliente. Mostrar essa linha a positivo era mostrar como ganho dinheiro que voltou para trás: a
 * pessoa somava de cabeça, não batia com o saldo, e a conversa seguinte era sobre confiança.
 *
 * Sem `sinal` (a vista pode ser lida sem a coluna) deduz-se do mesmo facto: paga E estornada.
 */
export function valorComSinal(linha: {
  valor_cents: number
  sinal?: number | null
  paga_em?: string | null
  estornada_em?: string | null
}): number {
  const valor = Math.round(Number(linha.valor_cents) || 0)
  const sinal =
    typeof linha.sinal === 'number' && linha.sinal !== 0
      ? Math.sign(linha.sinal)
      : linha.estornada_em && linha.paga_em
        ? -1
        : 1
  return valor * sinal
}

// ═══════════════════════ PRAZOS ═══════════════════════

export type SituacaoPrazo = 'sem_prazo' | 'atrasada' | 'hoje' | 'proxima'

/**
 * «ATRASADA» CALCULA-SE AO LER — nunca se guarda.
 *
 * Um estado `atrasada` na base é uma mentira que envelhece: precisava de alguém (um cron, uma
 * escrita ao abrir a página) a pô-lo de pé todas as noites, e o dia em que esse alguém falhasse a
 * lista dizia «em prazo» a tarefas de há duas semanas. Comparar a data com hoje não falha nunca e
 * não precisa de manutenção.
 *
 * A comparação é por DIA e não por instante: `prazo` é um `date` na base (sem hora), e uma tarefa
 * para hoje não está atrasada às 9 da manhã. Por isso ambos os lados são truncados a AAAA-MM-DD.
 */
export function situacaoDoPrazo(prazo: string | null | undefined, hoje: Date = new Date()): SituacaoPrazo {
  if (!prazo) return 'sem_prazo'
  const dia = String(prazo).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return 'sem_prazo'
  const hojeDia = diaLocal(hoje)
  if (dia < hojeDia) return 'atrasada'
  if (dia === hojeDia) return 'hoje'
  return 'proxima'
}

/**
 * O dia de HOJE na hora de quem está a olhar — Lisboa, na prática.
 *
 * `toISOString()` dava UTC, e em Portugal no verão isso significa que entre a meia-noite e a uma
 * da manhã «hoje» ainda era ontem: as tarefas de hoje apareciam atrasadas durante uma hora.
 */
export function diaLocal(d: Date = new Date()): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export const SITUACAO_PRAZO_NOME: Record<SituacaoPrazo, string> = {
  sem_prazo: 'Sem prazo',
  atrasada: 'Atrasada',
  hoje: 'Para hoje',
  proxima: 'A caminho',
}

/** A ordem por que uma lista de tarefas se lê: o que já falhou primeiro, o que não tem prazo no fim. */
export const PESO_PRAZO: Record<SituacaoPrazo, number> = {
  atrasada: 0,
  hoje: 1,
  proxima: 2,
  sem_prazo: 3,
}

/** Data curta à portuguesa, sem depender do locale do servidor (que na Vercel é o americano). */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const dia = String(iso).slice(0, 10)
  const [a, m, d] = dia.split('-')
  if (!a || !m || !d) return '—'
  return `${d}/${m}/${a}`
}

// ═══════════════════════ ÂMBITO DE EQUIPA ═══════════════════════
//
// As quatro páginas têm de dizer à pessoa DE QUEM é o que ela está a ver. Enquanto não havia modelo
// de equipa diziam todas a mesma frase («ainda não está configurado»); agora que há (migração 131),
// há três situações possíveis e só uma delas é a antiga. Se cada página escrevesse a sua frase, a
// que ficasse esquecida continuava a dizer a um team leader com equipa montada que o sistema não
// sabe quem ela é — e ele acreditava.
//
// É PURO de propósito: a frase depende de dois factos (tem a capacidade? quantos liderados?) e de
// mais nada. Assim prova-se sem base e sem sessão, em `lib/backoffice-vista.check.ts`.

import type { FamiliaAmbito } from '@/lib/backoffice-papeis'

/** O que está a acontecer ao âmbito desta pessoa, nesta família. */
export type SituacaoEquipa =
  /** Não tem o papel que abre a equipa — vê o seu e pronto. Não há nada a explicar. */
  | 'so_proprio'
  /** Tem o papel, mas o sistema não conhece nenhum liderado dela. É preciso dizer porquê. */
  | 'equipa_vazia'
  /** Tem o papel e tem equipa: está a ver linhas de outras pessoas, e tem de saber disso. */
  | 'com_equipa'
  /** Vê a casa toda (só o dono). */
  | 'todos'

export function situacaoDaEquipa(opts: {
  veEquipa: boolean
  liderados: number
  todos?: boolean
}): SituacaoEquipa {
  if (opts.todos) return 'todos'
  if (!opts.veEquipa) return 'so_proprio'
  return opts.liderados > 0 ? 'com_equipa' : 'equipa_vazia'
}

/** Como se chama, em português, aquilo que cada página mostra. */
export const FAMILIA_NOME: Record<FamiliaAmbito, string> = {
  extracto: 'extracto',
  leads: 'leads',
  pipeline: 'pipeline',
  tarefas: 'tarefas',
}

/**
 * A FRASE que a página mostra sobre o âmbito — ou `null` quando não há nada a dizer.
 *
 * `equipa_vazia` é o caso delicado: uma lista curta lê-se como «a minha equipa não vendeu nada»,
 * que é o contrário da verdade e é a pior coisa que se pode dizer a um responsável. A frase tem de
 * separar «não há resultados» de «o sistema não sabe quem é a tua equipa» — e dizer o que fazer.
 */
export function avisoDeEquipa(situacao: SituacaoEquipa, familia: FamiliaAmbito, liderados = 0): string | null {
  switch (situacao) {
    case 'com_equipa':
      return `Estás a ver o teu ${FAMILIA_NOME[familia]} e o de ${liderados} pessoa${liderados === 1 ? '' : 's'} da tua equipa.`
    case 'equipa_vazia':
      return (
        `Tens o papel que dá acesso ao ${FAMILIA_NOME[familia]} da tua equipa, mas o sistema não tem ninguém ` +
        'registado como teu liderado — por isso só vês o que é teu. Não quer dizer que a tua equipa não tenha ' +
        'resultados: quer dizer que a equipa ainda não foi montada no admin. Fala com o Ricardo.'
      )
    case 'todos':
      return `Como dono, este ${FAMILIA_NOME[familia]} é o da casa toda, não só o teu.`
    default:
      return null
  }
}

/**
 * A PONTE PASSA A ACTUALIZAR — e o pipeline deixa de congelar na primeira cópia.
 *
 * ═══ O DEFEITO, MEDIDO ═════════════════════════════════════════════════════════════════════
 *
 * `lib/backoffice-dia-ingestao.ts` copia os leads para `vendas_negocios` com
 * `upsert(..., { ignoreDuplicates: true })`. Funciona à primeira e NUNCA MAIS: depois da primeira
 * cópia nada propaga. Um lead que passou a `pending_review` no Telegram, ou que entretanto deu o
 * `broker_uid` — o sinal mais quente desta casa, porque já abriu conta na corretora — continua
 * `lead` no pipeline para sempre. Não há `update` em sítio nenhum (documentado em
 * `docs/maquina-de-vendas-autonoma.md` §2.1).
 *
 * E o defeito não dá erro: dá um pipeline com pessoas no estado errado, e uma equipa a abordar
 * como desconhecido quem já respondeu a tudo.
 *
 * ═══ O QUE ESTE MÓDULO NÃO PODE FAZER, E É O CASO MAU QUE A GUARDA PROVA ══════════════════
 *
 * A tentação é trocar `ignoreDuplicates` por um `upsert` que escreve tudo. Isso resolvia o
 * congelamento e criava um defeito pior: **um UPDATE automático a pisar o trabalho de uma pessoa.**
 * O comentário original da ingestão já dizia a regra — «a ingestão nunca atropela trabalho humano»
 * — e ela mantém-se inteira. O que o bot sabe NÃO pode apagar o que um closer escreveu.
 *
 * Daí as quatro regras, cada uma com o seu caso mau:
 *
 *  1. **o estado só anda para a FRENTE.** O Telegram pode estar atrasado em relação ao closer: a
 *     pessoa marcou reunião por telefone e no bot continua `qualifying`. Um UPDATE ingénuo punha o
 *     negócio de `marcado` para `contactado` e a reunião desaparecia do ecrã de quem a ia fazer;
 *  2. **um negócio FECHADO não se toca.** `ganho` e `perdido` são decisões de uma pessoa. Reabrir
 *     um negócio ganho porque o bot ainda tem o lead a meio é desfazer uma venda no relatório;
 *  3. **só se preenche o que está VAZIO.** Um email corrigido à mão por quem falou com a pessoa
 *     vale mais do que o que a fonte tem. Preencher o vazio é informação nova; substituir o
 *     preenchido é apagar trabalho;
 *  4. **a `nota` não se escreve, nunca.** É o único campo de prosa livre, é onde o closer escreve o
 *     que ouviu, e não há forma de o completar sem arriscar apagá-lo. Fica de fora por inteiro.
 *
 * ═══ PURO, PORQUE ERRA EM SILÊNCIO ════════════════════════════════════════════════════════
 *
 * Nenhum destes erros rebenta. Recuar um estado, reabrir um negócio ganho ou substituir um email
 * corrigido à mão são todos `update`s que o Postgres aceita com gosto. `pipeline-fluxo.check.ts`
 * atira-lhe os casos maus sem base de dados.
 */
import { ESTADOS_PIPELINE, ehEstadoFechado, type EstadoPipeline } from '@/lib/backoffice-vista'

/** As colunas que a fonte pode preencher quando estão vazias. A `nota` NÃO está aqui, e é a regra 4. */
export const COLUNAS_PREENCHIVEIS = [
  'email',
  'telefone',
  'telegram_username',
  'idioma',
  'pais',
  'interesse',
  'instagram_handle',
  'broker_uid',
  'etiquetas',
] as const

export type ColunaPreenchivel = (typeof COLUNAS_PREENCHIVEIS)[number]

/**
 * O `select` que a ingestão faz para poder decidir, escrito por extenso e UMA ÚNICA VEZ.
 *
 * Tem de ser um literal: o `select` do supabase-js é tipado pela string, e um template dinâmico
 * (`COLUNAS_PREENCHIVEIS.join(', ')`) faz o compilador desistir e devolver `ParserError` — a partir
 * daí as colunas deixam de ser verificadas, que é precisamente a garantia que se queria. Mas um
 * literal copiado para o ficheiro da ingestão eram duas listas a envelhecer em separado: uma coluna
 * nova em `COLUNAS_PREENCHIVEIS` e esquecida aqui dava uma propagação que escreve por cima de um
 * campo que ela nunca leu — ou seja, apaga trabalho de uma pessoa, sem erro nenhum. Vive aqui, ao
 * lado da lista, e o `.check.ts` confirma que as duas dizem o mesmo.
 */
export const SELECT_PARA_PROPAGAR =
  'id, chave_origem, estado, email, telefone, telegram_username, idioma, pais, interesse, instagram_handle, broker_uid, etiquetas'

/** O negócio como está no pipeline. Só o que decide. */
export interface NegocioNoPipeline {
  id: string
  chave_origem: string
  estado: string | null
  /** Os valores actuais das colunas preenchíveis. Vazio/nulo = há espaço para a fonte. */
  valores: Partial<Record<ColunaPreenchivel, unknown>>
}

/** O que a fonte sabe hoje sobre a mesma pessoa. */
export interface OQueAFonteSabe {
  chave_origem: string
  /** O estado derivado da fonte, ou `null` quando ela não sabe dizer. */
  estado: EstadoPipeline | null
  valores: Partial<Record<ColunaPreenchivel, unknown>>
}

export interface Propagacao {
  negocioId: string
  chaveOrigem: string
  /** O que se vai escrever. Nunca inclui `nota`. */
  mudancas: Partial<Record<ColunaPreenchivel | 'estado', unknown>>
  /** Uma frase por mudança, para o relatório do cron. */
  porque: string[]
}

export interface NaoPropagado {
  chaveOrigem: string
  porque: string
}

export interface PlanoDePropagacao {
  propagar: Propagacao[]
  deixar: NaoPropagado[]
  resumo: string
}

/** Posição do estado na ordem do avanço real do negócio. `-1` = não é um estado conhecido. */
export function posicaoDoEstado(estado: string | null | undefined): number {
  return (ESTADOS_PIPELINE as readonly string[]).indexOf(String(estado ?? ''))
}

/**
 * Está vazio? Só o que está vazio é que se preenche (regra 3).
 *
 * A string com espaços conta como vazia, e o array vazio também: uma coluna com `''` ou `[]` finge
 * que há dado onde não há, e deixar a fonte preenchê-la é corrigir o fingimento, não apagar nada.
 */
export function estaVazio(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim().length === 0
  if (Array.isArray(v)) return v.length === 0
  return false
}

/** Tem valor útil? Nunca se escreve vazio por cima de vazio — era um `update` que não muda nada. */
function temValor(v: unknown): boolean {
  return !estaVazio(v)
}

/**
 * O PLANO — puro.
 *
 * Recebe os negócios que já existem no pipeline e o que as fontes sabem hoje, e diz exactamente o
 * que se escreve. Quem não tem nada a mudar aparece em `deixar` com o motivo: sem isso, um dia em
 * que a propagação não faça nada é indistinguível de um dia em que ela não correu.
 */
export function planearPropagacao(entrada: {
  negocios: readonly NegocioNoPipeline[]
  fontes: readonly OQueAFonteSabe[]
}): PlanoDePropagacao {
  const porChave = new Map<string, NegocioNoPipeline>()
  for (const n of entrada.negocios ?? []) porChave.set(String(n.chave_origem), n)

  const propagar: Propagacao[] = []
  const deixar: NaoPropagado[] = []

  for (const f of entrada.fontes ?? []) {
    const chave = String(f.chave_origem)
    const n = porChave.get(chave)
    if (!n) {
      // Não está no pipeline: é trabalho da ingestão (inserir), não da propagação. Dizê-lo aqui
      // evita que alguém «conserte» isto com um insert e passe a ter duas portas de entrada.
      deixar.push({ chaveOrigem: chave, porque: 'Ainda não está no pipeline — inserir é da ingestão, não desta propagação.' })
      continue
    }

    // Regra 2: um negócio fechado é uma decisão de uma pessoa.
    const posActual = posicaoDoEstado(n.estado)
    if (posActual >= 0 && ehEstadoFechado(n.estado as EstadoPipeline)) {
      deixar.push({
        chaveOrigem: chave,
        porque:
          `Está «${n.estado}», que é fechado. Reabrir um negócio ganho ou perdido porque a fonte ` +
          'ainda tem o lead a meio é desfazer a decisão de uma pessoa no relatório dela.',
      })
      continue
    }

    const mudancas: Propagacao['mudancas'] = {}
    const porque: string[] = []

    // Regra 1: o estado só anda para a frente.
    if (f.estado) {
      const posFonte = posicaoDoEstado(f.estado)
      if (posFonte < 0) {
        porque.push(`estado «${f.estado}» da fonte não é um estado do pipeline — ignorado em vez de escrito às cegas`)
      } else if (posActual < 0) {
        // O negócio tem um estado que não se reconhece. Não se corrige: corrige-se a linha, não o
        // agente — é a mesma regra do motor para campos ilegíveis.
        porque.push(`o negócio está em «${n.estado}», que não é um estado conhecido. Não se mexe no estado.`)
      } else if (posFonte > posActual) {
        mudancas.estado = f.estado
        porque.push(`estado ${n.estado} → ${f.estado} (a fonte já sabe mais; só se anda para a frente)`)
      } else if (posFonte < posActual) {
        porque.push(
          `estado mantido em «${n.estado}»: a fonte diz «${f.estado}», que é ATRÁS. O bot pode estar ` +
            'desactualizado em relação a quem falou com a pessoa, e recuar apagava esse trabalho do ecrã.',
        )
      }
    }

    // Regra 3: só o que está vazio.
    for (const col of COLUNAS_PREENCHIVEIS) {
      const novo = f.valores?.[col]
      if (!temValor(novo)) continue
      if (!estaVazio(n.valores?.[col])) {
        porque.push(`${col} mantido: já estava preenchido, e o que uma pessoa corrigiu vale mais do que o que a fonte tem`)
        continue
      }
      mudancas[col] = novo
      porque.push(`${col} preenchido (estava vazio)`)
    }

    const mexe = Object.keys(mudancas).length > 0
    if (!mexe) {
      deixar.push({
        chaveOrigem: chave,
        porque: porque.length ? porque.join('; ') : 'A fonte não traz nada que o pipeline ainda não tenha.',
      })
      continue
    }

    propagar.push({ negocioId: String(n.id), chaveOrigem: chave, mudancas, porque })
  }

  const avancos = propagar.filter((p) => p.mudancas.estado !== undefined).length
  const resumo =
    propagar.length === 0
      ? `Propagação: nada a actualizar em ${deixar.length} negócio(s) olhado(s), cada um com motivo.`
      : `Propagação: ${propagar.length} negócio(s) actualizado(s), ${avancos} com avanço de estado, ` +
        `${deixar.length} deixado(s) como estavam.`

  return { propagar, deixar, resumo }
}

/**
 * A GARANTIA DE FORMA, para quem escrever a parte da base de dados.
 *
 * Devolve as mudanças já filtradas do que nunca se escreve. É redundante com `planearPropagacao` de
 * propósito: a regra que proíbe escrever a `nota` fica também no último sítio antes do `update`, e
 * não só na função que decide. Quem acrescentar um campo ao plano e se esquecer desta lista vê o
 * campo a não ser escrito, em vez de ver a nota de um cliente a desaparecer.
 */
export const NUNCA_SE_ESCREVE = ['nota', 'closer_id', 'setter_id', 'prospector_id', 'motivo_perda', 'fechado_em', 'comprador_id'] as const

export function mudancasSeguras(mudancas: Record<string, unknown>): Record<string, unknown> {
  const fora = new Set<string>(NUNCA_SE_ESCREVE as readonly string[])
  const saida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(mudancas ?? {})) {
    if (fora.has(k)) continue
    saida[k] = v
  }
  return saida
}

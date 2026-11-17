/**
 * «O QUE FAÇO AGORA?» — a fila de prioridade do pipeline (parte pura, provada em `prioridade.check.ts`).
 *
 * Um vendedor perde mais negócios por falar com a pessoa errada à hora errada do que por falar
 * mal. Esta fila ordena os negócios abertos pelo que está mais perto de virar (ou de arrefecer),
 * e diz em cada um a acção seguinte e PORQUÊ, com regras à vista e sem números inventados:
 *
 *   · quanto mais avançada a etapa, mais pesa (uma chamada marcada vale mais que um lead novo);
 *   · um lead quente fresco pesa muito na primeira hora (velocidade de resposta), menos depois;
 *   · um negócio parado há dias numa etapa activa sobe (está a arrefecer);
 *   · uma tarefa atrasada sobe;
 *   · sem canal de contacto desce.
 *
 * Fora da fila: ganhos, perdidos, e leads de listas importadas sem consentimento
 * (`whatsapp_import` em «lead») — não se contactam por iniciativa (ver lib/vendas/executor-pipeline.ts).
 */
import { FONTES_QUENTES } from './conversao'

export type NegocioParaPrioridade = {
  id: string
  nome: string
  origem: string | null
  estado: string
  criado_em: string
  atualizado_em: string | null
  email?: string | null
  telefone?: string | null
  telegram_id?: string | null
}

export type ItemPrioridade = {
  id: string
  nome: string
  estado: string
  origem: string | null
  pontos: number
  accao: string
  porque: string[]
}

const BASE: Record<string, { pontos: number; accao: string }> = {
  marcado: { pontos: 50, accao: 'Preparar a chamada marcada' },
  apresentado: { pontos: 45, accao: 'Fechar: seguimento da apresentação' },
  no_show: { pontos: 40, accao: 'Remarcar a chamada' },
  qualificado: { pontos: 35, accao: 'Marcar a chamada' },
  contactado: { pontos: 20, accao: 'Seguimento: qualificar' },
  lead: { pontos: 10, accao: 'Primeiro contacto' },
}

/** Etapas em que estar parado significa arrefecer. */
const ACTIVAS = new Set(['contactado', 'qualificado', 'apresentado', 'no_show'])
const H = 3_600_000

export function entraNaFila(n: Pick<NegocioParaPrioridade, 'estado' | 'origem'>): boolean {
  if (!(n.estado in BASE)) return false
  if (n.estado === 'lead' && n.origem === 'whatsapp_import') return false
  return true
}

export function pontuar(n: NegocioParaPrioridade, tarefasAtrasadas: number, agora: Date): ItemPrioridade | null {
  if (!entraNaFila(n)) return null
  const base = BASE[n.estado]
  let pontos = base.pontos
  let accao = base.accao
  const porque: string[] = []
  const t = agora.getTime()

  if (n.estado === 'lead') {
    const quente = (FONTES_QUENTES as readonly string[]).includes(n.origem ?? '')
    const horas = (t - Date.parse(n.criado_em)) / H
    if (quente) {
      pontos += 20
      porque.push(`lead quente (${n.origem})`)
      if (horas <= 1) {
        pontos += 25
        accao = 'Responder já (entrou há menos de 1 h)'
        porque.push('entrou há menos de 1 h')
      } else if (horas <= 24) {
        pontos += 15
        porque.push(`entrou há ${Math.round(horas)} h e ainda ninguém respondeu`)
      } else {
        porque.push(`sem resposta há ${Math.round(horas / 24)} dia(s)`)
      }
    }
  }

  if (ACTIVAS.has(n.estado) && n.atualizado_em) {
    const dias = (t - Date.parse(n.atualizado_em)) / (24 * H)
    if (dias >= 7) {
      pontos += 15
      porque.push(`parado há ${Math.floor(dias)} dias: está a arrefecer`)
    } else if (dias >= 2) {
      pontos += 10
      porque.push(`sem mexer há ${Math.floor(dias)} dias`)
    }
  }

  if (tarefasAtrasadas > 0) {
    pontos += 15
    porque.push(tarefasAtrasadas === 1 ? '1 tarefa atrasada' : `${tarefasAtrasadas} tarefas atrasadas`)
  }

  if (!n.email && !n.telefone && !n.telegram_id) {
    pontos -= 10
    porque.push('sem contacto guardado')
  }

  return { id: n.id, nome: n.nome, estado: n.estado, origem: n.origem, pontos, accao, porque }
}

/** A fila: maior pontuação primeiro; em empate, o mais antigo (esperou mais). */
export function filaDePrioridade(
  negocios: NegocioParaPrioridade[],
  atrasadasPorNegocio: Map<string, number>,
  agora: Date,
  max = 10,
): ItemPrioridade[] {
  const criado = new Map(negocios.map((n) => [n.id, Date.parse(n.criado_em)]))
  return negocios
    .map((n) => pontuar(n, atrasadasPorNegocio.get(n.id) ?? 0, agora))
    .filter((i): i is ItemPrioridade => i !== null)
    .sort((a, b) => b.pontos - a.pontos || (criado.get(a.id) ?? 0) - (criado.get(b.id) ?? 0))
    .slice(0, max)
}

/** Conta tarefas abertas com prazo antes de hoje, por negócio. */
export function contarAtrasadas(tarefas: { negocio_id: string | null; prazo: string | null }[], hojeISO: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of tarefas) {
    if (!t.negocio_id || !t.prazo || t.prazo >= hojeISO) continue
    m.set(t.negocio_id, (m.get(t.negocio_id) ?? 0) + 1)
  }
  return m
}

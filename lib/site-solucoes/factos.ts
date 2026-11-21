/**
 * Factos «de relance» do /solucoes: transforma as horas do simulador em coisas que se percebem
 * num segundo (dias de trabalho, semanas de férias, minutos por dia, a data do calendário até à
 * qual o ano foi só tarefas repetidas).
 *
 * Tudo é derivado das horas que a pessoa indicou e dos PRESSUPOSTOS da casa (46 semanas, 8 h por
 * dia, 40 h por semana). Nenhum número vem de fora: a guarda (factos.check.ts) confirma as contas.
 */
import { PRESSUPOSTOS } from '@/lib/site-solucoes/automacao'

export const HORAS_DIA = 8
export const HORAS_SEMANA = 40

export interface Totais {
  horasSemana: number
  recuperaveisSemana: number
  recuperaveisAno: number
  eurosAno: number
}

export interface Factos {
  /** Dias úteis de 8 h devolvidos por ano. */
  diasAno: number
  /** Semanas de 40 h devolvidas por ano («semanas de férias»). */
  semanasAno: number
  /** Minutos devolvidos por dia útil (5 dias por semana). */
  minutosDia: number
  /** Parte de uma semana de 40 h que hoje vai para tarefas repetidas (0 a 1). */
  fatiaSemana: number
  /** Parte das tarefas repetidas que passa para a IA (0 a 1). */
  fatiaAutomatizavel: number
  /** Dias úteis por ano gastos em tarefas repetidas (o total, não só o recuperável). */
  diasRepetidosAno: number
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function factos(t: Totais): Factos {
  const hs = Math.max(0, t.horasSemana)
  const rs = Math.max(0, Math.min(hs, t.recuperaveisSemana))
  const ra = Math.max(0, t.recuperaveisAno)
  return {
    diasAno: Math.round(ra / HORAS_DIA),
    semanasAno: r1(ra / HORAS_SEMANA),
    minutosDia: Math.round((rs * 60) / 5),
    fatiaSemana: Math.min(1, hs / HORAS_SEMANA),
    fatiaAutomatizavel: hs > 0 ? rs / hs : 0,
    diasRepetidosAno: Math.round((hs * PRESSUPOSTOS.semanasPorAno) / HORAS_DIA),
  }
}

/**
 * A data até à qual, contando dias úteis a partir de 1 de janeiro, o ano inteiro foi só tarefas
 * repetidas. Ex.: 23 dias úteis → por volta de 2 de fevereiro. Devolve null se não houver horas.
 */
export function dataAteOnde(diasUteis: number, ano: number): Date | null {
  if (!(diasUteis > 0)) return null
  const d = new Date(Date.UTC(ano, 0, 1))
  let contados = 0
  const limite = Math.min(Math.round(diasUteis), 260)
  while (true) {
    const dia = d.getUTCDay()
    if (dia !== 0 && dia !== 6) {
      contados++
      if (contados >= limite) return d
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }
}

/** Número curto de proposta, estável para o mesmo negócio no mesmo dia. */
export function numeroProposta(empresa: string, data: Date): string {
  let h = 2166136261
  for (const c of empresa.toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const y = String(data.getFullYear()).slice(2)
  const m = String(data.getMonth() + 1).padStart(2, '0')
  const d = String(data.getDate()).padStart(2, '0')
  return `MTM-${y}${m}${d}-${(h >>> 0).toString(36).slice(0, 4).toUpperCase()}`
}

/**
 * CONVERSÃO REAL DO PIPELINE — a parte pura (provada em `conversao.check.ts`).
 *
 * Três perguntas, com números que vêm só da base (nada estimado):
 *   · de cada origem, quantos foram trabalhados, quantos avançaram, quantos fecharam;
 *   · quanto tempo passa até ao primeiro contacto (mediana, a partir do histórico lead → outro);
 *   · que leads quentes estão à espera de resposta AGORA.
 */
export const AVANCADOS = ['qualificado', 'marcado', 'no_show', 'apresentado', 'ganho'] as const
export const FONTES_QUENTES = ['telegram', 'instagram', 'formulario', 'agenda'] as const

export type LinhaNegocio = { id: string; nome: string; origem: string | null; estado: string; criado_em: string }
export type PrimeiroContacto = { negocio_id: string; em: string }

export type PorOrigem = {
  origem: string
  total: number
  trabalhados: number
  avancados: number
  ganhos: number
  /** Percentagens inteiras sobre o total; null quando não há base. */
  pctTrabalhados: number | null
  pctGanhos: number | null
  /** Mediana, em horas, entre entrar e o primeiro movimento. null = ninguém foi contactado. */
  medianaHorasContacto: number | null
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null)

export function mediana(v: number[]): number | null {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function conversaoPorOrigem(negocios: LinhaNegocio[], primeiros: PrimeiroContacto[]): PorOrigem[] {
  const primeiro = new Map<string, number>()
  for (const p of primeiros) {
    const t = Date.parse(p.em)
    const antes = primeiro.get(p.negocio_id)
    if (Number.isFinite(t) && (antes === undefined || t < antes)) primeiro.set(p.negocio_id, t)
  }
  const grupos = new Map<string, LinhaNegocio[]>()
  for (const n of negocios) {
    const o = n.origem || 'sem origem'
    grupos.set(o, [...(grupos.get(o) ?? []), n])
  }
  return [...grupos.entries()]
    .map(([origem, ns]) => {
      const trabalhados = ns.filter((n) => n.estado !== 'lead').length
      const avancados = ns.filter((n) => (AVANCADOS as readonly string[]).includes(n.estado)).length
      const ganhos = ns.filter((n) => n.estado === 'ganho').length
      const horas = ns
        .map((n) => {
          const t = primeiro.get(n.id)
          const c = Date.parse(n.criado_em)
          return t !== undefined && Number.isFinite(c) && t >= c ? (t - c) / 3_600_000 : null
        })
        .filter((h): h is number => h !== null)
      const med = mediana(horas)
      return {
        origem,
        total: ns.length,
        trabalhados,
        avancados,
        ganhos,
        pctTrabalhados: pct(trabalhados, ns.length),
        pctGanhos: pct(ganhos, ns.length),
        medianaHorasContacto: med === null ? null : Math.round(med * 10) / 10,
      }
    })
    .sort((a, b) => b.total - a.total)
}

/** Leads quentes ainda em «lead» há mais de `horas` horas, o mais antigo primeiro. */
export function quentesSemResposta(negocios: LinhaNegocio[], agora: Date, horas = 1, max = 15) {
  const limite = agora.getTime() - horas * 3_600_000
  return negocios
    .filter((n) => n.estado === 'lead' && (FONTES_QUENTES as readonly string[]).includes(n.origem ?? '') && Date.parse(n.criado_em) < limite)
    .sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em))
    .slice(0, max)
    .map((n) => ({ id: n.id, nome: n.nome, origem: n.origem, horas: Math.round((agora.getTime() - Date.parse(n.criado_em)) / 3_600_000) }))
}

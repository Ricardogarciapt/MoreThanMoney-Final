/**
 * OS TIMEFRAMES DO GRÁFICO — puros, partilhados pelo servidor (rota das velas) e pelo cliente
 * (selector, vela viva). Sem imports: correm no browser, no Node e nas guardas.
 *
 * Nativos (as fontes de velas servem-nos): M1 M5 M15 H1 H4 D1. Os outros derivam-se de um nativo
 * (`DERIVACAO`). W1 e MN são de CALENDÁRIO — segunda-feira 00:00 UTC e dia 1 00:00 UTC — porque a
 * época Unix não os alinha (o dia 0 foi uma quinta, e os meses não têm todos o mesmo tamanho).
 * Os segundos de W1/MN (604800 / 2592000) são só nominais, os mesmos do feed directo
 * (lib/webtrader/feed-directo/tipos.ts): servem para medir, nunca para alinhar velas.
 */

export const TF_NATIVOS = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'] as const
export const TIMEFRAMES_GRAFICO = ['M1', 'M2', 'M3', 'M5', 'M10', 'M15', 'M30', 'H1', 'H2', 'H4', 'H6', 'H8', 'H12', 'D1', 'W1', 'MN'] as const
export type TfGrafico = (typeof TIMEFRAMES_GRAFICO)[number]

export const TF_SEG_GRAFICO: Record<TfGrafico, number> = {
  M1: 60, M2: 120, M3: 180, M5: 300, M10: 600, M15: 900, M30: 1800,
  H1: 3600, H2: 7200, H4: 14400, H6: 21600, H8: 28800, H12: 43200, D1: 86400, W1: 604800, MN: 2592000,
}

export type Calendario = 'semana' | 'mes'

/** De que nativo se deriva cada timeframe e quantas velas dele cabem numa (W1/MN: aproximado, para pedir que chegue). */
export const DERIVACAO: Record<string, { de: string; fator: number; calendario?: Calendario }> = {
  M2: { de: 'M1', fator: 2 }, M3: { de: 'M1', fator: 3 },
  M10: { de: 'M5', fator: 2 },
  M30: { de: 'M15', fator: 2 },
  H2: { de: 'H1', fator: 2 }, H6: { de: 'H1', fator: 6 }, H8: { de: 'H1', fator: 8 }, H12: { de: 'H1', fator: 12 },
  W1: { de: 'D1', fator: 7, calendario: 'semana' },
  MN: { de: 'D1', fator: 31, calendario: 'mes' },
}

export const tfValido = (tf: string): tf is TfGrafico => (TIMEFRAMES_GRAFICO as readonly string[]).includes(tf)

/** Início do bucket de calendário de `t` (unix s): segunda 00:00 UTC ou dia 1 00:00 UTC. */
export function inicioCalendario(t: number, tipo: Calendario): number {
  const d = new Date(t * 1000)
  if (tipo === 'mes') return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000)
  const diaSemana = (d.getUTCDay() + 6) % 7 // segunda = 0
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diaSemana) / 1000)
}

/** O instante (unix s) em que abre a vela de `tf` que contém `t`. */
export function inicioDaVela(t: number, tf: string): number {
  const cal = DERIVACAO[tf]?.calendario
  if (cal) return inicioCalendario(t, cal)
  const seg = TF_SEG_GRAFICO[tf as TfGrafico] ?? 300
  return Math.floor(t / seg) * seg
}

export interface VelaTf { t: number; o: number; h: number; l: number; c: number; v: number }

/** Agrega velas ordenadas no timeframe `tf` (buckets de `inicioDaVela`). */
export function agregarNoTimeframe<V extends VelaTf>(velas: V[], tf: string): VelaTf[] {
  const out: VelaTf[] = []
  let atual: VelaTf | null = null
  for (const v of velas) {
    const t = inicioDaVela(v.t, tf)
    if (!atual || atual.t !== t) {
      if (atual) out.push(atual)
      atual = { t, o: v.o, h: v.h, l: v.l, c: v.c, v: v.v || 0 }
    } else {
      if (v.h > atual.h) atual.h = v.h
      if (v.l < atual.l) atual.l = v.l
      atual.c = v.c
      atual.v += v.v || 0
    }
  }
  if (atual) out.push(atual)
  return out
}

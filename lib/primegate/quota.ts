/**
 * PrimeGate — quota partilhada (10 pedidos/minuto, 1 000/dia por omissão).
 *
 * As funções da Vercel são muitas instâncias sem memória comum: um contador em memória deixava
 * cada uma gastar os seus 10 por minuto e a PrimeVerse via 40. Por isso a contagem vive na base
 * (`primegate_quota`, função atómica `primegate_reservar`) e a decisão é reservar ANTES de pedir:
 * o 11.º pedido do minuto não sai.
 *
 * `decidirQuota` é a mesma regra em TypeScript puro — é ela que a guarda testa, e é a que o
 * contador em memória (testes) usa. A função SQL da migração 184 replica-a linha a linha.
 */

export interface LimitesQuota {
  porMinuto: number
  porDia: number
}

export const LIMITES_POR_OMISSAO: LimitesQuota = { porMinuto: 10, porDia: 1000 }

export type ResultadoQuota =
  | { ok: true; minuto: number; dia: number }
  | { ok: false; motivo: 'minuto' | 'dia' | 'retry_after' | 'sem_base'; minuto?: number; dia?: number; bloqueadoAte?: string }

/** A regra pura: com estas contagens, pode sair mais um pedido? */
export function decidirQuota(
  contagens: { minuto: number; dia: number; bloqueadoAteMs?: number | null },
  limites: LimitesQuota,
  agoraMs: number,
): ResultadoQuota {
  if (contagens.bloqueadoAteMs && contagens.bloqueadoAteMs > agoraMs) {
    return { ok: false, motivo: 'retry_after', bloqueadoAte: new Date(contagens.bloqueadoAteMs).toISOString() }
  }
  if (contagens.minuto >= limites.porMinuto) return { ok: false, motivo: 'minuto', minuto: contagens.minuto, dia: contagens.dia }
  if (contagens.dia >= limites.porDia) return { ok: false, motivo: 'dia', minuto: contagens.minuto, dia: contagens.dia }
  return { ok: true, minuto: contagens.minuto + 1, dia: contagens.dia + 1 }
}

export interface Quota {
  reservar(): Promise<ResultadoQuota>
  /** A PrimeVerse respondeu 429: ninguém pede até `ate`. */
  bloquearAte(ate: Date): Promise<void>
}

/** Contador em memória — SÓ para testes (em produção não é partilhado entre instâncias). */
export function quotaEmMemoria(limites: LimitesQuota = LIMITES_POR_OMISSAO, relogio: () => number = Date.now): Quota & {
  estado: () => { minuto: number; dia: number }
} {
  const porJanela = new Map<string, number>()
  let bloqueadoAteMs: number | null = null
  const janelas = () => {
    const iso = new Date(relogio()).toISOString()
    return { m: `m:${iso.slice(0, 16)}`, d: `d:${iso.slice(0, 10)}` }
  }
  return {
    async reservar() {
      const { m, d } = janelas()
      const r = decidirQuota({ minuto: porJanela.get(m) ?? 0, dia: porJanela.get(d) ?? 0, bloqueadoAteMs }, limites, relogio())
      if (r.ok) {
        porJanela.set(m, r.minuto)
        porJanela.set(d, r.dia)
      }
      return r
    },
    async bloquearAte(ate: Date) {
      bloqueadoAteMs = ate.getTime()
    },
    estado() {
      const { m, d } = janelas()
      return { minuto: porJanela.get(m) ?? 0, dia: porJanela.get(d) ?? 0 }
    },
  }
}

type DbMinima = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  from: (t: string) => {
    upsert: (v: Record<string, unknown>, o?: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
  }
}

/** A quota de produção, na base. Se a base falhar, NÃO pede (mais vale atrasar que ser cortado). */
export function quotaNaBase(db: DbMinima, limites: LimitesQuota = LIMITES_POR_OMISSAO): Quota {
  return {
    async reservar() {
      const { data, error } = await db.rpc('primegate_reservar', { p_max_minuto: limites.porMinuto, p_max_dia: limites.porDia })
      if (error || !data || typeof data !== 'object') return { ok: false, motivo: 'sem_base' }
      const d = data as { ok?: boolean; motivo?: string; minuto?: number; dia?: number; bloqueado_ate?: string }
      if (d.ok) return { ok: true, minuto: Number(d.minuto ?? 0), dia: Number(d.dia ?? 0) }
      const motivo = d.motivo === 'dia' || d.motivo === 'retry_after' ? d.motivo : 'minuto'
      return { ok: false, motivo, minuto: d.minuto, dia: d.dia, bloqueadoAte: d.bloqueado_ate }
    },
    async bloquearAte(ate: Date) {
      await db.from('primegate_quota').upsert(
        { janela: 'bloqueio', contagem: 0, bloqueado_ate: ate.toISOString(), atualizado_em: new Date().toISOString() },
        { onConflict: 'janela' },
      )
    },
  }
}

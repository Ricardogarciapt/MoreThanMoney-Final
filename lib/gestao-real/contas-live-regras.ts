/**
 * QUEM GERE CADA CONTA — o monitor antigo ou o motor em tempo real do VPS.
 *
 * Duas chaves têm de estar viradas para o motor mandar numa conta, e o monitor antigo só se cala
 * quando as duas estão:
 *
 *  1. a conta está na lista `site_settings.motor_real_contas_live` (vazia por omissão), para um tipo
 *     de gestão que o motor já sabe fazer em live (`TIPOS_LIVE_SUPORTADOS`);
 *  2. o motor está VIVO e diz que a está a gerir: batimento em `gestao_real_pulso` com menos de
 *     `PULSO_MAX_IDADE_MS`, `escrita=true` e a conta na lista `live` do batimento.
 *
 * Se o motor morre, desliga a escrita ou recusa a conta, o batimento deixa de a confirmar e, no
 * máximo 20 s depois, o monitor antigo volta a gerir sozinho. Falha a ler a base = o monitor gere
 * (nunca ficar uma posição sem ninguém).
 *
 * Formato da lista (JSON; a coluna `value` pode vir como texto):
 *   ["530d2e07-…"]                                  → todos os tipos suportados
 *   [{"conta":"530d2e07-…","tipos":["premium"]}]    → só estes
 *
 * Regras puras, sem imports: o repositório mtm-auto tem uma cópia BYTE A BYTE deste ficheiro
 * (`lib/gestao-real/contas-live-regras.ts`) — `lib/gestao-real/__tests__/copias-mtm-auto.check.ts`
 * compara-as. Mudar aqui = copiar para lá.
 */

export type TipoGestao = 'premium' | 't2t' | 'mtmauto'

/**
 * Tipos que o motor já executa em live. T2T fica de fora na fase 1: o guarda dele existe, mas
 * enquanto o tipo não estiver aqui nunca cala o monitor antigo.
 *
 * 'mtmauto' entrou a 05/10 (F3 — motor partilhado): o motor próprio da MTM Auto foi retirado e a
 * gestão por preço das contas MTM Auto é do motor do VPS. Só conta a conta: continua a exigir a
 * conta em `site_settings.motor_real_contas_live` (vazia) + batimento vivo — é o dono que a põe lá.
 */
export const TIPOS_LIVE_SUPORTADOS: readonly TipoGestao[] = ['premium', 'mtmauto']

export const CHAVE_LISTA_LIVE = 'motor_real_contas_live'
export const SERVICO_PULSO = 'motor-real'
export const PULSO_MAX_IDADE_MS = 20_000

export interface EntradaLive {
  conta: string
  tipos: TipoGestao[]
}

export interface PulsoMotor {
  em: string | null
  escrita: boolean
  /** Contas que o motor está de facto a gerir em live (conta:tipo). */
  live: string[]
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** Lê a lista, tolerante a texto JSON e a entradas soltas. Lixo = lista vazia. */
export function lerListaLive(valor: unknown): EntradaLive[] {
  let v = valor
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch { return [] }
  }
  if (!Array.isArray(v)) return []
  const out: EntradaLive[] = []
  for (const e of v) {
    if (typeof e === 'string' && norm(e)) {
      out.push({ conta: norm(e), tipos: [...TIPOS_LIVE_SUPORTADOS] })
    } else if (e && typeof e === 'object' && norm((e as { conta?: unknown }).conta)) {
      const tipos = Array.isArray((e as { tipos?: unknown }).tipos)
        ? ((e as { tipos: unknown[] }).tipos.map(norm).filter((t) => t === 'premium' || t === 't2t' || t === 'mtmauto') as TipoGestao[])
        : [...TIPOS_LIVE_SUPORTADOS]
      out.push({ conta: norm((e as { conta: unknown }).conta), tipos })
    }
  }
  return out
}

/** A lista pede live para esta conta e tipo, e o tipo é suportado? (o que o MOTOR consulta) */
export function listaPedeLive(lista: EntradaLive[], accountId: string, tipo: TipoGestao): boolean {
  if (!TIPOS_LIVE_SUPORTADOS.includes(tipo)) return false
  const id = norm(accountId)
  return lista.some((e) => e.conta === id && e.tipos.includes(tipo))
}

export const chaveLive = (accountId: string, tipo: TipoGestao) => `${norm(accountId)}:${tipo}`

/** Regra pura do guarda dos monitores antigos. */
export function decidirGuarda(
  lista: EntradaLive[],
  pulso: PulsoMotor | null,
  accountId: string,
  tipo: TipoGestao,
  agoraMs: number,
): boolean {
  if (!listaPedeLive(lista, accountId, tipo)) return false
  if (!pulso || !pulso.escrita || !pulso.em) return false
  const em = Date.parse(pulso.em)
  if (!Number.isFinite(em) || agoraMs - em > PULSO_MAX_IDADE_MS || em - agoraMs > PULSO_MAX_IDADE_MS) return false
  return pulso.live.map(norm).includes(chaveLive(accountId, tipo))
}

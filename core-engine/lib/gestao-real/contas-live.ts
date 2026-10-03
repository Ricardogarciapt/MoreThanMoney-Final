/**
 * Guarda dos monitores antigos (site): lê a lista `motor_real_contas_live` e o batimento do motor.
 * As regras estão em `contas-live-regras.ts`.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  CHAVE_LISTA_LIVE,
  SERVICO_PULSO,
  decidirGuarda,
  lerListaLive,
  type EntradaLive,
  type PulsoMotor,
  type TipoGestao,
} from './contas-live-regras'

export * from './contas-live-regras'

const RELER_MS = 5_000

let cache: { lista: EntradaLive[]; pulso: PulsoMotor | null; lidoEm: number } | null = null

async function ler(agoraMs: number): Promise<{ lista: EntradaLive[]; pulso: PulsoMotor | null }> {
  if (cache && agoraMs - cache.lidoEm < RELER_MS) return cache
  const db = getSupabaseAdmin()
  const { data: s, error: e1 } = await db.from('site_settings').select('value').eq('key', CHAVE_LISTA_LIVE).maybeSingle()
  if (e1) throw new Error(e1.message)
  const lista = lerListaLive(s?.value)
  let pulso: PulsoMotor | null = null
  // Lista vazia (o normal): nem se lê o batimento.
  if (lista.length) {
    const { data: p, error: e2 } = await db.from('gestao_real_pulso').select('em, escrita, live').eq('servico', SERVICO_PULSO).maybeSingle()
    if (e2) throw new Error(e2.message)
    pulso = p ? { em: p.em ? String(p.em) : null, escrita: p.escrita === true, live: Array.isArray(p.live) ? p.live.map(String) : [] } : null
  }
  cache = { lista, pulso, lidoEm: agoraMs }
  return cache
}

/**
 * O monitor antigo deve deixar a gestão por preço desta conta ao motor? Nunca lança; na dúvida, não.
 */
export async function contaGeridaPeloMotorReal(accountId: string | null | undefined, tipo: TipoGestao, agoraMs = Date.now()): Promise<boolean> {
  if (!accountId) return false
  try {
    const { lista, pulso } = await ler(agoraMs)
    return decidirGuarda(lista, pulso, accountId, tipo, agoraMs)
  } catch {
    return false
  }
}

/** Só para testes. */
export function __limparCacheLive(): void {
  cache = null
}

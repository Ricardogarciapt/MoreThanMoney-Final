import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { esquecerCache } from '@/lib/admin-centro/cache'

const db = () => getSupabaseAdmin()

/**
 * Saldo e equity LIDOS das contas de corretora (216 · `contas_saldo_lido`).
 *
 * Nunca se chama a MetaApi para escrever aqui: guarda-se o que o servidor já leu por outro motivo
 * (vista ao vivo, cópia a dimensionar lotes) e o que o botão «Actualizar saldos» lê em lotes pequenos.
 * As listas do admin lêem esta tabela — zero chamadas à MetaApi por linha.
 */

export type OrigemSaldo = 'vista' | 'copia' | 'actualizar'

// A cópia lê a mesma conta de 5 em 5 s; uma escrita por conta por minuto chega para a lista.
const ESCRITA_MIN_MS = 60_000
const ultimaEscrita = new Map<string, number>()

export async function guardarSaldoLido(p: { chave: string; ref?: string | null; saldo: number | null; equity: number | null; moeda?: string | null; origem: OrigemSaldo }): Promise<void> {
  if (!p.chave || (p.saldo == null && p.equity == null)) return
  const agora = Date.now()
  if (p.origem === 'copia' && agora - (ultimaEscrita.get(p.chave) ?? 0) < ESCRITA_MIN_MS) return
  ultimaEscrita.set(p.chave, agora)
  try {
    await db().from('contas_saldo_lido').upsert({
      chave: p.chave, ref: p.ref ?? null, saldo: p.saldo, equity: p.equity, moeda: p.moeda ?? null,
      origem: p.origem, lido_em: new Date(agora).toISOString(),
    }, { onConflict: 'chave' })
    // Uma leitura pedida no admin aparece logo na lista (a cópia espera pelos 30 s da cache).
    if (p.origem !== 'copia') esquecerCache('centro:contas')
  } catch {
    // Guardar o saldo é um extra: nunca pode partir a leitura nem a cópia que o trouxe.
  }
}

/** A chave física do saldo: o id MetaApi (a mesma conta ligada em várias apps partilha-o) ou a ref. */
export function chaveDoSaldo(c: { ref: string; plataforma: string; metaapiAccountId?: string | null }): string | null {
  if ((c.plataforma === 'mt4' || c.plataforma === 'mt5') && c.metaapiAccountId) return c.metaapiAccountId
  if (c.plataforma === 'tradelocker') return c.ref
  return null
}

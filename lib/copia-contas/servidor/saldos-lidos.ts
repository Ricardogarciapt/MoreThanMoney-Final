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

export async function guardarSaldoLido(p: { chave: string; ref?: string | null; saldo: number | null; equity: number | null; credito?: number | null; moeda?: string | null; origem: OrigemSaldo }): Promise<void> {
  if (!p.chave || (p.saldo == null && p.equity == null)) return
  const agora = Date.now()
  if (p.origem === 'copia' && agora - (ultimaEscrita.get(p.chave) ?? 0) < ESCRITA_MIN_MS) return
  ultimaEscrita.set(p.chave, agora)
  const lidoEm = new Date(agora).toISOString()
  // equity = saldo + crédito + flutuante (225): o flutuante é o que as posições abertas valem AGORA.
  const flutuante = p.saldo != null && p.equity != null ? Number((p.equity - p.saldo - (p.credito ?? 0)).toFixed(2)) : null
  try {
    await db().from('contas_saldo_lido').upsert({
      chave: p.chave, ref: p.ref ?? null, saldo: p.saldo, equity: p.equity, moeda: p.moeda ?? null,
      credito: p.credito ?? null, flutuante,
      origem: p.origem, lido_em: lidoEm,
    }, { onConflict: 'chave' })
    // Histórico (225): só as leituras de hora a hora / pedidas no admin — a cópia lê a cada 5 s e
    // encheria a tabela sem acrescentar nada à curva.
    if (p.origem !== 'copia') {
      await db().from('contas_saldo_historico').insert({
        chave: p.chave, lido_em: lidoEm, saldo: p.saldo, equity: p.equity, credito: p.credito ?? null, flutuante, moeda: p.moeda ?? null, origem: p.origem,
      })
    }
    // Uma leitura pedida no admin aparece logo na lista (a cópia espera pelos 30 s da cache).
    if (p.origem !== 'copia') esquecerCache('centro:contas')
  } catch {
    // Guardar o saldo é um extra: nunca pode partir a leitura nem a cópia que o trouxe.
  }
}

/**
 * Movimentos de conta que não são trades (225 · `contas_movimentos`): depósitos, levantamentos,
 * créditos/bónus, comissões e ajustes, tal como a corretora os regista. Chave = id do deal: ler a
 * mesma janela outra vez não duplica nada.
 */
export async function guardarMovimentos(chave: string, moeda: string | null, lista: { id: string; em: string | null; tipo: string; valor: number | null; tipoCorretora: string; comentario: string | null }[]): Promise<number> {
  const linhas = lista.filter((m) => m.id && m.em).map((m) => ({
    chave, deal_id: m.id, em: m.em, tipo: m.tipo, tipo_corretora: m.tipoCorretora, valor: m.valor, moeda, comentario: m.comentario,
  }))
  if (!linhas.length) return 0
  try {
    const { error } = await db().from('contas_movimentos').upsert(linhas, { onConflict: 'chave,deal_id', ignoreDuplicates: true })
    return error ? 0 : linhas.length
  } catch {
    return 0
  }
}

/** A chave física do saldo: o id MetaApi (a mesma conta ligada em várias apps partilha-o) ou a ref. */
export function chaveDoSaldo(c: { ref: string; plataforma: string; metaapiAccountId?: string | null }): string | null {
  if ((c.plataforma === 'mt4' || c.plataforma === 'mt5') && c.metaapiAccountId) return c.metaapiAccountId
  if (c.plataforma === 'tradelocker') return c.ref
  return null
}

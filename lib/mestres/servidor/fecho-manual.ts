/**
 * Execução do fecho à mão da mestre nas seguidoras — a decisão e o porquê estão em ../fecho-manual.ts.
 *
 * Nunca lança: o fecho da mestre já aconteceu e não pode falhar por causa das seguidoras. O que não
 * passar fica no `console.warn` com a conta e o motivo, e a posição da seguidora continua com a
 * gestão dela (SL/TP), como estava antes desta mudança.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { accaoNaSeguidora, propagaFechoManual } from '../fecho-manual'

export interface ResultadoFechoManual {
  seguidoras: number
  fechadas: number
  parciais: number
  erros: string[]
}

export async function fecharSeguidorasDoFechoManual(p: {
  contaMestreId: string
  posicao: { id: string; origem?: string | null; ideia_ref?: string | null }
  /** fração do lote da mestre que se fechou agora (1 = tudo) */
  fracao: number
  motivo: string
}): Promise<ResultadoFechoManual | null> {
  if (!propagaFechoManual({ motivo: p.motivo, origem: p.posicao.origem, ideiaRef: p.posicao.ideia_ref })) return null
  try {
    const db = getSupabaseAdmin()
    const { data: ponte } = await db.from('funded_sinal_posicoes')
      .select('estrategia, chave').eq('account_id', p.contaMestreId).eq('funded_position_id', p.posicao.id).maybeSingle()
    if (!ponte) return null
    // Só a mestre DA estratégia do sinal propaga — uma seguidora a fechar à mão é decisão dela.
    const { data: mestre } = await db.from('mestres_estrategias').select('slug')
      .eq('conta_mestre_id', p.contaMestreId).ilike('slug', String(ponte.estrategia)).maybeSingle()
    if (!mestre) return null

    const { data: pontes } = await db.from('funded_sinal_posicoes')
      .select('id, account_id, funded_position_id, estado')
      .eq('estrategia', ponte.estrategia).eq('chave', ponte.chave)
      .neq('account_id', p.contaMestreId).in('estado', ['a_abrir', 'aberta']).limit(500)
    const out: ResultadoFechoManual = { seguidoras: pontes?.length ?? 0, fechadas: 0, parciais: 0, erros: [] }
    if (!pontes?.length) return out

    const { aplicarNasPontes } = await import('@/lib/mtmfunded/estrategias-sinais/abrir')
    if (p.fracao >= 1 - 1e-9) {
      const r = await aplicarNasPontes(pontes as Parameters<typeof aplicarNasPontes>[0], 'fechar')
      out.fechadas = r.fechadas
      out.erros.push(...r.erros)
    } else {
      const ex = await import('@/lib/mtmfunded/simulado/execucao')
      for (const pt of pontes) {
        if (!pt.funded_position_id) continue
        try {
          const { data: pos } = await db.from('funded_positions').select('id, estado, symbol, volume')
            .eq('id', pt.funded_position_id).maybeSingle()
          if (!pos || pos.estado !== 'aberta') continue
          const simbolos = await ex.carregarSimbolos([String(pos.symbol)], false)
          const s = simbolos[String(pos.symbol)]
          if (!s) { out.erros.push(`${pt.account_id}: ${pos.symbol} sem especificação`); continue }
          const a = accaoNaSeguidora(p.fracao, Number(pos.volume), s)
          if (a.tipo === 'nada') continue
          const conta = await ex.lerConta(String(pt.account_id))
          if (!conta) continue
          if (a.tipo === 'fechar_tudo') {
            await ex.fecharPosicao(conta, String(pos.id), null, 'estrategia')
            await db.from('funded_sinal_posicoes').update({ estado: 'fechada', updated_at: new Date().toISOString() }).eq('id', pt.id)
            out.fechadas++
          } else {
            await ex.fecharPosicao(conta, String(pos.id), a.volume, 'estrategia')
            out.parciais++
          }
        } catch (e) {
          out.erros.push(`${pt.account_id}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    if (out.erros.length) console.warn('[mestres/fecho-manual]', p.contaMestreId, out.erros.slice(0, 5).join(' · '))
    return out
  } catch (e) {
    console.warn('[mestres/fecho-manual] falhou:', e instanceof Error ? e.message : String(e))
    return null
  }
}

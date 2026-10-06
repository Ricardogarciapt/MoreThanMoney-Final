/**
 * A EVOLUÇÃO DAS INSTRUÇÕES — cada agente propõe, o CEO decide, a receita confirma ou reverte.
 *
 * ═══ A REGRA (decisão do dono, 06/10) ══════════════════════════════════════════════════════
 *
 *  1. No seu ciclo, um agente pode PROPOR uma versão nova das suas instruções com base nos
 *     resultados medidos. A proposta fica em `agentes_instrucoes_versoes` (estado `proposta`), e
 *     passa pela guarda das instruções logo ao entrar — uma proposta que perca um limite fica
 *     registada como recusada e nunca chega ao CEO como «aceitável».
 *  2. O CEO aceita ou rejeita, e responde SEMPRE com uma acção do catálogo fechado (`medir`,
 *     `propor`, `construir`, `baixar_custo`, `justificar`). O catálogo é o mesmo dos pedidos: não
 *     existe forma de o CEO responder a uma versão com «envia» ou «cobra».
 *  3. Uma versão aceite fica `activa` com a receita da janela ANTERIOR gravada ao lado. Passada a
 *     janela seguinte, compara-se: se a receita BAIXOU, a versão é revertida automaticamente (as
 *     instruções de antes voltam) e fica `revertida` com os dois números escritos. Se não baixou,
 *     fica `confirmada`.
 *
 * ═══ PORQUE É QUE A REVERSÃO É AUTOMÁTICA ══════════════════════════════════════════════════
 *
 * Porque a alternativa é uma versão má que fica para sempre por ninguém se lembrar de olhar. Um
 * agente que reescreve as próprias instruções e piora não dá erro — vende menos, e a régua das 48 h
 * mata-o mais tarde com um motivo que não aponta para a reescrita. Reverter é barato e reversível
 * (a versão revertida fica no histórico); não reverter é invisível.
 */
import { ACCOES, type Accao } from './ciclo-ceo'
import { validarReescrita } from './instrucoes-guarda'

export const CHAVE_EVOLUCAO = 'agentes_evolucao'

export interface ConfigEvolucao {
  /** A janela de comparação antes/depois, em dias. */
  janelaDias: number
}

export function lerConfigEvolucao(valor: unknown): ConfigEvolucao {
  let v: Record<string, unknown> = {}
  try {
    v = typeof valor === 'string' ? JSON.parse(valor) : ((valor ?? {}) as Record<string, unknown>)
  } catch {
    v = {}
  }
  const k = Number(v.janela_dias)
  return { janelaDias: Number.isFinite(k) && k >= 1 ? Math.min(30, k) : 7 }
}

// ── 1. A proposta ─────────────────────────────────────────────────────────────────────────────

export interface Proposta {
  aceitaPelaGuarda: boolean
  texto: string
  veredicto: string
  perdidos: string[]
  acrescentados: string[]
}

/** A proposta passa pela guarda ao ENTRAR. Puro. */
export function avaliarProposta(antes: string | null | undefined, depois: string): Proposta {
  const v = validarReescrita({ antes, depois })
  return {
    aceitaPelaGuarda: v.aceita,
    texto: v.aceita ? v.texto : String(depois ?? ''),
    veredicto: v.motivo,
    perdidos: v.perdidos,
    acrescentados: v.acrescentados,
  }
}

// ── 2. A decisão do CEO ───────────────────────────────────────────────────────────────────────

export interface VersaoLida {
  id: string
  agente_id: string
  estado: string
  aceita: boolean
  instrucoes_antes: string | null
  instrucoes_depois: string | null
  receita_antes?: number | string | null
  avaliar_apos?: string | null
}

export interface DecisaoCeo {
  pode: boolean
  porque: string
  /** O que se grava na versão. */
  estadoNovo?: 'activa' | 'rejeitada'
  accao?: Accao
}

/**
 * O CEO decide. Puro, e é aqui que o catálogo fechado se impõe:
 *  · a acção tem de existir em `ACCOES` — «enviar», «cobrar», «publicar» não existem;
 *  · só se decide uma proposta (não uma versão já activa, revertida, ou recusada pela guarda);
 *  · aceitar uma proposta que a guarda recusou é impossível, diga o CEO o que disser.
 */
export function decidirVersao(v: VersaoLida, decisao: unknown, accao: unknown): DecisaoCeo {
  if (typeof accao !== 'string' || !(accao in ACCOES)) {
    return { pode: false, porque: `Acção «${String(accao)}» fora do catálogo fechado (${Object.keys(ACCOES).join(', ')}).` }
  }
  if (v.estado !== 'proposta') {
    return { pode: false, porque: `A versão está «${v.estado}», não é uma proposta por decidir.` }
  }
  if (decisao === 'aceitar') {
    if (!v.aceita) {
      return { pode: false, porque: 'A guarda das instruções recusou esta proposta (perde um limite ou concede um poder). Não se aceita — fica no histórico como tentativa.' }
    }
    return { pode: true, porque: 'Aceite pelo CEO.', estadoNovo: 'activa', accao: accao as Accao }
  }
  if (decisao === 'rejeitar') {
    return { pode: true, porque: 'Rejeitada pelo CEO.', estadoNovo: 'rejeitada', accao: accao as Accao }
  }
  return { pode: false, porque: `Decisão «${String(decisao)}» inválida: é «aceitar» ou «rejeitar».` }
}

// ── 3. Confirmar ou reverter ──────────────────────────────────────────────────────────────────

export interface Reversao {
  decisao: 'espera' | 'confirma' | 'reverte'
  porque: string
}

/**
 * Passada a janela seguinte: a receita baixou? Reverte. Igual ou maior: confirma.
 *
 * O caso que esta função trava: «baixou de 0 para 0». Zero antes e zero depois NÃO é baixar — e
 * reverter aí desfazia a única tentativa que um agente sem vendas fez para mudar.
 */
export function decidirReversao(v: VersaoLida, receitaDepois: number, agora: Date = new Date()): Reversao {
  if (v.estado !== 'activa') return { decisao: 'espera', porque: `Versão ${v.estado}: não se avalia.` }
  const fim = Date.parse(String(v.avaliar_apos ?? ''))
  if (!Number.isFinite(fim)) return { decisao: 'espera', porque: 'Sem data de avaliação — não se reverte por uma data que não existe.' }
  if (agora.getTime() < fim) return { decisao: 'espera', porque: 'A janela seguinte ainda não acabou.' }
  const antes = Number(v.receita_antes ?? 0)
  const depois = Number(receitaDepois ?? 0)
  if (!Number.isFinite(antes) || !Number.isFinite(depois)) return { decisao: 'espera', porque: 'Receita ilegível — não se reverte às cegas.' }
  if (depois < antes) {
    return {
      decisao: 'reverte',
      porque: `A receita BAIXOU com esta versão: ${antes.toFixed(2)} € na janela antes, ${depois.toFixed(2)} € na janela depois. Volta a versão anterior.`,
    }
  }
  return { decisao: 'confirma', porque: `Receita ${antes.toFixed(2)} € → ${depois.toFixed(2)} €: não baixou. Fica.` }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Base de dados.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Db = { from: (tabela: string) => any }

async function receitaEntre(db: Db, agenteId: string, de: Date, ate: Date): Promise<number | null> {
  const { data, error } = await db
    .from('agentes_eventos')
    .select('valor')
    .eq('agente_id', agenteId)
    .eq('tipo', 'receita')
    .gte('criado_em', de.toISOString())
    .lt('criado_em', ate.toISOString())
  if (error) return null
  return ((data ?? []) as Array<{ valor: unknown }>).reduce((s, r) => s + Math.max(0, Number(r.valor) || 0), 0)
}

/** Grava uma proposta de um agente (vinda do motor). A guarda corre aqui, no servidor. */
export async function gravarProposta(
  db: Db,
  agenteId: string,
  depois: string,
  porque: string,
  opcoes: { ensaio?: boolean } = {},
): Promise<{ ok: boolean; aceitaPelaGuarda: boolean; veredicto: string; erro?: string }> {
  const { data: ag, error } = await db.from('agentes_equipa').select('id, estado, instrucoes').eq('id', agenteId).maybeSingle()
  if (error || !ag) return { ok: false, aceitaPelaGuarda: false, veredicto: '', erro: error?.message ?? 'agente não encontrado' }
  if (['morto', 'parado', 'reformado'].includes(String((ag as { estado: string }).estado))) {
    return { ok: false, aceitaPelaGuarda: false, veredicto: '', erro: `agente ${(ag as { estado: string }).estado} não propõe versões` }
  }
  const antes = (ag as { instrucoes: string | null }).instrucoes
  const p = avaliarProposta(antes, depois)
  if (opcoes.ensaio) return { ok: true, aceitaPelaGuarda: p.aceitaPelaGuarda, veredicto: p.veredicto }
  const { error: e } = await db.from('agentes_instrucoes_versoes').insert({
    agente_id: agenteId,
    autor: 'agente',
    instrucoes_antes: antes,
    instrucoes_depois: p.texto,
    porque: porque.trim() || 'Sem motivo escrito.',
    aceita: p.aceitaPelaGuarda,
    limites_perdidos: p.perdidos,
    limites_acrescentados: p.acrescentados,
    veredicto: p.veredicto,
    // Recusada pela guarda não chega ao CEO como proposta: fica registada como tentativa.
    estado: p.aceitaPelaGuarda ? 'proposta' : 'recusada_guarda',
  })
  return e ? { ok: false, aceitaPelaGuarda: p.aceitaPelaGuarda, veredicto: p.veredicto, erro: e.message } : { ok: true, aceitaPelaGuarda: p.aceitaPelaGuarda, veredicto: p.veredicto }
}

/** O CEO decide uma proposta. Aceitar aplica as instruções E grava a receita «antes». */
export async function aplicarDecisaoCeo(
  db: Db,
  versaoId: string,
  decisao: unknown,
  accao: unknown,
  agora: Date = new Date(),
): Promise<{ ok: boolean; porque: string }> {
  const { data: cfg } = await db.from('site_settings').select('value').eq('key', CHAVE_EVOLUCAO).maybeSingle()
  const { janelaDias } = lerConfigEvolucao(cfg?.value)
  const { data: v, error } = await db
    .from('agentes_instrucoes_versoes')
    .select('id, agente_id, estado, aceita, instrucoes_antes, instrucoes_depois, receita_antes, avaliar_apos')
    .eq('id', versaoId)
    .maybeSingle()
  if (error || !v) return { ok: false, porque: error?.message ?? 'versão não encontrada' }
  const d = decidirVersao(v as VersaoLida, decisao, accao)
  if (!d.pode) return { ok: false, porque: d.porque }

  const mudanca: Record<string, unknown> = { estado: d.estadoNovo, decisao_ceo: decisao, accao_ceo: d.accao, decidida_em: agora.toISOString() }
  if (d.estadoNovo === 'activa') {
    const antes = await receitaEntre(db, (v as VersaoLida).agente_id, new Date(agora.getTime() - janelaDias * 86_400_000), agora)
    if (antes === null) return { ok: false, porque: 'Não se leu a receita «antes» — sem ela a reversão não teria com que comparar.' }
    mudanca.receita_antes = antes
    mudanca.avaliar_apos = new Date(agora.getTime() + janelaDias * 86_400_000).toISOString()
    // Revalida no momento de aplicar: as instruções do agente podem ter mudado desde a proposta.
    const { data: ag } = await db.from('agentes_equipa').select('instrucoes').eq('id', (v as VersaoLida).agente_id).maybeSingle()
    const val = validarReescrita({ antes: (ag as { instrucoes?: string } | null)?.instrucoes ?? '', depois: String((v as VersaoLida).instrucoes_depois ?? '') })
    if (!val.aceita) return { ok: false, porque: `Ao aplicar, a guarda recusou: ${val.motivo.slice(0, 200)}` }
    const { error: e1 } = await db.from('agentes_equipa').update({ instrucoes: val.texto, atualizado_em: agora.toISOString() }).eq('id', (v as VersaoLida).agente_id)
    if (e1) return { ok: false, porque: e1.message }
    mudanca.instrucoes_antes = (ag as { instrucoes?: string } | null)?.instrucoes ?? (v as VersaoLida).instrucoes_antes
  }
  const { error: e2 } = await db.from('agentes_instrucoes_versoes').update(mudanca).eq('id', versaoId)
  if (e2) return { ok: false, porque: e2.message }
  await db.from('agentes_eventos').insert({
    agente_id: (v as VersaoLida).agente_id,
    tipo: d.estadoNovo === 'activa' ? 'versao_aceite' : 'versao_rejeitada',
    detalhe: `${d.porque} Acção do CEO: ${d.accao}.`,
  })
  return { ok: true, porque: d.porque }
}

/** A passagem que confirma ou reverte as versões activas cuja janela acabou. */
export async function correrReversoes(
  db: Db,
  opcoes: { ensaio?: boolean; agora?: Date } = {},
): Promise<{ ok: boolean; revertidas: string[]; confirmadas: string[]; erros: string[] }> {
  const agora = opcoes.agora ?? new Date()
  const erros: string[] = []
  const revertidas: string[] = []
  const confirmadas: string[] = []
  const { data: cfg } = await db.from('site_settings').select('value').eq('key', CHAVE_EVOLUCAO).maybeSingle()
  const { janelaDias } = lerConfigEvolucao(cfg?.value)
  const { data: activas, error } = await db
    .from('agentes_instrucoes_versoes')
    .select('id, agente_id, estado, aceita, instrucoes_antes, instrucoes_depois, receita_antes, avaliar_apos')
    .eq('estado', 'activa')
    .lte('avaliar_apos', agora.toISOString())
    .limit(100)
  if (error) return { ok: false, revertidas, confirmadas, erros: [error.message] }
  for (const v of (activas ?? []) as VersaoLida[]) {
    const fim = Date.parse(String(v.avaliar_apos))
    const depois = await receitaEntre(db, v.agente_id, new Date(fim - janelaDias * 86_400_000), new Date(fim))
    if (depois === null) {
      erros.push(`${v.id}: receita «depois» ilegível — não se decide`)
      continue
    }
    const r = decidirReversao(v, depois, agora)
    if (r.decisao === 'espera' || opcoes.ensaio) {
      if (r.decisao === 'reverte') revertidas.push(v.id)
      if (r.decisao === 'confirma') confirmadas.push(v.id)
      continue
    }
    if (r.decisao === 'reverte') {
      // Só se repõem as instruções de antes se o agente AINDA tiver as desta versão: se entretanto
      // foi reeducado, reverter apagava a reeducação.
      const { data: ag } = await db.from('agentes_equipa').select('instrucoes').eq('id', v.agente_id).maybeSingle()
      const actuais = (ag as { instrucoes?: string } | null)?.instrucoes ?? ''
      if (actuais.trim() === String(v.instrucoes_depois ?? '').trim() && v.instrucoes_antes) {
        await db.from('agentes_equipa').update({ instrucoes: v.instrucoes_antes, atualizado_em: agora.toISOString() }).eq('id', v.agente_id)
      }
      await db.from('agentes_instrucoes_versoes').update({ estado: 'revertida', receita_depois: depois, revertida_em: agora.toISOString() }).eq('id', v.id)
      await db.from('agentes_eventos').insert({ agente_id: v.agente_id, tipo: 'versao_revertida', detalhe: r.porque })
      revertidas.push(v.id)
    } else {
      await db.from('agentes_instrucoes_versoes').update({ estado: 'confirmada', receita_depois: depois }).eq('id', v.id)
      confirmadas.push(v.id)
    }
  }
  return { ok: erros.length === 0, revertidas, confirmadas, erros }
}

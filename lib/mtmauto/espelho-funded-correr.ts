/**
 * O LADO QUE FALA COM A BASE do fecho das execuções espelhadas em contas MTM Funded.
 *
 * A decisão toda (quem casa com quem, quando se desiste) vive em `espelho-funded.ts`, pura e
 * testada. Aqui só se lê, se escreve e se conta — a mesma separação de `lib/mtmcopy/reconciliacao.ts`.
 *
 * `seco: true` diz o que faria sem tocar em nada. É assim que isto se estreia em produção.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { agruparParciais, type ParteFechada } from '@/lib/mtmfunded/historico-parciais'
import { pipSizeForSymbol } from '@/lib/mtmcopy/trade-outcome'
import {
  emparelharEspelho,
  passouOPrazo,
  JANELA_ANTES_MS,
  JANELA_DEPOIS_MS,
  MOTIVO_ESPELHO_NAO_ABRIU,
  type ExecucaoPendente,
  type PosicaoEspelho,
} from './espelho-funded'

export interface ResultadoEspelhoFunded {
  pendentes: number
  emparelhadas: number
  fechadas: number
  abertas: number
  desistidas: number
  semParAindaNoPrazo: number
  notas: string[]
}

export async function fecharEspelhosFunded(
  opts: { seco?: boolean; agora?: number } = {},
): Promise<ResultadoEspelhoFunded> {
  const db = getSupabaseAdmin()
  const seco = opts.seco === true
  const agora = opts.agora ?? Date.now()
  const notas: string[] = []
  const vazio: ResultadoEspelhoFunded = {
    pendentes: 0, emparelhadas: 0, fechadas: 0, abertas: 0, desistidas: 0, semParAindaNoPrazo: 0, notas,
  }

  // 1) As execuções presas: `pending` numa conta `mtmfunded`. Nenhum outro ciclo as visita.
  const { data: execs, error: eErr } = await db
    .from('mtmauto_executions')
    .select('id, account_id, signal_id, created_at, mtmauto_accounts!inner(plataforma, funded_account_id), mtmauto_signals(symbol, direction)')
    .eq('estado', 'pending')
    .eq('mtmauto_accounts.plataforma', 'mtmfunded')
    .limit(500)
  if (eErr) { notas.push(`execuções: ${eErr.message}`); return vazio }

  type Linha = {
    id: string
    created_at: string
    mtmauto_accounts: { funded_account_id: string | null } | null
    mtmauto_signals: { symbol: string | null; direction: string | null } | null
  }
  const linhas = ((execs ?? []) as unknown as Linha[]).filter(
    (l) => l.mtmauto_accounts?.funded_account_id && l.mtmauto_signals?.symbol && l.mtmauto_signals?.direction,
  )
  vazio.pendentes = linhas.length
  if (!linhas.length) return vazio

  const pendentes: ExecucaoPendente[] = linhas.map((l) => ({
    id: l.id,
    funded_account_id: String(l.mtmauto_accounts!.funded_account_id),
    symbol: String(l.mtmauto_signals!.symbol),
    direction: String(l.mtmauto_signals!.direction),
    created_at: l.created_at,
  }))

  // 2) As posições que o espelho abriu nessas contas, na janela que interessa. Só RAÍZES: uma
  //    parcial é uma filha da mesma trade e não é uma trade nova.
  const contas = [...new Set(pendentes.map((p) => p.funded_account_id))]
  const t = pendentes.map((p) => Date.parse(p.created_at)).filter(Number.isFinite)
  const de = new Date(Math.min(...t) - JANELA_ANTES_MS).toISOString()
  const ate = new Date(Math.max(...t) + JANELA_DEPOIS_MS).toISOString()

  const { data: pos, error: pErr } = await db
    .from('funded_positions')
    .select('id, account_id, symbol, direcao, aberta_em, estado')
    .in('account_id', contas)
    .is('mae_id', null)
    .gte('aberta_em', de)
    .lte('aberta_em', ate)
    .limit(2000)
  if (pErr) { notas.push(`posições: ${pErr.message}`); return vazio }

  const raizes = (pos ?? []) as Array<PosicaoEspelho & { estado: string | null }>
  const estadoDaRaiz = new Map(raizes.map((r) => [String(r.id), String(r.estado ?? '')]))
  const { pares, semPar } = emparelharEspelho(pendentes, raizes)
  vazio.emparelhadas = pares.length

  const desempatadas = pares.filter((p) => p.candidatos > 1).length
  if (desempatadas) notas.push(`${desempatadas} emparelhada(s) com mais de um candidato — desempate pelo tempo`)

  // 3) Para as que fecharam, o desfecho REAL: todas as partes da trade, líquido e pips pesados.
  const raizesFechadas = pares.map((p) => p.posicaoId).filter((id) => estadoDaRaiz.get(id) === 'fechada')
  const partesPorRaiz = new Map<string, ParteFechada[]>()
  if (raizesFechadas.length) {
    const { data: partes } = await db
      .from('funded_positions')
      .select('id, mae_id, account_id, symbol, direcao, volume, preco_entrada, preco_fecho, pnl, comissao, swap, aberta_em, fechada_em')
      .or(raizesFechadas.map((id) => `id.eq.${id},mae_id.eq.${id}`).join(','))
      .eq('estado', 'fechada')
      .limit(5000)
    for (const p of (partes ?? []) as ParteFechada[]) {
      const raiz = String(p.mae_id ?? p.id)
      partesPorRaiz.set(raiz, [...(partesPorRaiz.get(raiz) ?? []), p])
    }
  }

  const carimbo = new Date(agora).toISOString()
  for (const par of pares) {
    const estado = estadoDaRaiz.get(par.posicaoId)
    if (estado === 'fechada') {
      const [trade] = agruparParciais(partesPorRaiz.get(par.posicaoId) ?? [], new Set([par.posicaoId]), pipSizeForSymbol)
      if (!trade) { notas.push(`${par.execId}: raiz fechada sem partes legíveis — deixada como está`); continue }
      if (!seco) {
        await db.from('mtmauto_executions').update({
          estado: 'closed',
          motivo: null,
          broker_position_id: par.posicaoId,
          resultado: trade.resultado,
          resultado_pips: trade.pips,
          fechado_em: trade.quando,
          updated_at: carimbo,
        }).eq('id', par.execId)
      }
      vazio.fechadas++
    } else {
      // Ainda aberta na conta MTM Funded: deixa de ser uma promessa e passa a ser uma posição.
      if (!seco) {
        await db.from('mtmauto_executions').update({
          estado: 'open',
          motivo: null,
          broker_position_id: par.posicaoId,
          updated_at: carimbo,
        }).eq('id', par.execId)
      }
      vazio.abertas++
    }
  }

  // 4) Sem posição: só se desiste depois do prazo de cortesia. Antes disso o espelho ainda pode vir.
  const porId = new Map(pendentes.map((p) => [p.id, p]))
  for (const id of semPar) {
    const p = porId.get(id)
    if (!p || !passouOPrazo(p.created_at, agora)) { vazio.semParAindaNoPrazo++; continue }
    if (!seco) {
      await db.from('mtmauto_executions').update({
        estado: 'skipped', motivo: MOTIVO_ESPELHO_NAO_ABRIU, updated_at: carimbo,
      }).eq('id', id)
    }
    vazio.desistidas++
  }

  return vazio
}

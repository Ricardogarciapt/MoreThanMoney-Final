/**
 * Lê o fecho REAL das cópias nas contas MT4/MT5 (deals MetaApi) e grava-o em `copia_resultados`
 * ao lado da mestre MTM Funded, em pips. Só LEITURA das contas (GET /history-deals): nunca abre,
 * modifica nem fecha nada. Regra pura em ../resultados.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { restMt5ComToken } from '@/lib/webtrader/corretoras/mt5'
import { compararComMestre, fechosPorPosicao, resumoPorConta, vigiarCopias, type DealMt, type Direcao, type VigiaCopias } from '../resultados'
import { lerContaPorRef, tokenDaConta } from './refs'

type Db = SupabaseClient

export interface ResultadoLeitura {
  contas: number
  contasLidas: number
  falhas: string[]
  gravados: number
  resumo: ReturnType<typeof resumoPorConta>
  /** cópias abertas na corretora com a mestre já fechada (dinheiro real sem gestão) */
  orfas: Array<VigiaCopias['orfas'][number] & { conta: string }>
  /** linhas de copia_posicoes acertadas pela vigia */
  corrigidas: number
}

export async function lerResultadosDasCopias(db: Db, opcoes: { horas?: number; ensaio?: boolean } = {}): Promise<ResultadoLeitura> {
  const horas = Math.min(24 * 14, Math.max(1, opcoes.horas ?? 48))
  const desde = new Date(Date.now() - horas * 3600_000)
  const ate = new Date()

  const { data: rotas, error } = await db.from('copia_rotas')
    .select('id, destino_ref, destino_chave, estrategia_slug, origem_tipo')
    .like('destino_chave', 'mt:%')
  if (error) throw new Error(`copia_rotas: ${error.message}`)

  const porDestino = new Map<string, { ref: string; chave: string; rotas: Array<{ id: string; estrategia: string | null }> }>()
  for (const r of rotas ?? []) {
    const d = porDestino.get(r.destino_chave) ?? { ref: r.destino_ref, chave: r.destino_chave, rotas: [] as Array<{ id: string; estrategia: string | null }> }
    d.rotas.push({ id: r.id, estrategia: r.estrategia_slug ?? null })
    porDestino.set(r.destino_chave, d)
  }

  const falhas: string[] = []
  const linhas: Record<string, unknown>[] = []
  let contasLidas = 0
  const orfas: ResultadoLeitura['orfas'] = []
  let corrigidas = 0

  for (const d of porDestino.values()) {
    const { data: copias } = await db.from('copia_posicoes')
      .select('id, rota_id, origem_posicao_id, destino_posicao_id, destino_simbolo, direcao, created_at')
      .in('rota_id', d.rotas.map((r) => r.id))
      .not('destino_posicao_id', 'is', null)
      .gte('created_at', new Date(desde.getTime() - 7 * 86400_000).toISOString())
    const { data: vivas } = await db.from('copia_posicoes')
      .select('id, estado, destino_posicao_id, client_id, origem_posicao_id, destino_simbolo, direcao')
      .in('rota_id', d.rotas.map((r) => r.id))
      .in('estado', ['aberta', 'erro'])
      .gte('created_at', new Date(desde.getTime() - 7 * 86400_000).toISOString())
    if (!copias?.length && !vivas?.length) continue

    const conta = await lerContaPorRef(d.ref).catch(() => null)
    if (!conta?.metaapiAccountId) { falhas.push(`${d.chave}: sem conta MetaApi`); continue }
    const t = await tokenDaConta(conta).catch(() => null)
    if (!t) { falhas.push(`${d.chave}: sem chave MetaApi`); continue }
    let deals: DealMt[]
    try {
      const r = await restMt5ComToken(t.token)(conta.metaapiAccountId,
        `/history-deals/time/${encodeURIComponent(desde.toISOString())}/${encodeURIComponent(ate.toISOString())}`)
      deals = Array.isArray(r) ? (r as DealMt[]) : []
    } catch (e) {
      falhas.push(`${d.chave}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`)
      continue
    }
    contasLidas++

    // ── vigia: órfãs e base desacertada (GET /positions; só se escreve na nossa tabela) ──
    if (vivas?.length) {
      const abertas = await restMt5ComToken(t.token)(conta.metaapiAccountId, '/positions').catch(() => null)
      if (Array.isArray(abertas)) {
        const idsM = [...new Set(vivas.map((c) => c.origem_posicao_id).filter(Boolean))] as string[]
        const { data: ms } = idsM.length
          ? await db.from('funded_positions').select('id, estado, fechada_em').in('id', idsM)
          : { data: [] as Array<{ id: string; estado: string | null; fechada_em: string | null }> }
        const v = vigiarCopias({
          copias: vivas.map((c) => ({ ...c, destino_posicao_id: c.destino_posicao_id == null ? null : String(c.destino_posicao_id) })),
          abertasNoDestino: (abertas as Array<{ id: unknown; clientId?: string | null }>).map((x) => ({ id: String(x.id), clientId: x.clientId ?? null })),
          deals,
          mestres: new Map((ms ?? []).map((m) => [String(m.id), { estado: m.estado ?? null, fechada_em: m.fechada_em ?? null }])),
          agora: ate.getTime(),
        })
        for (const o of v.orfas) orfas.push({ ...o, conta: d.chave })
        if (!opcoes.ensaio) {
          for (const c of v.correcoes) {
            const { error: e } = await db.from('copia_posicoes').update({
              estado: c.estado, ...(c.destino_posicao_id ? { destino_posicao_id: c.destino_posicao_id } : {}),
              ...(c.estado === 'fechada' ? { fechado_pct: 1 } : {}), erro: c.nota, updated_at: ate.toISOString(),
            }).eq('id', c.copiaId).in('estado', ['aberta', 'erro'])
            if (!e) corrigidas++
          }
        } else corrigidas += v.correcoes.length
      } else falhas.push(`${d.chave}: posições abertas ilegíveis (vigia saltada)`)
    }
    if (!copias?.length) continue

    const fechos = fechosPorPosicao(deals)
    const minhas = copias.filter((c) => fechos.has(String(c.destino_posicao_id)))
    if (!minhas.length) continue

    const ids = [...new Set(minhas.map((c) => c.origem_posicao_id).filter(Boolean))] as string[]
    const { data: mestres } = ids.length
      ? await db.from('funded_positions').select('id, symbol, preco_entrada, preco_fecho, motivo_fecho, fechada_em, estado').in('id', ids)
      : { data: [] as Array<Record<string, unknown>> }
    const mestrePorId = new Map((mestres ?? []).map((m) => [String(m.id), m]))
    const estrategiaDaRota = new Map(d.rotas.map((r) => [r.id, r.estrategia]))

    for (const c of minhas) {
      const f = fechos.get(String(c.destino_posicao_id))!
      const m = mestrePorId.get(String(c.origem_posicao_id))
      const fechada = m && m.estado === 'fechada'
      const simbolo = String(m?.symbol ?? c.destino_simbolo ?? f.simbolo ?? '')
      const direcao = (c.direcao === 'sell' ? 'sell' : 'buy') as Direcao
      const k = compararComMestre({
        direcao, simbolo, copia: f,
        mestre: {
          precoEntrada: fechada ? Number(m!.preco_entrada) : null,
          precoFecho: fechada ? Number(m!.preco_fecho) : null,
          fechadaEm: fechada ? String(m!.fechada_em) : null,
        },
      })
      linhas.push({
        copia_posicao_id: c.id, rota_id: c.rota_id, destino_chave: d.chave, estrategia: estrategiaDaRota.get(c.rota_id) ?? null,
        destino_posicao_id: String(c.destino_posicao_id), origem_posicao_id: c.origem_posicao_id, simbolo, direcao,
        volume: f.volume, preco_entrada: f.precoEntrada, preco_fecho: f.precoFecho, lucro: f.lucro, motivo: f.motivo, fechada_em: f.fechadaEm,
        mestre_preco_entrada: fechada ? m!.preco_entrada : null, mestre_preco_fecho: fechada ? m!.preco_fecho : null,
        mestre_motivo: fechada ? m!.motivo_fecho : null, mestre_fechada_em: fechada ? m!.fechada_em : null,
        pips_copia: k.pipsCopia, pips_mestre: k.pipsMestre, divergencia_pips: k.divergenciaPips,
        custo_entrada_pips: k.custoEntradaPips, saiu_antes: k.saiuAntes, pips_sombra_b: k.pipsSombraB,
        lido_em: ate.toISOString(),
      })
    }
  }

  let gravados = 0
  if (!opcoes.ensaio && linhas.length) {
    for (let i = 0; i < linhas.length; i += 200) {
      const { error: e } = await db.from('copia_resultados').upsert(linhas.slice(i, i + 200), { onConflict: 'copia_posicao_id' })
      if (e) { falhas.push(`gravar: ${e.message}`); break }
      gravados += Math.min(200, linhas.length - i)
    }
  }

  return {
    contas: porDestino.size,
    contasLidas,
    falhas,
    gravados,
    orfas,
    corrigidas,
    resumo: resumoPorConta(linhas.map((l) => ({
      destino_chave: String(l.destino_chave), pips_copia: l.pips_copia as number | null, pips_mestre: l.pips_mestre as number | null,
      pips_sombra_b: l.pips_sombra_b as number | null, saiu_antes: Boolean(l.saiu_antes),
    }))),
  }
}

/** Texto curto para o Telegram do admin. */
export function textoDoResumo(r: ResultadoLeitura, horas: number): string {
  const s = (x: number) => `${x >= 0 ? '+' : ''}${x}`
  const linhas = [`📊 Cópias MT5 vs mestre — últimas ${horas} h (pips)`]
  if (!r.resumo.length) linhas.push('Sem cópias fechadas com mestre fechada neste período.')
  for (const c of r.resumo) {
    linhas.push(`${c.conta}: cópia ${s(c.copia)} · mestre ${s(c.mestre)} · a sair com a mestre ${s(c.sombraB)} · ${c.n} trades, ${c.saiuAntes} saíram antes`)
  }
  if (r.orfas.length) {
    linhas.push(`⚠️ ${r.orfas.length} cópia(s) ABERTA(S) na corretora com a mestre já fechada — fecha à mão ou confirma:`)
    for (const o of r.orfas.slice(0, 8)) linhas.push(`  · ${o.conta} #${o.positionId} ${o.simbolo ?? ''} ${o.direcao ?? ''} (mestre fechou ${o.mestreFechadaEm.slice(0, 16).replace('T', ' ')} UTC)`)
  }
  if (r.corrigidas) linhas.push(`Base acertada: ${r.corrigidas} cópia(s) (fechadas na corretora ou encontradas pelo clientId).`)
  if (r.falhas.length) linhas.push(`Não lidas: ${r.falhas.slice(0, 5).join(' | ')}`)
  linhas.push('Só leitura. «A sair com a mestre» é estimativa (sem o spread do fecho).')
  return linhas.join('\n')
}

/** Só o alerta das órfãs (vigia de hora a hora). Vazio = não há nada a dizer. */
export function textoDasOrfas(r: ResultadoLeitura): string {
  if (!r.orfas.length) return ''
  const l = [`⚠️ Vigia das cópias: ${r.orfas.length} posição(ões) ABERTA(S) na corretora com a mestre MTM Funded já fechada.`]
  for (const o of r.orfas.slice(0, 10)) l.push(`· ${o.conta} #${o.positionId} ${o.simbolo ?? ''} ${o.direcao ?? ''} — mestre fechou ${o.mestreFechadaEm.slice(0, 16).replace('T', ' ')} UTC`)
  l.push('Nada foi fechado automaticamente: confirma e fecha no MT5 ou no admin.')
  return l.join('\n')
}

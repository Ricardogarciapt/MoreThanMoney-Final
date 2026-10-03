import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { RegrasConta } from './regras'
import {
  avaliarConta, decidirVigia, deveParar, diaDaCorretora, resumirHistorico,
  type AccaoVigia, type NegocioMt5,
} from './leitura-mt5'

/**
 * O VIGIA DAS CONTAS MT5 DO MTM FUNDED (desafios e financiadas fora de torneio).
 *
 * Regras e custos em ./leitura-mt5.ts. Aqui só a rede (REST da MetaApi) e a base de dados.
 * Chamado pelo cron de 10 em 10 min (/api/cron/mtmfunded-mt5-vigia) e pelo cron horário
 * (/api/cron/mtmfunded-metrics). Nunca ligação RPC nem streaming, nunca a lista de símbolos.
 */

type Db = ReturnType<typeof getSupabaseAdmin>

const PROVISIONING_BASE =
  process.env.METAAPI_PROVISIONING_URL ?? 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'
const regiao = () => process.env.METAAPI_REGION?.trim() || 'london'
const clientBase = () => `https://mt-client-api-v1.${regiao()}.agiliumtrade.ai/users/current/accounts`

export const HORAS_OCIOSA = () => Number(process.env.MTMFUNDED_MT5_OCIOSA_HORAS || 48)
export const HORAS_VARREDURA = () => Number(process.env.MTMFUNDED_MT5_VARREDURA_HORAS || 24)

export interface EstadoVigia {
  paradaPorNosEm?: string | null
  deployPedidoEm?: string | null
  donoPediuEm?: string | null
  posicoesAbertas?: number
  forcarCompleta?: boolean
  ultimaAccao?: AccaoVigia
}

type Resposta<T> = { ok: true; data: T } | { ok: false; status: number }

/** Um GET REST da conta, com o travão de quota e o registo de inexistentes. Nunca lança. */
async function getConta<T>(metaapiId: string, caminho: string): Promise<Resposta<T>> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, status: 0 }
  try {
    const r = await fetch(`${clientBase()}/${metaapiId}${caminho}`, {
      headers: { 'auth-token': token }, cache: 'no-store', signal: AbortSignal.timeout(20_000),
    })
    if (r.ok) return { ok: true, data: (await r.json()) as T }
    const texto = await r.text().catch(() => '')
    const erro = { status: r.status, message: texto }
    if (r.status === 429) {
      const { registarErroQuota } = await import('@/lib/mtmcopy/metaapi-quota')
      await registarErroQuota(metaapiId, erro)
    } else if (r.status === 404) {
      const { marcarContaInexistente } = await import('@/lib/mtmcopy/metaapi-inexistentes')
      await marcarContaInexistente(metaapiId, erro, { nivelConta: true, origem: 'mtmfunded-vigia' })
    }
    return { ok: false, status: r.status }
  } catch {
    return { ok: false, status: 0 }
  }
}

export async function pedirDeploy(metaapiId: string): Promise<boolean> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return false
  const r = await fetch(`${PROVISIONING_BASE}/users/current/accounts/${metaapiId}/deploy`, {
    method: 'POST', headers: { 'auth-token': token }, signal: AbortSignal.timeout(15_000),
  }).catch(() => null)
  return Boolean(r && (r.ok || r.status === 204))
}

interface InfoConta { equity?: number; balance?: number; margin?: number; freeMargin?: number; marginLevel?: number }

const PONTOS_HISTORICO = 240
function empilhar(anterior: unknown, p: { equity: number; saldo: number; margem?: number }) {
  const antes = Array.isArray(anterior) ? (anterior as Array<Record<string, number | string>>) : []
  return [
    ...antes,
    { t: new Date().toISOString(), e: Math.round(p.equity * 100) / 100, s: Math.round(p.saldo * 100) / 100, ...(p.margem != null ? { m: Math.round(p.margem * 100) / 100 } : {}) },
  ].slice(-PONTOS_HISTORICO)
}

export interface ResultadoVigia {
  lidas: number
  quebradas: number
  semResposta: number
  accoes: Partial<Record<AccaoVigia | 'parada', number>>
}

/** Regras de todos os programas + fallback por tamanho (1 fase) para contas emitidas à mão. */
async function lerRegras(db: Db) {
  const programas = new Map<string, RegrasConta>()
  const porTamanho = new Map<string, RegrasConta>()
  const { data } = await db.from('mtm_funded_programs').select('id, regras, saldo, fases')
  for (const p of data ?? []) {
    const regras = (p.regras ?? {}) as RegrasConta
    programas.set(p.id as string, regras)
    if (Number(p.fases) === 1) porTamanho.set(String(Number(p.saldo)), regras)
  }
  return { programas, porTamanho }
}

export async function vigiarContasMt5(db: Db, notas: string[], minutosEntreLeituras: number): Promise<ResultadoVigia> {
  const out: ResultadoVigia = { lidas: 0, quebradas: 0, semResposta: 0, accoes: {} }
  const conta1 = (a: AccaoVigia | 'parada') => { out.accoes[a] = (out.accoes[a] ?? 0) + 1 }

  const { data: contas } = await db
    .from('mtm_trading_accounts')
    .select('id, user_id, tipo, program_id, saldo_inicial, metaapi_account_id, metricas, metricas_lidas_em, estado, created_at')
    .in('tipo', ['desafio', 'funded', 'financiada'])
    .eq('estado', 'ativa')
    .not('metaapi_account_id', 'is', null)
    .neq('motor', 'sim')
    .is('tournament_id', null)
    .limit(200)
  if (!contas?.length) return out

  const [{ programas, porTamanho }, { lerEstadosMetaApi }, { contaInexistente }, { leituraDeFundoBloqueada }] =
    await Promise.all([
      lerRegras(db),
      import('@/lib/mtmcopy/contas-ociosas'),
      import('@/lib/mtmcopy/metaapi-inexistentes'),
      import('@/lib/mtmcopy/metaapi-quota'),
    ])
  // UMA chamada de provisioning para o estado de todas (não gasta créditos da API de cliente).
  const estados = await lerEstadosMetaApi()

  const tratar = async (conta: Record<string, unknown>) => {
    const id = String(conta.id)
    const curto = id.slice(0, 8)
    const metaapiId = String(conta.metaapi_account_id)
    const anterior = (conta.metricas ?? {}) as Record<string, unknown>
    const vigia = (anterior.vigia ?? {}) as EstadoVigia
    const ms = (s: unknown) => (typeof s === 'string' && Number.isFinite(Date.parse(s)) ? Date.parse(s) : null)
    const agora = Date.now()

    let regras = conta.program_id ? programas.get(String(conta.program_id)) ?? null : null
    if (!regras) regras = porTamanho.get(String(Number(conta.saldo_inicial ?? 0))) ?? null
    if (!regras) { notas.push(`mt5 ${curto}: sem programa nem tamanho conhecido`); return }

    const accao = decidirVigia({
      agoraMs: agora,
      estadoMetaApi: estados ? (estados.get(metaapiId)?.state ?? 'NAO_LISTADA') : null,
      inexistente: await contaInexistente(metaapiId),
      quotaBloqueada: await leituraDeFundoBloqueada(metaapiId),
      minutosEntreLeituras,
      lidaEmMs: ms(conta.metricas_lidas_em),
      diaReferencia: typeof anterior.diaReferencia === 'string' ? anterior.diaReferencia : null,
      paradaPorNosEmMs: ms(vigia.paradaPorNosEm),
      deployPedidoEmMs: ms(vigia.deployPedidoEm),
      donoPediuEmMs: ms(vigia.donoPediuEm),
      horasVarredura: HORAS_VARREDURA(),
      forcarCompleta: vigia.forcarCompleta === true,
    })
    conta1(accao)

    const gravarVigia = (v: EstadoVigia) =>
      db.from('mtm_trading_accounts')
        .update({ metricas: { ...anterior, vigia: { ...vigia, ...v, ultimaAccao: accao } } })
        .eq('id', id)

    if (accao === 'deploy') {
      // Uma conta que a própria MetaApi apagou da listagem não se tenta ligar às cegas.
      if (estados && !estados.has(metaapiId)) { notas.push(`mt5 ${curto}: não aparece na MetaApi`); return }
      await pedirDeploy(metaapiId)
      await gravarVigia({ deployPedidoEm: new Date(agora).toISOString() })
      return
    }
    if (accao !== 'leitura_completa' && accao !== 'posicoes') return

    // ── posições primeiro (50 créditos) ─────────────────────────────────────
    const pos = await getConta<unknown[]>(metaapiId, '/positions')
    if (!pos.ok) { out.semResposta++; return }
    const posicoesAbertas = Array.isArray(pos.data) ? pos.data.length : 0

    if (accao === 'posicoes' && posicoesAbertas === 0) {
      // Sem posições: nada a medir até à próxima completa — a não ser que tenham acabado de
      // fechar (o saldo mudou), e aí faz-se já a completa na próxima passagem.
      const fecharamAgora = Number(vigia.posicoesAbertas ?? 0) > 0
      const ultimoNeg = ms(anterior.ultimoNegocioEm)
      if (!fecharamAgora && deveParar({
        agoraMs: agora, posicoesAbertas: 0, ultimoNegocioEmMs: ultimoNeg,
        criadaEmMs: ms(conta.created_at), horasOciosa: HORAS_OCIOSA(), donoPediuEmMs: ms(vigia.donoPediuEm),
      })) {
        const { undeployMetaApiAccount } = await import('@/lib/mtmcopy/metaapi-provision')
        await undeployMetaApiAccount(metaapiId)
        conta1('parada')
        await gravarVigia({ posicoesAbertas: 0, paradaPorNosEm: new Date(agora).toISOString() })
        return
      }
      if (fecharamAgora) {
        await gravarVigia({ posicoesAbertas: 0, forcarCompleta: true })
        return
      }
      await gravarVigia({ posicoesAbertas: 0 })
      return
    }

    // ── equity (50 créditos) ────────────────────────────────────────────────
    const info = await getConta<InfoConta>(metaapiId, '/account-information')
    if (!info.ok || typeof info.data.equity !== 'number' || typeof info.data.balance !== 'number') {
      out.semResposta++
      return
    }
    out.lidas++
    const snap = { equity: info.data.equity, saldo: info.data.balance, margem: info.data.margin }
    const saldoInicial = Number(conta.saldo_inicial ?? 0)

    // ── histórico (só na completa: 75 + 0,65/negócio) ───────────────────────
    let lucroPorDia = (anterior.lucroPorDia ?? {}) as Record<string, number>
    let diasNegociados = Number(anterior.diasNegociados ?? 0)
    let refDia = Number(anterior.saldoReferenciaDia ?? snap.saldo)
    let diaReferencia = typeof anterior.diaReferencia === 'string' ? anterior.diaReferencia : diaDaCorretora(agora)
    let ultimoNegocioEm = typeof anterior.ultimoNegocioEm === 'string' ? anterior.ultimoNegocioEm : null
    let quebraHistorico: { motivo: string; detalhe: string } | null = null

    if (accao === 'leitura_completa') {
      const desde = ultimoNegocioEm ?? String(conta.created_at ?? new Date(agora - 30 * 86_400_000).toISOString())
      const deals = await getConta<NegocioMt5[]>(
        metaapiId,
        `/history-deals/time/${encodeURIComponent(desde)}/${encodeURIComponent(new Date(agora).toISOString())}`,
      )
      if (deals.ok) {
        const r = resumirHistorico({
          saldoAtual: snap.saldo, saldoInicial, agoraMs: agora, regras,
          negocios: Array.isArray(deals.data) ? deals.data : [],
          anterior: {
            lucroPorDia, ultimoNegocioEm,
            saldoReferenciaDia: Number.isFinite(Number(anterior.saldoReferenciaDia)) ? Number(anterior.saldoReferenciaDia) : null,
            diaReferencia: typeof anterior.diaReferencia === 'string' ? anterior.diaReferencia : null,
          },
        })
        lucroPorDia = r.lucroPorDia
        diasNegociados = r.diasNegociados
        refDia = r.saldoReferenciaDia
        diaReferencia = r.diaReferencia
        ultimoNegocioEm = r.ultimoNegocioEm
        quebraHistorico = r.quebra
      } else if (diaReferencia !== diaDaCorretora(agora)) {
        // Sem histórico no virar do dia: âncora = saldo actual (melhor do que a de ontem).
        refDia = snap.saldo
        diaReferencia = diaDaCorretora(agora)
      }
    }

    const pico = Math.max(Number(anterior.picoEquity ?? saldoInicial), snap.equity)
    const drawdownPct = pico > 0 ? Math.round(((pico - snap.equity) / pico) * 10000) / 100 : 0
    const veredicto = avaliarConta(regras, {
      saldoInicial, equity: snap.equity, saldoReferenciaDia: refDia, lucroPorDia, diasNegociados,
      diasDecorridos: conta.created_at ? Math.floor((agora - Date.parse(String(conta.created_at))) / 86_400_000) : undefined,
    })
    const quebrou = veredicto.quebrou || Boolean(quebraHistorico)
    const motivo = veredicto.quebrou ? veredicto.motivo : quebraHistorico?.motivo
    const detalhe = veredicto.quebrou ? veredicto.detalhe : quebraHistorico?.detalhe

    const agoraIso = new Date(agora).toISOString()
    const metricas: Record<string, unknown> = {
      ...anterior,
      equity: snap.equity, saldo: snap.saldo,
      saldoReferenciaDia: refDia, diaReferencia, lucroPorDia, diasNegociados, ultimoNegocioEm,
      picoEquity: pico, drawdownPct,
      resultadoPct: veredicto.resultadoPct,
      elegivel: quebrou ? false : veredicto.elegivel,
      naoElegivelPorque: quebrou ? 'conta quebrada' : veredicto.naoElegivelPorque ?? null,
      margemDiaria: veredicto.margemDiaria, margemTotal: veredicto.margemTotal,
      margemUsada: snap.margem ?? null,
      margemLivre: info.data.freeMargin ?? null,
      nivelMargem: info.data.marginLevel ?? null,
      historico: accao === 'leitura_completa' ? empilhar(anterior.historico, snap) : anterior.historico,
      lidoEm: agoraIso,
      vigia: {
        ...vigia, posicoesAbertas, ultimaAccao: accao, paradaPorNosEm: null,
        ...(accao === 'leitura_completa' ? { forcarCompleta: false } : {}),
      },
    }

    if (quebrou) {
      out.quebradas++
      await db.from('mtm_trading_accounts').update({
        estado: 'quebrada', quebrou_regra: motivo, quebrada_em: agoraIso,
        metricas: { ...metricas, congeladoEm: agoraIso, motivo: detalhe },
        metricas_lidas_em: agoraIso,
      }).eq('id', id)
      try {
        const { quebrarConta } = await import('./ciclo-de-vida')
        const r = await quebrarConta(id, String(motivo ?? 'regra'))
        if (!r.emailEnviado) notas.push(`mt5 ${curto}: quebrou, email falhou`)
      } catch (e) {
        notas.push(`mt5 ${curto}: limpeza falhou — ${String(e).slice(0, 60)}`)
      }
      return
    }

    const objetivo = Number(regras.objetivo_pct ?? 0)
    if (objetivo > 0 && !anterior.faseConcluida && veredicto.resultadoPct >= objetivo && veredicto.elegivel && posicoesAbertas === 0) {
      try {
        const { concluirDesafio } = await import('./ciclo-de-vida')
        const r = await concluirDesafio(id, { resultadoPct: veredicto.resultadoPct })
        notas.push(r.ok ? `mt5 ${curto}: concluído · ${r.codigo}` : `mt5 ${curto}: concluiu, certificado falhou — ${r.erro}`)
      } catch (e) {
        notas.push(`mt5 ${curto}: conclusão falhou — ${String(e).slice(0, 60)}`)
      }
      // concluirDesafio grava `fase`/`faseConcluida` nas métricas: relê-se para não as apagar.
      const { data: fresca } = await db.from('mtm_trading_accounts').select('metricas').eq('id', id).maybeSingle()
      const f = (fresca?.metricas ?? {}) as Record<string, unknown>
      if (f.faseConcluida != null) Object.assign(metricas, { fase: f.fase, faseConcluida: f.faseConcluida })
    }

    await db.from('mtm_trading_accounts')
      .update({ metricas, ...(accao === 'leitura_completa' ? { metricas_lidas_em: agoraIso } : {}) })
      .eq('id', id)
  }

  // Poucas de cada vez: cada conta são ≤3 pedidos REST, e a função tem 300 s.
  const LOTE = 5
  for (let i = 0; i < contas.length; i += LOTE) {
    await Promise.all(contas.slice(i, i + LOTE).map((c) => tratar(c).catch((e) => {
      notas.push(`mt5 ${String(c.id).slice(0, 8)}: ${String(e).slice(0, 80)}`)
    })))
  }
  return out
}

/**
 * O dono abriu as métricas de uma conta MT5 parada por nós: pede o deploy e marca o pedido
 * (o vigia não a volta a parar nas 2 h seguintes). Devolve true se a conta estava parada.
 */
export async function acordarContaDoDono(db: Db, conta: { id: string; metaapi_account_id: string | null; metricas: unknown }): Promise<boolean> {
  const m = (conta.metricas ?? {}) as Record<string, unknown>
  const vigia = (m.vigia ?? {}) as EstadoVigia
  if (!vigia.paradaPorNosEm || !conta.metaapi_account_id) return false
  const agora = new Date().toISOString()
  const recente = vigia.deployPedidoEm && Date.now() - Date.parse(vigia.deployPedidoEm) < 10 * 60_000
  if (!recente) await pedirDeploy(conta.metaapi_account_id)
  await db.from('mtm_trading_accounts')
    .update({ metricas: { ...m, vigia: { ...vigia, donoPediuEm: agora, ...(recente ? {} : { deployPedidoEm: agora }) } } })
    .eq('id', conta.id)
  return true
}

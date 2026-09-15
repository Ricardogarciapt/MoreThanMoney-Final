import { derivarAlertas, FONTES, idadeS, mercadoAberto, percentil, serieTemporal, taxa, type ChaveFonte } from '../regras'
import { carregarContas } from './contas'
import { carregarInfra } from './infra'
import { carregarJanela } from './sinais'

/**
 * COCKPIT — compõe os loaders em cache (janela de sinais 20 s, infra 15 s, contas 30 s). Não faz
 * consultas próprias: vários separadores abertos custam o mesmo que um.
 */
export async function cockpit() {
  const agora = Date.now()
  const [janela, infra, contas] = await Promise.all([carregarJanela(), carregarInfra(), carregarContas()])

  const fontes = FONTES.map((f) => {
    const s = janela.sinais.filter((x) => x.fonte === f.chave)
    const ultimo = s[0]?.em ?? null
    return {
      chave: f.chave as ChaveFonte, nome: f.nome, nota: f.nota, ultimo, idadeS: idadeS(ultimo, agora),
      n1h: s.filter((x) => agora - Date.parse(x.em) < 3600_000).length, n24h: s.length,
      serie: serieTemporal(s.map((x) => Date.parse(x.em)), 24, 3600_000, agora),
      erros24h: s.reduce((a, x) => a + x.fanout.errosSistema, 0),
    }
  })

  const linhas = [...janela.fanout.values()].flat()
  const janelaExec = (ms: number) => {
    const l = linhas.filter((x) => agora - Date.parse(x.em) < ms)
    const executado = l.filter((x) => x.estado === 'executado' || x.estado === 'aberto' || x.estado === 'fechado').length
    const saltado = l.filter((x) => x.estado === 'saltado' || x.estado === 'descartado').length
    const erro = l.filter((x) => x.estado === 'erro').length
    const errosSistema = l.filter((x) => (x.estado === 'erro' || x.estado === 'saltado') && !x.esperado).length
    const total = executado + saltado + erro
    return { total, executado, saltado, erro, errosSistema, taxaSucesso: taxa(executado, total), taxaErro: taxa(erro, total) }
  }
  const exec1h = janelaExec(3600_000)
  const exec24h = janelaExec(86_400_000)
  const lat = linhas.map((x) => x.latenciaMs).filter((x): x is number => x != null)
  const serieExec = serieTemporal(linhas.filter((x) => x.estado === 'executado').map((x) => Date.parse(x.em)), 24, 3600_000, agora)
  const serieErro = serieTemporal(linhas.filter((x) => x.estado === 'erro').map((x) => Date.parse(x.em)), 24, 3600_000, agora)

  const mt = contas.contas.filter((c) => c.contaMetaApi)
  const idsMeta = new Set(mt.map((c) => c.metaapiAccountId).filter(Boolean))
  const ligadas = mt.filter((c) => /connected|deployed|ligada|active/i.test(c.estado)).length
  const emErro = mt.filter((c) => /error|erro/i.test(c.estado)).length
  const quotaTotal = (() => {
    const porUser = new Map<string, number | null>()
    for (const c of mt) if (c.userId) porUser.set(c.userId, c.quota.limite)
    let soma = 0
    let ilimitados = 0
    for (const v of porUser.values()) v == null ? ilimitados++ : (soma += v)
    return { soma, ilimitados, acima: new Set(mt.filter((c) => c.quota.acima).map((c) => c.userId)).size }
  })()

  const premium = fontes.find((f) => f.chave === 'premium')
  const alertas = derivarAlertas({
    agoraMs: agora,
    quotaBloqueioAte: infra.quota.bloqueioGlobalAte ? Date.parse(infra.quota.bloqueioGlobalAte) : null,
    supabaseMs: infra.supabase.latenciaMs,
    pulsos: infra.servicos.map((s) => ({ nome: s.nome, idadeS: s.idadeS })),
    snapshots: infra.streaming.map((s) => ({ conta: s.conta, idadeS: s.idadeS, sincronizado: s.sincronizado })),
    exec1h: { total: exec1h.total, erros: exec1h.erro, errosSistema: exec1h.errosSistema },
    latenciaP95Ms: percentil(lat, 0.95),
    copia: { pedidos: infra.copia.pedidos, live: infra.copia.live, eventosPendentes: infra.copia.eventosPendentes, motorLigado: infra.copia.motorLigado },
    fantasmas: infra.fantasmas.total,
    premiumUltimoS: premium?.idadeS ?? null,
    mercadoAberto: mercadoAberto(new Date(agora)),
  })

  return {
    lidaEm: new Date().toISOString(),
    alertas,
    fontes,
    execucao: { h1: exec1h, h24: exec24h, latenciaP50Ms: percentil(lat, 0.5), latenciaP95Ms: percentil(lat, 0.95), serieExec, serieErro },
    metaapi: {
      quota: infra.quota,
      fantasmas: infra.fantasmas,
      contas: mt.length, distintas: idsMeta.size, ligadas, emErro, inexistentesReferenciadas: mt.filter((c) => c.metaapi.inexistente).length,
      quotaUtilizadores: quotaTotal,
      nota: 'Estado guardado na base (sem chamadas à MetaApi). Deployed/undeployed real: Sincronização → pré-visualizar.',
    },
    streaming: infra.streaming,
    supabase: infra.supabase,
    servicos: infra.servicos,
    servicosPendente: infra.servicosPendente,
    crons: infra.crons,
    cronsPendente: infra.cronsPendente,
    copia: infra.copia,
    avisos: [...janela.avisos, ...contas.avisos],
  }
}

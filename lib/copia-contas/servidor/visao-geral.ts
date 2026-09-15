import { contasStreaming } from '@/lib/mtmcopy/metaapi-snapshot-regras'
import { db, idsMetaApiDeSistema, lerInterruptores, metaApiFotografia } from './base'

/**
 * VISÃO GERAL — a saúde da cópia, numa leitura barata:
 *  · entrega aos subscritores: latência sinal do provider → execução no subscritor, medida no
 *    mtmcopy_signal_log das últimas 24 h (índice created_at desc, até 3000 linhas). A CopyFactory
 *    não expõe a latência dela sem uma chamada por subscritor — por isso não se pede;
 *  · CopyFactory: estratégias e subscritores listados, subscrições a estratégias mortas;
 *  · MetaApi: contas deployed/undeployed (custo) e quem precisa delas;
 *  · serviços do VPS: batimento em servicos_pulso (078), fotografia de streaming (metaapi_snapshot)
 *    e última actividade das outboxes;
 *  · últimos erros: sinais, eventos de cópia.
 */

const q = (xs: number[], p: number) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))])
}

export async function visaoGeral() {
  const desde24h = new Date(Date.now() - 86_400_000).toISOString()
  const [meta, interruptores, sistema, sinais, pulsos, snapshots, copiaPend, copiaErros, copiaLat, fundedPend, fundedUltimo, rotas, errosSinal] = await Promise.all([
    metaApiFotografia(),
    lerInterruptores(),
    idsMetaApiDeSistema(),
    db().from('mtmcopy_signal_log').select('telegram_message_id, connection_id, status, created_at').gte('created_at', desde24h).not('telegram_message_id', 'is', null).order('created_at', { ascending: false }).limit(3000),
    db().from('servicos_pulso').select('servico, host, versao, estado, em'),
    db().from('metaapi_snapshot').select('account_id, sincronizado, em'),
    db().from('copia_eventos').select('id', { count: 'exact', head: true }).is('processado_em', null),
    db().from('copia_eventos').select('id, rota_id, tipo, erro, criado_em').eq('resultado', 'erro').gte('criado_em', desde24h).order('criado_em', { ascending: false }).limit(10),
    db().from('copia_eventos').select('latencia_ms').gte('criado_em', desde24h).not('latencia_ms', 'is', null).order('criado_em', { ascending: false }).limit(1000),
    db().from('funded_copy_events').select('id', { count: 'exact', head: true }).is('processado_em', null),
    db().from('funded_copy_events').select('processado_em').not('processado_em', 'is', null).order('id', { ascending: false }).limit(1),
    db().from('copia_rotas').select('estado, ativa, modo, origem_tipo, origem_ref, destino_tipo'),
    db().from('mtmcopy_signal_log').select('symbol, channel_key, detail, created_at').eq('status', 'error').gte('created_at', desde24h).order('created_at', { ascending: false }).limit(10),
  ])

  // ── entrega: primeira linha de cada mensagem (provider) → execuções dos subscritores ──
  const porMsg = new Map<string, { inicio: number; execs: number[]; erros: number; saltos: number }>()
  for (const l of (sinais.data ?? []).slice().reverse()) {
    const k = String(l.telegram_message_id)
    const t = Date.parse(String(l.created_at))
    const m = porMsg.get(k) ?? { inicio: t, execs: [], erros: 0, saltos: 0 }
    m.inicio = Math.min(m.inicio, t)
    if (l.connection_id && l.status === 'executed') m.execs.push(t)
    if (l.connection_id && l.status === 'error') m.erros++
    if (l.connection_id && l.status === 'skipped') m.saltos++
    porMsg.set(k, m)
  }
  const latencias: number[] = []
  let erros = 0
  let execucoes = 0
  for (const m of porMsg.values()) {
    for (const t of m.execs) latencias.push(t - m.inicio)
    execucoes += m.execs.length
    erros += m.erros
  }

  // ── MetaApi ──
  const deployed = meta.accounts.filter((a) => a.state === 'DEPLOYED')
  const ligadas = deployed.filter((a) => a.connectionStatus === 'CONNECTED')
  const estrategias = new Set(meta.strategies.map((s) => s.id))
  const mortas = meta.cfFalhou ? [] : meta.subscribers.filter((s) => s.subscriptions.some((x) => x.strategyId && !estrategias.has(x.strategyId)))
  const streaming = contasStreaming(process.env.PREMIUM_STREAMING_CONTAS)

  // Fontes MT das rotas activas: cada uma é uma ligação de streaming (conta 24 h deployed).
  const rotasL = rotas.error ? [] : rotas.data ?? []
  const rotasAtivas = rotasL.filter((r) => r.estado === 'aprovada' && r.ativa)

  const agora = Date.now()
  const servicos = [
    ...(pulsos.error ? [] : pulsos.data ?? []).map((p) => ({
      nome: String(p.servico), host: p.host as string | null, versao: p.versao as string | null, em: String(p.em),
      idadeS: Math.round((agora - Date.parse(String(p.em))) / 1000), estado: p.estado as Record<string, unknown>,
    })),
    ...(snapshots.data ?? []).map((s) => ({
      nome: `premium-streaming · ${String(s.account_id).slice(0, 8)}`, host: 'mtm-stream', versao: null, em: String(s.em),
      idadeS: Math.round((agora - Date.parse(String(s.em))) / 1000), estado: { sincronizado: s.sincronizado },
    })),
    ...(fundedUltimo.data?.[0]?.processado_em ? [{
      nome: 'mtm-funded-copier (último evento processado)', host: 'mtm-stream', versao: null, em: String(fundedUltimo.data[0].processado_em),
      idadeS: Math.round((agora - Date.parse(String(fundedUltimo.data[0].processado_em))) / 1000), estado: { pendentes: fundedPend.count ?? 0 },
    }] : []),
  ]

  return {
    lidaEm: new Date().toISOString(),
    interruptores,
    entrega: {
      mensagens24h: porMsg.size, execucoes24h: execucoes, erros24h: erros,
      latenciaP50Ms: q(latencias, 0.5), latenciaP95Ms: q(latencias, 0.95), latenciaMaxMs: q(latencias, 1),
      nota: 'sinal registado → execução no subscritor (mtmcopy_signal_log). A cópia pela CopyFactory corre na MetaApi e não entra nesta medida.',
    },
    copyFactory: {
      estrategias: meta.strategies.length, subscritores: meta.subscribers.length,
      subscritoresComEstrategiaMorta: mortas.map((s) => ({ id: s.id, nome: s.name })),
      listadaEm: meta.lidaEm, falhou: meta.cfFalhou,
    },
    metaApi: {
      total: meta.accounts.length, deployed: deployed.length, ligadas: ligadas.length, undeployed: meta.accounts.length - deployed.length,
      sistema: meta.accounts.filter((a) => sistema.has(a.id)).length,
      streamingPremium: streaming.length,
      falhou: meta.falhou,
      nota: 'A MetaApi cobra por conta deployed (horas). Undeployed não conta.',
    },
    copiaContas: {
      migracaoAplicada: !rotas.error,
      rotas: rotasL.length, ativas: rotasAtivas.length,
      pedidos: rotasL.filter((r) => r.estado === 'pedido').length,
      live: rotasL.filter((r) => r.modo === 'live').length,
      fontesStreamingNecessarias: new Set(rotasAtivas.filter((r) => r.origem_tipo === 'mt5' || r.origem_tipo === 'mt4').map((r) => String(r.origem_ref))).size,
      eventosPendentes: copiaPend.count ?? 0,
      latenciaP50Ms: q((copiaLat.data ?? []).map((x) => Number(x.latencia_ms)), 0.5),
      latenciaP95Ms: q((copiaLat.data ?? []).map((x) => Number(x.latencia_ms)), 0.95),
    },
    servicos,
    ultimosErros: [
      ...(copiaErros.data ?? []).map((e) => ({ onde: `cópia · ${e.tipo}`, texto: String(e.erro ?? ''), em: String(e.criado_em) })),
      ...(errosSinal.data ?? []).map((e) => ({ onde: `sinal · ${e.channel_key ?? '—'} · ${e.symbol ?? ''}`, texto: String(e.detail ?? ''), em: String(e.created_at) })),
    ].sort((a, b) => b.em.localeCompare(a.em)).slice(0, 15),
  }
}

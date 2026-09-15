import vercel from '@/vercel.json'
import { CONTAS_MOTOR_TEMPO_REAL } from '@/lib/mtmcopy/provider-constants'
import { emCache } from '../cache'
import { idadeS } from '../regras'
import { db, ler, txt } from './base'

/**
 * INFRA — o que o cockpit precisa de saber sem tocar na MetaApi:
 *   · sonda Supabase (1 linha de site_settings, cronometrada)
 *   · servicos_pulso (078), metaapi_snapshot (071, SEM as colunas jsonb pesadas)
 *   · travão de quota MetaApi (080: metaapi_simbolos_cache.metaapi_quota_bloqueio_ate)
 *   · registo de contas MetaApi inexistentes (mesma tabela, metaapi_quota_api='nao_existe')
 *   · interruptores e contadores da cópia entre contas (078)
 *   · crons da Vercel (vercel.json) + último batimento em cron_pulso (085, quando existir)
 */

/**
 * Registo de contas inexistentes (contrato partilhado site ↔ MTM Auto, mtm-auto/lib/contas-inexistentes.ts):
 * linha em metaapi_simbolos_cache com metaapi_quota_api='nao_existe' e bloqueio 24 h.
 */
export { MOTIVO_NAO_EXISTE as API_NAO_EXISTE } from '@/lib/mtmcopy/metaapi-inexistentes'
import { MOTIVO_NAO_EXISTE as API_NAO_EXISTE, CONTAS_METAAPI_APAGADAS } from '@/lib/mtmcopy/metaapi-inexistentes'

export interface Infra {
  lidaEm: string
  supabase: { latenciaMs: number | null; erro: string | null }
  servicos: { nome: string; host: string | null; versao: string | null; em: string; idadeS: number | null; estado: Record<string, unknown> }[]
  servicosPendente: boolean
  streaming: { conta: string; motorTempoReal: boolean; sincronizado: boolean; em: string; idadeS: number | null }[]
  quota: { bloqueioGlobalAte: string | null; api: string | null; motivo: string | null; contasBloqueadas: number; pendente: boolean }
  fantasmas: { total: number | null; conhecidasApagadas: number; pendente: boolean; contas: { conta: string; ate: string | null; motivo: string | null }[] }
  copia: { pendente: boolean; motorLigado: boolean; liveDesbloqueado: boolean; rotas: number; ativas: number; pedidos: number; live: number; eventosPendentes: number; errosEventos24h: number }
  crons: { caminho: string; horario: string; ultimoEm: string | null; ok: boolean | null; duracaoMs: number | null }[]
  cronsPendente: boolean
}

export async function carregarInfra(): Promise<Infra> {
  return (await emCache('centro:infra', 15_000, lerInfra)).v
}

async function lerInfra(): Promise<Infra> {
  const agora = Date.now()
  const t0 = Date.now()
  const sonda = await ler(db().from('site_settings').select('key').limit(1))
  const latenciaMs = sonda.erro ? null : Date.now() - t0

  const desde24h = new Date(agora - 86_400_000).toISOString()
  const [pulsos, snaps, bloqueios, interruptores, rotas, pend, errosEv, crons] = await Promise.all([
    ler(db().from('servicos_pulso').select('servico, host, versao, estado, em').limit(100)),
    ler(db().from('metaapi_snapshot').select('account_id, sincronizado, em').limit(100)),
    ler(db().from('metaapi_simbolos_cache').select('account_id, metaapi_quota_bloqueio_ate, metaapi_quota_api, metaapi_quota_motivo').gt('metaapi_quota_bloqueio_ate', new Date(agora).toISOString()).limit(500)),
    ler(db().from('site_settings').select('key, value').in('key', ['copia_contas', 'copia_contas_live_desbloqueado'])),
    ler(db().from('copia_rotas').select('estado, ativa, modo').limit(2000)),
    ler(db().from('copia_eventos').select('id', { count: 'exact', head: true }).is('processado_em', null)),
    ler(db().from('copia_eventos').select('id', { count: 'exact', head: true }).eq('resultado', 'erro').gte('criado_em', desde24h)),
    ler(db().from('cron_pulso').select('caminho, em, ok, duracao_ms').limit(200)),
  ])

  const quota = { ...bloqueios, linhas: bloqueios.linhas.filter((q) => q.metaapi_quota_api !== API_NAO_EXISTE) }
  const fantasmas = bloqueios.linhas.filter((q) => q.metaapi_quota_api === API_NAO_EXISTE)
  const global = quota.linhas.find((q) => q.account_id === '*')
  const iv = new Map(interruptores.linhas.map((r) => [String(r.key), r.value as unknown]))
  const cronPorCaminho = new Map(crons.linhas.map((c) => [String(c.caminho), c]))

  return {
    lidaEm: new Date().toISOString(),
    supabase: { latenciaMs, erro: sonda.erro },
    servicos: pulsos.linhas.map((p) => ({
      nome: String(p.servico), host: txt(p.host), versao: txt(p.versao), em: String(p.em), idadeS: idadeS(txt(p.em), agora),
      estado: (p.estado && typeof p.estado === 'object' ? p.estado : {}) as Record<string, unknown>,
    })).sort((a, b) => a.nome.localeCompare(b.nome)),
    servicosPendente: pulsos.semTabela,
    streaming: snaps.linhas.map((s) => ({
      conta: String(s.account_id), motorTempoReal: CONTAS_MOTOR_TEMPO_REAL.includes(String(s.account_id)),
      sincronizado: s.sincronizado === true, em: String(s.em), idadeS: idadeS(txt(s.em), agora),
    })),
    quota: {
      bloqueioGlobalAte: txt(global?.metaapi_quota_bloqueio_ate), api: txt(global?.metaapi_quota_api), motivo: txt(global?.metaapi_quota_motivo),
      contasBloqueadas: quota.linhas.filter((q) => q.account_id !== '*').length, pendente: quota.semTabela,
    },
    fantasmas: {
      total: bloqueios.semTabela || bloqueios.erro ? null : fantasmas.length, conhecidasApagadas: CONTAS_METAAPI_APAGADAS.size, pendente: bloqueios.semTabela,
      contas: fantasmas.map((f) => ({ conta: String(f.account_id), ate: txt(f.metaapi_quota_bloqueio_ate), motivo: txt(f.metaapi_quota_motivo) })),
    },
    copia: {
      pendente: rotas.semTabela,
      motorLigado: (iv.get('copia_contas') as { ligado?: boolean } | undefined)?.ligado === true,
      liveDesbloqueado: iv.get('copia_contas_live_desbloqueado') === true,
      rotas: rotas.linhas.length,
      ativas: rotas.linhas.filter((r) => r.estado === 'aprovada' && r.ativa === true).length,
      pedidos: rotas.linhas.filter((r) => r.estado === 'pedido').length,
      live: rotas.linhas.filter((r) => r.modo === 'live').length,
      eventosPendentes: pend.contagem ?? 0,
      errosEventos24h: errosEv.contagem ?? 0,
    },
    crons: ((vercel as { crons?: { path: string; schedule: string }[] }).crons ?? []).map((c) => {
      const p = cronPorCaminho.get(c.path)
      return { caminho: c.path, horario: c.schedule, ultimoEm: txt(p?.em), ok: p ? p.ok === true : null, duracaoMs: p?.duracao_ms == null ? null : Number(p.duracao_ms) }
    }),
    cronsPendente: crons.semTabela,
  }
}

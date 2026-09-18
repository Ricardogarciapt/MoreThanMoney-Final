import {
  CANONICAL_AURUMFLOW_STRATEGY_ID, CANONICAL_GOLDKILLER_STRATEGY_ID, CANONICAL_PREMIUM_STRATEGY_ID, CANONICAL_SENSEI_STRATEGY_ID,
} from '@/lib/mtmcopy/provider-constants'
import { emCache } from '../cache'
import { carregarContas } from './contas'
import { lerProviders } from './sinais'
import { db, ler, num, txt, type Linha } from './base'
import { carregarPainelMestres } from '@/lib/mestres/servidor/painel-leitura'
import type { Executor } from '@/lib/mestres/painel'

/**
 * ESTRATÉGIAS — MTM Auto Premium, Sensei, Aurum Flow, GoldKiller, Edge/King/Wolf, providers das
 * equipas: fonte (mestre/espelho + veredicto 082), seguidores por plataforma, desempenho 30 d
 * (pips/% nos sinais; dinheiro só para o admin, das execuções), divergências.
 *
 * Sem MetaApi/CopyFactory: os seguidores CopyFactory vêm do que está gravado em
 * mtmcopy_connections (copyfactory_strategy_pick / copyfactory_subscribed). A reconciliação com a
 * CopyFactory real continua na secção Sincronização (acção explícita).
 */

/** Estratégias CopyFactory da casa ↔ slug da estratégia MTM Auto. */
export const CF_POR_SLUG: Record<string, string> = {
  'premium-ouro': CANONICAL_PREMIUM_STRATEGY_ID,
  sensei: CANONICAL_SENSEI_STRATEGY_ID,
  'aurum-flow': CANONICAL_AURUMFLOW_STRATEGY_ID,
  goldkiller: CANONICAL_GOLDKILLER_STRATEGY_ID,
}

export interface EstrategiaCentro {
  id: string
  slug: string
  nome: string
  equipa: string | null
  tipo: string | null
  ativa: boolean
  apagada: boolean
  fonteExecucao: 'mestre' | 'espelho' | null
  espelho: { conta: string | null; alinhado: boolean | null; motivos: string[]; nTrades: number | null; mediaDiferencaPips: number | null; latenciaP95Ms: number | null } | null
  metaapiAccountId: string | null
  estrategiaCf: string | null
  seguidores: { mtmauto: number; mtmautoAuto: number; site: number; siteNaoSubscritas: number; funded: number; total: number }
  desempenho30d: { sinais: number; fechados: number; incoerentes: number; pips: number; pct: number | null; acerto: number | null; dinheiro: number | null; execucoes: number }
  divergencias: string[]
  ultimoSinal: string | null
  /**
   * 'sombra' quando `sinais_config.modo = 'sombra'` e a estratégia NÃO executa (`ativo = false`):
   * é medida por services/sombra-estrategias sem abrir nada. Etiqueta — quem decide é `ativo`.
   */
  modo: 'sombra' | null
  /** Motor das mestres (116): quem executa, modos, mestre SIM, rotas em live. null = estratégia fora do motor. */
  mestres: {
    executor: Executor
    executorNota: string
    modo: string
    sinalModo: string
    t2tModo: string
    rotuloMestre: string
    contaMestreLogin: string | null
    nRotas: number
    nRotasLive: number
    nContasLive: number
    cfIds: string[]
    cfCortado: boolean
  } | null
  /** inactiva, fora do motor, sem sombra e sem ninguém a seguir (ex.: Gold Did) — escondida por omissão */
  abandonada: boolean
}

/** Uma linha de `estrategia_sombra_dia` (migração 108), como o painel a usa. */
export interface DiaSombra {
  dia: string
  trades: number
  vitorias: number
  r_total: number
  r_medio: number | null
  pior_sequencia: number
  perdas_seguidas: number
  exposicao_max: number
  abertas: number
  definitivo: boolean
  ideias: number | null
  passaram_gate: number | null
  atualizado_em: string | null
}

export interface SombraCentro {
  slug: string
  nome: string
  /** a estratégia está mesmo desligada? (se não estiver, a sombra é redundante e o painel avisa) */
  executa: boolean
  gestao: Record<string, unknown> | null
  dias: DiaSombra[]
}

/** Dias de sombra mostrados no cartão. */
export const DIAS_SOMBRA = 14

export async function carregarEstrategias(): Promise<{ estrategias: EstrategiaCentro[]; sombras: SombraCentro[]; sombraPendente: boolean; veredictoPendente: boolean; fontePendente: boolean; lidaEm: string }> {
  return (await emCache('centro:estrategias', 30_000, lerEstrategias)).v
}

const modoDe = (p: Linha): 'sombra' | null => {
  const cfg = p.sinais_config && typeof p.sinais_config === 'object' ? (p.sinais_config as Record<string, unknown>) : {}
  return cfg.modo === 'sombra' ? 'sombra' : null
}

async function lerEstrategias() {
  const desde30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [provs, subs, sinais, execs, veredito, tenants, contas, painel] = await Promise.all([
    lerProviders(),
    ler(db().from('mtmauto_subscriptions').select('provider_id, conta_id, user_id, ativo, auto_aceitar').eq('ativo', true).limit(5000)),
    ler(db().from('mtmauto_signals').select('id, provider_id, estado, resultado_pips, resultado_pct, created_at').gte('created_at', desde30).order('created_at', { ascending: false }).limit(3000)),
    ler(db().from('mtmauto_executions').select('signal_id, estado, resultado, created_at').gte('created_at', desde30).limit(10000)),
    ler(db().from('espelho_veredito').select('*').limit(100)),
    ler(db().from('mtmauto_tenants').select('id, nome').limit(200)),
    carregarContas(),
    carregarPainelMestres().catch(() => null),
  ])
  const sinalProv = new Map<string, string>()
  for (const s of sinais.linhas) sinalProv.set(String(s.id), String(s.provider_id))
  const nomeEquipa = new Map(tenants.linhas.map((t) => [String(t.id), String(t.nome ?? '')]))
  const vered = new Map(veredito.linhas.map((v) => [String(v.estrategia ?? '').toLowerCase(), v]))

  const estrategias: EstrategiaCentro[] = provs.map((p: Linha) => {
    const id = String(p.id)
    const slug = String(p.slug ?? '')
    const subsP = subs.linhas.filter((s) => String(s.provider_id) === id)
    const m = painel?.estrategias.find((x) => x.providerId === id) ?? null
    // As estratégias CopyFactory vêm do motor das mestres quando lá está (Premium Hvmg/MxsR/9gsL,
    // GoldKiller Wl1B/SDNb, Sensei hbKq/Oca7); senão, a constante de sempre.
    const cfs = m?.cf.ids.length ? m.cf.ids : CF_POR_SLUG[slug.toLowerCase()] ? [CF_POR_SLUG[slug.toLowerCase()]] : []
    const cf = cfs[0] ?? null
    const siteSeg = cfs.length ? contas.contas.filter((c) => c.origem === 'site' && c.estrategias.some((x) => cfs.includes(x))) : []
    const fundedSeg = contas.contas.filter((c) => c.origem === 'funded' && c.estrategias.some((e) => e.toLowerCase() === slug.toLowerCase()))
    const sinaisP = sinais.linhas.filter((s) => String(s.provider_id) === id)
    // Resultados incoerentes (ex.: +409 950 pips / +923 % a 31/08, stop mal lido) não entram na soma:
    // uma trade de ouro não faz mais de 50 % nem 5 000 pips. Contam-se à parte.
    const coerente = (s: Linha) => Math.abs(num(s.resultado_pct) ?? 0) <= 50 && Math.abs(num(s.resultado_pips) ?? 0) <= 5000
    const fechadosTodos = sinaisP.filter((s) => s.estado === 'closed' && s.resultado_pips != null)
    const fechados = fechadosTodos.filter(coerente)
    const pips = fechados.reduce((a, s) => a + (num(s.resultado_pips) ?? 0), 0)
    const pctV = fechados.map((s) => num(s.resultado_pct)).filter((x): x is number => x != null)
    const execP = execs.linhas.filter((e) => sinalProv.get(String(e.signal_id)) === id)
    const dinheiro = execP.reduce((a, e) => a + (num(e.resultado) ?? 0), 0)
    const v = vered.get(slug.toLowerCase())
    const contasSub = subsP.map((s) => contas.contas.find((c) => c.ref === `auto:${s.conta_id}`))
    const divergencias: string[] = []
    if (p.ativo === false && subsP.some((s) => s.auto_aceitar)) divergencias.push('estratégia inactiva com seguidores em automático')
    if (subsP.some((s) => !s.conta_id)) divergencias.push(`${subsP.filter((s) => !s.conta_id).length} subscrição(ões) sem conta`)
    const paradas = contasSub.filter((c) => c && (!c.ativa || /error|erro/i.test(c.estado))).length
    if (paradas) divergencias.push(`${paradas} conta(s) MTM Auto parada(s)/em erro a seguir`)
    const naoSub = m?.cf.cortado ? 0 : siteSeg.filter((c) => c.usos.some((u) => u.includes('não subscrita')) && c.ativa).length
    if (naoSub) divergencias.push(`${naoSub} ligação(ões) do site activas mas não subscritas na CopyFactory`)
    if (m?.cf.cortado) {
      // CopyFactory cortada: quem ainda lá está subscrito recebe a trade duas vezes (CopyFactory + motor).
      const ainda = siteSeg.filter((c) => c.usos.some((u) => /^CopyFactory /.test(u) && !u.includes('não subscrita'))).length
      if (ainda) divergencias.push(`${ainda} ligação(ões) ainda marcadas como subscritas na CopyFactory cortada (ordens em dobro com o motor)`)
    } else {
      const pausadasSub = siteSeg.filter((c) => !c.ativa && !c.usos.some((u) => u.includes('não subscrita'))).length
      if (pausadasSub) divergencias.push(`${pausadasSub} ligação(ões) pausada(s) ainda marcadas como subscritas`)
    }
    for (const a of m?.avisos ?? []) divergencias.push(`motor das mestres: ${a}`)
    if (p.metaapi_account_id && contas.contas.some((c) => c.metaapiAccountId === p.metaapi_account_id && c.metaapi.inexistente)) divergencias.push('conta mestre no registo de inexistentes')
    if (fechadosTodos.length > fechados.length) divergencias.push(`${fechadosTodos.length - fechados.length} resultado(s) incoerente(s) excluído(s) do desempenho`)
    if (p.fonte_execucao === 'espelho' && v && v.alinhado !== true) divergencias.push('fonte espelho sem veredicto alinhado')

    return {
      id, slug, nome: String(p.nome ?? slug), equipa: p.tenant_id ? nomeEquipa.get(String(p.tenant_id)) ?? 'equipa' : null, tipo: txt(p.tipo),
      ativa: p.ativo !== false, apagada: Boolean(p.apagado_em),
      fonteExecucao: (p.fonte_execucao === 'espelho' ? 'espelho' : p.fonte_execucao === 'mestre' ? 'mestre' : null) as EstrategiaCentro['fonteExecucao'],
      espelho: p.espelho_funded_account_id || v ? {
        conta: txt(p.espelho_funded_account_id), alinhado: v ? v.alinhado === true : null,
        motivos: Array.isArray(v?.motivos) ? (v!.motivos as unknown[]).map(String) : [],
        nTrades: num(v?.n_trades), mediaDiferencaPips: num(v?.media_diferenca_pips), latenciaP95Ms: num(v?.latencia_p95_ms),
      } : null,
      metaapiAccountId: txt(p.metaapi_account_id), estrategiaCf: cf,
      seguidores: {
        mtmauto: subsP.length, mtmautoAuto: subsP.filter((s) => s.auto_aceitar).length,
        site: siteSeg.length, siteNaoSubscritas: naoSub, funded: fundedSeg.length,
        total: subsP.length + siteSeg.length + fundedSeg.length,
      },
      desempenho30d: {
        sinais: sinaisP.length, fechados: fechados.length, incoerentes: fechadosTodos.length - fechados.length, pips: Math.round(pips * 10) / 10,
        pct: pctV.length ? Math.round(pctV.reduce((a, b) => a + b, 0) * 100) / 100 : null,
        acerto: fechados.length ? Math.round((fechados.filter((s) => (num(s.resultado_pips) ?? 0) > 0).length / fechados.length) * 100) : null,
        dinheiro: execP.length ? Math.round(dinheiro * 100) / 100 : null, execucoes: execP.length,
      },
      divergencias, ultimoSinal: txt(sinaisP[0]?.created_at),
      modo: modoDe(p),
      mestres: m ? {
        executor: m.executor, executorNota: m.executorNota, modo: m.modo, sinalModo: m.sinalModo, t2tModo: m.t2tModo,
        rotuloMestre: m.rotuloMestre, contaMestreLogin: m.contaMestre?.login ?? null,
        nRotas: m.nRotas, nRotasLive: m.nRotasLive, nContasLive: m.nContasLive, cfIds: m.cf.ids, cfCortado: m.cf.cortado,
      } : null,
      abandonada: p.ativo === false && !m && modoDe(p) !== 'sombra' && subsP.length + siteSeg.length + fundedSeg.length === 0,
    }
  }).sort((a, b) => Number(a.apagada) - Number(b.apagada) || Number(b.ativa) - Number(a.ativa) || b.seguidores.total - a.seguidores.total)

  // Sombra: só as estratégias marcadas. Uma leitura, ≤ 14 linhas por estratégia.
  const emSombra = estrategias.filter((e) => e.modo === 'sombra' && !e.apagada)
  const desde14 = new Date(Date.now() - DIAS_SOMBRA * 86_400_000).toISOString().slice(0, 10)
  const somb = emSombra.length
    ? await ler(db().from('estrategia_sombra_dia').select('*').in('estrategia', emSombra.map((e) => e.slug)).gte('dia', desde14).order('dia', { ascending: false }).limit(DIAS_SOMBRA * emSombra.length))
    : { linhas: [] as Linha[], semTabela: false, erro: null, contagem: null }
  const sombras: SombraCentro[] = emSombra.map((e) => {
    const linhas = somb.linhas.filter((l) => String(l.estrategia) === e.slug)
    return {
      slug: e.slug, nome: e.nome, executa: e.ativa,
      gestao: (linhas[0]?.gestao as Record<string, unknown> | undefined) ?? null,
      dias: linhas.map((l) => {
        const d = (l.detalhe ?? {}) as Record<string, unknown>
        return {
          dia: String(l.dia), trades: num(l.trades) ?? 0, vitorias: num(l.vitorias) ?? 0, r_total: num(l.r_total) ?? 0,
          r_medio: num(l.r_medio), pior_sequencia: num(l.pior_sequencia) ?? 0, perdas_seguidas: num(l.perdas_seguidas) ?? 0,
          exposicao_max: num(l.exposicao_max) ?? 0, abertas: num(l.abertas) ?? 0, definitivo: l.definitivo === true,
          ideias: num(d.ideias), passaram_gate: num(d.passaram_gate), atualizado_em: txt(l.atualizado_em),
        }
      }),
    }
  })

  return {
    estrategias,
    sombras,
    sombraPendente: somb.semTabela,
    veredictoPendente: veredito.semTabela,
    fontePendente: !provs.some((p) => 'fonte_execucao' in p),
    lidaEm: new Date().toISOString(),
  }
}

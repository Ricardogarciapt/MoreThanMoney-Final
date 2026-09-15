/**
 * Leitura do painel «Motor em tempo real» (/admin/centro): batimento, lista live e a comparação das
 * últimas 24 h (máx. 5 000 linhas, índice por decidido_em). Sem a migração 096 devolve `pendente`.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { percentil } from '../sombra'
import { CHAVE_LISTA_LIVE, PULSO_MAX_IDADE_MS, SERVICO_PULSO, lerListaLive } from '../contas-live-regras'

export async function carregarMotorReal() {
  const db = getSupabaseAdmin()
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString()
  const [pulsoR, listaR, linhasR] = await Promise.all([
    db.from('gestao_real_pulso').select('em, escrita, live, contas, detalhe').eq('servico', SERVICO_PULSO).maybeSingle(),
    db.from('site_settings').select('value').eq('key', CHAVE_LISTA_LIVE).maybeSingle(),
    db.from('gestao_real_sombra')
      .select('conta, tipo, posicao, simbolo, regra, acao, sl, volume, preco, tick_em, decidido_em, monitor_em, monitor_valor, latencia_ms, divergencia_pips, divergencia_volume, estado, modo')
      .gte('decidido_em', desde).order('decidido_em', { ascending: false }).limit(5000),
  ])
  if (linhasR.error && /does not exist|relation|schema cache/i.test(linhasR.error.message)) {
    return { pendente: true as const }
  }
  const linhas = linhasR.data ?? []
  const pulso = pulsoR.data
  const idadePulsoMs = pulso?.em ? Date.now() - Date.parse(String(pulso.em)) : null
  const porEstado: Record<string, number> = {}
  const porRegra: Record<string, { n: number; casadas: number; semMonitor: number; lat: number[]; div: number[] }> = {}
  for (const l of linhas) {
    porEstado[l.estado] = (porEstado[l.estado] ?? 0) + 1
    const r = (porRegra[l.regra] ??= { n: 0, casadas: 0, semMonitor: 0, lat: [], div: [] })
    r.n++
    if (l.estado === 'casada') {
      r.casadas++
      if (l.latencia_ms != null) r.lat.push(Number(l.latencia_ms))
      if (l.divergencia_pips != null) r.div.push(Number(l.divergencia_pips))
    }
    if (l.estado === 'sem_monitor') r.semMonitor++
  }
  const casadas = linhas.filter((l) => l.estado === 'casada')
  const lat = casadas.map((l) => Number(l.latencia_ms)).filter(Number.isFinite)
  const div = casadas.map((l) => Number(l.divergencia_pips)).filter(Number.isFinite)
  return {
    pendente: false as const,
    motor: {
      vivo: idadePulsoMs != null && idadePulsoMs <= PULSO_MAX_IDADE_MS,
      idadePulsoMs,
      escrita: pulso?.escrita === true,
      live: (pulso?.live as string[] | null) ?? [],
      contas: (pulso?.contas as unknown[] | null) ?? [],
      detalhe: pulso?.detalhe ?? null,
    },
    listaLive: lerListaLive(listaR.data?.value),
    total24h: linhas.length,
    porEstado,
    latenciaP50Ms: percentil(lat, 50),
    latenciaP95Ms: percentil(lat, 95),
    divergenciaP95Pips: percentil(div, 95),
    divergenciaMaxPips: div.length ? Math.max(...div) : null,
    regras: Object.entries(porRegra)
      .map(([regra, r]) => ({ regra, n: r.n, casadas: r.casadas, semMonitor: r.semMonitor, latP50: percentil(r.lat, 50), divP95: percentil(r.div, 95) }))
      .sort((a, b) => b.n - a.n),
    recentes: linhas.filter((l) => l.estado !== 'posicao_fechada').slice(0, 25),
  }
}

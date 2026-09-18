/**
 * PAINEL DO MOTOR DAS MESTRES (admin) — o estado resumido de cada estratégia, das contas e do motor,
 * e as regras das mudanças que o admin pode pedir (modo sombra↔live por estratégia e por conta,
 * kill-switch). Puro e testado (__tests__/painel.check.ts): sem base, sem MetaApi.
 *
 * Quem executa cada estratégia HOJE (executor):
 *   · motor        — `mestres_estrategias.modo = 'live'`: o nosso motor (VPS mtm-copia-contas) envia da
 *                    mestre SIM directamente para as contas dos clientes; a CopyFactory foi cortada.
 *   · copyfactory  — o motor ainda não está em live e a estratégia tem estratégias CopyFactory por
 *                    cortar (ex.: Premium Hvmg, GoldKiller Wl1B): quem copia é a CopyFactory.
 *   · legado       — o motor não está em live e não há CopyFactory: executa o caminho antigo (MTM Auto
 *                    pelo espelhar, execução directa pelo grupo Telegram, T2T de sempre).
 *
 * As guardas de LIVE aqui repetem as do trigger da base (migração 116, `mestres_*_guarda`) só para o
 * painel explicar ANTES de pedir; quem manda é sempre a base — o servidor devolve o erro dela.
 */
import { decidirModo } from './decisao'
import type { ConfigGlobalMestres, ContaMestres, EstrategiaMestre, ModoDecidido, ModoEstrategia } from './tipos'

export type Executor = 'motor' | 'copyfactory' | 'legado'
export type CampoModo = 'modo' | 'sinal_modo' | 't2t_modo'

export const NOME_CAMPO: Record<CampoModo, string> = {
  modo: 'Propagação (mestre → clientes)',
  sinal_modo: 'Sinal → mestre SIM',
  t2t_modo: 'Tap to Trade pelo motor',
}

// ── entradas (linhas já lidas da base) ──────────────────────────────────────

export interface ContaMestreInfo {
  id: string
  login: string | null
  etiqueta: string | null
  estado: string | null
  motor: string | null
  saldo: number | null
  equity: number | null
}

export interface EstrategiaEntrada extends EstrategiaMestre {
  nome: string
  providerAtivo: boolean | null
  /** o espelho provider antigo (082) ainda copia a conta MetaApi do provider para a mestre SIM */
  espelhoProviderAtivo: boolean
  /** o mtm-auto ainda executa esta estratégia pelas subscrições (mtmauto_providers.espelhar) */
  mtmautoEspelhar: boolean | null
  contaMestre: ContaMestreInfo | null
}

export interface RotaEntrada {
  id: string
  estrategia_slug: string | null
  tipo_rota: string | null
  destino_ref: string
  destino_chave: string
  ativa: boolean
  estado: string
  pausada_motivo?: string | null
  user_id?: string | null
}

export interface ContaEntrada extends ContaMestres {
  etiqueta: string | null
  descricao: string | null
  email: string | null
  ultimaFalha: string | null
  ultimaFalhaEm: string | null
}

export interface OrdemEntrada {
  id: number | string
  estrategia: string | null
  conta_chave: string | null
  tipo: string
  modo: string
  estado: string
  erro: string | null
  latencia_total_ms: number | null
  latencia_corretora_ms: number | null
  criado_em: string
}

export interface AlertaEntrada {
  id: number | string
  tipo: string
  estrategia: string | null
  conta_chave: string | null
  mensagem: string
  criado_em: string
  visto_em: string | null
}

export interface SinalEntrada { estrategia: string; modo: string; criado_em: string; symbol: string | null; direcao: string | null }

export interface PulsoEntrada {
  em: string | null
  /** servicos_pulso.estado.mestres (serviço mtm-copia-contas) */
  mestres: Record<string, unknown> | null
}

export interface EntradaPainel {
  agoraMs: number
  global: ConfigGlobalMestres
  pulso: PulsoEntrada
  estrategias: EstrategiaEntrada[]
  rotas: RotaEntrada[]
  contas: ContaEntrada[]
  ordens: OrdemEntrada[]
  alertas: AlertaEntrada[]
  sinais: SinalEntrada[]
  /** cópias abertas em LIVE por rota (copia_posicoes aberta/enviando que não são sombra) */
  abertasLivePorRota: Record<string, number>
}

// ── saídas ──────────────────────────────────────────────────────────────────

export interface EstatOrdens { total: number; ok: number; erro: number; recusado: number; bloqueado: number; sombra: number; saltado: number; latP50Ms: number | null; latP95Ms: number | null }

export interface RotaPainel {
  id: string
  tipo: string
  destinoRef: string
  contaChave: string
  etiqueta: string | null
  descricao: string | null
  contaModo: 'sombra' | 'live'
  efectivo: ModoDecidido
  motivo: string
  abertasLive: number
}

export interface EstrategiaPainel {
  slug: string
  nome: string
  providerId: string
  executor: Executor
  executorNota: string
  modo: ModoEstrategia
  sinalModo: ModoEstrategia
  t2tModo: ModoEstrategia
  contaMestre: ContaMestreInfo | null
  rotuloMestre: string
  cf: { ids: string[]; cortado: boolean; cortadoEm: string | null }
  mtmauto: { incluir: boolean; cortadoEm: string | null; espelhar: boolean | null }
  espelhoProviderAtivo: boolean
  rotas: RotaPainel[]
  nRotas: number
  nRotasLive: number
  nContasLive: number
  abertasLive: number
  ordens24h: EstatOrdens
  ultimasOrdens: OrdemEntrada[]
  alertas: AlertaEntrada[]
  ultimoSinal: SinalEntrada | null
  /** por campo: null = pode ir a live; texto = porque é que a base recusa */
  bloqueioLive: Record<CampoModo, string | null>
  avisos: string[]
}

export interface ContaPainel {
  contaChave: string
  contaRef: string
  modo: 'sombra' | 'live'
  etiqueta: string | null
  descricao: string | null
  email: string | null
  estrategias: { slug: string; tipo: string; efectivo: ModoDecidido }[]
  falhasSeguidas: number
  bloqueada: boolean
  bloqueioMotivo: string | null
  ultimaFalha: string | null
  ultimaFalhaEm: string | null
  limites: { maxPosicoes: number; maxRiscoTotalPct: number; maxLoteTotal: number | null; loteFixoForcado: number | null }
}

export type EstadoMotor = 'kill' | 'desligado' | 'sem-pulso' | 'sombra' | 'live'

export interface AlertaPainel { id: string; severidade: 'grave' | 'aviso' | 'info'; titulo: string; detalhe: string }

export interface PainelMestres {
  global: ConfigGlobalMestres & { escritaVps: boolean | null; pulsoEm: string | null; pulsoIdadeS: number | null; pulsoVivo: boolean; estado: EstadoMotor }
  estrategias: EstrategiaPainel[]
  contas: ContaPainel[]
  totais: {
    estrategias: number
    estrategiasLive: number
    estrategiasSombra: number
    contasLive: number
    rotas: number
    rotasLive: number
    abertasLive: number
    ordens24h: EstatOrdens
    falhas24h: number
    alertasNovos: number
    alertas24h: number
  }
  alertas: AlertaPainel[]
}

/** Idade máxima do batimento do serviço antes de o painel o dar por calado. */
export const PULSO_MAX_S = 180
const DIA_MS = 86_400_000

// ── peças ───────────────────────────────────────────────────────────────────

/** «MTM Auto Sensei» → «Sensei»; slug como recurso. */
export function nomeCurtoEstrategia(nome: string | null | undefined, slug: string): string {
  const n = String(nome ?? '').replace(/^MTM Auto\s+/i, '').trim()
  if (n) return n
  if (/^premium/i.test(slug)) return 'Premium'
  if (/goldkiller/i.test(slug)) return 'GoldKiller'
  return slug.replace(/^mtm-auto-/, '').replace(/^\w/, (c) => c.toUpperCase())
}

/** O emblema das contas que são mestres de estratégia: «Mestre · Sensei». */
export function rotuloMestre(nome: string | null | undefined, slug: string): string {
  return `Mestre · ${nomeCurtoEstrategia(nome, slug)}`
}

/** id da conta (mtm_trading_accounts) → estratégia de que é mestre. */
export function mestresPorConta(linhas: Array<{ conta_mestre_id?: unknown; slug?: unknown; nome?: unknown; modo?: unknown }>): Map<string, { slug: string; nome: string; rotulo: string; modo: ModoEstrategia }> {
  const m = new Map<string, { slug: string; nome: string; rotulo: string; modo: ModoEstrategia }>()
  for (const l of linhas) {
    if (!l.conta_mestre_id || !l.slug) continue
    const slug = String(l.slug)
    const nome = nomeCurtoEstrategia(l.nome as string | null, slug)
    const modo = (['desligado', 'sombra', 'live'].includes(String(l.modo)) ? String(l.modo) : 'desligado') as ModoEstrategia
    m.set(String(l.conta_mestre_id), { slug, nome, rotulo: `Mestre · ${nome}`, modo })
  }
  return m
}

export function executorDe(e: Pick<EstrategiaMestre, 'modo' | 'copyfactoryIds' | 'copyfactoryCortadoEm'>): { executor: Executor; nota: string } {
  if (e.modo === 'live') return { executor: 'motor', nota: 'o nosso motor envia da mestre SIM para as contas dos clientes (sem CopyFactory)' }
  const sombra = e.modo === 'sombra' ? ' · motor em sombra a registar o que faria' : ''
  if (e.copyfactoryIds.length && !e.copyfactoryCortadoEm) return { executor: 'copyfactory', nota: `CopyFactory ${e.copyfactoryIds.join(', ')}${sombra}` }
  return { executor: 'legado', nota: `caminho antigo (MTM Auto / execução directa / T2T)${sombra}` }
}

/** Espelho da guarda da base (116): porque é que pôr este campo em live seria recusado. */
export function motivoBloqueioLive(
  e: Pick<EstrategiaMestre, 'copyfactoryIds' | 'copyfactoryCortadoEm' | 'incluirMtmauto' | 'mtmautoCortadoEm'>,
  campo: CampoModo,
  global: ConfigGlobalMestres,
): string | null {
  if (!global.liveDesbloqueado) return 'live não desbloqueado na instalação (site_settings.mestres_motor.live_desbloqueado)'
  if (campo === 'modo' && e.copyfactoryIds.length && !e.copyfactoryCortadoEm) {
    return `CopyFactory por cortar (${e.copyfactoryIds.join(', ')}) — correr scripts/mestres/cortar-copyfactory.ts antes, senão ordens em dobro`
  }
  if (campo === 'modo' && e.incluirMtmauto && !e.mtmautoCortadoEm) return 'inclui contas MTM Auto mas o mtm-auto ainda executa esta estratégia (mtmauto_cortado_em vazio)'
  return null
}

export function percentil(xs: number[], p: number): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))
  return v[i]
}

export function estatOrdens(ordens: OrdemEntrada[]): EstatOrdens {
  const c = (e: string) => ordens.filter((o) => o.estado === e).length
  const lat = ordens.filter((o) => o.modo === 'live' && o.latencia_total_ms != null).map((o) => Number(o.latencia_total_ms))
  return {
    total: ordens.length, ok: c('ok'), erro: c('erro'), recusado: c('recusado'), bloqueado: c('bloqueado'), sombra: c('sombra'), saltado: c('saltado'),
    latP50Ms: percentil(lat, 0.5), latP95Ms: percentil(lat, 0.95),
  }
}

const idadeS = (iso: string | null | undefined, agora: number) => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.max(0, Math.round((agora - t) / 1000)) : null
}

// ── resumo ──────────────────────────────────────────────────────────────────

export function resumirPainel(x: EntradaPainel): PainelMestres {
  const agora = x.agoraMs
  const pulsoIdadeS = idadeS(x.pulso.em, agora)
  const pulsoVivo = pulsoIdadeS != null && pulsoIdadeS <= PULSO_MAX_S
  const esc = x.pulso.mestres?.escrita
  const escritaVps = typeof esc === 'boolean' ? esc : null
  const contasPorChave = new Map(x.contas.map((c) => [c.contaChave, c]))
  const ordens24 = x.ordens.filter((o) => agora - Date.parse(o.criado_em) < DIA_MS)

  const estrategias: EstrategiaPainel[] = x.estrategias.map((e) => {
    const slugL = e.slug.toLowerCase()
    const rotasE = x.rotas.filter((r) => String(r.estrategia_slug ?? '').toLowerCase() === slugL)
    const rotas: RotaPainel[] = rotasE.map((r) => {
      const conta = contasPorChave.get(r.destino_chave) ?? null
      const d = decidirModo({
        global: x.global, escritaNoProcesso: escritaVps === true, estrategia: e, conta,
        rota: { ativa: r.ativa, estado: r.estado, tipo_rota: r.tipo_rota ?? 'estrategia', destino_ref: r.destino_ref },
      })
      return {
        id: r.id, tipo: r.tipo_rota ?? 'estrategia', destinoRef: r.destino_ref, contaChave: r.destino_chave,
        etiqueta: conta?.etiqueta ?? null, descricao: conta?.descricao ?? null, contaModo: conta?.modo ?? 'sombra',
        efectivo: d.modo, motivo: d.motivo, abertasLive: x.abertasLivePorRota[r.id] ?? 0,
      }
    })
    const ordensE = ordens24.filter((o) => String(o.estrategia ?? '').toLowerCase() === slugL)
    const alertasE = x.alertas.filter((a) => String(a.estrategia ?? '').toLowerCase() === slugL)
    const sinaisE = x.sinais.filter((s) => s.estrategia.toLowerCase() === slugL).sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em))
    const ex = executorDe(e)
    const avisos: string[] = []
    if (e.sinalModo === 'live' && e.espelhoProviderAtivo) avisos.push('sinal → mestre em live com o espelho provider antigo ainda ligado: a mestre pode receber a mesma trade duas vezes')
    if (e.modo === 'live' && e.incluirMtmauto && e.mtmautoEspelhar === true) avisos.push('o MTM Auto ainda tem espelhar=true nesta estratégia: confirmar que não executa em dobro')
    if (e.modo !== 'live' && e.copyfactoryIds.length && e.copyfactoryCortadoEm) avisos.push('CopyFactory cortada mas a propagação do motor não está em live: os clientes não recebem esta estratégia')
    if (!e.contaMestre) avisos.push('conta mestre SIM não encontrada')
    else if (e.contaMestre.estado && e.contaMestre.estado !== 'ativa') avisos.push(`conta mestre ${e.contaMestre.login ?? ''} em estado «${e.contaMestre.estado}»`)
    if (e.modo === 'live' && rotas.length && !rotas.some((r) => r.efectivo === 'live')) avisos.push('estratégia em live mas nenhuma conta recebe em live (todas em sombra)')
    return {
      slug: e.slug, nome: e.nome, providerId: e.providerId, executor: ex.executor, executorNota: ex.nota,
      modo: e.modo, sinalModo: e.sinalModo, t2tModo: e.t2tModo, contaMestre: e.contaMestre, rotuloMestre: rotuloMestre(e.nome, e.slug),
      cf: { ids: e.copyfactoryIds, cortado: Boolean(e.copyfactoryCortadoEm), cortadoEm: e.copyfactoryCortadoEm },
      mtmauto: { incluir: e.incluirMtmauto, cortadoEm: e.mtmautoCortadoEm, espelhar: e.mtmautoEspelhar },
      espelhoProviderAtivo: e.espelhoProviderAtivo,
      rotas, nRotas: rotas.length, nRotasLive: rotas.filter((r) => r.efectivo === 'live').length,
      nContasLive: new Set(rotas.filter((r) => r.efectivo === 'live').map((r) => r.contaChave)).size,
      abertasLive: rotas.reduce((a, r) => a + r.abertasLive, 0),
      ordens24h: estatOrdens(ordensE), ultimasOrdens: ordensE.slice(0, 10), alertas: alertasE.slice(0, 10),
      ultimoSinal: sinaisE[0] ?? null,
      bloqueioLive: { modo: motivoBloqueioLive(e, 'modo', x.global), sinal_modo: motivoBloqueioLive(e, 'sinal_modo', x.global), t2t_modo: motivoBloqueioLive(e, 't2t_modo', x.global) },
      avisos,
    }
  }).sort((a, b) => ordemModo(b.modo) - ordemModo(a.modo) || a.nome.localeCompare(b.nome))

  const contas: ContaPainel[] = x.contas.map((c) => ({
    contaChave: c.contaChave, contaRef: c.contaRef, modo: c.modo, etiqueta: c.etiqueta, descricao: c.descricao, email: c.email,
    estrategias: estrategias.flatMap((e) => e.rotas.filter((r) => r.contaChave === c.contaChave).map((r) => ({ slug: e.slug, tipo: r.tipo, efectivo: r.efectivo }))),
    falhasSeguidas: c.falhasSeguidas, bloqueada: c.bloqueada, bloqueioMotivo: c.bloqueioMotivo, ultimaFalha: c.ultimaFalha, ultimaFalhaEm: c.ultimaFalhaEm,
    limites: { maxPosicoes: c.maxPosicoes, maxRiscoTotalPct: c.maxRiscoTotalPct, maxLoteTotal: c.maxLoteTotal, loteFixoForcado: c.loteFixoForcado },
  }))
  // contas que só aparecem nas rotas (sem linha em mestres_contas: sombra por omissão)
  for (const e of estrategias) for (const r of e.rotas) {
    if (contas.some((c) => c.contaChave === r.contaChave)) continue
    contas.push({
      contaChave: r.contaChave, contaRef: r.destinoRef, modo: 'sombra', etiqueta: null, descricao: null, email: null,
      estrategias: estrategias.flatMap((e2) => e2.rotas.filter((r2) => r2.contaChave === r.contaChave).map((r2) => ({ slug: e2.slug, tipo: r2.tipo, efectivo: r2.efectivo }))),
      falhasSeguidas: 0, bloqueada: false, bloqueioMotivo: null, ultimaFalha: null, ultimaFalhaEm: null,
      limites: { maxPosicoes: 10, maxRiscoTotalPct: 6, maxLoteTotal: null, loteFixoForcado: null },
    })
  }
  contas.sort((a, b) => Number(b.modo === 'live') - Number(a.modo === 'live') || b.estrategias.length - a.estrategias.length || a.contaChave.localeCompare(b.contaChave))

  const estado: EstadoMotor = x.global.kill ? 'kill' : !x.global.ligado ? 'desligado' : !pulsoVivo ? 'sem-pulso'
    : estrategias.some((e) => e.nRotasLive > 0 || e.sinalModo === 'live') && escritaVps === true ? 'live' : 'sombra'
  const global = { ...x.global, escritaVps, pulsoEm: x.pulso.em, pulsoIdadeS, pulsoVivo, estado }
  const alertasNovos = x.alertas.filter((a) => !a.visto_em).length
  const alertas24h = x.alertas.filter((a) => agora - Date.parse(a.criado_em) < DIA_MS).length
  const ordensTot = estatOrdens(ordens24)
  const totais = {
    estrategias: estrategias.length,
    estrategiasLive: estrategias.filter((e) => e.modo === 'live' || e.sinalModo === 'live' || e.t2tModo === 'live').length,
    estrategiasSombra: estrategias.filter((e) => e.modo === 'sombra' && e.sinalModo !== 'live').length,
    contasLive: contas.filter((c) => c.modo === 'live').length,
    rotas: estrategias.reduce((a, e) => a + e.nRotas, 0),
    rotasLive: estrategias.reduce((a, e) => a + e.nRotasLive, 0),
    abertasLive: estrategias.reduce((a, e) => a + e.abertasLive, 0),
    ordens24h: ordensTot,
    falhas24h: ordensTot.erro,
    alertasNovos, alertas24h,
  }
  return { global, estrategias, contas, totais, alertas: alertasDoPainel(global, estrategias, contas, totais) }
}

const ordemModo = (m: ModoEstrategia) => (m === 'live' ? 2 : m === 'sombra' ? 1 : 0)

export function alertasDoPainel(g: PainelMestres['global'], estrategias: EstrategiaPainel[], contas: ContaPainel[], t: PainelMestres['totais']): AlertaPainel[] {
  const a: AlertaPainel[] = []
  const temLive = estrategias.some((e) => e.modo === 'live' || e.sinalModo === 'live')
  if (g.kill) a.push({ id: 'mestres-kill', severidade: 'grave', titulo: 'Motor das mestres: KILL-SWITCH accionado', detalhe: 'Nada é enviado às contas dos clientes, nem saídas. As posições abertas ficam só com o SL/TP da corretora.' })
  if (!g.kill && g.ligado && !g.pulsoVivo) a.push({ id: 'mestres-pulso', severidade: temLive ? 'grave' : 'aviso', titulo: 'Motor das mestres sem batimento', detalhe: g.pulsoIdadeS == null ? 'o serviço mtm-copia-contas nunca registou' : `último batimento há ${Math.round(g.pulsoIdadeS / 60)} min` })
  if (!g.kill && g.ligado && temLive && g.escritaVps === false) a.push({ id: 'mestres-escrita', severidade: 'aviso', titulo: 'Estratégias em live mas MESTRES_ESCRITA≠1 no VPS', detalhe: 'O serviço trata tudo como sombra.' })
  if (t.falhas24h > 0) a.push({ id: 'mestres-falhas', severidade: t.falhas24h >= 5 ? 'grave' : 'aviso', titulo: `${t.falhas24h} ordem(ns) do motor com erro nas últimas 24 h`, detalhe: 'Ver as últimas ordens por estratégia.' })
  for (const c of contas) if (c.bloqueada) a.push({ id: `mestres-bloq:${c.contaChave}`, severidade: 'grave', titulo: `Conta bloqueada nas aberturas: ${c.etiqueta ?? c.contaChave}`, detalhe: c.bloqueioMotivo ?? `${c.falhasSeguidas} falhas seguidas` })
  if (t.alertasNovos > 0) a.push({ id: 'mestres-alertas', severidade: 'aviso', titulo: `${t.alertasNovos} alerta(s) do motor por ver`, detalhe: 'Conta que falha, corte por fazer, kill accionado.' })
  for (const e of estrategias) for (const av of e.avisos) a.push({ id: `mestres-av:${e.slug}:${av.slice(0, 20)}`, severidade: 'aviso', titulo: `${e.nome}: ${av.split(':')[0]}`, detalhe: av })
  const ordem = { grave: 0, aviso: 1, info: 2 }
  return a.sort((x, y) => ordem[x.severidade] - ordem[y.severidade])
}

// ── mudanças pedidas pelo admin ─────────────────────────────────────────────

export type PedidoMestres =
  | { tipo: 'estrategia'; slug: string; campo: CampoModo; valor: ModoEstrategia; confirmacao?: string }
  | { tipo: 'conta'; contaChave: string; valor: 'sombra' | 'live'; confirmacao?: string }
  | { tipo: 'kill'; valor: boolean; confirmacao?: string }
  | { tipo: 'alertas_vistos'; ids: (string | number)[] }

/** A palavra que o admin tem de escrever para cada mudança (o servidor recusa sem ela). */
export function palavraDeConfirmacao(p: PedidoMestres): string | null {
  switch (p.tipo) {
    case 'estrategia': return p.valor === 'live' ? `LIVE ${p.slug}` : 'CONFIRMAR'
    case 'conta': return p.valor === 'live' ? 'LIVE' : 'CONFIRMAR'
    case 'kill': return p.valor ? 'KILL' : 'RETOMAR'
    case 'alertas_vistos': return null
  }
}

const MODOS: ModoEstrategia[] = ['desligado', 'sombra', 'live']
const CAMPOS: CampoModo[] = ['modo', 'sinal_modo', 't2t_modo']

/** Lê o corpo de um pedido (vem do browser: nunca confiar na forma). */
export function lerPedido(corpo: unknown): PedidoMestres | { erro: string } {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>
  const confirmacao = typeof c.confirmacao === 'string' ? c.confirmacao.trim() : undefined
  switch (c.tipo) {
    case 'estrategia': {
      const slug = String(c.slug ?? '').trim()
      if (!slug || slug.length > 60) return { erro: 'slug obrigatório' }
      if (!CAMPOS.includes(c.campo as CampoModo)) return { erro: `campo inválido (${CAMPOS.join(' | ')})` }
      if (!MODOS.includes(c.valor as ModoEstrategia)) return { erro: `valor inválido (${MODOS.join(' | ')})` }
      return { tipo: 'estrategia', slug, campo: c.campo as CampoModo, valor: c.valor as ModoEstrategia, confirmacao }
    }
    case 'conta': {
      const contaChave = String(c.contaChave ?? '').trim()
      if (!/^(mt|tl):/.test(contaChave) || contaChave.length > 200) return { erro: 'contaChave inválida' }
      if (c.valor !== 'sombra' && c.valor !== 'live') return { erro: 'valor inválido (sombra | live)' }
      return { tipo: 'conta', contaChave, valor: c.valor, confirmacao }
    }
    case 'kill':
      if (typeof c.valor !== 'boolean') return { erro: 'valor (boolean) obrigatório' }
      return { tipo: 'kill', valor: c.valor, confirmacao }
    case 'alertas_vistos': {
      const ids = Array.isArray(c.ids) ? c.ids.filter((i) => /^\d{1,18}$/.test(String(i))).slice(0, 200) as (string | number)[] : []
      if (!ids.length) return { erro: 'ids obrigatórios' }
      return { tipo: 'alertas_vistos', ids }
    }
    default:
      return { erro: 'tipo inválido (estrategia | conta | kill | alertas_vistos)' }
  }
}

/**
 * A mudança pode seguir para a base? Confirma a palavra e repete as guardas da 116 para dar ao admin
 * uma mensagem clara (a base volta a verificar tudo no trigger — este passo nunca a substitui).
 */
export function validarPedido(
  p: PedidoMestres,
  ctx: { global: ConfigGlobalMestres; estrategia?: EstrategiaMestre | null; contaExiste?: boolean },
): { ok: true } | { ok: false; status: number; erro: string } {
  const palavra = palavraDeConfirmacao(p)
  if (palavra && (!('confirmacao' in p) || p.confirmacao !== palavra)) return { ok: false, status: 400, erro: `Escreve «${palavra}» para confirmar.` }
  if (p.tipo === 'estrategia') {
    if (!ctx.estrategia) return { ok: false, status: 404, erro: `estratégia ${p.slug} não está no motor das mestres (mestres_estrategias)` }
    if (p.valor === 'live') {
      const m = motivoBloqueioLive(ctx.estrategia, p.campo, ctx.global)
      if (m) return { ok: false, status: 409, erro: m }
    }
  }
  if (p.tipo === 'conta') {
    if (!ctx.contaExiste) return { ok: false, status: 404, erro: 'conta sem rota no motor das mestres' }
    if (p.valor === 'live' && !ctx.global.liveDesbloqueado) return { ok: false, status: 409, erro: 'live não desbloqueado na instalação (site_settings.mestres_motor.live_desbloqueado)' }
  }
  return { ok: true }
}

/** O novo valor de site_settings.mestres_motor para o kill-switch (nunca mexe em ligado/live_desbloqueado). */
export function valorKill(atual: ConfigGlobalMestres, kill: boolean): { ligado: boolean; kill: boolean; live_desbloqueado: boolean } {
  return { ligado: atual.ligado, kill, live_desbloqueado: atual.liveDesbloqueado }
}

// ── métricas de 90 dias (as da MTM Auto, lib/mtmauto/desempenho-do-catalogo) ─────────────────

export interface Resumo90d {
  /** true = há trades REAIS fechadas em 90 dias (o número publicado) */
  temHistorico: boolean
  winrate: number | null
  fechados: number
  pips: number | null
  fatorLucro: number | null
  /** só contas SIMULADAS, só quando não há reais — interno, nunca se publica nem se soma */
  simuladas: { trades: number; winrate: number | null; pips: number } | null
}

/** O retrato da MTM Auto reduzido ao que o admin precisa numa linha. Não recalcula nada. */
export function resumo90d(d: { winrate: number | null; fechados: number; pips: number | null; fatorLucro: number | null; simuladas?: { trades: number; winrate: number | null; pips: number } | null }): Resumo90d {
  const tem = d.winrate != null && d.fechados > 0
  return {
    temHistorico: tem,
    winrate: tem ? d.winrate : null,
    fechados: tem ? d.fechados : 0,
    pips: tem ? d.pips : null,
    fatorLucro: tem ? d.fatorLucro : null,
    simuladas: !tem && d.simuladas && d.simuladas.trades > 0 ? { trades: d.simuladas.trades, winrate: d.simuladas.winrate, pips: d.simuladas.pips } : null,
  }
}

/** «71,4% · 7 trades · +123,4 pips» | «sem histórico real (simuladas: 55% · 20)» */
export function textoResumo90d(r: Resumo90d | null | undefined): string {
  if (!r) return '—'
  const f = (v: number, c = 1) => v.toLocaleString('pt-PT', { maximumFractionDigits: c })
  if (r.temHistorico) {
    const pips = r.pips == null ? '' : ` · ${r.pips > 0 ? '+' : ''}${f(r.pips)} pips`
    return `${f(r.winrate ?? 0)}% · ${r.fechados} ${r.fechados === 1 ? 'trade' : 'trades'}${pips}`
  }
  if (r.simuladas) return `sem histórico real (simuladas: ${r.simuladas.winrate == null ? '—' : `${f(r.simuladas.winrate)}%`} · ${r.simuladas.trades})`
  return 'sem histórico real'
}

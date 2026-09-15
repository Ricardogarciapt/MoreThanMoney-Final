/**
 * Centro de Controlo MTM Auto — REGRAS PURAS (sem imports de servidor). Partilhadas pelas rotas
 * /api/admin/centro/* e pelo ecrã, e testadas em lib/admin-centro/__tests__/centro.check.ts.
 */

export type Tom = 'ok' | 'aviso' | 'grave' | 'info' | 'neutro'
export type Severidade = 'grave' | 'aviso' | 'info'

// ── números ─────────────────────────────────────────────────────────────────────────────────────

export function percentil(xs: number[], p: number): number | null {
  const v = xs.filter((x) => Number.isFinite(x))
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  return Math.round(s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))])
}

export function idadeS(iso: string | null | undefined, agoraMs = Date.now()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.max(0, Math.round((agoraMs - t) / 1000)) : null
}

/** Tom de uma idade (s) face a limites de aviso/grave. Sem idade = grave (nunca visto). */
export function tomIdade(idade: number | null, avisoS: number, graveS: number): Tom {
  if (idade == null) return 'grave'
  if (idade >= graveS) return 'grave'
  if (idade >= avisoS) return 'aviso'
  return 'ok'
}

/** Série de contagens por balde (para sparklines): `n` baldes de `baldeMs` a acabar em `agoraMs`. */
export function serieTemporal(tempos: number[], n: number, baldeMs: number, agoraMs = Date.now()): number[] {
  const out = new Array<number>(n).fill(0)
  const inicio = agoraMs - n * baldeMs
  for (const t of tempos) {
    if (!Number.isFinite(t) || t < inicio || t > agoraMs) continue
    out[Math.min(n - 1, Math.floor((t - inicio) / baldeMs))]++
  }
  return out
}

export function taxa(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : null
}

// ── fontes de sinais ────────────────────────────────────────────────────────────────────────────

export type ChaveFonte = 'premium' | 'primeverse' | 'sensei' | 'goldkiller' | 'mtmscanner' | 'aurum' | 'forex' | 't2t' | 'mtmauto' | 'outra'

export const FONTES: { chave: ChaveFonte; nome: string; nota: string; limiteSilencioMin: number | null }[] = [
  { chave: 'premium', nome: 'Premium (relay SME)', nota: 'Telegram → relay-post → execução/CopyFactory', limiteSilencioMin: null },
  { chave: 'primeverse', nome: 'PrimeVerse', nota: 'pv-relay → primeverse-exec', limiteSilencioMin: null },
  { chave: 'sensei', nome: 'Sensei (TradingView)', nota: 'webhook TradingView', limiteSilencioMin: null },
  { chave: 'goldkiller', nome: 'GoldKiller', nota: 'webhook TradingView', limiteSilencioMin: null },
  { chave: 'mtmscanner', nome: 'MTM Scanner', nota: 'webhook TradingView', limiteSilencioMin: 240 },
  { chave: 'aurum', nome: 'Aurum Flow / perps', nota: 'webhook TradingView → Bybit', limiteSilencioMin: null },
  { chave: 'forex', nome: 'Forex (ideias/swings)', nota: 'Telegram / fs-relay', limiteSilencioMin: null },
  { chave: 't2t', nome: 'Tap to Trade', nota: 'aceitações dos clientes', limiteSilencioMin: null },
  { chave: 'mtmauto', nome: 'MTM Auto (motor)', nota: 'mtmauto_signals → execuções', limiteSilencioMin: null },
]

/** De onde veio uma linha do mtmcopy_signal_log (channel_key) ou um chat (channel_slug). */
export function fonteDoCanal(canal: string | null | undefined, texto?: string | null): ChaveFonte {
  const c = String(canal ?? '').toLowerCase()
  if (texto && /PrimeVerse/i.test(texto)) return 'primeverse'
  if (!c && texto && /premium/i.test(texto)) return 'premium'
  if (c === 'premium-signals' || c === 'premium-ideas' || c === 'premium') return 'premium'
  if (c.includes('primeverse')) return 'primeverse'
  if (c.includes('sensei')) return 'sensei'
  if (c.includes('goldkiller')) return 'goldkiller'
  if (c.includes('scanner')) return 'mtmscanner'
  if (c.includes('aurum') || c.includes('perps')) return 'aurum'
  if (c.includes('trade-ideas') || c.includes('forex') || c === 'ideias-e-sinais') return 'forex'
  if (c.includes('t2t') || c.includes('tap')) return 't2t'
  return 'outra'
}

/** De onde veio um alerta TradingView (alert_name / raw_payload.strategy). */
export function fonteDoAlerta(nome: string | null | undefined): ChaveFonte {
  const n = String(nome ?? '').toLowerCase()
  if (n.includes('sensei')) return 'sensei'
  if (n.includes('goldkiller') || n.includes('gold killer')) return 'goldkiller'
  if (n.includes('aurum') || n.includes('perps')) return 'aurum'
  if (n.includes('scanner')) return 'mtmscanner'
  return 'outra'
}

/** Estado de uma linha de fan-out, normalizado entre sistemas. */
export type EstadoFanout = 'executado' | 'saltado' | 'erro' | 'recebido' | 'aberto' | 'fechado' | 'descartado' | 'outro'

export function estadoFanout(s: string | null | undefined): EstadoFanout {
  const v = String(s ?? '').toLowerCase()
  if (v === 'executed' || v === 'filled') return 'executado'
  if (v === 'skipped') return 'saltado'
  if (v === 'error' || v === 'failed' || v === 'erro') return 'erro'
  if (v === 'received' || v === 'pending') return 'recebido'
  if (v === 'open' || v === 'active') return 'aberto'
  if (v === 'closed' || v.startsWith('exit') || v === 'loss' || v === 'be') return 'fechado'
  if (v === 'discarded') return 'descartado'
  return 'outro'
}

/** Um motivo de salto/erro é «ruído esperado» (cliente sem acesso, sem saldo) ou falha do sistema? */
export function motivoEsperado(motivo: string | null | undefined): boolean {
  return /access is not active|no balance|not enough money|gestão não aplicada|sem acesso|sem saldo|market (is )?closed|mercado fechado|fora do hor|paused|pausad|not subscribed|não subscrit|symbol not allowed|filtro/i.test(String(motivo ?? ''))
}

// ── alertas ─────────────────────────────────────────────────────────────────────────────────────

export type AcaoRunbook =
  | { tipo: 'pausar_monitores'; minutos: number }
  | { tipo: 'retomar_monitores' }
  | { tipo: 'desligar_motor_copia' }
  | { tipo: 'ir'; seccao: SeccaoCentro; filtro?: Record<string, string> }

export interface Alerta {
  id: string
  severidade: Severidade
  titulo: string
  detalhe: string
  acoes: { rotulo: string; acao: AcaoRunbook; confirmar?: string }[]
}

export type SeccaoCentro = 'cockpit' | 'sinais' | 'estrategias' | 'contas' | 'copia' | 'utilizadores' | 'funded' | 'sincronizacao'

export const SECCOES: { id: SeccaoCentro; nome: string; atalho: string }[] = [
  { id: 'cockpit', nome: 'Cockpit', atalho: '1' },
  { id: 'sinais', nome: 'Sinais', atalho: '2' },
  { id: 'estrategias', nome: 'Estratégias', atalho: '3' },
  { id: 'contas', nome: 'Contas', atalho: '4' },
  { id: 'copia', nome: 'Cópia', atalho: '5' },
  { id: 'utilizadores', nome: 'Utilizadores', atalho: '6' },
  { id: 'funded', nome: 'MTM Funded', atalho: '7' },
  { id: 'sincronizacao', nome: 'Sincronização & Auditoria', atalho: '8' },
]

export function ehSeccao(v: unknown): v is SeccaoCentro {
  return SECCOES.some((s) => s.id === v)
}

export interface EntradaAlertas {
  agoraMs: number
  quotaBloqueioAte: number | null
  supabaseMs: number | null
  pulsos: { nome: string; idadeS: number | null }[]
  snapshots: { conta: string; idadeS: number | null; sincronizado: boolean }[]
  exec1h: { total: number; erros: number; errosSistema: number }
  latenciaP95Ms: number | null
  copia: { pedidos: number; live: number; eventosPendentes: number; motorLigado: boolean }
  fantasmas: number | null
  premiumUltimoS: number | null
  mercadoAberto: boolean
}

/** Deriva os alertas do cockpit. Ordem: grave → aviso → info. */
export function derivarAlertas(e: EntradaAlertas): Alerta[] {
  const a: Alerta[] = []
  if (e.quotaBloqueioAte && e.quotaBloqueioAte > e.agoraMs) {
    const min = Math.ceil((e.quotaBloqueioAte - e.agoraMs) / 60_000)
    a.push({
      id: 'quota', severidade: 'aviso', titulo: `MetaApi: leituras de fundo em pausa (${min} min)`,
      detalhe: 'Travão de quota activo (global «*»). As ordens dos clientes não param; os monitores saltam leituras.',
      acoes: [{ rotulo: 'Retomar monitores já', acao: { tipo: 'retomar_monitores' }, confirmar: 'RETOMAR' }],
    })
  }
  if (e.supabaseMs != null && e.supabaseMs > 1500) {
    a.push({ id: 'supabase', severidade: 'grave', titulo: `Supabase lento (${e.supabaseMs} ms)`, detalhe: 'Sonda de 1 linha acima de 1,5 s. Reduzir carga de fundo antes de a base cair (cf. 15/09).', acoes: [{ rotulo: 'Pausar monitores 10 min', acao: { tipo: 'pausar_monitores', minutos: 10 }, confirmar: 'PAUSAR' }] })
  } else if (e.supabaseMs == null) {
    a.push({ id: 'supabase', severidade: 'grave', titulo: 'Supabase não respondeu à sonda', detalhe: 'A leitura de 1 linha falhou.', acoes: [] })
  }
  for (const p of e.pulsos) {
    if (p.idadeS == null || p.idadeS > 180) a.push({ id: `pulso:${p.nome}`, severidade: 'grave', titulo: `Serviço sem batimento: ${p.nome}`, detalhe: p.idadeS == null ? 'nunca registou' : `último há ${Math.round(p.idadeS / 60)} min`, acoes: [] })
  }
  for (const s of e.snapshots) {
    if (s.idadeS == null || s.idadeS > 120) a.push({ id: `snap:${s.conta}`, severidade: 'aviso', titulo: `Streaming parado · ${s.conta.slice(0, 8)}`, detalhe: `fotografia com ${s.idadeS == null ? '?' : Math.round(s.idadeS)} s`, acoes: [] })
    else if (!s.sincronizado) a.push({ id: `snap:${s.conta}`, severidade: 'aviso', titulo: `Streaming não sincronizado · ${s.conta.slice(0, 8)}`, detalhe: 'a ligação existe mas não terminou a sincronização', acoes: [] })
  }
  if (e.exec1h.total >= 5 && e.exec1h.errosSistema / e.exec1h.total > 0.2) {
    a.push({ id: 'erros1h', severidade: 'grave', titulo: `Erros de execução na última hora: ${e.exec1h.errosSistema}/${e.exec1h.total}`, detalhe: 'Mais de 20% das execuções falharam por razões do sistema (não contam «sem acesso»/«sem saldo»).', acoes: [{ rotulo: 'Ver sinais com erro', acao: { tipo: 'ir', seccao: 'sinais', filtro: { estado: 'erro' } } }] })
  }
  if (e.latenciaP95Ms != null && e.latenciaP95Ms > 10_000) {
    a.push({ id: 'latencia', severidade: 'aviso', titulo: `Latência sinal→execução p95 ${Math.round(e.latenciaP95Ms / 1000)} s`, detalhe: 'Acima de 10 s nas últimas 24 h.', acoes: [{ rotulo: 'Abrir sinais', acao: { tipo: 'ir', seccao: 'sinais' } }] })
  }
  if (e.copia.live > 0) {
    a.push({ id: 'copia-live', severidade: 'grave', titulo: `${e.copia.live} rota(s) de cópia em LIVE`, detalhe: 'Nesta fase nenhuma rota devia estar em live.', acoes: [{ rotulo: 'Ver rotas', acao: { tipo: 'ir', seccao: 'copia' } }, ...(e.copia.motorLigado ? [{ rotulo: 'Desligar motor da cópia', acao: { tipo: 'desligar_motor_copia' } as AcaoRunbook, confirmar: 'DESLIGAR' }] : [])] })
  }
  if (e.copia.eventosPendentes > 200) {
    a.push({ id: 'copia-fila', severidade: 'aviso', titulo: `${e.copia.eventosPendentes} eventos de cópia por processar`, detalhe: 'O motor do VPS pode estar parado ou atrasado.', acoes: [{ rotulo: 'Ver cópia', acao: { tipo: 'ir', seccao: 'copia' } }] })
  }
  if (e.fantasmas != null && e.fantasmas > 0) {
    a.push({ id: 'fantasmas', severidade: 'aviso', titulo: `${e.fantasmas} conta(s) MetaApi inexistente(s) referenciadas`, detalhe: 'Registo de contas que devolvem 404 na MetaApi.', acoes: [{ rotulo: 'Ver contas', acao: { tipo: 'ir', seccao: 'contas', filtro: { problema: '1' } } }] })
  }
  if (e.mercadoAberto && e.premiumUltimoS != null && e.premiumUltimoS > 6 * 3600) {
    a.push({ id: 'premium-silencio', severidade: 'info', titulo: `Premium sem sinais há ${Math.round(e.premiumUltimoS / 3600)} h`, detalhe: 'Pode ser normal; confirmar o relay e o webhook do bot se durar.', acoes: [{ rotulo: 'Abrir sinais Premium', acao: { tipo: 'ir', seccao: 'sinais', filtro: { fonte: 'premium' } } }] })
  }
  if (e.copia.pedidos > 0) {
    a.push({ id: 'copia-pedidos', severidade: 'info', titulo: `${e.copia.pedidos} pedido(s) de cópia à espera`, detalhe: 'Clientes pediram rotas conta→conta.', acoes: [{ rotulo: 'Aprovar pedidos', acao: { tipo: 'ir', seccao: 'copia', filtro: { estado: 'pedido' } } }] })
  }
  const ordem: Record<Severidade, number> = { grave: 0, aviso: 1, info: 2 }
  return a.sort((x, y) => ordem[x.severidade] - ordem[y.severidade])
}

/** Mercado de ouro/forex aberto (grosso modo: dom 22:00 → sex 21:00 UTC). */
export function mercadoAberto(agora = new Date()): boolean {
  const d = agora.getUTCDay()
  const h = agora.getUTCHours()
  if (d === 6) return false
  if (d === 0) return h >= 22
  if (d === 5) return h < 21
  return true
}

// ── direitos (matriz MTM Auto) ──────────────────────────────────────────────────────────────────

export const MOTIVOS_DIREITO: { motivo: string; nome: string; tom: Tom }[] = [
  { motivo: 'admin', nome: 'Admin', tom: 'info' },
  { motivo: 'mtmauto_stripe', nome: 'Stripe (MTM Auto)', tom: 'ok' },
  { motivo: 'mtmauto_apple', nome: 'Apple', tom: 'ok' },
  { motivo: 'legado_mtmcopy', nome: 'MTM Copy legado', tom: 'aviso' },
  { motivo: 'mtmauto_isento', nome: 'Isento', tom: 'neutro' },
  { motivo: 'mtmauto_manual', nome: 'Acesso manual', tom: 'neutro' },
  { motivo: 'vip', nome: 'VIP', tom: 'ok' },
  { motivo: 'premium', nome: 'Premium', tom: 'ok' },
  { motivo: 'membro_mtm', nome: 'Membro', tom: 'neutro' },
  { motivo: 'suspenso', nome: 'Suspenso', tom: 'grave' },
  { motivo: 'nenhum', nome: 'Sem acesso', tom: 'grave' },
]

export function nomeMotivo(m: string | null | undefined): string {
  return MOTIVOS_DIREITO.find((x) => x.motivo === m)?.nome ?? String(m ?? '—')
}

// ── erros actuais vs velhos ─────────────────────────────────────────────────────────────────────

/** Um erro guardado numa conta é actual se a conta foi actualizada nas últimas `horas` h. */
export function erroActual(erro: string | null | undefined, atualizadoEm: string | null | undefined, agoraMs = Date.now(), horas = 24): 'actual' | 'velho' | null {
  if (!erro) return null
  const i = idadeS(atualizadoEm, agoraMs)
  return i != null && i <= horas * 3600 ? 'actual' : 'velho'
}

// ── flag de transição ───────────────────────────────────────────────────────────────────────────

export const CHAVE_FLAG_PADRAO = 'admin_centro_padrao'

/** site_settings.value pode vir como boolean, string JSON ou {ligado}. env ADMIN_CENTRO_PADRAO=1 força. */
export function lerFlagPadrao(valor: unknown, env: string | undefined): boolean {
  if (String(env ?? '').trim() === '1') return true
  if (valor === true) return true
  if (typeof valor === 'string') return valor.trim() === 'true' || valor.trim() === '"true"'
  if (valor && typeof valor === 'object') return (valor as { ligado?: unknown }).ligado === true
  return false
}

/** Palavras de confirmação por acção (o servidor recusa sem elas). */
export const CONFIRMACOES = {
  pausar_monitores: 'PAUSAR',
  retomar_monitores: 'RETOMAR',
  desligar_motor_copia: 'DESLIGAR',
  flag_padrao: 'CONFIRMAR',
} as const

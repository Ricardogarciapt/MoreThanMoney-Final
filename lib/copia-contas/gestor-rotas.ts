/**
 * O GESTOR DE ROTAS — as regras puras do ecrã simples «estratégia → contas».
 *
 * Pedido do dono (19/11/2026): as rotas estavam confusas (lista + quadro livre + tabelas de rotas).
 * O gestor mostra UMA coluna por estratégia LIGADA, com a cadeia inteira no topo (de onde vem o
 * sinal → conta mestre → onde aparece nas apps) e as contas dos clientes por baixo, como cartões
 * que se arrastam de uma estratégia para outra. Nada aqui escreve: a escrita é a mesma da cadeia
 * (`/api/admin/mtmauto-copia/cadeia`, pelo DESEJO do cliente e ressincronização das rotas).
 *
 * As estratégias LIGADAS são as que têm `mtmauto_providers.ativo = true` — o mesmo campo que a
 * admin da app MTM Auto liga e desliga. Não há lista fixa aqui: o que a app mostra, o gestor mostra.
 */
import { podeLigar, type Cadeia, type NoEstrategia, type SubscritorCadeia } from './cadeia'
import type { PlataformaCopia } from './tipos'

// ── de onde vem o sinal ─────────────────────────────────────────────────────

export type TipoFonte = 'webhook' | 'telegram' | 'chat' | 'externa' | 'desconhecida'

/**
 * A fonte REAL de cada estratégia da casa. `mtmauto_providers.fonte_sinais` está vazio em todas
 * (19/11), e o «Chat · sinais-x» que a cadeia mostra é para onde o sinal VAI, não de onde vem.
 * O Premium (premium-ouro) é o trader manual lido do Telegram pelo relay da VPS; as outras nascem
 * de alertas do TradingView (webhook) dos nossos scanners.
 */
export const FONTE_DA_CASA: Record<string, { tipo: TipoFonte; texto: string }> = {
  'premium-ouro': { tipo: 'telegram', texto: 'Telegram · relay da VPS (trader manual, sessão de Londres)' },
  'mtm-auto-premium-ii': { tipo: 'webhook', texto: 'Webhook · scanner MTM Auto Premium' },
  'aurum-flow': { tipo: 'webhook', texto: 'Webhook · Aurum Flow (cripto)' },
  'mtm-auto-trendshot': { tipo: 'webhook', texto: 'Webhook · TrendShot' },
  'mtm-auto-defy': { tipo: 'webhook', texto: 'Webhook · DEFY' },
  'mtm-scanner': { tipo: 'webhook', texto: 'Webhook · MTM Scanner (Ideias de Forex)' },
  sensei: { tipo: 'webhook', texto: 'Webhook · Sensei scanner' },
  goldkiller: { tipo: 'webhook', texto: 'Webhook · GoldKiller' },
}

export function fonteDaEstrategia(n: Pick<NoEstrategia, 'slug' | 'fonteSinais' | 'fonteFiltro' | 'canalChat' | 'fonte'>): { tipo: TipoFonte; texto: string } {
  if (n.fonteSinais) {
    const nome = n.fonteSinais === 'primeverse' ? 'PrimeVerse' : n.fonteSinais
    return { tipo: 'externa', texto: n.fonteFiltro ? `${nome} · ${n.fonteFiltro}` : nome }
  }
  const casa = FONTE_DA_CASA[n.slug.toLowerCase()]
  if (casa) return casa
  if (n.canalChat) return { tipo: 'chat', texto: `Chat · ${n.canalChat}` }
  return { tipo: 'desconhecida', texto: 'Fonte por declarar' }
}

// ── as contas ───────────────────────────────────────────────────────────────

/** O que o gestor precisa de cada conta (sai de `/api/admin/mtmauto-copia/contas`). */
export interface ContaGestor {
  ref: string
  origem: 'site' | 'auto' | 'wt' | 'funded'
  plataforma: PlataformaCopia
  userId: string
  email: string | null
  nome: string | null
  rotulo: string | null
  etiqueta: string | null
  mestre: string | null
  login: string | null
  servidor: string | null
  ativa: boolean
  demo: boolean
  saldo: number | null
}

/** Nome curto e claro do TIPO de conta — o que o dono reconhece, sem siglas internas. */
export const NOME_PLATAFORMA: Record<PlataformaCopia, string> = {
  mt5: 'MetaTrader 5',
  mt4: 'MetaTrader 4',
  tradelocker: 'TradeLocker',
  mtmfunded: 'MTM Funded',
}
export const CURTO_PLATAFORMA: Record<PlataformaCopia, string> = { mt5: 'MT5', mt4: 'MT4', tradelocker: 'TL', mtmfunded: 'Funded' }

/** Por que app a conta entrou. A mesma conta pode estar em várias — o gestor mostra a da rota. */
export const APP_DA_ORIGEM: Record<string, { nome: string; cor: string }> = {
  auto: { nome: 'App MTM Auto', cor: 'text-emerald-300 border-emerald-500/30' },
  site: { nome: 'MTM System · T2T', cor: 'text-sky-300 border-sky-500/30' },
  wt: { nome: 'WebTrader', cor: 'text-violet-300 border-violet-500/30' },
  funded: { nome: 'MTM Funded', cor: 'text-amber-300 border-amber-500/30' },
  prov: { nome: 'Mestre', cor: 'text-[#E9C46A] border-[#D2A63C]/40' },
}

export const origemDaRef = (ref: string): string => String(ref).split(':')[0]?.toLowerCase() ?? ''

/** Só as ligações do site e as contas da app escolhem estratégias (é onde vive o desejo do cliente). */
export const podeMexer = (ref: string): boolean => /^(site|auto):/i.test(ref)

/** A plataforma de uma ref quando a conta não veio na lista (ex.: `funded:` fora da listagem). */
export function plataformaDaRef(ref: string, conta: ContaGestor | undefined): PlataformaCopia {
  if (conta) return conta.plataforma
  return origemDaRef(ref) === 'funded' ? 'mtmfunded' : 'mt5'
}

// ── a organização do ecrã ───────────────────────────────────────────────────

export interface Gestor {
  /** colunas: estratégias ligadas nas apps, as com mais contas primeiro */
  ativas: NoEstrategia[]
  /** estratégias desligadas — recolhidas em baixo */
  desligadas: NoEstrategia[]
  /** contas de cliente (site/app) activas que não seguem nenhuma estratégia ligada */
  semEstrategia: ContaGestor[]
  /** contas ainda presas a uma estratégia desligada: não recebem sinais novos */
  presasEmDesligadas: Array<{ estrategia: NoEstrategia; s: SubscritorCadeia }>
}

export function organizarGestor(c: Pick<Cadeia, 'estrategias'>, contas: ContaGestor[]): Gestor {
  const ativas = c.estrategias.filter((n) => n.ativo)
    .sort((a, b) => b.contagem.total - a.contagem.total || a.nome.localeCompare(b.nome, 'pt'))
  const desligadas = c.estrategias.filter((n) => !n.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
  const aSeguir = new Set(ativas.flatMap((n) => n.subscritores.map((s) => s.ref.toLowerCase())))
  const semEstrategia = contas
    .filter((x) => podeMexer(x.ref) && x.ativa && !x.mestre && !aSeguir.has(x.ref.toLowerCase()))
    .sort((a, b) => (a.etiqueta ?? a.email ?? a.ref).localeCompare(b.etiqueta ?? b.email ?? b.ref, 'pt'))
  const presasEmDesligadas = desligadas.flatMap((estrategia) =>
    estrategia.subscritores.filter((s) => !s.pausadaMotivo).map((s) => ({ estrategia, s })))
  return { ativas, desligadas, semEstrategia, presasEmDesligadas }
}

/** Procura num cartão: nome, email, login, etiqueta, ref. */
export function bateNaProcura(q: string, s: { etiqueta?: string | null; descricao?: string | null; email?: string | null; ref: string }, conta?: ContaGestor): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return [s.etiqueta, s.descricao, s.email, s.ref, conta?.login, conta?.nome, conta?.servidor].some((v) => String(v ?? '').toLowerCase().includes(t))
}

// ── o que um largar pede ────────────────────────────────────────────────────

export type PedidoLargar =
  | { accao: 'ligar'; ref: string; slug: string }
  | { accao: 'desligar'; ref: string; slug: string }
  | { accao: 'mover'; ref: string; de: string; para: string }

/**
 * O pedido que um arrasto faz. `para = null` é largar em «Sem estratégia» (deixar de seguir);
 * `de = null` é vir de «Sem estratégia» (passar a seguir). Com `copiar` (tecla Alt) a conta fica
 * nas duas. Devolve o motivo em PT quando não pode — o ecrã mostra-o em vez de pedir um 409.
 */
export function pedidoDoLargar(p: {
  ref: string
  de: NoEstrategia | null
  para: NoEstrategia | null
  copiar?: boolean
  chave?: string
}): { ok: true; pedido: PedidoLargar } | { ok: false; motivo: string } {
  if (!podeMexer(p.ref)) return { ok: false, motivo: 'Esta conta entrou pelo WebTrader ou pelo MTM Funded: a estratégia escolhe-se na conta MTM Auto ou na ligação do site.' }
  if (!p.para) {
    if (!p.de) return { ok: false, motivo: 'A conta já não segue nenhuma estratégia.' }
    return { ok: true, pedido: { accao: 'desligar', ref: p.ref, slug: p.de.slug } }
  }
  const v = podeLigar(p.para, { chave: p.chave ?? p.ref, ref: p.ref }, p.copiar ? null : p.de)
  if (!v.ok) return { ok: false, motivo: v.mensagem }
  if (!p.de || p.copiar) return { ok: true, pedido: { accao: 'ligar', ref: p.ref, slug: p.para.slug } }
  return { ok: true, pedido: { accao: 'mover', ref: p.ref, de: p.de.slug, para: p.para.slug } }
}

/** A frase de confirmação do que acabou de acontecer, para o aviso no ecrã. */
export function fraseDoPedido(p: PedidoLargar, nomes: Map<string, string>, conta: string): string {
  const n = (s: string) => nomes.get(s.toLowerCase()) ?? s
  if (p.accao === 'mover') return `${conta} passou de «${n(p.de)}» para «${n(p.para)}».`
  if (p.accao === 'ligar') return `${conta} passou a seguir «${n(p.slug)}».`
  return `${conta} deixou de seguir «${n(p.slug)}». As posições abertas continuam geridas até fecharem.`
}

// ── o filtro simples de TIPO de conta (Centro › Contas) ─────────────────────

export type TipoConta = '' | 'mt5' | 'mt4' | 'tradelocker' | 'mtmfunded'

/** Os botões do filtro, já com o nome claro e a contagem — só aparecem os tipos que existem. */
export function botoesTipoConta(contas: Array<{ plataforma: string }>): Array<{ id: TipoConta; nome: string; n: number }> {
  const conta = (p: string) => contas.filter((c) => c.plataforma === p).length
  const tipos: Array<Exclude<TipoConta, ''>> = ['mt5', 'mtmfunded', 'tradelocker', 'mt4']
  return [
    { id: '' as TipoConta, nome: 'Todas', n: contas.length },
    ...tipos.map((t) => ({ id: t as TipoConta, nome: NOME_PLATAFORMA[t], n: conta(t) })).filter((b) => b.n > 0),
  ]
}

/**
 * QUEM COPIA O QUÊ — a cadeia FONTE DE SINAIS → CONTA MESTRE (estratégia) → SUBSCRITORES.
 *
 * ═══ PORQUE ISTO EXISTE ═════════════════════════════════════════════════════════════════════
 *
 * O painel `/admin/centro?s=copia` mostrava azulejos de contagem e uma tabela de rotas soltas.
 * Nenhum dos dois responde à pergunta que o dono faz todos os dias — «quem copia o quê». Uma rota
 * sozinha (`origem_chave` → `destino_chave`) não diz de que ESTRATÉGIA é, nem de onde veio o sinal
 * que a fez abrir, nem se está mesmo a executar. Isto junta as três camadas numa leitura só.
 *
 * ═══ A FONTE DE VERDADE (e a coluna que MENTE) ══════════════════════════════════════════════
 *
 * `copia_rotas.modo` NÃO é o modo real de execução. É uma coluna da migração 078 (cópia conta-a-conta)
 * cujas fechaduras são `site_settings.copia_contas.ligado` + `copia_contas_live_desbloqueado` +
 * `COPIA_ESCRITA=1` — e o desbloqueio está a `false` desde sempre. Por isso TODAS as linhas de
 * `copia_rotas` estão em `modo='shadow'`, incluindo as das estratégias que executam em LIVE.
 * Um painel que conte `modo='live'` mostra 0 e diz «live bloqueado» enquanto o motor abre ordens
 * reais em contas de clientes. Era exactamente o que o painel antigo fazia.
 *
 * Quem manda de verdade nas rotas das mestres (`mestres=true`, migração 116) é:
 *   · `site_settings.mestres_motor`  → ligado / kill / live_desbloqueado
 *   · `mestres_estrategias.modo`     → por estratégia (e `t2t_modo` para as rotas `tipo_rota='t2t'`)
 *   · `mestres_contas.modo`          → por conta de destino
 *   · `MESTRES_ESCRITA=1`            → no processo do VPS
 * e a regra que os combina é `lib/mestres/decisao.ts::decidirModo` — a MESMA que o motor corre.
 * É ela que se usa aqui, para o painel não ter uma segunda opinião sobre o que está vivo.
 *
 * Para as rotas que NÃO são das mestres (cópia conta→conta entre contas do mesmo dono, `mestres=false`)
 * continua a valer `lib/copia-contas/regras.ts::modoEfectivo` — essas sim vivem nas fechaduras da 078.
 *
 * ═══ O QUE ESTE FICHEIRO É ══════════════════════════════════════════════════════════════════
 *
 * Puro: recebe linhas já lidas e devolve a árvore. Sem Supabase, sem Next, sem React. Testado em
 * `lib/copia-contas/__tests__/cadeia.check.ts`. O cano está em `lib/copia-contas/servidor/cadeia.ts`.
 */
import type { LinhaDeAgua } from '../admin-centro/linha-de-agua'
import { decidirModo } from '../mestres/decisao'
import { SEM_TRAVAS, temTravas, type TravasMestre } from './mestre-travas'
import { GESTAO_VAZIA, textoDaGestao, type GestaoMestre } from './mestre-gestao'
import type { ConfigGlobalMestres, ContaMestres, EstrategiaMestre, ModoDecidido } from '../mestres/tipos'
import { contaPorOmissao } from '../mestres/tipos'
import { modoEfectivo, type Interruptores } from './regras'
import type { EstadoRota, ModoRota } from './tipos'

// ── entradas (linhas já lidas) ──────────────────────────────────────────────

/** Uma estratégia: o provider (`mtmauto_providers`) + a linha de `mestres_estrategias`. */
export interface EstrategiaEntrada {
  /** null = provider sem mestre nossa (a estratégia existe, o motor não a serve) */
  mestre: EstrategiaMestre | null
  providerId: string
  slug: string
  nome: string
  ativo: boolean
  /** `mtmauto_providers.fonte_sinais` — de onde entram os sinais (ex.: 'primeverse'). */
  fonteSinais: string | null
  /** `mtmauto_providers.fonte_filtro` — quem, dentro da fonte, assina o sinal (ex.: 'g_wolf'). */
  fonteFiltro: string | null
  /** Canal do chat que publica esta estratégia (lib/mestres/t2t.ESTRATEGIA_DO_CANAL invertido). */
  canalChat: string | null
  /** Ids CopyFactory ainda por cortar → quem copia hoje é a CopyFactory, não o nosso motor. */
  copyfactoryPorCortar: string[]
  /**
   * As travas de segurança da mestre (`sinais_config.travas`), para o quadro as poder EDITAR no nó
   * em vez de mandar o gestor a outro ecrã. Quem as aplica é `lib/mestres/servidor/sinal-mestre.ts`.
   *
   * Opcional porque uma estratégia sem a chave no jsonb é o caso NORMAL (era o de todas a 29/09) —
   * e omitir tem de valer «sem travas», nunca um erro de leitura.
   */
  travas?: TravasMestre
  /** As automações de saída lidas do mesmo jsonb (só as cinco que têm motor). */
  gestao?: GestaoMestre
  /**
   * A conta mestre (mtm_trading_accounts), para a mostrar no TOPO da coluna — porque a mestre é a
   * estratégia, não uma conta a mais. Traz a linha de partida e a proveniência: sem elas o «10 250»
   * da mestre não se distingue do «1 100» da conta de medição, nem o simulado do real.
   */
  contaMestre: {
    id: string
    login: string | null
    etiqueta: string | null
    saldo: number | null
    equity: number | null
    saldoInicial: number | null
    linhaDeAgua: LinhaDeAgua
  } | null
}

/** Uma rota de cópia, como está em `copia_rotas`. */
export interface RotaEntrada {
  id: string
  userId: string | null
  mestres: boolean
  tipoRota: string | null
  estrategiaSlug: string | null
  origemRef: string
  origemChave: string
  destinoRef: string
  destinoChave: string
  rotulo: string | null
  modoLote: string
  valor: number
  ativa: boolean
  estado: string
  /** a coluna que mente — guarda-se para o painel poder DIZER que ela mente */
  modoColuna: string
  pausadaMotivo: string | null
  abertas: number
}

/** O nome de uma conta de destino (etiqueta do dono, login@servidor, email). */
export interface NomeConta {
  ref: string
  etiqueta: string | null
  descricao: string | null
  email: string | null
  userId: string | null
}

export interface EntradaCadeia {
  global: ConfigGlobalMestres
  /** MESTRES_ESCRITA=1 no VPS (do batimento em servicos_pulso). */
  escritaNoProcesso: boolean
  /** as fechaduras da cópia 078 (para as rotas que NÃO são das mestres) */
  interruptores078: Interruptores
  estrategias: EstrategiaEntrada[]
  rotas: RotaEntrada[]
  contasMestres: ContaMestres[]
  nomes: NomeConta[]
  /** posições dos nós guardadas no quadro (site_settings.copia_cadeia_layout) */
  disposicao?: Record<string, { x: number; y: number }>
}

// ── saídas ──────────────────────────────────────────────────────────────────

export type TipoLaco = 'estrategia' | 't2t' | 'conta'

export interface SubscritorCadeia {
  /** chave do NÓ no quadro: a conta física (a mesma conta ligada duas vezes é UM nó) */
  chave: string
  rotaId: string
  ref: string
  tipo: TipoLaco
  etiqueta: string | null
  descricao: string | null
  email: string | null
  userId: string | null
  lote: string
  /** o que o motor faz mesmo com esta rota, agora */
  efectivo: ModoDecidido
  motivo: string
  /** pausada pelo cliente / deixou de seguir — abre nada, mas ainda gere o que está aberto */
  pausadaMotivo: string | null
  abertas: number
  x?: number
  y?: number
}

export type Executor = 'motor' | 'copyfactory' | 'legado' | 'parado'

export interface NoEstrategia {
  /** chave do NÓ no quadro */
  chave: string
  slug: string
  nome: string
  providerId: string
  ativo: boolean
  /** texto curto da fonte: «PrimeVerse · g_wolf», «Chat · sensei-scanner», «Telegram Premium» */
  fonte: string
  fonteSinais: string | null
  fonteFiltro: string | null
  canalChat: string | null
  contaMestre: EstrategiaEntrada['contaMestre']
  /** quem executa esta estratégia HOJE */
  executor: Executor
  executorNota: string
  /** As travas de segurança desta mestre, como estão gravadas (o editor do nó parte delas). */
  travas: TravasMestre
  /** Alguma trava configurada? O nó mostra-o na barra: uma mestre sem travas não protege nada. */
  comTravas: boolean
  /** As automações de saída desta mestre, como estão gravadas. */
  gestao: GestaoMestre
  /** «BE a 1,25× · trailing a 2×» — o resumo que cabe na barra do nó. */
  gestaoTexto: string
  /** o modo pedido (mestres_estrategias.modo) — não é o mesmo que o efectivo de cada rota */
  modoPedido: EstrategiaMestre['modo'] | 'sem-mestre'
  t2tModo: EstrategiaMestre['t2tModo'] | 'sem-mestre'
  subscritores: SubscritorCadeia[]
  /** subscritores por tipo de laço, para a vista simples contar sem repetir a regra */
  contagem: { total: number; live: number; sombra: number; parado: number; t2t: number; pausados: number }
  x?: number
  y?: number
}

export interface Cadeia {
  estrategias: NoEstrategia[]
  /** rotas conta→conta (mestres=false): não pertencem a estratégia nenhuma */
  contaAConta: SubscritorCadeia[]
  /** rotas com `estrategia_slug` que não bate com nenhuma estratégia conhecida */
  orfas: SubscritorCadeia[]
  /** o que o painel tem de DIZER em voz alta (divergências entre o que se mostra e o que a base tem) */
  avisos: string[]
  motor: { ligado: boolean; kill: boolean; liveDesbloqueado: boolean; escritaNoProcesso: boolean }
}

// ── peças ───────────────────────────────────────────────────────────────────

/**
 * O texto da FONTE de uma estratégia. A cadeia começa aqui e sem isto o topo da árvore fica a
 * dizer só o nome da estratégia — que é precisamente o que não explica de onde veio a ordem.
 */
export function textoDaFonte(e: Pick<EstrategiaEntrada, 'fonteSinais' | 'fonteFiltro' | 'canalChat' | 'slug'>): string {
  if (e.fonteSinais) {
    const nome = e.fonteSinais === 'primeverse' ? 'PrimeVerse' : e.fonteSinais
    return e.fonteFiltro ? `${nome} · ${e.fonteFiltro}` : nome
  }
  if (e.canalChat) return `Chat · ${e.canalChat}`
  return 'Sem fonte declarada'
}

/**
 * Quem executa a estratégia HOJE. A mesma escada de `lib/mestres/painel.ts::executorDe`, repetida
 * aqui porque esta vista também tem de a responder para providers SEM mestre nossa (onde aquela
 * função não chega): sem linha em `mestres_estrategias` ninguém foi cortado, logo é o caminho antigo.
 */
export function executorDaEstrategia(e: EstrategiaEntrada, global: ConfigGlobalMestres): { executor: Executor; nota: string } {
  if (!e.ativo) return { executor: 'parado', nota: 'provider inactivo — não executa por caminho nenhum' }
  if (!e.mestre) return { executor: 'legado', nota: 'sem mestre nossa: executa o caminho antigo (MTM Auto / execução directa / T2T de sempre)' }
  if (!global.ligado || global.kill) {
    return { executor: global.kill ? 'parado' : 'legado', nota: global.kill ? 'kill-switch accionado — o motor não envia nada' : 'motor das mestres desligado' }
  }
  if (e.mestre.modo === 'live') return { executor: 'motor', nota: 'o nosso motor envia da mestre SIM para as contas dos clientes' }
  if (e.copyfactoryPorCortar.length) {
    return { executor: 'copyfactory', nota: `a CopyFactory ainda copia (${e.copyfactoryPorCortar.join(', ')} por cortar)` }
  }
  return { executor: 'legado', nota: e.mestre.modo === 'sombra' ? 'motor em sombra: quem executa é o caminho antigo' : 'estratégia desligada no motor' }
}

/** «×2», «0,02 lotes», «1,5 % de risco», «proporcional ao saldo». */
export function textoDoLote(modo: string, valor: number): string {
  const n = (v: number) => String(v).replace('.', ',')
  switch (modo) {
    case 'multiplicador': return `×${n(valor)}`
    case 'fixo': return `${n(valor)} lotes`
    case 'risco_pct': return `${n(valor)} % de risco`
    case 'proporcional_saldo': return `proporcional ao saldo (×${n(valor)})`
    default: return `${modo} ${n(valor)}`
  }
}

// ── montagem ────────────────────────────────────────────────────────────────

/** A cadeia inteira, pronta para desenhar. */
export function montarCadeia(e: EntradaCadeia): Cadeia {
  const avisos: string[] = []
  const nomePorRef = new Map(e.nomes.map((n) => [n.ref, n]))
  const contaPorChave = new Map(e.contasMestres.map((c) => [c.contaChave, c]))
  const disposicao = e.disposicao ?? {}

  const subscritorDe = (r: RotaEntrada, estrategia: EstrategiaMestre | null): SubscritorCadeia => {
    const nome = nomePorRef.get(r.destinoRef) ?? null
    const tipo: TipoLaco = r.mestres ? (r.tipoRota === 't2t' ? 't2t' : 'estrategia') : 'conta'
    // AQUI é que se decide o que é verdade. Rotas das mestres → a regra do motor (116); rotas
    // conta→conta → as fechaduras da 078. A coluna `modo` não entra em nenhuma das duas.
    const d = r.mestres
      ? decidirModo({
          global: e.global,
          escritaNoProcesso: e.escritaNoProcesso,
          estrategia,
          conta: contaPorChave.get(r.destinoChave) ?? contaPorOmissao(r.destinoChave, r.destinoRef),
          rota: { ativa: r.ativa, estado: r.estado, tipo_rota: r.tipoRota, destino_ref: r.destinoRef },
        })
      : { modo: modoEfectivo({ ativa: r.ativa, estado: r.estado as EstadoRota, modo: r.modoColuna as ModoRota }, e.interruptores078), motivo: 'cópia entre contas (078)' }
    return {
      chave: r.destinoChave,
      rotaId: r.id,
      ref: r.destinoRef,
      tipo,
      etiqueta: nome?.etiqueta ?? null,
      descricao: nome?.descricao ?? null,
      email: nome?.email ?? null,
      userId: r.userId ?? nome?.userId ?? null,
      lote: textoDoLote(r.modoLote, Number(r.valor)),
      efectivo: d.modo,
      motivo: d.motivo,
      pausadaMotivo: r.pausadaMotivo,
      abertas: r.abertas,
      ...(disposicao[r.destinoChave] ?? {}),
    }
  }

  const porSlug = new Map<string, EstrategiaEntrada>()
  for (const x of e.estrategias) porSlug.set(x.slug.toLowerCase(), x)

  const usadas = new Set<string>()
  const estrategias: NoEstrategia[] = e.estrategias.map((x) => {
    const minhas = e.rotas.filter((r) => r.mestres && String(r.estrategiaSlug ?? '').toLowerCase() === x.slug.toLowerCase())
    for (const r of minhas) usadas.add(r.id)
    const subscritores = minhas.map((r) => subscritorDe(r, x.mestre)).sort(ordenarSubscritores)
    const ex = executorDaEstrategia(x, e.global)
    if (x.mestre && !x.contaMestre) {
      avisos.push(`${x.slug}: a linha de mestres_estrategias aponta para a conta ${x.mestre.contaMestreId.slice(0, 8)}…, que não existe em mtm_trading_accounts.`)
    }
    return {
      chave: `estrategia:${x.slug}`,
      slug: x.slug,
      nome: x.nome,
      providerId: x.providerId,
      ativo: x.ativo,
      fonte: textoDaFonte(x),
      fonteSinais: x.fonteSinais,
      fonteFiltro: x.fonteFiltro,
      canalChat: x.canalChat,
      contaMestre: x.contaMestre,
      travas: x.travas ?? SEM_TRAVAS,
      comTravas: temTravas(x.travas ?? SEM_TRAVAS),
      gestao: x.gestao ?? GESTAO_VAZIA,
      gestaoTexto: textoDaGestao(x.gestao ?? GESTAO_VAZIA),
      executor: ex.executor,
      executorNota: ex.nota,
      modoPedido: x.mestre?.modo ?? 'sem-mestre',
      t2tModo: x.mestre?.t2tModo ?? 'sem-mestre',
      subscritores,
      contagem: contarSubscritores(subscritores),
      ...(disposicao[`estrategia:${x.slug}`] ?? {}),
    }
  })

  const contaAConta: SubscritorCadeia[] = []
  const orfas: SubscritorCadeia[] = []
  for (const r of e.rotas) {
    if (usadas.has(r.id)) continue
    if (!r.mestres) { contaAConta.push(subscritorDe(r, null)); continue }
    orfas.push(subscritorDe(r, null))
    avisos.push(`Rota ${r.id.slice(0, 8)}… diz seguir «${r.estrategiaSlug ?? 'sem slug'}», que não é nenhuma estratégia viva.`)
  }

  // A divergência que mais custa: uma estratégia em live com rotas todas em sombra. Ou o contrário.
  for (const n of estrategias) {
    if (n.modoPedido === 'live' && n.contagem.total > 0 && n.contagem.live === 0) {
      avisos.push(`${n.slug} está pedida em LIVE mas nenhuma das ${n.contagem.total} rotas executa — ver o motivo em cada subscritor.`)
    }
    /**
     * Uma mestre a emitir para contas em live SEM UMA ÚNICA TRAVA na raiz. Não é um erro de
     * configuração — é o estado em que as oito estratégias estavam a 29/09 — mas tem de estar dito
     * em voz alta: nada impede esta mestre de emitir em cima de uma notícia, à sexta à noite, ou já
     * a perder o dia, e o que ela emitir vai para todas as contas que a seguem.
     */
    if (!n.comTravas && n.contagem.live > 0) {
      avisos.push(`${n.slug} emite para ${n.contagem.live} conta(s) em LIVE sem nenhuma trava de raiz (janela, fim de semana, drawdown do dia, margem). Editar no nó da mestre, no quadro.`)
    }
  }

  return {
    estrategias: estrategias.sort((a, b) => b.contagem.total - a.contagem.total || a.nome.localeCompare(b.nome)),
    contaAConta,
    orfas,
    avisos,
    motor: { ...e.global, escritaNoProcesso: e.escritaNoProcesso },
  }
}

/** Live primeiro, depois sombra, depois parado; dentro de cada, quem tem posições abertas à frente. */
function ordenarSubscritores(a: SubscritorCadeia, b: SubscritorCadeia): number {
  const peso = (s: SubscritorCadeia) => (s.efectivo === 'live' ? 0 : s.efectivo === 'sombra' ? 1 : 2)
  return peso(a) - peso(b) || b.abertas - a.abertas || (a.etiqueta ?? a.ref).localeCompare(b.etiqueta ?? b.ref)
}

export function contarSubscritores(subs: SubscritorCadeia[]): NoEstrategia['contagem'] {
  return {
    total: subs.length,
    live: subs.filter((s) => s.efectivo === 'live').length,
    sombra: subs.filter((s) => s.efectivo === 'sombra').length,
    parado: subs.filter((s) => s.efectivo === 'parado').length,
    t2t: subs.filter((s) => s.tipo === 't2t').length,
    pausados: subs.filter((s) => s.pausadaMotivo != null).length,
  }
}

// ── regras do QUADRO (arrastar e largar) ────────────────────────────────────

export type ErroLigacao = 'sem-mestre' | 'ja-segue' | 'provider-inactivo' | 'nao-e-conta' | 'mesma-estrategia'

export const MENSAGEM_ERRO_LIGACAO: Record<ErroLigacao, string> = {
  'sem-mestre': 'Esta estratégia não tem mestre nossa (mestres_estrategias) — não há de onde copiar.',
  'ja-segue': 'Esta conta já segue esta estratégia.',
  'provider-inactivo': 'O provider está inactivo — ligar aqui não faz a conta executar.',
  'nao-e-conta': 'Só contas de cliente podem ser subscritores (uma mestre não segue outra mestre).',
  'mesma-estrategia': 'Largaste o subscritor onde ele já estava.',
}

/**
 * Pode esta conta passar a seguir esta estratégia? As guardas DURAS (ciclo, fan-out, plataforma,
 * dono) são de `regras.ts::validarRota` e da base — aqui só estão as que o QUADRO consegue explicar
 * antes de o arrasto largar, para o rato não ter de esperar por um 409.
 */
export function podeLigar(
  destino: NoEstrategia,
  subscritor: Pick<SubscritorCadeia, 'chave' | 'ref'>,
  origem?: NoEstrategia | null,
): { ok: true } | { ok: false; erro: ErroLigacao; mensagem: string } {
  const falha = (erro: ErroLigacao) => ({ ok: false as const, erro, mensagem: MENSAGEM_ERRO_LIGACAO[erro] })
  if (origem && origem.slug === destino.slug) return falha('mesma-estrategia')
  if (destino.modoPedido === 'sem-mestre') return falha('sem-mestre')
  if (!destino.ativo) return falha('provider-inactivo')
  // Uma conta mestre é `prov:`/a chave `mtmfunded:` de uma estratégia — nunca é subscritora.
  if (/^prov:/i.test(subscritor.ref)) return falha('nao-e-conta')
  if (destino.subscritores.some((s) => s.chave === subscritor.chave)) return falha('ja-segue')
  return { ok: true }
}

export type AccaoArrasto =
  | { tipo: 'ligar'; slug: string; ref: string }
  | { tipo: 'mover'; de: string; para: string; ref: string }

/**
 * O que o arrasto PEDE. Mover não é uma escrita só: é «passa a seguir a nova» + «deixa de seguir a
 * antiga», e a ordem importa — liga-se primeiro, para nunca haver um instante em que a conta não
 * segue nada e uma posição aberta fique sem quem a feche.
 */
export function accoesDoArrasto(de: NoEstrategia | null, para: NoEstrategia, ref: string): AccaoArrasto[] {
  if (!de) return [{ tipo: 'ligar', slug: para.slug, ref }]
  return [{ tipo: 'mover', de: de.slug, para: para.slug, ref }]
}

/** A disposição do quadro, limpa: só chaves conhecidas, coordenadas finitas e dentro de limites. */
export const LIMITE_QUADRO = 20_000

export function normalizarDisposicao(bruta: unknown, chavesConhecidas: string[]): Record<string, { x: number; y: number }> {
  const validas = new Set(chavesConhecidas)
  const o = bruta && typeof bruta === 'object' ? (bruta as Record<string, unknown>) : {}
  const out: Record<string, { x: number; y: number }> = {}
  for (const [k, v] of Object.entries(o).slice(0, 2000)) {
    if (!validas.has(k) || !v || typeof v !== 'object') continue
    const p = v as { x?: unknown; y?: unknown }
    const x = Number(p.x)
    const y = Number(p.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    out[k] = { x: Math.max(-LIMITE_QUADRO, Math.min(LIMITE_QUADRO, Math.round(x))), y: Math.max(-LIMITE_QUADRO, Math.min(LIMITE_QUADRO, Math.round(y))) }
  }
  return out
}

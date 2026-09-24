import { z } from 'zod'
import { levantavelUsd } from './contrato'

/**
 * A GESTÃO DE UMA CONTA MTM FUNDED PELO ADMIN — as decisões, sem base de dados.
 *
 * A rota (app/api/admin/mtmfunded/conta/[id]) lê, escreve e audita; aqui só se decide: que acções
 * existem e com que campos, que mudanças de estado são permitidas, quando um levantamento pode
 * ser aprovado e o que é uma conta em pausa. Tudo puro para o teste
 * (lib/mtmfunded/__tests__/admin-conta.check.ts) o poder chamar à mão.
 *
 * Três regras que atravessam o ficheiro:
 *  · o dinheiro simulado só se mexe por funções atómicas da base (funded_somar_saldo e companhia);
 *  · uma conta simulada não muda de estado com posições abertas — o motor só olha para contas
 *    `ativa`, e uma posição numa conta que ele deixou de ver ficava sem SL/TP nem stop-out;
 *  · a PAUSA do admin mantém a conta `ativa` (o motor continua a gerir SL/TP), mas as portas de
 *    ordens novas fecham-se pela coluna `pausada_em` (migração 079).
 */

// ── as acções ────────────────────────────────────────────────────────────────

const motivo = z.string().trim().min(3, 'escreve o motivo (mín. 3 caracteres)').max(400)
const uuid = z.string().regex(/^[0-9a-f-]{36}$/i, 'id inválido')
const chave = z.string().regex(/^[A-Za-z0-9_-]{8,80}$/, 'chave de idempotência inválida')
const preco = z.union([z.number().positive(), z.null()])

export const PedidoAccao = z.discriminatedUnion('accao', [
  // Posições & ordens
  z.object({ accao: z.literal('fechar_posicao'), positionId: uuid, volume: z.number().positive().nullable().optional(), motivo: motivo.optional() }),
  z.object({ accao: z.literal('modificar_posicao'), positionId: uuid, sl: preco, tp: preco, motivo: motivo.optional() }),
  z.object({ accao: z.literal('cancelar_ordem'), orderId: uuid, motivo: motivo.optional() }),
  z.object({ accao: z.literal('fechar_tudo'), confirmacao: z.string(), cancelarPendentes: z.boolean().default(true), motivo }),
  // Gestão
  z.object({ accao: z.literal('pausar'), motivo, cancelarPendentes: z.boolean().default(false) }),
  z.object({ accao: z.literal('retomar'), motivo }),
  z.object({ accao: z.literal('fechar_conta'), motivo }),
  z.object({ accao: z.literal('marcar_breach'), motivo }),
  z.object({ accao: z.literal('reverter_breach'), motivo }),
  z.object({ accao: z.literal('avancar_fase'), motivo, emitirFinanciada: z.boolean().default(false) }),
  z.object({ accao: z.literal('reset'), confirmacao: z.string(), saldo: z.number().min(100).max(1_000_000).optional(), motivo }),
  z.object({ accao: z.literal('ajustar_saldo'), delta: z.number().refine((n) => n !== 0 && Math.abs(n) <= 1_000_000, 'valor entre −1.000.000 e 1.000.000, diferente de zero'), motivo }),
  z.object({ accao: z.literal('estender_prazo'), dias: z.number().int().min(1).max(365), motivo }),
  z.object({ accao: z.literal('definir_analise'), valor: z.boolean(), motivo }),
  z.object({ accao: z.literal('definir_aceita_t2t'), valor: z.boolean(), motivo }),
  z.object({ accao: z.literal('definir_estrategia'), slug: z.string().trim().max(80).nullable(), motivo }),
  z.object({ accao: z.literal('regenerar_credenciais'), novoLogin: z.boolean().default(false), motivo }),
  // APAGAR: irreversível. O `confirmacao` é o login escrito à mão (ver lib/mtmfunded/apagar-conta.ts).
  z.object({ accao: z.literal('apagar_conta'), confirmacao: z.string(), motivo }),
  z.object({ accao: z.literal('notificar'), modelo: z.enum(['pausa', 'retoma', 'aviso_regras', 'conta_revista', 'livre']), texto: z.string().trim().max(800).optional(), email: z.boolean().default(true), push: z.boolean().default(true) }),
  // Levantamentos
  z.object({ accao: z.literal('levantamento'), levantamentoId: uuid, estado: z.enum(['em_analise', 'aprovado', 'pago', 'recusado']), motivo: z.string().trim().max(400).optional() }),
])

export type PedidoAccao = z.infer<typeof PedidoAccao>
export type NomeAccao = PedidoAccao['accao']

/** Toda a acção leva uma chave — duplo clique, rede que repete: a segunda devolve o que a primeira fez. */
export const CorpoPost = z.object({ chave })

/** As que mexem em dinheiro ou fecham posições: sem chave não correm (a UI gera-a ao abrir a confirmação). */
export const ACCOES_DE_DINHEIRO: ReadonlySet<NomeAccao> = new Set([
  'fechar_posicao', 'fechar_tudo', 'reset', 'ajustar_saldo', 'levantamento', 'avancar_fase', 'apagar_conta',
])

export function validarPedido(corpo: unknown):
  | { ok: true; pedido: PedidoAccao; chave: string }
  | { ok: false; erro: string } {
  const c = CorpoPost.safeParse(corpo)
  if (!c.success) return { ok: false, erro: c.error.issues[0]?.message ?? 'falta a chave de idempotência' }
  const p = PedidoAccao.safeParse(corpo)
  if (!p.success) {
    const i = p.error.issues[0]
    return { ok: false, erro: i ? `${i.path.join('.') || 'pedido'}: ${i.message}` : 'pedido inválido' }
  }
  return { ok: true, pedido: p.data, chave: c.data.chave }
}

// ── quem pode ────────────────────────────────────────────────────────────────

/** A decisão da guarda, separada da leitura da sessão: sem sessão 401, sem admin 403. */
export function decisaoDeAcesso(a: { isAdmin: boolean; userId?: string | null }): { status: 401 | 403; erro: string } | null {
  if (!a.userId) return { status: 401, erro: 'sem sessão' }
  if (!a.isAdmin) return { status: 403, erro: 'apenas administradores' }
  return null
}

// ── a pausa ──────────────────────────────────────────────────────────────────

export interface LinhaPausa { pausada_em?: string | null; pausa_motivo?: string | null }

/** A mensagem com que as portas de ordens recusam uma conta em pausa, ou null se não está. */
export function motivoDePausa(l: LinhaPausa | null | undefined): string | null {
  if (!l?.pausada_em) return null
  return `conta em pausa pelo suporte — não aceita ordens novas${l.pausa_motivo ? ` (${l.pausa_motivo})` : ''}. As posições abertas mantêm SL/TP e podem ser fechadas.`
}

// ── transições de estado ─────────────────────────────────────────────────────

export interface ContaParaTransicao {
  estado: string
  motor: string
  tipo: string
  pausada_em?: string | null
  metricas?: Record<string, unknown> | null
}

export type Transicao =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; status: number; erro: string }

const nao = (status: number, erro: string): Transicao => ({ ok: false, status, erro })

/**
 * Que mudança de estado uma acção faz, e se pode.
 *
 * `abertas`/`pendentes` só contam nas simuladas: numa conta da corretora o site não vê as
 * posições sem ir à MetaApi, e quem decide sobre elas é a própria corretora.
 */
export function transicao(
  accao: 'pausar' | 'retomar' | 'fechar_conta' | 'marcar_breach' | 'reverter_breach',
  conta: ContaParaTransicao,
  ctx: { agora: string; motivo: string; adminId: string; abertas: number; pendentes: number },
): Transicao {
  const sim = conta.motor === 'sim'
  const plana = ctx.abertas === 0 && ctx.pendentes === 0
  switch (accao) {
    case 'pausar':
      if (!sim) return nao(409, 'a pausa só se aplica a contas simuladas — numa conta da corretora o site não trava as ordens')
      if (conta.estado !== 'ativa') return nao(409, `só se pausa uma conta activa (está ${conta.estado})`)
      if (conta.pausada_em) return nao(409, 'a conta já está em pausa')
      return { ok: true, patch: { pausada_em: ctx.agora, pausa_motivo: ctx.motivo, pausada_por: ctx.adminId } }
    case 'retomar':
      if (!conta.pausada_em) return nao(409, 'a conta não está em pausa')
      return { ok: true, patch: { pausada_em: null, pausa_motivo: null, pausada_por: null } }
    case 'fechar_conta':
      if (!['ativa', 'aprovada'].includes(conta.estado)) return nao(409, `não se fecha uma conta ${conta.estado}`)
      if (sim && !plana) return nao(409, `fecha primeiro as ${ctx.abertas} posições e ${ctx.pendentes} ordens (separador Posições)`)
      // `expirada` SEM `pausadaEm` nas métricas lê-se «Closed» (lib/mtmfunded/etiquetas).
      return { ok: true, patch: { estado: 'expirada', pausada_em: null, pausa_motivo: null, pausada_por: null } }
    case 'marcar_breach':
      if (conta.estado === 'quebrada') return nao(409, 'a conta já está Breached')
      if (!['ativa', 'aprovada', 'expirada'].includes(conta.estado)) return nao(409, `não se marca Breached uma conta ${conta.estado}`)
      if (sim && !plana) return nao(409, `fecha primeiro as ${ctx.abertas} posições e ${ctx.pendentes} ordens — sem o motor a olhar, ficavam sem SL/TP`)
      return { ok: true, patch: { estado: 'quebrada', quebrou_regra: `admin: ${ctx.motivo}`.slice(0, 200), quebrada_em: ctx.agora } }
    case 'reverter_breach':
      if (conta.estado !== 'quebrada') return nao(409, 'a conta não está Breached')
      return { ok: true, patch: { estado: 'ativa', quebrou_regra: null, quebrada_em: null } }
  }
}

/** A fase de um desafio: F1 → F2 → Funded. */
export function podeAvancarFase(conta: ContaParaTransicao, abertas: number, pendentes: number): string | null {
  if (conta.tipo !== 'desafio') return 'só os desafios (F1/F2) avançam de fase'
  if (conta.estado !== 'ativa') return `a conta está ${conta.estado} — só uma conta activa avança`
  if (conta.metricas?.faseConcluida) return 'esta fase já foi concluída'
  if (conta.motor === 'sim' && (abertas > 0 || pendentes > 0)) return `fecha primeiro as ${abertas} posições e ${pendentes} ordens`
  return null
}

// ── levantamentos ────────────────────────────────────────────────────────────

/**
 * Capital com prazo: uma conta aberta com capital da casa (compensação de 10/09, transição do PAMM
 * de 23/09) fica um ano sem levantamentos — é a condição do juro composto que a acompanha. A data
 * vive em `metricas.bloqueio_levantamento_ate`; sem ela, nada muda.
 *
 * Estava só na rota do TRADER (app/api/mtmfunded/levantamentos): o cliente via a regra, mas quem
 * aprovava do lado do admin não — nem o /admin, nem (agora) o bot. Uma regra que só o lado que não
 * decide conhece não é uma regra: é um aviso. Passa a viver aqui, com `guardaLevantamento`, para
 * que os três lados leiam a mesma coisa.
 */
export function bloqueioDeLevantamento(metricas: unknown, agoraMs: number = Date.now()): string | null {
  const d = (metricas as Record<string, unknown> | null)?.bloqueio_levantamento_ate
  if (typeof d !== 'string' || !d) return null
  const t = Date.parse(d)
  return Number.isFinite(t) && t > agoraMs ? d : null
}

export interface ContextoLevantamento {
  conta: { tipo: string; estado: string; motor: string; saldo_inicial: number; sim_saldo: number | null; equityMetricas: number | null; metricas?: unknown }
  abertas: number | null
  pendentes: number | null
  /** Pago + aprovado das OUTRAS linhas desta conta. */
  jaPagoOutros: number
  valor: number
  estadoAtual: string
  novoEstado: 'em_analise' | 'aprovado' | 'pago' | 'recusado'
  motivo?: string
  /** Para o teste não depender do relógio. */
  agoraMs?: number
}

/**
 * Pode este pedido passar para `novoEstado`?
 *
 * Aprovar e pagar voltam a verificar TUDO o que o pedido verificou ao nascer — Funded activa,
 * sem posições nem pendentes, valor dentro do levantável com a almofada de 3% sobre o saldo
 * EXACTO (sim_saldo) — porque entre o pedido e a decisão a conta pode ter negociado.
 */
export function guardaLevantamento(c: ContextoLevantamento): string | null {
  const { conta } = c
  if (['pago', 'recusado'].includes(c.estadoAtual)) return `o pedido já está ${c.estadoAtual}`
  if (c.novoEstado === 'recusado') return c.motivo && c.motivo.trim().length >= 3 ? null : 'escreve o motivo da recusa'
  if (c.novoEstado === 'em_analise') return c.estadoAtual === 'pedido' ? null : 'só um pedido novo passa a «em análise»'
  if (c.novoEstado === 'pago' && c.estadoAtual !== 'aprovado') return 'aprova primeiro — pagar sem aprovação salta a revisão'
  const preso = bloqueioDeLevantamento(conta.metricas, c.agoraMs)
  if (preso) {
    return `o capital desta conta não é levantável até ${new Date(preso).toLocaleDateString('pt-PT')} (capital da casa, 12 meses) — recusa com este motivo em vez de aprovar`
  }
  if (!['financiada', 'funded'].includes(conta.tipo)) return 'só contas Funded levantam'
  if (conta.estado !== 'ativa') return `a conta está ${conta.estado} — só uma Funded activa levanta`
  if (c.abertas == null || c.pendentes == null) return 'não foi possível confirmar as posições da conta — tenta daqui a um minuto'
  if (c.abertas > 0 || c.pendentes > 0) return `a conta tem ${c.abertas} posições abertas e ${c.pendentes} ordens pendentes`
  const equity = conta.motor === 'sim' && conta.sim_saldo != null ? Number(conta.sim_saldo) : Number(conta.equityMetricas ?? conta.saldo_inicial)
  const disponivel = levantavelUsd(Number(conta.saldo_inicial), equity, c.jaPagoOutros)
  if (!(c.valor > 0)) return 'valor inválido'
  if (c.valor > disponivel + 1e-9) return `o levantável agora é ${disponivel.toFixed(2)} USD (almofada de 3% e quota de 75%) — o pedido é de ${c.valor.toFixed(2)} USD`
  return null
}

// ── progresso das regras (barras do Resumo) ──────────────────────────────────

export interface BarraRegra { chave: string; nome: string; pct: number | null; texto: string; perigo: boolean }

export function barrasDeRegras(p: {
  regras: Record<string, unknown> | null
  saldoInicial: number
  equity: number
  ancoraDia: number | null
  diasNegociados: number
  fase: number
  lucroPorDia?: Record<string, number> | null
  analise: boolean
}): BarraRegra[] {
  const r = p.regras
  if (!r || !(p.saldoInicial > 0)) return []
  const n = (v: unknown) => (v == null || v === '' ? 0 : Number(v))
  const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x * 10) / 10))
  const usd = (x: number) => `${x.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} USD`
  const out: BarraRegra[] = []

  const objetivo = p.fase >= 2 && r.objetivo_fase2_pct != null ? n(r.objetivo_fase2_pct) : n(r.objetivo_pct)
  if (objetivo > 0) {
    const alvo = p.saldoInicial * objetivo / 100
    const feito = p.equity - p.saldoInicial
    out.push({ chave: 'objetivo', nome: `Objectivo de lucro (${objetivo}%)`, pct: clamp((feito / alvo) * 100), texto: `${usd(feito)} de ${usd(alvo)}`, perigo: false })
  }
  const diaria = n(r.perda_diaria_pct)
  if (diaria > 0) {
    const base = p.ancoraDia ?? p.saldoInicial
    const permitido = base * diaria / 100
    const usado = Math.max(0, base - p.equity)
    const pct = clamp((usado / permitido) * 100)
    out.push({ chave: 'diaria', nome: `Perda diária (${diaria}%)`, pct, texto: `${usd(usado)} de ${usd(permitido)} usados${p.analise ? ' · análise: não quebra' : ''}`, perigo: pct >= 80 })
  }
  const maxima = n(r.perda_maxima_pct)
  if (maxima > 0) {
    const permitido = p.saldoInicial * maxima / 100
    const usado = Math.max(0, p.saldoInicial - p.equity)
    const pct = clamp((usado / permitido) * 100)
    out.push({ chave: 'maxima', nome: `Drawdown máximo (${maxima}%)`, pct, texto: `${usd(usado)} de ${usd(permitido)} usados${p.analise ? ' · análise: não quebra' : ''}`, perigo: pct >= 80 })
  }
  const dias = n(r.dias_minimos)
  if (dias > 0) {
    out.push({ chave: 'dias', nome: `Dias mínimos (${dias})`, pct: clamp((p.diasNegociados / dias) * 100), texto: `${p.diasNegociados} de ${dias} dias negociados`, perigo: false })
  }
  const consistencia = n(r.consistencia_pct)
  if (consistencia > 0) {
    const valores = Object.values(p.lucroPorDia ?? {}).map(Number).filter(Number.isFinite)
    const total = valores.reduce((a, x) => a + x, 0)
    const melhor = Math.max(0, ...valores)
    const fatia = total > 0 ? (melhor / total) * 100 : null
    out.push({
      chave: 'consistencia', nome: `Consistência (máx. ${consistencia}% num dia)`,
      pct: fatia == null ? null : clamp((fatia / consistencia) * 100),
      texto: fatia == null ? 'sem lucro ainda — não se avalia' : `o melhor dia vale ${fatia.toFixed(1)}% do lucro`,
      perigo: fatia != null && fatia > consistencia,
    })
  }
  return out
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** CSV com `;` (o Excel em PT abre-o em colunas) e aspas escapadas. Fórmulas neutralizadas. */
export function paraCsv(linhas: Array<Record<string, unknown>>, colunas: string[]): string {
  const celula = (v: unknown) => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [colunas.join(';'), ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(';'))].join('\n')
}

/** Os campos da conta que a auditoria fotografa antes e depois (nunca passwords). */
export const CAMPOS_AUDITADOS = [
  'estado', 'tipo', 'saldo_inicial', 'sim_saldo', 'sim_equity', 'quebrou_regra', 'quebrada_em',
  'segue_estrategia', 'aceita_t2t', 'mt5_login', 'pausada_em', 'pausa_motivo', 'prazo_extra_dias',
] as const

export function fotografia(conta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!conta) return {}
  const m = (conta.metricas ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of CAMPOS_AUDITADOS) if (k in conta) out[k] = conta[k]
  out.fase = m.fase ?? null
  out.analise = m.analise ?? null
  return out
}

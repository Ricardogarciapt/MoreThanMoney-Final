/**
 * O ORÇAMENTO DE UM AGENTE — puro. Saldo, gasto do dia e do mês, e se pode gastar mais.
 *
 * Quem decide é esta função, e o motor do AIOS (`aios/motor/regras.py → bloqueio_orcamento`) faz a
 * mesma conta: um agente sem saldo ou com o teto atingido não acorda. O painel mostra o mesmo
 * motivo escrito que o motor usa, para não haver «pode gastar» num ecrã e «bloqueado» no outro.
 *
 * O dia e o mês são os de Lisboa: um teto diário que vira à meia-noite UTC vira à uma da manhã no
 * verão, e o dono lê o painel em hora de Lisboa.
 */

export interface MovimentoLido {
  agente_id: string
  tipo: string
  valor: number | string | null
  detalhe?: string | null
  criado_em: string
}

export interface OrcamentoAgente {
  orcamento: number
  gasto: number
  saldo: number
  gasto_dia: number
  gasto_mes: number
  teto_dia: number | null
  teto_mes: number | null
  /** Nulo quando pode gastar; senão, o motivo escrito por que o motor não o acorda. */
  bloqueado: string | null
}

const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}
const dinheiro = (v: number) => Math.round(v * 100) / 100
const teto = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : dinheiro(Number(v)))

/** `AAAA-MM-DD` em Lisboa. */
export function diaLisboa(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export function calcularOrcamento(
  linha: { orcamento: unknown; gasto: unknown; teto_dia?: unknown; teto_mes?: unknown },
  movimentos: MovimentoLido[],
  agora: Date,
): OrcamentoAgente {
  const orcamento = dinheiro(n(linha.orcamento))
  const gasto = dinheiro(n(linha.gasto))
  const hoje = diaLisboa(agora)
  const mes = hoje.slice(0, 7)

  let gasto_dia = 0
  let gasto_mes = 0
  for (const m of movimentos) {
    if (m.tipo !== 'gastou') continue
    const v = n(m.valor)
    if (v <= 0) continue
    const dia = diaLisboa(new Date(m.criado_em))
    if (dia.slice(0, 7) !== mes) continue
    gasto_mes += v
    if (dia === hoje) gasto_dia += v
  }

  const r: OrcamentoAgente = {
    orcamento,
    gasto,
    saldo: Math.max(0, dinheiro(orcamento - gasto)),
    gasto_dia: dinheiro(gasto_dia),
    gasto_mes: dinheiro(gasto_mes),
    teto_dia: teto(linha.teto_dia),
    teto_mes: teto(linha.teto_mes),
    bloqueado: null,
  }
  if (r.saldo <= 0) r.bloqueado = `Sem saldo (gastou ${r.gasto} de ${r.orcamento}). Dá-lhe saldo para voltar a trabalhar.`
  else if (r.teto_dia != null && r.gasto_dia >= r.teto_dia) r.bloqueado = `Teto do dia atingido (${r.gasto_dia} de ${r.teto_dia}). Volta amanhã.`
  else if (r.teto_mes != null && r.gasto_mes >= r.teto_mes) r.bloqueado = `Teto do mês atingido (${r.gasto_mes} de ${r.teto_mes}). Volta no mês seguinte.`
  return r
}

/** Valida um valor escrito pelo dono (carregamento ou despesa). Devolve o número ou o motivo. */
export function lerValor(v: unknown): { ok: true; valor: number } | { ok: false; erro: string } {
  const x = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  if (!Number.isFinite(x) || x <= 0) return { ok: false, erro: 'O valor tem de ser um número maior que zero.' }
  if (x > 100_000) return { ok: false, erro: 'Valor acima de 100 000: escreve-o em partes, se for mesmo isso.' }
  return { ok: true, valor: dinheiro(x) }
}

/** Valida um teto: vazio/0 = sem teto. */
export function lerTeto(v: unknown): { ok: true; valor: number | null } | { ok: false; erro: string } {
  if (v == null || v === '' || Number(v) === 0) return { ok: true, valor: null }
  const r = lerValor(v)
  return r.ok ? { ok: true, valor: r.valor } : r
}

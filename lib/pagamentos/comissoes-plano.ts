/**
 * QUEM RECEBE HOJE, E PORQUE É QUE OS OUTROS AINDA NÃO — o plano de pagamento das comissões da
 * equipa por transferência Stripe. Ficheiro PURO (guarda em `comissoes-plano.check.ts`).
 *
 * O acto humano continua a ser o mesmo: o dono APROVA a comissão no admin. O que este plano decide
 * é só o que vem depois, e só transfere quando TODAS estas condições se cumprem:
 *
 *  1. a comissão está 'aprovada' e nem ela nem a venda foram estornadas;
 *  2. a venda já passou a janela da desconfiança (30 dias desde o pagamento): uma devolução dentro
 *     dela reverte a comissão (`lib/vendas/livro.ts`), e dinheiro transferido não volta sozinho;
 *  3. a pessoa tem a conta de recebimento completa (Stripe Connect);
 *  4. a pessoa não tem dívidas (comissões pagas e depois devolvidas) — isso acerta-se à mão;
 *  5. a pessoa não é da casa (admins não recebem transferências: é dinheiro a sair e a voltar);
 *  6. o total chega ao mínimo (1 €), para não gastar transferências em cêntimos.
 *
 * Tudo o que fica de fora sai com o MOTIVO, para o admin e o extracto o poderem dizer.
 */

export const JANELA_PAGAMENTO_DIAS = 30
export const MINIMO_TRANSFERENCIA_CENTS = 100

export type LinhaComissao = {
  id: string
  beneficiario_id: string
  valor_cents: number
  moeda: string | null
  estado: string
  estornada_em: string | null
  venda_pago_em: string | null
  venda_estornada_em: string | null
}

export type PessoaPagamento = {
  id: string
  connectId: string | null
  connectEstado: string | null
  admin: boolean
  dividaCents: number
}

export type Lote = {
  beneficiarioId: string
  destino: string
  moeda: string
  ids: string[]
  totalCents: number
}

export type MotivoEspera = 'janela' | 'sem_conta' | 'conta_incompleta' | 'divida' | 'casa' | 'minimo'

export type Espera = { beneficiarioId: string; motivo: MotivoEspera; ids: string[]; totalCents: number }

export const MOTIVO_TEXTO: Record<MotivoEspera, string> = {
  janela: 'A venda ainda está dentro dos 30 dias em que o cliente pode pedir o dinheiro de volta.',
  sem_conta: 'Ainda não preencheu os dados de recebimento (conta Stripe).',
  conta_incompleta: 'Começou os dados de recebimento mas o Stripe ainda não os validou.',
  divida: 'Tem comissões pagas e depois devolvidas por clientes: acerta-se à mão primeiro.',
  casa: 'É da casa: não se transfere.',
  minimo: 'Total abaixo de 1 €: junta-se ao próximo pagamento.',
}

function diasDesde(iso: string | null, agoraMs: number): number {
  if (!iso) return Infinity
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? (agoraMs - t) / 86_400_000 : Infinity
}

export function planearPagamentos(entrada: {
  linhas: LinhaComissao[]
  pessoas: Map<string, PessoaPagamento>
  agoraIso: string
  janelaDias?: number
  minimoCents?: number
}): { lotes: Lote[]; espera: Espera[] } {
  const agora = new Date(entrada.agoraIso).getTime()
  const janela = entrada.janelaDias ?? JANELA_PAGAMENTO_DIAS
  const minimo = entrada.minimoCents ?? MINIMO_TRANSFERENCIA_CENTS

  const grupos = new Map<string, LinhaComissao[]>()
  const espera = new Map<string, Espera>()
  const esperar = (l: LinhaComissao, motivo: MotivoEspera) => {
    const k = `${l.beneficiario_id}|${motivo}`
    const e = espera.get(k) ?? { beneficiarioId: l.beneficiario_id, motivo, ids: [], totalCents: 0 }
    e.ids.push(l.id)
    e.totalCents += Math.max(0, Math.round(Number(l.valor_cents) || 0))
    espera.set(k, e)
  }

  for (const l of entrada.linhas) {
    if (l.estado !== 'aprovada' || l.estornada_em || l.venda_estornada_em) continue
    if ((Number(l.valor_cents) || 0) <= 0) continue
    if (diasDesde(l.venda_pago_em, agora) < janela) {
      esperar(l, 'janela')
      continue
    }
    const p = entrada.pessoas.get(l.beneficiario_id)
    if (p?.admin) {
      esperar(l, 'casa')
      continue
    }
    if (!p?.connectId) {
      esperar(l, 'sem_conta')
      continue
    }
    if (p.connectEstado !== 'complete') {
      esperar(l, 'conta_incompleta')
      continue
    }
    if (p.dividaCents > 0) {
      esperar(l, 'divida')
      continue
    }
    const moeda = (l.moeda || 'EUR').toUpperCase()
    const k = `${l.beneficiario_id}|${moeda}`
    grupos.set(k, [...(grupos.get(k) ?? []), l])
  }

  const lotes: Lote[] = []
  for (const [k, linhas] of grupos) {
    const [beneficiarioId, moeda] = k.split('|')
    const total = linhas.reduce((t, l) => t + Math.round(Number(l.valor_cents) || 0), 0)
    if (total < minimo) {
      for (const l of linhas) esperar(l, 'minimo')
      continue
    }
    lotes.push({
      beneficiarioId,
      destino: String(entrada.pessoas.get(beneficiarioId)!.connectId),
      moeda,
      ids: linhas.map((l) => l.id).sort(),
      totalCents: total,
    })
  }
  return { lotes, espera: [...espera.values()] }
}

/** Chave de idempotência do lote: o mesmo conjunto de comissões nunca gera duas transferências. */
export function chaveDoLote(lote: Pick<Lote, 'ids' | 'beneficiarioId'>): string {
  const base = `${lote.beneficiarioId}:${[...lote.ids].sort().join(',')}`
  let h = 5381
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0
  return `comissoes-equipa-${lote.beneficiarioId.slice(0, 8)}-${lote.ids.length}-${h.toString(36)}`
}

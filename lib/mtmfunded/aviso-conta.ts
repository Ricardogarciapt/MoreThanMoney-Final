/**
 * O AVISO FIXO DA CONTA NO WEBTRADER — a linha que diz ao trader em que conta está a negociar.
 *
 * Até 17/09 era uma frase só para todas as contas MTM Funded («… não é negociação real»). O dono
 * quer que ela diga o PONTO DO CAMINHO, lido da conta e não adivinhado pelo ecrã:
 *   · desafio (1 ou 2 fases, qualquer fase) → «… · Encontras-te em Avaliação»
 *   · Funded aprovada                        → «Conta · MTM Funded · contém negociação real»
 *     (decisão do dono de 17/09: a Funded negoceia capital patrocinado MTM)
 *
 * Os outros casos têm texto próprio, porque qualquer um dos dois acima seria mentira neles:
 *   · desafio aprovado       → avaliação concluída (a conta já não avalia nada)
 *   · desafio quebrado/cancelado/expirado → avaliação terminada
 *   · Funded quebrada/encerrada → «já não negoceia» — dizer «contém negociação real» numa conta
 *     rebentada convidava a negociar nela
 *   · Funded de ANÁLISE (`metricas.analise`) — contas sem regras que seguem estratégias (as de
 *     clientes como o Fábio/Alcy). São `tipo='financiada'` por razões técnicas (sem objectivo nem
 *     fase), mas ninguém as ganhou num desafio e não têm capital patrocinado: continuam simuladas.
 *   · CONTA REAL DA CASA (`conta_real_casa`, 109) — as contas do dono que ele declarou reais a 17/09
 *     (as 1K das estratégias, T2T, «Todos os sinais» e os quatro espelhos de 10K) → AUDITORIA:
 *     «Conta MTM Funded · Conta de auditoria · negociação real». Não é o aviso da Funded de cliente
 *     (decisão do dono): negoceiam a sério, mas ninguém as ganhou num desafio — servem para a casa
 *     auditar as estratégias. Continuam sem regras (`analise`); a marca manda sobre `analise`
 *     porque as duas respondem a perguntas diferentes (ver conta-real-casa.ts).
 *   · torneio → simulada, com o nome do torneio no lugar da avaliação
 *   · provider (conta-mestre de estratégia) → simulada, conta-mestre
 *   · sem dados (sessão antiga guardada no browser antes deste campo) → a frase neutra
 *
 * Puro: o servidor calcula (rotas das contas) e o cliente só traduz a chave.
 */

export type AvisoConta =
  | 'avaliacao'
  | 'avaliacao_concluida'
  | 'avaliacao_terminada'
  | 'funded'
  | 'auditoria'
  | 'funded_encerrada'
  | 'analise'
  | 'torneio'
  | 'mestre'
  | 'geral'

export interface ContaParaAviso {
  tipo?: string | null
  estado?: string | null
  metricas?: Record<string, unknown> | null
  pausadaEm?: string | null
  /** `mtm_trading_accounts.conta_real_casa` (109). */
  contaReal?: boolean | null
}

export function avisoDaConta(c: ContaParaAviso | null | undefined): AvisoConta {
  if (!c?.tipo) return 'geral'
  const estado = String(c.estado ?? '')
  // Estados que fecham a conta. `expirada` com `metricas.pausadaEm` é a pausa do ciclo do
  // levantamento (lib/mtmfunded/etiquetas.ts) — a conta continua a ser a mesma Funded.
  const pausaDoLevantamento = estado === 'expirada' && Boolean(c.metricas?.pausadaEm)
  const fechada = ['quebrada', 'cancelada'].includes(estado) || (estado === 'expirada' && !pausaDoLevantamento)

  switch (c.tipo) {
    case 'desafio':
      if (estado === 'aprovada') return 'avaliacao_concluida'
      if (fechada) return 'avaliacao_terminada'
      return 'avaliacao'
    case 'financiada':
    case 'funded':
      // Fechada primeiro, também na conta real: dizer «contém negociação real» numa conta
      // encerrada convidava a negociar nela.
      if (c.contaReal === true) return fechada || estado === 'aprovada' ? 'funded_encerrada' : 'auditoria'
      if (c.metricas?.analise === true || c.metricas?.analise === 'true') return 'analise'
      if (fechada || estado === 'aprovada') return 'funded_encerrada'
      return 'funded'
    case 'torneio':
      return 'torneio'
    case 'provider':
      return 'mestre'
    default:
      return 'geral'
  }
}

/** A chave do dicionário (lib/i18n/messages/mtmfunded.ts) — `.curto` para a faixa do telemóvel. */
export function chaveDoAviso(a: AvisoConta | string | null | undefined, curto = false): string {
  const valido: AvisoConta[] = ['avaliacao', 'avaliacao_concluida', 'avaliacao_terminada', 'funded', 'auditoria', 'funded_encerrada', 'analise', 'torneio', 'mestre', 'geral']
  const k = valido.includes(a as AvisoConta) ? (a as AvisoConta) : 'geral'
  return `mtmfunded.aviso.${k}${curto ? '.curto' : ''}`
}

/** A conta tem negociação real (pinta a faixa de outra cor): Funded de cliente e auditoria da casa. */
export const avisoReal = (a: AvisoConta | string | null | undefined) => a === 'funded' || a === 'auditoria'

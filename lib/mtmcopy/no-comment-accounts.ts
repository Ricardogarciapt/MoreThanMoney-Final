import { CONTAS_MOTOR_TEMPO_REAL } from './provider-constants'

/**
 * TODAS as ordens abrem como trades MANUAIS: sem comentário e sem magic number.
 *
 * As contas financiadas (prop firms) leem o comentário e o magic para detetar copy-trading
 * automático — e banem a conta quando o encontram. Isto era uma lista de exceções, conta a
 * conta, o que só funciona enquanto alguém se lembrar de lá pôr a conta seguinte. A conta do
 * Mário (FXIFY) entrou sem ninguém se lembrar. A regra passa a ser ao contrário: limpo por
 * omissão, e a exceção tem de se justificar.
 *
 * A EXCEÇÃO são as contas PROVEDORAS. Não por descuido: é no comentário que o motor guarda
 * qual das três pernas é cada posição (`matchesPremiumLegComment`, `parsePremiumSingleComment`).
 * Sem ele, o mestre deixa de saber onde fazer o parcial, onde pôr o break-even e qual a perna
 * que fica a arrastar. Do lado do CLIENTE isso não se perde: as saídas dos subscritores acham
 * a posição por símbolo+direção e o T2T fecha por id da posição — nenhum deles lê comentários.
 *
 * As contas provedoras são nossas e vivem em corretoras normais; nenhuma prop firm as inspeciona.
 */

/** Contas que MANTÊM comentário — as provedoras, onde o motor o lê de volta. */
export function commentedAccountIds(): string[] {
  const extra = (process.env.MTMCOPY_COMMENTED_ACCOUNTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set([...CONTAS_MOTOR_TEMPO_REAL, ...extra].filter(Boolean))]
}

/** A conta abre trades sem comentário (isto é: todas menos as provedoras). */
export function isNoCommentAccount(accountId?: string | null): boolean {
  const id = accountId?.trim()
  if (!id) return true // sem saber de quem é a conta, o lado seguro é não assinar a ordem
  return !commentedAccountIds().includes(id)
}

/** Comentário a enviar na ordem — `undefined` em tudo o que não seja conta provedora. */
export function orderCommentFor(
  accountId: string | null | undefined,
  comment: string | null | undefined,
  fallback = 'MTMcopier',
): string | undefined {
  if (isNoCommentAccount(accountId)) return undefined
  return (comment ?? fallback).slice(0, 31)
}

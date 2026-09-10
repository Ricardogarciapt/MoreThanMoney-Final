/**
 * TODAS as ordens abrem como trades manuais.
 *
 * As prop firms leem o comentário da ordem para detetar copy-trading e banem a conta quando o
 * encontram. Isto era uma lista de exceções conta-a-conta, que só funciona enquanto alguém se
 * lembrar de lá pôr a conta seguinte — e a do Mário (FXIFY, conta REAL de 1.000 USD) entrou sem
 * ninguém se lembrar. A regra ficou ao contrário: limpo por omissão.
 *
 * A exceção são as contas PROVEDORAS, e não por descuido: é no comentário que o motor guarda
 * qual das três pernas é cada posição. Sem ele o mestre não sabe onde fazer o parcial nem onde
 * pôr o break-even. Do lado do cliente ninguém lê comentários — as saídas acham a posição por
 * símbolo+direção, e o T2T fecha por id.
 */
import { isNoCommentAccount, orderCommentFor, commentedAccountIds } from '../no-comment-accounts'
import { CONTAS_MOTOR_TEMPO_REAL, CANONICAL_PREMIUM_ACCOUNT_ID } from '../provider-constants'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

// ── contas de clientes: nunca assinadas ────────────────────────────────────
const MARIO_FXIFY = '9c7f56d3-59a9-4a41-8032-9d137a646ab7'
eq('conta do Mário (FXIFY) não leva comentário', orderCommentFor(MARIO_FXIFY, 'MTMAUTO-premium'), undefined)
eq('conta de cliente qualquer', orderCommentFor('conta-de-cliente-qualquer', 'MTMcopier'), undefined)
eq('conta desconhecida também não', orderCommentFor('11111111-2222-3333-4444-555555555555', 'x'), undefined)
eq('id vazio → sem comentário', orderCommentFor('', 'x'), undefined)
eq('id nulo → sem comentário', orderCommentFor(null, 'x'), undefined)
eq('sem id é tratado como cliente', isNoCommentAccount(undefined), true)

// ── contas provedoras: mantêm, porque o motor lê de volta ──────────────────
eq('mestre Premium mantém comentário', orderCommentFor(CANONICAL_PREMIUM_ACCOUNT_ID, 'PREM-L1'), 'PREM-L1')
eq('mestre sem texto usa o fallback', orderCommentFor(CANONICAL_PREMIUM_ACCOUNT_ID, null), 'MTMcopier')
eq('mestre não é conta-sem-comentário', isNoCommentAccount(CANONICAL_PREMIUM_ACCOUNT_ID), false)
for (const conta of CONTAS_MOTOR_TEMPO_REAL) {
  eq(`provedora ${conta.slice(0, 8)} mantém`, isNoCommentAccount(conta), false)
}

// ── espaços à volta do id não podem furar a regra ──────────────────────────
eq('id do mestre com espaços', isNoCommentAccount(` ${CANONICAL_PREMIUM_ACCOUNT_ID} `), false)

// ── o comentário do mestre continua a caber no limite do MT5 (31 chars) ────
eq('comentário truncado a 31', orderCommentFor(CANONICAL_PREMIUM_ACCOUNT_ID, 'x'.repeat(60))?.length, 31)

// ── a lista de contas assinadas não pode conter vazios ─────────────────────
eq('sem ids vazios na lista', commentedAccountIds().some((x) => !x.trim()), false)

console.log(mau === 0 ? `✓ ${ok} verificações passaram` : `${ok} ok, ${mau} FALHARAM`)
process.exit(mau === 0 ? 0 : 1)

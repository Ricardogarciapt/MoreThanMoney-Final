/**
 * LIGAR UMA CONTA MTM FUNDED NAS APPS — as regras puras (sem base, sem Next).
 *
 * O cliente escreve login + password + servidor «MTM Funded» no «Ligar conta» do T2T / MTM Auto.
 *
 *   password MASTER + conta do próprio      → ligação completa (métricas + execução pelo motor)
 *   password INVESTOR (conta sua ou alheia) → só leitura (métricas sim, execução nunca)
 *   password MASTER de conta de outro       → recusada (quem acompanha usa a investor)
 *   login inexistente / password errada     → a MESMA resposta genérica
 *
 * Testado em lib/mtmfunded/__tests__/ligar-conta.check.ts.
 */
import { timingSafeEqual } from 'crypto'

export type ModoLigacao = 'master' | 'investor'

export interface ContaParaLigar {
  id: string
  user_id: string | null
  mt5_password_cifrada: string | null
  mt5_investor_cifrada: string | null
}

export type DecisaoLigacao =
  | { ok: true; modo: ModoLigacao; somenteLeitura: boolean }
  | { ok: false; codigo: 'credenciais' | 'conta_de_outro' }

function igual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  // Comprimentos diferentes: compara na mesma contra si próprio para não sair mais cedo.
  if (x.length !== y.length) {
    timingSafeEqual(x, x)
    return false
  }
  return timingSafeEqual(x, y)
}

export function decidirLigacao(p: {
  conta: ContaParaLigar | null
  password: string
  userId: string
  decifrar: (v: string | null | undefined) => string | null
}): DecisaoLigacao {
  if (!p.conta || !p.password) return { ok: false, codigo: 'credenciais' }
  const master = p.decifrar(p.conta.mt5_password_cifrada)
  const investor = p.decifrar(p.conta.mt5_investor_cifrada)
  // Avaliam-se as duas sempre — o tempo de resposta não diz qual bateu.
  const eMaster = master ? igual(master, p.password) : false
  const eInvestor = investor ? igual(investor, p.password) : false
  if (eMaster) {
    if (p.conta.user_id && p.conta.user_id === p.userId) return { ok: true, modo: 'master', somenteLeitura: false }
    return { ok: false, codigo: 'conta_de_outro' }
  }
  if (eInvestor) return { ok: true, modo: 'investor', somenteLeitura: true }
  return { ok: false, codigo: 'credenciais' }
}

// ── limite de tentativas ────────────────────────────────────────────────────

export const JANELA_TENTATIVAS_MS = 15 * 60_000
export const MAX_FALHAS_POR_UTILIZADOR = 5
export const MAX_FALHAS_POR_LOGIN = 10

export interface Tentativa {
  user_id: string
  login: string
  ok: boolean
  criado_em: string | number
}

/** true = bloqueado. Só contam FALHAS dentro da janela; acertos não gastam tentativas. */
export function tentativasEsgotadas(tentativas: Tentativa[], userId: string, login: string, agora = Date.now()): boolean {
  const recentes = tentativas.filter((t) => !t.ok && agora - new Date(t.criado_em).getTime() < JANELA_TENTATIVAS_MS)
  const doUtilizador = recentes.filter((t) => t.user_id === userId).length
  const doLogin = recentes.filter((t) => t.login === login).length
  return doUtilizador >= MAX_FALHAS_POR_UTILIZADOR || doLogin >= MAX_FALHAS_POR_LOGIN
}

export function loginLimpo(v: unknown): string | null {
  const s = String(v ?? '').replace(/\D/g, '')
  return /^77\d{6}$/.test(s) ? s : null
}

export function servidorValido(v: unknown, esperado = 'MTM Funded'): boolean {
  const s = String(v ?? '').trim()
  return !s || s.toLowerCase().replace(/\s+/g, ' ') === esperado.toLowerCase()
}

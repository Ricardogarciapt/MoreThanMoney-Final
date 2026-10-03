import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { cifrar, decifrar } from '@/lib/mtmfunded/credenciais'

/**
 * CREDENCIAIS DAS CONTAS SIMULADAS — como no MetaTrader.
 *
 * Cada conta emitida por nós tem um LOGIN numérico, uma password MASTER (negociar) e uma password
 * INVESTOR (só ver), no servidor «MTM Funded». É a forma que um trader já conhece, e é a que deixa
 * partilhar a conta com alguém para a acompanhar sem lhe dar o botão de comprar.
 *
 * Vivem nas MESMAS colunas das contas da corretora (`mt5_login`, `mt5_password_cifrada`,
 * `mt5_investor_cifrada`) — o painel, a rota das credenciais e o admin mostram-nas sem mudar
 * nada. As passwords guardam-se cifradas (AES-256-GCM) e nunca vão por email: vêem-se no painel,
 * com sessão, e só quando se carrega em «Mostrar».
 */

// Sem caracteres que se confundem ao ler de um ecrã (0/O, 1/l/I).
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const DIGITOS = '23456789'
const SIMBOLOS = '!@#$%*?'

function sortear(conjunto: string): string {
  return conjunto[randomInt(conjunto.length)]
}

export function gerarPassword(tamanho = 10): string {
  // Pelo menos uma de cada família, como o MetaTrader exige — e depois baralhado.
  const base = [sortear(LETRAS.slice(0, 24)), sortear(LETRAS.slice(24)), sortear(DIGITOS), sortear(SIMBOLOS)]
  const todos = LETRAS + DIGITOS + SIMBOLOS
  while (base.length < tamanho) base.push(sortear(todos))
  for (let i = base.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[base[i], base[j]] = [base[j], base[i]]
  }
  return base.join('')
}

/**
 * Login de 8 dígitos a começar por 77 — nunca colide com os logins da corretora externa, e
 * distingue-se de relance numa lista mista.
 */
export async function gerarLoginUnico(): Promise<string> {
  const db = getSupabaseAdmin()
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const login = `77${String(randomInt(0, 1_000_000)).padStart(6, '0')}`
    const { data } = await db.from('mtm_trading_accounts').select('id').eq('mt5_login', login).maybeSingle()
    if (!data) return login
  }
  throw new Error('não foi possível gerar um login livre')
}

export async function credenciaisNovas(): Promise<Record<string, string>> {
  return {
    mt5_login: await gerarLoginUnico(),
    mt5_password_cifrada: cifrar(gerarPassword()),
    mt5_investor_cifrada: cifrar(gerarPassword()),
  }
}

// ── entrar com login + password (WebTrader) ─────────────────────────────────

export type ModoSessao = 'master' | 'investor'

function igual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function segredoDasSessoes(): string {
  const s = process.env.MTMFUNDED_CRED_KEY
  if (!s || s.length < 32) throw new Error('MTMFUNDED_CRED_KEY em falta')
  return `sessao:${s}`
}

/**
 * Verifica login + password. Devolve o modo (master negoceia, investor só vê) ou null.
 *
 * Conta inexistente e password errada dão a mesma resposta: distingui-las deixava adivinhar
 * que logins existem.
 */
export async function verificarCredenciais(
  login: string,
  password: string,
): Promise<{ accountId: string; modo: ModoSessao } | null> {
  const limpo = login.replace(/\D/g, '')
  if (!limpo || !password) return null
  const { data: conta } = await getSupabaseAdmin()
    .from('mtm_trading_accounts')
    .select('id, mt5_password_cifrada, mt5_investor_cifrada, motor')
    .eq('mt5_login', limpo)
    .eq('motor', 'sim')
    .maybeSingle()
  if (!conta) return null
  const master = decifrar(conta.mt5_password_cifrada as string)
  const investor = decifrar(conta.mt5_investor_cifrada as string)
  if (master && igual(master, password)) return { accountId: conta.id as string, modo: 'master' }
  if (investor && igual(investor, password)) return { accountId: conta.id as string, modo: 'investor' }
  return null
}

/** Sessão da conta: `v1.<conta>.<modo>.<expira>.<assinatura>`, válida 12 horas. */
export function emitirSessao(accountId: string, modo: ModoSessao, horas = 12): { token: string; expira: string } {
  const expira = Date.now() + horas * 3600_000
  const corpo = `v1.${accountId}.${modo}.${expira}`
  const assinatura = createHmac('sha256', segredoDasSessoes()).update(corpo).digest('base64url')
  return { token: `${corpo}.${assinatura}`, expira: new Date(expira).toISOString() }
}

export function lerSessao(token: string | null | undefined): { accountId: string; modo: ModoSessao } | null {
  if (!token) return null
  const partes = token.split('.')
  if (partes.length !== 5 || partes[0] !== 'v1') return null
  const [, accountId, modo, expira, assinatura] = partes
  const esperada = createHmac('sha256', segredoDasSessoes()).update(partes.slice(0, 4).join('.')).digest('base64url')
  if (!igual(assinatura, esperada)) return null
  if (!(Number(expira) > Date.now())) return null
  if (modo !== 'master' && modo !== 'investor') return null
  return { accountId, modo }
}

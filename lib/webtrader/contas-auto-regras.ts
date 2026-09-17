/**
 * CONTAS DO MTM AUTO NO WEBTRADER — as decisões, sem base de dados (testadas em
 * lib/webtrader/__tests__/contas-auto.check.ts).
 *
 * Porque existe: o separador WebTrader da app MTM Auto abre o mesmo WebTrader do site, e três tipos
 * de conta ligados NA APP não chegavam cá:
 *   1. TradeLocker ligada no MTM Auto (vive em mtmauto_accounts, não em mtmcopy_connections);
 *   2. MT5/MT4 de clientes de EQUIPAS — a conta MetaApi existe só na chave da equipa, e o WebTrader
 *      usava sempre a da casa (404);
 *   3. MTM Funded ligada com a password INVESTOR (conta de outra pessoa) — o WebTrader só listava as
 *      contas de que a pessoa é dona.
 */
import { resolverToken, type TokenResolvido } from '@/lib/copia-contas/tokens'

const txt = (v: unknown) => (v == null || v === '' ? null : String(v))

// ── 1. TradeLocker ligada no MTM Auto ────────────────────────────────────────────────────────

/** Uma linha de mtmauto_accounts entra na lista como TradeLocker? Só com a conta escolhida (id + nº). */
export function tradeLockerAutoListavel(c: Record<string, unknown>): boolean {
  return String(c.plataforma ?? '').toLowerCase() === 'tradelocker' && Boolean(txt(c.tl_account_id)) && Boolean(txt(c.tl_acc_num))
}

/**
 * A mesma conta TradeLocker pode estar ligada no site E no MTM Auto: aparece UMA vez (a do site ganha,
 * porque é a que o ligador de contas gere). Chave = ambiente + id da conta na TradeLocker.
 */
export function chaveContaTL(env: unknown, accountId: unknown): string {
  return `${String(env ?? '').toLowerCase()}:${String(accountId ?? '')}`
}

// ── 2. Chave MetaApi da conta ────────────────────────────────────────────────────────────────

/**
 * A chave MetaApi de uma conta MT do WebTrader. Mesma regra da cópia entre contas
 * (lib/copia-contas/tokens.ts): `auto:` de cliente de equipa com chave própria → chave da equipa;
 * tudo o resto → casa. A QUOTA do plano decide-se antes e à parte (autorizarMt5) — a chave só diz
 * ONDE a conta vive, nunca se a pessoa a pode abrir.
 */
export function chaveMetaApiDaConta(p: {
  origem: 'site' | 'auto' | 'wt'
  contaId: string
  tenantId: string | null
  tokenEquipa: string | null
  tokenCasa: string | null
}): TokenResolvido | null {
  return resolverToken({
    ref: `${p.origem}:${p.contaId}`,
    tenantId: p.origem === 'auto' ? p.tenantId : null,
    tokenEquipa: p.origem === 'auto' ? p.tokenEquipa : null,
    tokenCasa: p.tokenCasa,
  })
}

// ── 3. MTM Funded ligada (master ou investor) ────────────────────────────────────────────────

export interface LigacaoFunded {
  funded_account_id?: unknown
  funded_somente_leitura?: unknown
}

/**
 * Com que modo a pessoa abre uma conta MTM Funded SEM ter entrado com login+password neste separador.
 *   · dona da conta → master;
 *   · não é dona mas tem a conta ligada (site ou MTM Auto) → investor, SEMPRE. Uma ligação a conta
 *     alheia só existe com a password investor (a master de outra pessoa é recusada ao ligar), e mesmo
 *     que uma linha viesse sem a marca de leitura, uma conta que não é tua nunca negoceia por aqui;
 *   · nada disto → null (sem acesso).
 */
export function modoFundedPelaLigacao(p: {
  accountId: string
  donoId: string | null
  userId: string
  ligacoes: LigacaoFunded[]
}): 'master' | 'investor' | null {
  if (p.donoId && p.donoId === p.userId) return 'master'
  const ligada = p.ligacoes.some((l) => txt(l.funded_account_id) === p.accountId)
  return ligada ? 'investor' : null
}

/** Ids das contas MTM Funded ligadas pela pessoa que NÃO são dela (entram na lista como investor). */
export function fundedLigadasAlheias(ligacoes: LigacaoFunded[], proprias: Iterable<string>): string[] {
  const donas = new Set(proprias)
  const out = new Set<string>()
  for (const l of ligacoes) {
    const id = txt(l.funded_account_id)
    if (id && !donas.has(id)) out.add(id)
  }
  return [...out]
}

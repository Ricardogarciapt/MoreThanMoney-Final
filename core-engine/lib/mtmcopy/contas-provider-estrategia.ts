/**
 * A CONTA MESTRE DE CADA ESTRATÉGIA VEM DA BASE DE DADOS — nunca de uma constante escrita à mão.
 *
 * O incidente (16/09/2026): as estratégias da casa deixaram de abrir sinais. As contas provider
 * MT5 existiam e estavam ligadas — são as que o agente do VPS criou na The Trading Master, uma
 * por estratégia (19036 Premium, 19037 Sensei, 19038 GoldKiller, 19040 Aurum Flow, 19042 MTM
 * Scanner) — mas o código não sabia delas. As constantes `CANONICAL_*_ACCOUNT_ID` apontavam para
 * as contas ANTIGAS, apagadas na MetaApi a 15/09, e tinham sido postas a `null` para parar os
 * NotFoundError que estrangulavam o token. `null` quer dizer «não executa»: os sinais chegavam,
 * a rota não tinha conta, e nada abria. As contas mestre ficaram vazias, e por isso o espelho
 * (070) também não tinha posições nenhumas para levar às contas MTM Funded dos seguidores.
 *
 * A lição é a que este ficheiro implementa: **o id de uma conta é um dado, não código**. Quem
 * cria as contas é o agente MT5 no VPS, e o que ele grava é uma linha em `mtm_trading_accounts`
 * (`tipo = 'provider'`, `provider_slug`, `metaapi_account_id`). É essa linha que manda. As
 * constantes ficam como último recurso para o que ainda não tem linha.
 *
 * COMO SE ESCOLHE A CONTA DE UMA ESTRATÉGIA (ver `escolherContaDaEstrategia`, pura e testada):
 *   1. linha de `mtm_trading_accounts` com `provider_slug` = slug, `tipo = 'provider'`,
 *      `estado = 'ativa'`, `motor = 'mt5'` e `metaapi_account_id` preenchido;
 *   2. contas conhecidamente APAGADAS na MetaApi nunca entram (CONTAS_METAAPI_APAGADAS);
 *   3. havendo várias, ganha a que bate certo com `mtmauto_providers.metaapi_account_id`; se
 *      nenhuma bater, ganha a mais recente e a divergência é REPORTADA (`divergencia`) — a conta
 *      do VPS é a que negoceia, mas alguém tem de saber que o provider aponta para outro lado;
 *   4. sem nenhuma linha viável, fica o id do provider (se existir e não estiver apagado);
 *   5. sem nada disso, `null` — e `null` continua a querer dizer NÃO EXECUTA.
 *
 * LEITURA SÍNCRONA: quem constrói as rotas (`buildCanonicalProviderRoutes`) é síncrono e é
 * chamado em dezenas de sítios. Por isso o mapa vive em cache de módulo, aquecida por
 * `getSignalSourcesConfig()` (que é async e corre sempre antes) e por quem mais precise. Cache
 * fria = comportamento antigo (constantes), nunca uma conta errada.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CONTAS_METAAPI_APAGADAS } from './metaapi-inexistentes'
import { CONTAS_MOTOR_TEMPO_REAL, ehContaDeMotor as ehContaDeMotorFixa } from './provider-constants'

/** Estratégias da casa com conta mestre própria. A chave é o slug em `mtmauto_providers`. */
export const SLUG_PREMIUM = 'premium-ouro'
export const SLUG_SENSEI = 'sensei'
export const SLUG_GOLDKILLER = 'Goldkiller'
export const SLUG_AURUM = 'aurum-flow'
export const SLUG_MTM_SCANNER = 'mtm-scanner'

/**
 * O MTM Scanner tem conta provider (19042) e NÃO executa — decisão do dono. Fica aqui escrito
 * para não voltar a ser «esquecimento»: quem quiser ligá-lo tem de o tirar desta lista, e nessa
 * altura a rota canónica dele passa a existir.
 */
export const SLUGS_QUE_NAO_EXECUTAM: ReadonlySet<string> = new Set([SLUG_MTM_SCANNER])

export interface LinhaContaProvider {
  id: string
  provider_slug: string | null
  metaapi_account_id: string | null
  tipo: string | null
  estado: string | null
  motor: string | null
  mt5_login: string | null
  servidor: string | null
  created_at?: string | null
}

export interface ContaDeEstrategia {
  slug: string
  accountId: string
  /** de onde saiu o id: a linha da conta, ou o provider como último recurso */
  origem: 'conta_vps' | 'provider'
  login: string | null
  servidor: string | null
  /** o provider aponta para OUTRA conta — a conta do VPS ganha, mas isto tem de aparecer no painel */
  divergencia: string | null
}

const vivo = (s: string | null | undefined) => Boolean(s && s.trim() && !CONTAS_METAAPI_APAGADAS.has(s.trim()))

/**
 * PURA: a conta mestre de uma estratégia, a partir das linhas da base. Testada em
 * lib/mtmcopy/__tests__/contas-provider-estrategia.check.ts.
 */
export function escolherContaDaEstrategia(
  slug: string,
  linhas: LinhaContaProvider[],
  providerMetaapiId: string | null | undefined,
): ContaDeEstrategia | null {
  const alvo = slug.trim().toLowerCase()
  const candidatas = linhas
    .filter(
      (l) =>
        String(l.provider_slug ?? '').trim().toLowerCase() === alvo &&
        String(l.tipo ?? '') === 'provider' &&
        String(l.estado ?? '') === 'ativa' &&
        String(l.motor ?? 'mt5') === 'mt5' &&
        vivo(l.metaapi_account_id),
    )
    // mais recente primeiro: uma conta nova substitui a anterior sem ninguém mexer em código
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))

  const doProvider = vivo(providerMetaapiId) ? String(providerMetaapiId).trim() : null
  const bate = candidatas.find((l) => String(l.metaapi_account_id).trim() === doProvider)
  const escolhida = bate ?? candidatas[0]

  if (escolhida) {
    const accountId = String(escolhida.metaapi_account_id).trim()
    return {
      slug,
      accountId,
      origem: 'conta_vps',
      login: escolhida.mt5_login ? String(escolhida.mt5_login) : null,
      servidor: escolhida.servidor ? String(escolhida.servidor) : null,
      divergencia:
        doProvider && doProvider !== accountId
          ? `mtmauto_providers.metaapi_account_id (${doProvider.slice(0, 8)}) não é a conta provider viva (${accountId.slice(0, 8)}, MT5 ${escolhida.mt5_login ?? '?'})`
          : null,
    }
  }

  // Sem linha de conta: o provider ainda serve, desde que a conta dele não esteja apagada.
  if (doProvider) {
    return { slug, accountId: doProvider, origem: 'provider', login: null, servidor: null, divergencia: null }
  }
  return null
}

// ── cache de módulo ──────────────────────────────────────────────────────────

const TTL_MS = Number(process.env.CONTAS_PROVIDER_TTL_MS || 60_000)
let cache: { em: number; contas: Map<string, ContaDeEstrategia> } | null = null
let aVoar: Promise<Map<string, ContaDeEstrategia>> | null = null

/** Só para testes: injecta (ou limpa) o mapa em cache. */
export function __definirContasProvider(contas: Map<string, ContaDeEstrategia> | null): void {
  cache = contas ? { em: Date.now(), contas } : null
  aVoar = null
}

async function ler(): Promise<Map<string, ContaDeEstrategia>> {
  const db = getSupabaseAdmin()
  const [{ data: contas, error: e1 }, { data: provs, error: e2 }] = await Promise.all([
    db
      .from('mtm_trading_accounts')
      .select('id, provider_slug, metaapi_account_id, tipo, estado, motor, mt5_login, servidor, created_at')
      .eq('tipo', 'provider')
      .not('provider_slug', 'is', null)
      .limit(500),
    db.from('mtmauto_providers').select('slug, metaapi_account_id, ativo, apagado_em').limit(500),
  ])
  // Uma leitura falhada NÃO apaga o que já se sabia: manter a cache velha é melhor do que
  // devolver «sem conta», que aqui significa deixar de executar.
  if (e1 || e2) {
    if (cache) return cache.contas
    throw new Error(`contas provider: ${(e1 ?? e2)?.message}`)
  }
  const mapa = new Map<string, ContaDeEstrategia>()
  const slugs = new Set<string>()
  for (const c of contas ?? []) if (c.provider_slug) slugs.add(String(c.provider_slug))
  for (const p of provs ?? []) if (p.slug && !p.apagado_em) slugs.add(String(p.slug))
  for (const slug of slugs) {
    const prov = (provs ?? []).find((p) => String(p.slug).toLowerCase() === slug.toLowerCase())
    const escolha = escolherContaDaEstrategia(
      slug,
      (contas ?? []) as LinhaContaProvider[],
      (prov?.metaapi_account_id as string | null) ?? null,
    )
    if (escolha) mapa.set(slug.toLowerCase(), escolha)
  }
  return mapa
}

/** Relê as contas mestre (respeitando o TTL). Nunca lança: erro = fica o que havia. */
export async function carregarContasDeEstrategia(forcar = false): Promise<Map<string, ContaDeEstrategia>> {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache.contas
  if (aVoar) return aVoar
  aVoar = ler()
    .then((contas) => {
      cache = { em: Date.now(), contas }
      return contas
    })
    .catch((e) => {
      console.warn('[contas-provider] leitura falhou:', e instanceof Error ? e.message : e)
      return cache?.contas ?? new Map<string, ContaDeEstrategia>()
    })
    .finally(() => {
      aVoar = null
    })
  return aVoar
}

/** SÍNCRONO, da cache. `null` com a cache fria — quem lê cai no comportamento antigo. */
export function contaDaEstrategiaEmCache(slug: string): ContaDeEstrategia | null {
  if (SLUGS_QUE_NAO_EXECUTAM.has(slug)) return null
  return cache?.contas.get(slug.trim().toLowerCase()) ?? null
}

/** O id da conta mestre, ou '' (que em `ProviderRoute.account_id` quer dizer «não executa»). */
export function idDaContaEmCache(slug: string): string {
  return contaDaEstrategiaEmCache(slug)?.accountId ?? ''
}

/** Todas as contas mestre conhecidas (para o painel e para os diagnósticos). */
export function contasDeEstrategiaEmCache(): ContaDeEstrategia[] {
  return [...(cache?.contas.values() ?? [])]
}

/**
 * Esta conta é a mestre de uma estratégia que EXECUTA? (substitui `mesmaConta(..., CANONICAL_*)`).
 *
 * O MTM Scanner tem conta mestre e não negoceia: dizer que sim aqui faria uma rota dele passar
 * por canónica e ganhar conta sozinha — que é exactamente o contrário da decisão do dono.
 */
export function ehContaDeEstrategia(accountId: string | null | undefined): boolean {
  const id = String(accountId ?? '').trim()
  if (!id) return false
  return contasDeEstrategiaEmCache().some((c) => c.accountId === id && !SLUGS_QUE_NAO_EXECUTAM.has(c.slug))
}

/** O slug da estratégia a que esta conta mestre pertence. */
export function slugDaConta(accountId: string | null | undefined): string | null {
  const id = String(accountId ?? '').trim()
  if (!id) return null
  return contasDeEstrategiaEmCache().find((c) => c.accountId === id)?.slug ?? null
}

/**
 * AS CONTAS ONDE O MOTOR EM TEMPO REAL CORRE — a lista fixa MAIS as contas mestre vivas.
 *
 * `CONTAS_MOTOR_TEMPO_REAL` é uma constante montada no arranque a partir de ids escritos à mão.
 * Sem esta união, as contas provider novas ficavam de fora do motor: abriam a trade e ficavam a
 * olhar para ela — sem parciais, sem break-even, sem trailing. E o que o espelho leva às contas
 * MTM Funded é exactamente o que acontece na mestre, por isso a gestão que falta aqui falta lá
 * também. É este o «trailing stop» que o dono não via.
 *
 * O MTM Scanner fica de fora por `SLUGS_QUE_NAO_EXECUTAM` (não abre, logo não há nada a gerir).
 */
export function contasDoMotorTempoReal(): string[] {
  const vivas = contasDeEstrategiaEmCache()
    .filter((c) => !SLUGS_QUE_NAO_EXECUTAM.has(c.slug))
    .map((c) => c.accountId)
  return [...new Set([...CONTAS_MOTOR_TEMPO_REAL, ...vivas])].filter(Boolean)
}

/** Versão de `ehContaDeMotor` que também conhece as contas mestre vindas da base. */
export function ehContaDeMotorViva(accountId: string | null | undefined): boolean {
  if (ehContaDeMotorFixa(accountId)) return true
  const slug = slugDaConta(accountId)
  return Boolean(slug && !SLUGS_QUE_NAO_EXECUTAM.has(slug))
}

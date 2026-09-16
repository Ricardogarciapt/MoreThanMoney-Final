/**
 * A conta mestre de cada estratégia vem da BASE, não de constantes escritas à mão.
 *
 *   npx tsx lib/mtmcopy/__tests__/contas-provider-estrategia.check.ts
 *
 * O que isto tranca é o incidente de 16/09/2026: as constantes CANONICAL_*_ACCOUNT_ID estavam a
 * `null` (contas antigas apagadas na MetaApi), as rotas ficaram sem conta, os sinais chegavam e
 * nada abria — e sem posições na mestre o espelho não tinha nada para levar às contas MTM Funded.
 */
import assert from 'node:assert/strict'
import {
  SLUG_GOLDKILLER,
  SLUG_MTM_SCANNER,
  SLUG_PREMIUM,
  SLUG_SENSEI,
  SLUGS_QUE_NAO_EXECUTAM,
  __definirContasProvider,
  contaDaEstrategiaEmCache,
  contasDoMotorTempoReal,
  ehContaDeEstrategia,
  ehContaDeMotorViva,
  escolherContaDaEstrategia,
  idDaContaEmCache,
  slugDaConta,
  type ContaDeEstrategia,
  type LinhaContaProvider,
} from '../contas-provider-estrategia'
import { CONTAS_METAAPI_APAGADAS } from '../metaapi-inexistentes'
import { CANONICAL_PREMIUM_ACCOUNT_ID } from '../provider-constants'
import { buildCanonicalProviderRoutes, repairProviderRoutes } from '../provider-routes-defaults'
import type { ProviderRoute } from '../signal-sources-config'

const VIVA_PREMIUM = 'a21178c2-863b-4c57-b1ef-fec5d2e32f6b'
const VIVA_SENSEI = '78066d2d-3851-4865-a32f-b35bd48f117c'
const VIVA_GK = '3bab6541-db5d-491e-8d25-d49f18fc9af1'
const APAGADA = [...CONTAS_METAAPI_APAGADAS][0]!

const linha = (p: Partial<LinhaContaProvider> & { provider_slug: string; metaapi_account_id: string }): LinhaContaProvider => ({
  id: `c-${p.provider_slug}`,
  tipo: 'provider',
  estado: 'ativa',
  motor: 'mt5',
  mt5_login: '19036',
  servidor: 'TheTradingMaster-Live',
  created_at: '2026-09-15T10:00:00Z',
  ...p,
})

// ── escolha da conta (pura) ──────────────────────────────────────────────────

{
  const linhas = [linha({ provider_slug: SLUG_SENSEI, metaapi_account_id: VIVA_SENSEI, mt5_login: '19037' })]
  const r = escolherContaDaEstrategia(SLUG_SENSEI, linhas, VIVA_SENSEI)
  assert.equal(r?.accountId, VIVA_SENSEI, 'a conta do VPS é a conta do Sensei')
  assert.equal(r?.origem, 'conta_vps')
  assert.equal(r?.divergencia, null, 'provider e conta batem certo: sem divergência')
}

{
  // O provider aponta para OUTRA conta — a conta do VPS ganha, e a divergência é reportada.
  const linhas = [linha({ provider_slug: SLUG_GOLDKILLER, metaapi_account_id: VIVA_GK, mt5_login: '19038' })]
  const r = escolherContaDaEstrategia(SLUG_GOLDKILLER, linhas, CANONICAL_PREMIUM_ACCOUNT_ID)
  assert.equal(r?.accountId, VIVA_GK, 'a conta do VPS manda sobre o provider desalinhado')
  assert.match(String(r?.divergencia), /não é a conta provider viva/)
}

{
  // Um provider que aponta para uma conta APAGADA não é divergência: é lixo, e ignora-se.
  const linhas = [linha({ provider_slug: SLUG_GOLDKILLER, metaapi_account_id: VIVA_GK, mt5_login: '19038' })]
  const r = escolherContaDaEstrategia(SLUG_GOLDKILLER, linhas, APAGADA)
  assert.equal(r?.accountId, VIVA_GK)
  assert.equal(r?.divergencia, null)
}

{
  // Nunca uma conta apagada na MetaApi — cada pedido a uma delas estrangula o token inteiro.
  const linhas = [linha({ provider_slug: SLUG_PREMIUM, metaapi_account_id: APAGADA })]
  assert.equal(escolherContaDaEstrategia(SLUG_PREMIUM, linhas, APAGADA), null, 'conta apagada nunca é escolhida')
}

{
  // Contas inativas, de outro motor ou sem id não servem.
  const linhas = [
    linha({ provider_slug: SLUG_PREMIUM, metaapi_account_id: VIVA_PREMIUM, estado: 'quebrada' }),
    linha({ provider_slug: SLUG_PREMIUM, metaapi_account_id: VIVA_SENSEI, motor: 'sim' }),
  ]
  assert.equal(escolherContaDaEstrategia(SLUG_PREMIUM, linhas, null), null, 'sem conta viável, sem conta')
}

{
  // Sem linha de conta, o provider ainda serve (é o estado antigo, que continua a funcionar).
  const r = escolherContaDaEstrategia(SLUG_PREMIUM, [], CANONICAL_PREMIUM_ACCOUNT_ID)
  assert.equal(r?.accountId, CANONICAL_PREMIUM_ACCOUNT_ID)
  assert.equal(r?.origem, 'provider')
}

{
  // Duas contas vivas: ganha a que bate certo com o provider, não a mais recente.
  const linhas = [
    linha({ provider_slug: SLUG_PREMIUM, metaapi_account_id: VIVA_SENSEI, created_at: '2026-09-16T10:00:00Z' }),
    linha({ provider_slug: SLUG_PREMIUM, metaapi_account_id: VIVA_PREMIUM, created_at: '2026-09-10T10:00:00Z' }),
  ]
  assert.equal(escolherContaDaEstrategia(SLUG_PREMIUM, linhas, VIVA_PREMIUM)?.accountId, VIVA_PREMIUM)
  // Sem provider a desempatar, ganha a mais recente.
  assert.equal(escolherContaDaEstrategia(SLUG_PREMIUM, linhas, null)?.accountId, VIVA_SENSEI)
}

// ── cache + rotas canónicas ──────────────────────────────────────────────────

const conta = (slug: string, accountId: string, login: string): ContaDeEstrategia => ({
  slug, accountId, origem: 'conta_vps', login, servidor: 'TheTradingMaster-Live', divergencia: null,
})

__definirContasProvider(null)
{
  // Cache FRIA = comportamento antigo. Nunca uma conta errada, nunca uma excepção.
  assert.equal(idDaContaEmCache(SLUG_SENSEI), '', 'cache fria não inventa contas')
  const rotas = buildCanonicalProviderRoutes()
  assert.equal(rotas.find((r) => r.id === 'canonical-premium-signals')?.account_id, CANONICAL_PREMIUM_ACCOUNT_ID)
}

__definirContasProvider(
  new Map([
    [SLUG_PREMIUM.toLowerCase(), conta(SLUG_PREMIUM, VIVA_PREMIUM, '19036')],
    [SLUG_SENSEI.toLowerCase(), conta(SLUG_SENSEI, VIVA_SENSEI, '19037')],
    [SLUG_GOLDKILLER.toLowerCase(), conta(SLUG_GOLDKILLER, VIVA_GK, '19038')],
    [SLUG_MTM_SCANNER.toLowerCase(), conta(SLUG_MTM_SCANNER, '6bda9af4-be52-44dc-903f-94827029821c', '19042')],
  ]),
)

{
  const rotas = buildCanonicalProviderRoutes()
  const porId = new Map(rotas.map((r) => [r.id, r]))
  assert.equal(porId.get('canonical-premium-signals')?.account_id, VIVA_PREMIUM, 'Premium passa para a 19036')
  assert.equal(porId.get('canonical-sensei')?.account_id, VIVA_SENSEI, 'Sensei deixa de estar sem conta')
  const gk = porId.get('canonical-goldkiller')
  assert.ok(gk, 'a GoldKiller voltou a ser rota canónica (sem ela, SDNb não resolve)')
  assert.equal(gk?.account_id, VIVA_GK)
  assert.equal(gk?.strategy_id, 'SDNb')
  assert.equal(gk?.signal_source, 'webhook')
  // O MTM Scanner NÃO executa: não tem rota canónica nenhuma.
  assert.ok(SLUGS_QUE_NAO_EXECUTAM.has(SLUG_MTM_SCANNER))
  assert.equal(contaDaEstrategiaEmCache(SLUG_MTM_SCANNER), null, 'o MTM Scanner não entrega conta a ninguém')
  assert.ok(!rotas.some((r) => r.account_id === '6bda9af4-be52-44dc-903f-94827029821c'))
  // Ter conta mestre não faz do MTM Scanner uma estratégia que executa.
  assert.equal(ehContaDeEstrategia('6bda9af4-be52-44dc-903f-94827029821c'), false)
  assert.equal(ehContaDeEstrategia(VIVA_GK), true)
}

{
  // A CONTA VAZIA GUARDADA NÃO PODE CONTINUAR A GANHAR quando já há conta viva — foi isto que
  // manteve o Sensei e a Aurum Flow paradas depois de as contas novas existirem.
  const guardadas: ProviderRoute[] = [
    { id: 'canonical-sensei', label: 'MTM Auto Sensei', sender_channel: null, account_id: '', strategy_id: null, enabled: true },
    { id: 'canonical-premium-signals', label: 'MTM Auto Premium', sender_channel: 'premium-signals', account_id: '530d2e07-b391-440f-bc6e-f4c2a224057b', strategy_id: 'MxsR', enabled: true },
  ]
  const r = repairProviderRoutes(guardadas)
  const sensei = r.find((x) => x.id === 'canonical-sensei')
  assert.equal(sensei?.account_id, VIVA_SENSEI, 'conta viva ganha ao vazio guardado')
  assert.equal(
    r.find((x) => x.id === 'canonical-premium-signals')?.account_id,
    VIVA_PREMIUM,
    'o Premium é repontado da conta antiga para a 19036',
  )
  // Pausar continua a ser o interruptor: `enabled: false` sobrevive ao repair.
  const pausadas = repairProviderRoutes([{ ...guardadas[0]!, enabled: false }])
  assert.equal(pausadas.find((x) => x.id === 'canonical-sensei')?.enabled, false, 'a pausa do admin manda')
}

{
  // O motor em tempo real tem de correr nestas contas: sem ele não há parciais, BE nem trailing —
  // e o espelho só leva às MTM Funded o que acontece na mestre.
  const motor = contasDoMotorTempoReal()
  assert.ok(motor.includes(VIVA_PREMIUM) && motor.includes(VIVA_SENSEI) && motor.includes(VIVA_GK))
  assert.ok(!motor.includes('6bda9af4-be52-44dc-903f-94827029821c'), 'o MTM Scanner fica fora do motor')
  assert.ok(!motor.some((id) => !id || CONTAS_METAAPI_APAGADAS.has(id)), 'sem contas vazias nem apagadas')
  assert.equal(ehContaDeMotorViva(VIVA_GK), true)
  assert.equal(ehContaDeMotorViva(''), false)
  assert.equal(slugDaConta(VIVA_SENSEI), SLUG_SENSEI)
}

__definirContasProvider(null)
console.log('✓ contas-provider-estrategia: 24 verificações')

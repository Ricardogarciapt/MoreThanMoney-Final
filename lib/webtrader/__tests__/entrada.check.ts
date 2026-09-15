/**
 * WebTrader — entrada (login MTM/Google), sincronização das contas e TradeLocker sem duplicados.
 * Correr: npx tsx lib/webtrader/__tests__/entrada.check.ts
 */
import assert from 'node:assert/strict'
import { CAMINHO_WEBTRADER, ehCaminhoWebtrader, mensagemErroLogin, redirectWebtrader } from '../entrada'
import { contaInicial, montarSeletor, type ContaRealSeletor, type FundedDoUtilizador } from '../seletor'
import { ligacaoTradeLockerRepetida, ligarOuReutilizarTradeLocker, type LinhaTradeLocker } from '../tradelocker-ligar'
import { determinePostLoginRedirect, safeInternalRedirectPath } from '../../role-redirect'

let n = 0
const caso = async (nome: string, f: () => void | Promise<void>) => {
  await f()
  n++
  console.log(`  ok  ${nome}`)
}

async function main() {
  // ── 1. Redirect depois do login: só /webtrader deste site ──────────────────────────────────
  await caso('redirect: caminhos /webtrader aceites (com deep-link)', () => {
    assert.equal(redirectWebtrader('/webtrader'), '/webtrader')
    assert.equal(redirectWebtrader('/webtrader?symbol=OANDA:XAUUSD&dir=buy&sl=1&tp=2'), '/webtrader?symbol=OANDA:XAUUSD&dir=buy&sl=1&tp=2')
    assert.equal(redirectWebtrader('/webtrader/qualquer'), '/webtrader/qualquer')
    assert.equal(redirectWebtrader('  /webtrader  '), '/webtrader')
  })
  await caso('redirect: tudo o resto cai em /webtrader', () => {
    const maus = [
      null, undefined, '', 'webtrader', 'https://evil.com/webtrader', '//evil.com/webtrader', '/\\evil.com', '/\\/evil.com/webtrader',
      'javascript:alert(1)', '/webtrader\n//evil.com', '/web\ttrader', '/admin', '/webtraderx', '/webtrader-falso',
      '/webtrader/../admin', '/webtrader/%2e%2e/admin', `/webtrader?x=${'a'.repeat(3000)}`,
    ]
    for (const m of maus) assert.equal(redirectWebtrader(m as string), CAMINHO_WEBTRADER, `devia recusar ${JSON.stringify(m)}`)
    assert.equal(ehCaminhoWebtrader('/admin'), false)
    assert.equal(ehCaminhoWebtrader('/webtrader?symbol=X'), true)
  })
  await caso('redirect do site (callback OAuth) recusa barras invertidas e controlo', () => {
    assert.equal(safeInternalRedirectPath('/\\evil.com'), null)
    assert.equal(safeInternalRedirectPath('/x\n//evil.com'), null)
    assert.equal(safeInternalRedirectPath('//evil.com'), null)
    assert.equal(safeInternalRedirectPath('https://evil.com'), null)
    assert.equal(safeInternalRedirectPath('/webtrader?symbol=XAUUSD'), '/webtrader?symbol=XAUUSD')
  })
  await caso('pós-login: membro App Only volta ao /webtrader (e só a ele); membro normal a qualquer caminho interno', () => {
    const appOnly = { user_type: 'member', member_category: 'standard', is_active: true, subscription_plan: 'app_member' as const, subscription_expires_at: '2999-01-01T00:00:00Z', stripe_subscription_id: 'sub_x' }
    assert.equal(determinePostLoginRedirect(appOnly, '/webtrader?symbol=XAUUSD'), '/webtrader?symbol=XAUUSD')
    assert.equal(determinePostLoginRedirect(appOnly, '/member-area'), '/app-mobile')
    assert.equal(determinePostLoginRedirect(appOnly, '/webtrader/../admin'), '/app-mobile')
    const admin = { user_type: 'admin', is_active: true }
    assert.equal(determinePostLoginRedirect(admin, '/webtrader'), '/webtrader')
    assert.equal(determinePostLoginRedirect(admin, '/\\evil.com'), '/admin')
  })
  await caso('mensagens de erro iguais às do /login', () => {
    assert.equal(mensagemErroLogin('Invalid login credentials'), 'Email ou senha incorretos')
    assert.equal(mensagemErroLogin('Email not confirmed'), 'Email não confirmado. Verifique sua caixa de entrada.')
    assert.equal(mensagemErroLogin('outra coisa'), 'outra coisa')
    assert.equal(mensagemErroLogin(undefined), 'Erro ao fazer login. Tente novamente.')
  })

  // ── 2. Sincronização: contas → entradas do seletor, por plataforma ─────────────────────────
  const funded: FundedDoUtilizador[] = [
    { id: 'f-desafio', mt5_login: '77000001', etiqueta: 'F1', estadoCurto: 'Active', sim_saldo: 10000, sim_equity: 10050, programa: { nome: 'MTM Funded 10K' } },
    { id: 'f-estrategia', mt5_login: '77000002', etiqueta: 'Sim', estadoCurto: 'Active', sim_saldo: 5000, sim_equity: 5000, segueEstrategia: { slug: 'aurum', nome: 'MTM Auto Aurum Flow' } },
  ]
  const reais: ContaRealSeletor[] = [
    { ref: 'tradelocker:site:11111111-1111-1111-1111-111111111111', plataforma: 'tradelocker', rotulo: 'WebTrader', login: '12345', servidor: 'OSP', demo: false, real: true, bloqueada: null, origem: 'ligador' },
    { ref: 'mt5:site:22222222-2222-2222-2222-222222222222', plataforma: 'mt5', rotulo: 'T2T', login: '24502921', servidor: 'VTMarkets-Live', demo: false, real: true, bloqueada: null, origem: 'ligador' },
    { ref: 'mt5:auto:33333333-3333-3333-3333-333333333333', plataforma: 'mt5', rotulo: 'PU Prime', login: '986912', servidor: 'PUPrime-Demo', demo: true, real: true, bloqueada: 'Limite de contas MetaTrader do teu plano.', origem: 'ligador' },
    { ref: 'mt5:wt:44444444-4444-4444-4444-444444444444', plataforma: 'mt5', rotulo: null, login: '555', servidor: 'Broker-Live', demo: false, real: true, bloqueada: null, origem: 'webtrader' },
  ]

  await caso('seletor: MTM Funded (programa e estratégia), TradeLocker, MT5 site/auto/wt', () => {
    const e = montarSeletor({ funded, reais })
    assert.deepEqual(e.map((x) => [x.plataforma, x.id]), [
      ['mtmfunded', 'f-desafio'], ['mtmfunded', 'f-estrategia'],
      ['tradelocker', reais[0].ref], ['mt5', reais[1].ref], ['mt5', reais[2].ref], ['mt5', reais[3].ref],
    ])
    assert.equal(e[0].programa, 'MTM Funded 10K')
    assert.equal(e[1].segue, 'MTM Auto Aurum Flow')
    assert.equal(e[2].etiqueta, 'TradeLocker')
    assert.equal(e[2].estadoCurto, 'Real')
    assert.equal(e[3].etiqueta, 'MT5')
    assert.equal(e[4].estadoCurto, 'Bloqueada')
    assert.ok(e.slice(2).every((x) => x.real && x.propria && x.modo === 'master'))
    assert.ok(e.slice(0, 2).every((x) => !x.real))
  })
  await caso('seletor: sessões deste separador (MTM Funded investor, TradeLocker antiga) e sem duplicados', () => {
    const e = montarSeletor({
      funded,
      sessoesFunded: {
        'f-desafio': { accountId: 'f-desafio', login: '77000001', modo: 'master' },
        'f-outra': { accountId: 'f-outra', login: '77000099', modo: 'investor', etiqueta: 'F2', estadoCurto: 'Active' },
      },
      reais,
      sessoesTL: {
        // A mesma conta já ligada no ligador → não aparece duas vezes.
        'tradelocker:sessao:9001': { ref: 'tradelocker:sessao:9001', login: '12345', servidor: 'osp', demo: false },
        'tradelocker:sessao:9002': { ref: 'tradelocker:sessao:9002', login: '67890', servidor: 'HEROFX', demo: true },
      },
    })
    assert.equal(e.filter((x) => x.id === 'f-desafio').length, 1)
    const investor = e.find((x) => x.id === 'f-outra')!
    assert.equal(investor.modo, 'investor')
    assert.equal(investor.propria, false)
    assert.equal(e.some((x) => x.id === 'tradelocker:sessao:9001'), false)
    const tl = e.find((x) => x.id === 'tradelocker:sessao:9002')!
    assert.equal(tl.propria, false)
    assert.equal(tl.estadoCurto, 'Demo')
    assert.equal(new Set(e.map((x) => x.id)).size, e.length)
  })
  await caso('seletor: vazio → sem entradas; conta inicial = actual › última › primeira que abre', () => {
    assert.deepEqual(montarSeletor({ funded: [], reais: [] }), [])
    assert.equal(contaInicial([], null, 'x'), null)
    const e = montarSeletor({ funded, reais })
    assert.equal(contaInicial(e, null, null), 'f-desafio')
    assert.equal(contaInicial(e, null, reais[3].ref), reais[3].ref)
    assert.equal(contaInicial(e, 'f-estrategia', reais[3].ref), 'f-estrategia')
    assert.equal(contaInicial(e, null, reais[2].ref), 'f-desafio', 'bloqueada pela quota não abre sozinha')
    assert.equal(contaInicial(e, null, 'apagada'), 'f-desafio')
    const soBloqueada = montarSeletor({ funded: [], reais: [reais[2]] })
    assert.equal(contaInicial(soBloqueada, null, null), null)
  })

  // ── 3. TradeLocker: uma linha por conta (WebTrader ↔ ligador) ──────────────────────────────
  const linha = (id: string, extra: Partial<LinhaTradeLocker> = {}): LinhaTradeLocker =>
    ({ id, mt5_platform: 'tradelocker', mt5_status: 'connected', tl_account_id: '9001', tl_env: 'live', tl_server: 'OSP', ...extra })
  const alvo = { accountId: '9001', env: 'live', server: 'osp ' }

  await caso('repetida: mesma conta/ambiente/servidor (sem maiúsculas); outras não contam', () => {
    assert.equal(ligacaoTradeLockerRepetida([linha('a')], alvo)?.id, 'a')
    assert.equal(ligacaoTradeLockerRepetida([linha('a', { tl_env: 'demo' })], alvo), null)
    assert.equal(ligacaoTradeLockerRepetida([linha('a', { tl_server: 'HEROFX' })], alvo), null)
    assert.equal(ligacaoTradeLockerRepetida([linha('a', { tl_account_id: '9002' })], alvo), null)
    assert.equal(ligacaoTradeLockerRepetida([linha('a', { mt5_status: 'disconnected' })], alvo), null)
    assert.equal(ligacaoTradeLockerRepetida([linha('a', { mt5_platform: 'mt5' })], alvo), null)
    assert.equal(ligacaoTradeLockerRepetida(null, alvo), null)
  })

  await caso('WebTrader: conta já ligada no ligador → abre essa, NÃO grava outra', async () => {
    let gravou = 0
    const r = await ligarOuReutilizarTradeLocker({
      lerLigadas: async () => [linha('existente-1')],
      ligar: async () => { gravou++; return { status: 200, corpo: { connection: { id: 'nova' } } } },
    }, alvo)
    assert.deepEqual(r, { ok: true, ref: 'tradelocker:site:existente-1', ligada: 'existente' })
    assert.equal(gravou, 0)
  })

  await caso('WebTrader: conta nova → grava UMA vez pelo passo do ligador e abre essa linha', async () => {
    const base: LinhaTradeLocker[] = []
    let gravou = 0
    const deps = {
      lerLigadas: async () => base,
      ligar: async () => { gravou++; base.push(linha('nova-1')); return { status: 200, corpo: { connection: { id: 'nova-1' } } } },
    }
    const r1 = await ligarOuReutilizarTradeLocker(deps, alvo)
    assert.deepEqual(r1, { ok: true, ref: 'tradelocker:site:nova-1', ligada: 'nova' })
    // Segunda vez (outro login no WebTrader, ou o ligador a seguir) → reutiliza.
    const r2 = await ligarOuReutilizarTradeLocker(deps, alvo)
    assert.deepEqual(r2, { ok: true, ref: 'tradelocker:site:nova-1', ligada: 'existente' })
    assert.equal(gravou, 1)
    assert.equal(base.length, 1)
  })

  await caso('WebTrader: corrida (409 do ligador) → relê e abre a linha que ganhou', async () => {
    let leituras = 0
    const r = await ligarOuReutilizarTradeLocker({
      lerLigadas: async () => (leituras++ === 0 ? [] : [linha('vencedora')]),
      ligar: async () => ({ status: 409, corpo: { error: 'Esta conta TradeLocker já está ligada' } }),
    }, alvo)
    assert.deepEqual(r, { ok: true, ref: 'tradelocker:site:vencedora', ligada: 'existente' })
  })

  await caso('WebTrader: erros do ligador passam com o estado e a mensagem', async () => {
    const r = await ligarOuReutilizarTradeLocker({
      lerLigadas: async () => [],
      ligar: async () => ({ status: 400, corpo: { error: 'Essa conta não pertence a este login TradeLocker.' } }),
    }, alvo)
    assert.deepEqual(r, { ok: false, status: 400, erro: 'Essa conta não pertence a este login TradeLocker.' })
    const s = await ligarOuReutilizarTradeLocker({ lerLigadas: async () => [], ligar: async () => ({ status: 200, corpo: {} }) }, alvo)
    assert.equal(s.ok, false)
  })

  console.log(`\n${n} verificações OK`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * Contas inexistentes na MetaApi (incidente 2026-09-15 16:30 UTC — «too many unexisting or
 * undeployed trading accounts»): constantes mortas a null, linhas inativas saltadas, registo de
 * NotFound partilhado, travão de quota a distinguir este estrangulamento dos créditos, e o erro
 * de quota antigo mostrado como histórico.
 * Correr: npx tsx lib/mtmcopy/__tests__/contas-inexistentes.check.ts
 */
import assert from 'node:assert/strict'
import {
  CANONICAL_AURUMFLOW_ACCOUNT_ID, CANONICAL_BOOSTER_ACCOUNT_ID, CANONICAL_COPYTRADER_RG_ACCOUNT_ID,
  CANONICAL_GOLDKILLER_ACCOUNT_ID, CANONICAL_PREMIUM_ACCOUNT_ID, CANONICAL_SENSEI_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID, CONTAS_MOTOR_TEMPO_REAL, mesmaConta,
} from '../provider-constants'
import {
  CONTAS_METAAPI_APAGADAS, ContaInexistenteError, __definirLojaInexistentes, __limparInexistentes,
  contaInexistente, contaMarcadaInexistente, ehErroContaInexistente, ehErroContasInexistentesEmExcesso,
  filtrarContasExistentes, idsDeContaNoErro, marcarContaInexistente, type LojaInexistentes,
} from '../metaapi-inexistentes'
import { __definirLoja, type LojaMetaApi } from '../metaapi-loja'
import { __limparQuota, ehErroDeQuota, emSegundoPlano, leituraDeFundoBloqueada, registarErroQuota, tipoDeErroQuota } from '../metaapi-quota'
import { estadoDoUltimoErro } from '../erro-historico'
import { routeBelongsToChannel } from '../provider-routes-defaults'

let n = 0
const ok = (c: boolean, m: string) => { n++; assert.ok(c, m) }

const MORTAS = [
  '128fabf2-c894-45ed-a6b2-258b3bd274e1', '2f2bdf0d-ab60-434c-a6f7-6dcc2abef1bf', '9e224f09-3f58-45de-98de-c13c6e94656f',
  'a54832a6-7aeb-48f3-ab7e-8ecf4cdc305a', 'bd421604-2c44-4b31-bfa0-e7ef20c53fc3', '9dfb4df3-112d-4c7b-8d7d-b8cf97ca6fa6',
  '0f38257a-ba12-4f6c-b20c-9139693b3674', 'a4ea0c45-3dd1-4b55-bd2a-7f44d8d6884b', 'a5a1dddd-0099-4d67-98f1-86b65aad5845',
  'bddad3b8-353f-4a19-badf-f8df8f532678', 'dc588b39-1f0a-47a5-8985-28e6fbc98817', 'fbeeafeb-96a9-4133-bc6c-194cc281b6e0',
]
const VIVA = CANONICAL_PREMIUM_ACCOUNT_ID // 530d2e07, DEPLOYED na lista de 15/09

function lojaMemoria() {
  const linhas = new Map<string, number>()
  const cont = { ler: 0, marcar: 0 }
  const l: LojaInexistentes = {
    async ler(ids) { cont.ler++; const m = new Map<string, number>(); for (const i of ids) { const t = linhas.get(i); if (t != null) m.set(i, t) } return m },
    async marcar(id, ate) { cont.marcar++; linhas.set(id, ate) },
  }
  return { l, cont, linhas }
}

async function main() {
  // ── (a) constantes mortas ──
  for (const c of [CANONICAL_TRADE_IDEAS_ACCOUNT_ID, CANONICAL_SENSEI_ACCOUNT_ID, CANONICAL_GOLDKILLER_ACCOUNT_ID,
    CANONICAL_BOOSTER_ACCOUNT_ID, CANONICAL_COPYTRADER_RG_ACCOUNT_ID, CANONICAL_AURUMFLOW_ACCOUNT_ID]) {
    ok(c === null, 'constante de conta apagada é null')
  }
  ok(!CONTAS_MOTOR_TEMPO_REAL.some((id) => !id || CONTAS_METAAPI_APAGADAS.has(id)), 'motor sem contas vazias nem apagadas')
  ok(CONTAS_MOTOR_TEMPO_REAL.includes(VIVA), 'o Premium continua no motor')
  for (const id of MORTAS) ok(CONTAS_METAAPI_APAGADAS.has(id) && contaMarcadaInexistente(id), `morta estática: ${id.slice(0, 8)}`)
  ok(!contaMarcadaInexistente(VIVA), 'a conta viva não está marcada')
  ok(!mesmaConta(null, null) && !mesmaConta('', null) && mesmaConta(VIVA, VIVA), 'mesmaConta: null nunca iguala null')
  const rotaSemConta = { id: 'x', account_id: '', strategy_id: 'ZZZZ', signal_source: 'telegram', sender_channel: null } as never
  ok(!routeBelongsToChannel(rotaSemConta, 'trade-ideas'), 'rota sem conta não passa por Trade Ideas por null===null')

  // ── (c) classificação de erros ──
  const nf = Object.assign(new Error('Trading account with id 128fabf2-c894-45ed-a6b2-258b3bd274e1 not found'), { name: 'NotFoundError' })
  ok(ehErroContaInexistente(nf), 'NotFoundError da conta')
  ok(ehErroContaInexistente(Object.assign(new Error('MetaAPI HTTP 404'), { status: 404 }), true), '404 em chamada ao nível da conta')
  ok(!ehErroContaInexistente(Object.assign(new Error('MetaAPI HTTP 404'), { status: 404 })), '404 genérico fora do nível da conta não marca')
  ok(!ehErroContaInexistente(Object.assign(new Error('Specified symbol not found'), { name: 'NotFoundError' }), true), 'símbolo não encontrado nunca marca')
  ok(!ehErroContaInexistente(Object.assign(new Error('Position not found'), { status: 404 }), true), 'posição não encontrada nunca marca')
  ok(!ehErroContaInexistente(Object.assign(new Error('Account is not in this region, try london'), { status: 404 }), true), 'região errada não marca')
  ok(!ehErroContaInexistente(new Error('timeout')), 'timeout não marca')

  const estrangulado = Object.assign(
    new Error('It seems like you are trying to access too many unexisting or undeployed trading accounts. Please check your application logs for occurrences of NotFoundError'),
    { name: 'TooManyRequestsError', metadata: { accountId: 'bd421604-2c44-4b31-bfa0-e7ef20c53fc3' } },
  )
  ok(ehErroContasInexistentesEmExcesso(estrangulado), 'estrangulamento reconhecido')
  ok(ehErroDeQuota(estrangulado) && tipoDeErroQuota(estrangulado) === 'contas_inexistentes', 'quota: tipo contas_inexistentes (não créditos)')
  ok(!ehErroContaInexistente(estrangulado), 'o estrangulamento em si não marca nenhuma conta')
  ok(tipoDeErroQuota(new Error('The ws:getSymbols API allows 4320000 cpu credits per 6h')) === 'creditos', 'quota: créditos')
  assert.deepEqual(idsDeContaNoErro(estrangulado), ['bd421604-2c44-4b31-bfa0-e7ef20c53fc3']); n++

  // ── registo partilhado ──
  const m = lojaMemoria()
  __definirLojaInexistentes(m.l)
  __limparInexistentes()
  let t = Date.parse('2026-09-15T17:30:00Z')
  const NOVA = '11111111-2222-3333-4444-555555555555'
  ok(!(await contaInexistente(NOVA, t)), 'desconhecida: não inexistente')
  ok(await marcarContaInexistente(NOVA, nf, { agoraMs: t, origem: 'teste' }), 'NotFound marca')
  ok(m.cont.marcar === 1, '…e grava na tabela')
  ok(await contaInexistente(NOVA, t), 'marcada nesta instância')
  await marcarContaInexistente(NOVA, nf, { agoraMs: t + 1000 })
  ok(m.cont.marcar === 1, 'rajada de NotFound: 1 escrita por minuto')
  __limparInexistentes() // arranque a frio
  ok(await contaInexistente(NOVA, t + 5000), 'instância nova lê a marca da tabela')
  const lidas = m.cont.ler
  await contaInexistente(NOVA, t + 6000)
  ok(m.cont.ler === lidas, 'segunda pergunta não volta à base')
  ok(!(await contaInexistente(NOVA, t + 25 * 3600_000)), 'passadas 24 h deixa de estar marcada')
  ok(!(await marcarContaInexistente(NOVA, new Error('timeout'), { agoraMs: t })), 'erro que não é NotFound não marca')

  // filtro em lote (inativas/mortas saltam; uma leitura para o lote)
  __limparInexistentes()
  m.linhas.set(NOVA, t + 3600_000)
  const antes = m.cont.ler
  const vivos = await filtrarContasExistentes([VIVA, NOVA, MORTAS[0], null, '', VIVA], t)
  assert.deepEqual(vivos, [VIVA]); n++
  ok(m.cont.ler === antes + 1, 'lote: uma só leitura à base')

  // ── travão de quota: fundo salta contas marcadas; estrangulamento não encurta a marca ──
  const bloqueios: Array<{ ids: string[]; api: string | null }> = []
  const lojaQuota = {
    async lerBloqueios() { return new Map<string, number>() },
    async bloquear(ids: string[], _ate: number, api: string | null) { bloqueios.push({ ids, api }) },
  } as unknown as LojaMetaApi
  __definirLoja(lojaQuota)
  __limparQuota()
  ok(await emSegundoPlano(() => leituraDeFundoBloqueada(MORTAS[1], t)), 'fundo: conta morta bloqueada')
  ok(!(await emSegundoPlano(() => leituraDeFundoBloqueada(VIVA, t))), 'fundo: conta viva lê')
  ok(await registarErroQuota(MORTAS[2], estrangulado, t), 'estrangulamento registado')
  ok(bloqueios.length === 1 && bloqueios[0].api === 'contas_inexistentes', 'motivo gravado como contas_inexistentes')
  ok(!bloqueios[0].ids.includes(MORTAS[2]) && bloqueios[0].ids.includes('*'), 'marca de 24 h da conta não é encurtada; pausa global sim')

  // ── (b/d) linhas inativas / desligadas / mortas não vão à MetaApi (nem com token) ──
  process.env.METAAPI_TOKEN = 'teste-sem-rede'
  const { attachConnectionBalances } = await import('../connection-balances')
  const linhas = await attachConnectionBalances([
    { metaapi_account_id: MORTAS[0], mt5_status: 'connected', is_active: false },
    { metaapi_account_id: MORTAS[1], mt5_status: 'connected', is_active: true },
    { metaapi_account_id: VIVA, mt5_status: 'disconnected', is_active: true },
    { metaapi_account_id: VIVA, mt5_status: 'connected', is_active: false },
  ])
  ok(linhas.every((l) => l.account_balance === null), 'saldos: inativas, desligadas e mortas saltadas (sem pedidos)')

  // ── ordem para conta morta: erro claro, sem tentar ──
  const { placeOrdersSequential, readOpenPositions } = await import('../metaapi')
  const [r] = await placeOrdersSequential(MORTAS[3], [{ accountId: MORTAS[3], symbol: 'XAUUSD', direction: 'buy', volume: 0.01 } as never])
  ok(!r.success && /não existe/.test(String(r.error)), `ordem recusada com erro claro: ${r.error}`)
  ok((await emSegundoPlano(() => readOpenPositions(MORTAS[4]))) === null, 'leitura de fundo de conta morta: null')
  ok(new ContaInexistenteError('x').name === 'ContaInexistenteError', 'nome do erro')

  // ── 2. erro de quota antigo → histórico ──
  const quota = 'The ws:getSymbols API allows 4320000 cpu credits per 6h'
  const e1 = estadoDoUltimoErro(quota, [
    { status: 'error', created_at: '2026-09-15T10:45:00Z' },
    { status: 'executed', created_at: '2026-09-15T14:00:00Z' },
  ])
  ok(e1.last_error_historico && e1.last_error_em === '2026-09-15T10:45:00.000Z', 'quota com sucesso depois = histórico com data')
  ok(!estadoDoUltimoErro(quota, [{ status: 'executed', created_at: '2026-09-15T09:00:00Z' }, { status: 'error', created_at: '2026-09-15T10:45:00Z' }]).last_error_historico, 'quota sem sucesso depois = atual')
  ok(!estadoDoUltimoErro('Invalid account credentials', [{ status: 'error', created_at: '2026-09-15T10:00:00Z' }, { status: 'executed', created_at: '2026-09-15T14:00:00Z' }]).last_error_historico, 'erro da conta nunca vira histórico')
  ok(estadoDoUltimoErro(quota, [], '2026-09-15T12:00:00Z', '2026-09-15T11:00:00Z').last_error_historico, 'sem logs: last_signal_at > updated_at = histórico')

  console.log(`contas-inexistentes: ${n} verificações OK`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

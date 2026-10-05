/**
 * UMA ORDEM, UMA LEITURA DE `mtm_trading_accounts` — a guarda.
 *
 * O levantamento de 05/10 contou a MESMA linha da conta lida 4–5 vezes por ordem a mercado
 * (autorizar, pausa, base global da trava, dia negociado, releitura final) e, a seguir, um GET
 * inteiro feito pelo cliente (mais ~11 consultas e uma chamada ao Auth). Esta guarda prova:
 *
 *  1. CASO MAU: a pausa e a trava do tipo decidem pela LINHA que receberam e não voltam à base —
 *     corre-se SEM credenciais (qualquer leitura rebentava com «supabaseKey is required»), por isso
 *     chegar ao veredicto prova que não houve leitura.
 *  2. A base global que veio na linha é a que a trava usa (9 000 na linha ≠ saldo_inicial 10 000).
 *  3. A resposta de uma ordem aplica-se ao ecrã sem GET inteiro — excepto nos fechos, que mudam o
 *     histórico (aí aplica-se a leve E pede-se o inteiro).
 *  4. Pelo código: `abrirPosicao`/`criarPendente` passam a LINHA à pausa (não o id), a rota não
 *     relê a conta fora do ramo dos fechos, e o cliente aplica `estado` em vez de reler.
 *
 *   npx tsx lib/mtmfunded/__tests__/ordem-uma-leitura.check.ts
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Sem chave de serviço: uma leitura à base, por engano, falha alto em vez de passar em silêncio.
delete process.env.SUPABASE_SERVICE_ROLE_KEY

let n = 0
const teste = async (nome: string, f: () => Promise<void> | void) => { await f(); n++; console.log(`  ok  ${nome}`) }
const raiz = path.resolve(__dirname, '..', '..', '..')
const ler = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8')

async function main() {
  console.log('\nORDEM COM UMA LEITURA DA CONTA\n')

  await teste('a pausa decide pela linha — sem ir à base (caso mau: em pausa recusa)', async () => {
    const { exigirSemPausa, ContaEmPausa } = await import('../simulado/pausa')
    await exigirSemPausa({ id: 'x', pausada_em: null, pausa_motivo: null })
    await assert.rejects(
      exigirSemPausa({ id: 'x', pausada_em: '2026-10-05T10:00:00Z', pausa_motivo: 'auditoria' }),
      (e: unknown) => e instanceof ContaEmPausa && /auditoria/.test((e as Error).message),
    )
  })

  await teste('a trava do tipo usa a base global da linha — sem ir à base por ela', async () => {
    const { veredictoDoTipo } = await import('../simulado/travas-tipo')
    const conta = {
      id: '00000000-0000-0000-0000-000000000001', tipo: 'financiada', motor: 'sim',
      saldo_inicial: 10000, sim_saldo: 9500, sim_equity: 9500, sim_ancora_dia: 9500, travas_base_global: 9000,
    }
    const v = await veredictoDoTipo(conta, { equity: 9500 })
    // Global medida contra 9 000 (a linha), não contra 10 000 (saldo_inicial): 9 500 está ACIMA da base.
    assert.ok(v.global, 'a financiada tem medida global')
    assert.equal(v.global!.base, 9000, 'a base da global é a da linha')
    assert.equal(v.global!.usado, 0, '9 500 acima de 9 000: nada usado (contra 10 000 seriam 500)')
    // Caso mau: sem a chave na linha teria de ir à base — e aqui isso rebenta (sem credenciais).
    const { travas_base_global: _b, ...semChave } = conta
    void _b
    await assert.rejects(veredictoDoTipo(semChave, { equity: 9500 }), 'sem a chave na linha, volta à base — e sem credenciais falha')
  })

  await teste('a resposta da ordem aplica-se ao ecrã; só os fechos pedem o inteiro', async () => {
    const { aplicarEstadoDaOrdem, assinaturaEstado } = await import('../../../components/funded/estado-leve')
    type E = { estado: { saldo: number }; posicoes: Array<{ id: string; volume: number }>; ordens: Array<{ id: string }>; historico: unknown; desempenho: unknown }
    const anterior: E = { estado: { saldo: 10000 }, posicoes: [], ordens: [], historico: ['h1'], desempenho: { x: 1 } }
    const leve: E = { estado: { saldo: 9999.3 }, posicoes: [{ id: 'p1', volume: 0.1 }], ordens: [], historico: [], desempenho: null }
    const cheio = { em: 100, assinatura: assinaturaEstado(anterior) }
    const a = aplicarEstadoDaOrdem(leve, 'abrir', anterior, cheio, 5000)
    assert.equal(a.pedirInteiro, false, 'abrir não precisa do GET inteiro')
    assert.deepEqual(a.estado!.historico, ['h1'], 'o histórico que havia fica')
    assert.equal(a.estado!.estado.saldo, 9999.3)
    assert.equal(a.ultimoCheio!.assinatura, assinaturaEstado(leve), 'a assinatura avança (senão a sondagem seguinte pedia o inteiro)')
    assert.equal(a.ultimoCheio!.em, 100, 'o relógio do inteiro de segurança não avança')
    const f = aplicarEstadoDaOrdem(leve, 'fechar', anterior, cheio, 5000)
    assert.equal(f.pedirInteiro, true, 'fechar muda o histórico: pede o inteiro')
    assert.ok(f.estado, 'mas aplica já a leve, para o ecrã não esperar')
    assert.equal(aplicarEstadoDaOrdem(undefined, 'abrir', anterior, cheio, 5000).pedirInteiro, true, 'servidor antigo sem `estado`: como dantes')
    assert.equal(aplicarEstadoDaOrdem(leve, 'abrir', null, null, 5000).pedirInteiro, true, 'sem estado anterior não há a que juntar')
  })

  await teste('pelo código: a linha passa de mão em mão', () => {
    const ex = ler('lib/mtmfunded/simulado/execucao.ts')
    assert.doesNotMatch(ex, /exigirContaSemPausa\(conta\.id\)/, 'a pausa recebe a linha, não o id')
    assert.match(ex, /marcarDiaNegociado\(conta\.id, conta\)/, 'o dia negociado parte da linha que já se tinha')
    assert.match(ex, /COLUNAS_PAUSA_E_TRAVA/, 'as colunas da pausa e da trava vêm na leitura da conta')
    const rota = ler('app/api/mtmfunded/simulado/ordens/route.ts')
    const post = rota.slice(rota.indexOf('export async function POST'))
    assert.equal((post.match(/lerConta\(/g) ?? []).length, 1, 'a rota só relê a conta uma vez, e só nos fechos')
    assert.match(post, /MUDA_SALDO_NA_BASE\.has\(accao\)/)
    assert.match(post, /estadoCompleto\(linha, modo, \{ leve: true/, 'a resposta traz o estado leve')
    const cliente = ler('components/funded/funded-trader.tsx')
    assert.match(cliente, /aplicarEstadoDaOrdem\(r\.estado, accao/, 'o cliente aplica a resposta')
    assert.doesNotMatch(cliente, /const r = await ordem\([^\n]*\n\s*void recarregar\(\)/, 'e não relê cegamente depois de cada ordem')
  })

  console.log(`\n${n} testes ok\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })

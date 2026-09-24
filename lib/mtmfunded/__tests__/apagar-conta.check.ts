import assert from 'node:assert/strict'
import {
  PALAVRA_SEM_LOGIN, confirmacaoApagarValida, decidirApagarConta, refsDaConta,
  type DadosPendurados,
} from '../apagar-conta'

/**
 * Apagar uma conta MTM FUNDED (24/09): o que bloqueia, o que arrasta e o que fica.
 * Correr: npx tsx lib/mtmfunded/__tests__/apagar-conta.check.ts
 */

const ID = 'AAAAAAAA-1111-4111-8111-111111111111'

// ── as referências com que a conta aparece fora da sua tabela ─────────────────────────────────
{
  const r = refsDaConta(ID)
  assert.equal(r.chaveFisica, 'mtmfunded:aaaaaaaa-1111-4111-8111-111111111111', 'sempre em minúsculas')
  assert.equal(r.ref, 'funded:aaaaaaaa-1111-4111-8111-111111111111')
  // A mesma chave que lib/copia-contas/regras.ts::chaveFisica grava e lib/mestres/planear.ts lê.
  assert.equal(refsDaConta(ID.toLowerCase()).chaveFisica, r.chaveFisica, 'a caixa do id não muda a chave')
}

/** Uma conta de torneio banal: simulada, parada, sem nada pendurado. */
function base(): DadosPendurados {
  return {
    conta: {
      id: ID, login: '77123456', tipo: 'torneio', estado: 'expirada', motor: 'sim',
      contaRealDaCasa: false, metaapiAccountId: null, saldo: 0, saldoInicial: 10_000,
    },
    abertas: 0, pendentes: 0, fechadas: 0,
    mestreDe: [], providerDe: [], levantamentosAbertos: 0,
    rotas: [], mestresContas: 0, ligacoesT2T: 0, contasMtmAuto: 0, subscricoes: 0,
    certificados: 0, participacoes: 0, compras: 0,
  }
}

// ── o caso simples: apaga-se, sem arrastar nada ───────────────────────────────────────────────
{
  const d = decidirApagarConta(base())
  assert.equal(d.pode, true)
  assert.deepEqual(d.bloqueios, [])
  assert.deepEqual(d.arrasta, [])
  assert.deepEqual(d.avisos, [])
  assert.equal(d.confirmacaoEsperada, '77123456', 'destranca-se escrevendo o login')
}

// ── BLOQUEIOS: cada um recusa sozinho ─────────────────────────────────────────────────────────
{
  const caso = (patch: Partial<DadosPendurados> | ((d: DadosPendurados) => void), esperado: RegExp) => {
    const d = base()
    if (typeof patch === 'function') patch(d)
    else Object.assign(d, patch)
    const r = decidirApagarConta(d)
    assert.equal(r.pode, false, `devia recusar: ${esperado}`)
    assert.ok(r.bloqueios.some((b) => esperado.test(b)), `sem a explicação ${esperado}: ${r.bloqueios.join(' | ')}`)
    return r
  }

  // A conta real da casa (109) e o tipo «real» (dinheiro do cliente) nunca saem por um botão.
  caso((d) => { d.conta.contaRealDaCasa = true }, /REAL da casa/)
  caso((d) => { d.conta.tipo = 'real' }, /dinheiro do cliente/)

  // Mestre de uma estratégia: a base recusava na mesma (FK NO ACTION) — aqui diz-se porquê antes.
  const mestre = caso({ mestreDe: ['sensei', 'premium-ouro'] }, /MESTRE de sensei, premium-ouro/)
  assert.equal(mestre.arrasta.length, 0, 'com bloqueio não se promete apagar nada')

  caso({ providerDe: ['aurum-flow'] }, /aurum-flow/)

  // É ORIGEM de rotas: há gente a copiar desta conta. Foi o que deixou órfãos a 23/09.
  const origem = caso({
    rotas: [
      { id: 'r1', origem: true, ativa: true, modo: 'live' },
      { id: 'r2', origem: true, ativa: false, modo: 'sombra' },
    ],
  }, /ORIGEM de 2 rotas de cópia \(1 em LIVE\)/)
  assert.equal(origem.pode, false)

  // Posições por fechar (a mesma regra do fechar_conta/marcar_breach).
  caso({ abertas: 3, pendentes: 1 }, /3 posições abertas e 1 ordem pendente/)
  caso({ abertas: 1, pendentes: 0 }, /1 posição aberta e 0 ordens pendentes/)
  // Numa conta da corretora as posições não se contam aqui — quem manda nelas é a corretora.
  {
    const d = base()
    d.conta.motor = 'metaapi'
    d.abertas = 5
    assert.equal(decidirApagarConta(d).pode, true, 'motor≠sim: as posições não bloqueiam')
  }

  // Dinheiro a meio caminho.
  caso({ levantamentosAbertos: 1 }, /1 levantamento por fechar/)

  // Vários ao mesmo tempo: dizem-se TODOS, para não se resolver um e voltar a bater no seguinte.
  const d = base()
  d.mestreDe = ['sensei']
  d.levantamentosAbertos = 2
  d.abertas = 1
  const r = decidirApagarConta(d)
  assert.equal(r.bloqueios.length, 3)
}

// ── ARRASTA: o que desaparece junto, com contagem ─────────────────────────────────────────────
{
  const d = base()
  d.fechadas = 412
  d.ligacoesT2T = 1
  d.contasMtmAuto = 1
  d.subscricoes = 2
  d.mestresContas = 1
  d.rotas = [
    { id: 'r1', origem: false, ativa: true, modo: 'live' },
    { id: 'r2', origem: false, ativa: false, modo: 'sombra' },
  ]
  const r = decidirApagarConta(d)
  assert.equal(r.pode, true, 'ser DESTINO de rotas não bloqueia — as rotas vão com a conta')
  const porTabela = Object.fromEntries(r.arrasta.map((a) => [a.tabela, a.quantas]))
  assert.deepEqual(porTabela, {
    funded_positions: 412,
    mtmcopy_connections: 1,
    mtmauto_accounts: 1,
    mtmauto_subscriptions: 2,
    copia_rotas: 2,
    mestres_contas: 1,
  })
  assert.ok(r.arrasta.every((a) => a.nota.length > 10), 'cada linha diz o que é, em português')
  // Zero não aparece no diálogo: uma lista cheia de «0 linhas» esconde o que importa.
  assert.equal(decidirApagarConta(base()).arrasta.length, 0)
}

// ── AVISOS: o que FICA (e a MetaApi, que não se toca) ─────────────────────────────────────────
{
  const d = base()
  d.conta.metaapiAccountId = 'ac351c88-0000-0000-0000-000000000000'
  d.conta.saldo = 10_512.5
  d.certificados = 1
  d.participacoes = 1
  d.compras = 2
  const r = decidirApagarConta(d)
  assert.equal(r.pode, true)
  assert.ok(r.avisos.some((a) => /MetaApi NÃO é tocada/.test(a)), 'a conta na corretora fica lá, e diz-se')
  assert.ok(r.avisos.some((a) => /certificado fica/.test(a)))
  assert.ok(r.avisos.some((a) => /participação de torneio fica/.test(a)))
  assert.ok(r.avisos.some((a) => /2 compras ficam/.test(a)))
  // O separador de milhares do pt-PT é um espaço fino, não o espaço normal — daí o `\s`.
  assert.ok(r.avisos.some((a) => /10\s512,5 USD desaparece/.test(a)), `saldo no aviso: ${r.avisos.join(' | ')}`)
  // Saldo zero não gera aviso de saldo.
  assert.equal(decidirApagarConta(base()).avisos.length, 0)
}

// ── a confirmação escrita ─────────────────────────────────────────────────────────────────────
{
  assert.equal(confirmacaoApagarValida('77123456', '77123456'), true)
  assert.equal(confirmacaoApagarValida('  77123456  ', '77123456'), true, 'espaços das pontas não contam')
  assert.equal(confirmacaoApagarValida('7712345', '77123456'), false, 'um dígito a menos não destranca')
  assert.equal(confirmacaoApagarValida('', '77123456'), false)
  assert.equal(confirmacaoApagarValida(undefined, '77123456'), false)
  assert.equal(confirmacaoApagarValida(77123456, '77123456'), false, 'número não é o texto escrito')
  assert.equal(confirmacaoApagarValida('sim', '77123456'), false)
  // Conta por emitir (sem login): escreve-se a palavra.
  assert.equal(confirmacaoApagarValida(PALAVRA_SEM_LOGIN, null), true)
  assert.equal(confirmacaoApagarValida('apagar', null), false, 'a palavra é em maiúsculas')
  assert.equal(confirmacaoApagarValida('', ''), false)
  assert.equal(decidirApagarConta((() => { const d = base(); d.conta.login = null; return d })()).confirmacaoEsperada, '')
}

console.log('  ok  apagar conta MTM Funded: bloqueios, o que arrasta, o que fica e a confirmação')

/**
 * AS BIBLIOTECAS PARTILHADAS DAS ESTRATÉGIAS — o modelo do cartão (o que os dois ecrãs desenham)
 * e as opções de admin (o que os dois admins escrevem). Puras: sem base, sem rede.
 *
 *   npx tsx lib/estrategias-admin/__tests__/estrategias-partilhadas.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BE_GATILHO_MAX, CAMPOS_OPCOES, CHAVES_OPCOES, diferencasOpcoes, lerOpcoes, lerSimbolos, normalizarOpcoes, textoDiferenca,
} from '../opcoes'
import {
  agruparEstrategias, alvosDoCartao, contasFundedDoCartao, estadoDeSeguir, etiquetaRisco, iniciais, pt, resumoDoCartao,
  riscoPctValido, temHistorico, CHAVE_ESTADO, CHAVE_GRUPO, GRUPOS, TEXTO_PT,
} from '../../mtmauto/cartao-estrategia'

const casos: { nome: string; f: () => void }[] = []
const caso = (nome: string, f: () => void) => casos.push({ nome, f })

// ── cartão ──────────────────────────────────────────────────────────────────────────────────

caso('seguir e copiar automaticamente são estados diferentes', () => {
  assert.equal(estadoDeSeguir({ segue: true, autoAceitar: true }), 'automatico')
  assert.equal(estadoDeSeguir({ segue: true, autoAceitar: false }), 'manual')
  assert.equal(estadoDeSeguir({ segue: false }), 'parado')
  // auto-aceitar sem seguir gravado continua a ser automático: é o que abre trades.
  assert.equal(estadoDeSeguir({ segue: false, autoAceitar: true }), 'automatico')
})

caso('os três grupos, pela mesma ordem nos dois ecrãs', () => {
  const xs = [
    { id: 'a', segue: false, autoAceitar: false },
    { id: 'b', segue: true, autoAceitar: true },
    { id: 'c', segue: true, autoAceitar: false },
    { id: 'd', segue: true, autoAceitar: false },
  ]
  const g = agruparEstrategias(xs)
  assert.deepEqual(g.automaticas.map((x) => x.id), ['b'])
  assert.deepEqual(g.aSeguir.map((x) => x.id), ['c', 'd'])
  assert.deepEqual(g.disponiveis.map((x) => x.id), ['a'])
  assert.deepEqual(GRUPOS, ['automaticas', 'aSeguir', 'disponiveis'])
  // nenhuma estratégia se perde nem aparece duas vezes
  assert.equal(g.automaticas.length + g.aSeguir.length + g.disponiveis.length, xs.length)
})

caso('todas as chaves de estado e de grupo têm texto em português', () => {
  for (const k of Object.values(CHAVE_ESTADO)) assert.ok(TEXTO_PT[k], `falta ${k}`)
  for (const k of Object.values(CHAVE_GRUPO)) assert.ok(TEXTO_PT[k], `falta ${k}`)
  assert.equal(pt('estrategias.naoSegue'), 'Não segues')
  assert.equal(pt('nao.existe'), 'nao.existe')
})

caso('risco: só a percentagem mostra número, e só dentro dos limites da rota', () => {
  assert.deepEqual(etiquetaRisco({ modoRisco: 'percent', riscoPct: 1.5 }), { chave: 'risco.percent', pct: 1.5 })
  assert.deepEqual(etiquetaRisco({ modoRisco: 'lote', riscoPct: 3 }), { chave: 'risco.lote', pct: null })
  assert.deepEqual(etiquetaRisco(null), { chave: 'risco.conta', pct: null })
  // «percent» sem número não é percentagem nenhuma: cai no risco da conta em vez de mentir.
  assert.deepEqual(etiquetaRisco({ modoRisco: 'percent', riscoPct: null }), { chave: 'risco.conta', pct: null })
  assert.ok(riscoPctValido(0.1) && riscoPctValido(5))
  assert.ok(!riscoPctValido(0.05) && !riscoPctValido(5.1) && !riscoPctValido('x'))
})

caso('sem histórico medido não há alvos nem percentagem inventada', () => {
  const semHist = { id: '1', winrate: null, fechados: 0, tp1: 4, sl: 2 }
  assert.equal(temHistorico(semHist), false)
  assert.deepEqual(alvosDoCartao(semHist), [])
  assert.match(resumoDoCartao(semHist), /Sem histórico/)

  const com = { id: '1', winrate: 71.4, fechados: 7, tp1: 4, tp2: 2, tp3: 0, sl: 1 }
  assert.equal(temHistorico(com), true)
  assert.deepEqual(alvosDoCartao(com), [
    { rotulo: 'TP1', n: 4, perda: false },
    { rotulo: 'TP2', n: 2, perda: false },
    { rotulo: 'SL', n: 1, perda: true },
  ])
  assert.equal(resumoDoCartao(com), '71,4% de acerto · 7 trades')
})

caso('contas MTM Funded: o fio do cartão para quem a segue', () => {
  assert.deepEqual(contasFundedDoCartao({ id: '1', contasMtmFunded: [{ id: 'c1', rotulo: 'Edge 10K' }, { id: '', rotulo: 'x' }] } as never), [
    { id: 'c1', rotulo: 'Edge 10K' },
  ])
  assert.deepEqual(contasFundedDoCartao({ id: '1' }), [])
})

caso('iniciais', () => {
  assert.equal(iniciais('MTM Auto Edge'), 'MA')
  assert.equal(iniciais('Sensei'), 'SE')
  assert.equal(iniciais(''), '')
})

// ── opções de admin ─────────────────────────────────────────────────────────────────────────

caso('um campo que não vem no pedido MANTÉM o que estava', () => {
  const antes = { ativo: true, espelhar: true, sl_minimo_pips: 12, risco_default_pct: 1 }
  const r = normalizarOpcoes({ ativo: false }, antes)
  assert.ok(r.ok)
  // só o que foi pedido mudou — o resto ficou igual (apagar afinações sem ninguém pedir é como
  // um mínimo de stop desaparece e a estratégia deixa de abrir)
  assert.equal(r.opcoes.ativo, false)
  assert.equal(r.opcoes.espelhar, true)
  assert.equal(r.opcoes.sl_minimo_pips, 12)
  assert.equal(r.opcoes.risco_default_pct, 1)
})

caso('vazio explícito apaga; fora dos limites recusa com o nome do campo', () => {
  const r = normalizarOpcoes({ sl_minimo_pips: '' }, { sl_minimo_pips: 12 })
  assert.ok(r.ok)
  assert.equal(r.opcoes.sl_minimo_pips, null)

  const mau = normalizarOpcoes({ risco_default_pct: -1, be_gatilho: 9 }, {})
  assert.ok(!mau.ok)
  assert.equal(mau.erros.length, 2)
  assert.match(mau.erros[0]!.erro, /Risco por omissão/)
  assert.match(mau.erros[1]!.erro, new RegExp(String(BE_GATILHO_MAX)))
})

caso('o break-even é um alvo inteiro', () => {
  const r = normalizarOpcoes({ be_gatilho: 1.6 }, {})
  assert.ok(r.ok)
  assert.equal(r.opcoes.be_gatilho, 2)
})

caso('símbolos: maiúsculas, sem espaços, e vazio é «tudo»', () => {
  assert.deepEqual(lerSimbolos('xauusd, btcusd '), ['XAUUSD', 'BTCUSD'])
  assert.deepEqual(lerSimbolos(['eurusd']), ['EURUSD'])
  assert.equal(lerSimbolos(' , '), null)
  assert.equal(lerSimbolos(null), null)
})

caso('as diferenças dizem o que foi gravado', () => {
  const antes = lerOpcoes({ ativo: true, espelhar: false, sl_minimo_pips: 10 })
  const r = normalizarOpcoes({ espelhar: true, simbolos_permitidos: 'xauusd' }, { ativo: true, espelhar: false, sl_minimo_pips: 10 })
  assert.ok(r.ok)
  const d = diferencasOpcoes(antes, r.opcoes)
  assert.deepEqual(d.map((x) => x.campo).sort(), ['espelhar', 'simbolos_permitidos'])
  assert.equal(textoDiferenca(d.find((x) => x.campo === 'espelhar')!), 'A executar (espelhar): não → sim')
})

caso('cada campo descrito tem chave única e os números têm limites', () => {
  assert.equal(new Set(CHAVES_OPCOES).size, CAMPOS_OPCOES.length)
  for (const c of CAMPOS_OPCOES) {
    assert.ok(c.rotulo && c.nota, `${c.chave} sem rótulo/nota`)
    if (c.tipo === 'numero') assert.ok(c.min != null && c.max != null, `${c.chave} sem limites`)
  }
})

caso('nenhum campo de CONTA passa por aqui (essas têm rotas próprias)', () => {
  // login, servidor, conta MTM Funded, TradeLocker, chave da equipa e a fonte de execução
  // escrevem-se pelas rotas de ligação — uma segunda porta saltava as verificações delas.
  const proibidos = ['metaapi_account_id', 'login', 'servidor', 'funded_account_id', 'tl_acc_num', 'fonte_execucao', 'tenant_id', 'slug']
  for (const p of proibidos) assert.ok(!(CHAVES_OPCOES as string[]).includes(p), `${p} não devia estar nas opções`)
  const r = normalizarOpcoes({ metaapi_account_id: 'xpto', fonte_execucao: 'espelho' }, {})
  assert.ok(r.ok)
  assert.ok(!Object.prototype.hasOwnProperty.call(r.opcoes, 'metaapi_account_id'))
  assert.ok(!Object.prototype.hasOwnProperty.call(r.opcoes, 'fonte_execucao'))
})

// ── as duas cópias ──────────────────────────────────────────────────────────────────────────

caso('os ficheiros partilhados avisam que existem iguais nos dois repositórios', () => {
  const raiz = join(__dirname, '..', '..', '..')
  for (const f of ['lib/mtmauto/cartao-estrategia.ts', 'lib/estrategias-admin/opcoes.ts', 'lib/mestres/pedidos.ts']) {
    const t = readFileSync(join(raiz, f), 'utf8')
    assert.match(t, /IGUAL nos dois repositórios/, `${f} sem o aviso da cópia`)
  }
})

let falhas = 0
for (const c of casos) {
  try {
    c.f()
    console.log(`✓ ${c.nome}`)
  } catch (e) {
    falhas++
    console.error(`✗ ${c.nome}\n  ${e instanceof Error ? e.message : String(e)}`)
  }
}
console.log(`\nestratégias partilhadas: ${casos.length - falhas}/${casos.length}`)
process.exit(falhas ? 1 : 0)

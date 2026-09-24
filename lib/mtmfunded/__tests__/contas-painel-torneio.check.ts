import assert from 'node:assert/strict'
import { contarPorTipo, ehContaMestre, filtrarEntradas, temDoisTipos } from '../../webtrader/filtro-contas'

/**
 * O FILTRO DAS CONTAS NO PAINEL DO TORNEIO (pedido do dono, 24/09).
 *
 * A regra é a do seletor do WebTrader e não se duplica — o que este ficheiro prende é o CONTRATO
 * entre os dois: que os tipos com que este painel trabalha (`mtm_trading_accounts.tipo`) caem do
 * lado certo, e que as duas garantias do ecrã se mantêm com o vocabulário daqui.
 *
 * Se alguém um dia mudar «mestre» para outra coisa (conta_casa, provider_slug…), é aqui que se vê
 * que o painel do torneio passa a mostrar sete contas da casa ao dono outra vez.
 *
 * Correr: npx tsx lib/mtmfunded/__tests__/contas-painel-torneio.check.ts
 */

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

/** Uma conta como o painel a recebe (page.tsx decide `mestre` com `ehContaMestre`). */
const conta = (id: string, tipo: string) => ({ id, tipo, mestre: ehContaMestre({ tipo }) })
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id)

function main() {
  // ── os tipos deste painel caem do lado certo ──────────────────────────────
  caso('das sete contas das estratégias, só as `provider` são mestre', () => {
    assert.equal(conta('m', 'provider').mestre, true)
    for (const tipo of ['torneio', 'desafio', 'financiada', 'real']) {
      assert.equal(conta('x', tipo).mestre, false, `«${tipo}» é da pessoa, não é mestre`)
    }
  })

  /** A lista do dono: as dele misturadas com as sete mestres das estratégias. */
  const doDono = [
    conta('t1', 'torneio'), conta('f1', 'financiada'),
    ...['premium-ouro', 'sensei', 'aurum-flow', 'goldkiller', 'edge', 'king', 'wolf']
      .map((s, i) => conta(`m${i}`, 'provider')),
  ]

  caso('por omissão («As minhas») as sete mestres saem da frente', () => {
    assert.deepEqual(ids(filtrarEntradas(doDono, 'minhas')), ['t1', 'f1'])
  })
  caso('«Mestres» mostra as sete da casa, «Todas» mostra as nove', () => {
    assert.equal(filtrarEntradas(doDono, 'mestres').length, 7)
    assert.equal(filtrarEntradas(doDono, 'todas').length, 9)
  })
  caso('os números dos botões: As minhas 2 · Mestres 7 · Todas 9', () => {
    assert.deepEqual(contarPorTipo(doDono), { minhas: 2, mestres: 7, todas: 9 })
  })

  // ── a conta que o email abriu nunca desaparece ────────────────────────────
  caso('a conta do link do email fica à vista, seja ela qual for', () => {
    // `?conta=<id>&credenciais=1` promete as credenciais daquela conta: o filtro não desmente um email.
    assert.ok(ids(filtrarEntradas(doDono, 'minhas', 'm3')).includes('m3'))
    assert.ok(ids(filtrarEntradas(doDono, 'mestres', 't1')).includes('t1'))
    // E fica no LUGAR dela, sem saltar para o topo.
    assert.deepEqual(ids(filtrarEntradas(doDono, 'minhas', 'm0')), ['t1', 'f1', 'm0'])
  })

  // ── a barra só aparece a quem tem dos dois tipos ──────────────────────────
  caso('um participante de torneio não vê barra de filtro nenhuma', () => {
    const participante = [conta('t1', 'torneio')]
    assert.equal(temDoisTipos(participante), false)
    // E um filtro guardado de outros tempos não lhe esconde a única conta que tem.
    assert.deepEqual(ids(filtrarEntradas(participante, 'mestres')), ['t1'])
  })
  caso('o dono vê a barra', () => {
    assert.equal(temDoisTipos(doDono), true)
  })

  console.log(`\ncontas do painel do torneio: ${n} verificações certas`)
}

main()

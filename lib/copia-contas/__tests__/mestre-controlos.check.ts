/**
 * O REGISTO DOS CONTROLOS DA MESTRE — a guarda que impede o ecrã de mentir.
 *
 * O defeito de 29/09 não foi um campo errado: foi um campo que o painel mostrava como se funcionasse.
 * `sl_minimo_pips = 100` no GoldKiller, lido por motor nenhum. A correcção não é lembrar-se — é esta
 * guarda: um controlo só se pode dizer `'aplicado'` se apontar para o ficheiro que o lê.
 *
 * Sem isto, o registo de honestidade envelhece exactamente como envelheceu o aviso «IGUAL nos dois
 * repositórios» que nunca comparou conteúdo nenhum e passou verde um dia inteiro.
 *
 *   npx tsx lib/copia-contas/__tests__/mestre-controlos.check.ts
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CONTROLOS_MESTRE, GRUPOS, contarPorEstado, controlosDoGrupo, protege } from '../mestre-controlos'

const RAIZ = join(__dirname, '..', '..', '..')
let n = 0
const teste = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

console.log('\nREGISTO DOS CONTROLOS DA MESTRE\n')

teste('nenhum controlo se diz APLICADO sem apontar para um motor', () => {
  for (const c of CONTROLOS_MESTRE) {
    if (c.estado === 'aplicado' || c.estado === 'so-sombra') {
      assert.ok(
        c.lidoPor.length > 0,
        `«${c.rotulo}» diz-se «${c.estado}» e não aponta para ficheiro nenhum. Ou se prova quem o lê, ou passa a 'nao-aplicado'.`,
      )
    }
  }
})

teste('os ficheiros apontados EXISTEM (uma referência morta é pior do que nenhuma)', () => {
  const faltam: string[] = []
  for (const c of CONTROLOS_MESTRE) {
    for (const ref of c.lidoPor) {
      // «lib/x.ts:120 → outraCoisa» / «lib/x.ts:foraDaJanela» → o caminho é o que vem antes do : ou do →
      const caminho = ref.split(/[:→(]/)[0].trim()
      if (!caminho.includes('/')) continue
      if (!existsSync(join(RAIZ, caminho))) faltam.push(`${c.chave}: ${caminho}`)
    }
  }
  assert.deepEqual(faltam, [], `referências a ficheiros que não existem:\n${faltam.join('\n')}`)
})

teste('um controlo NÃO APLICADO tem de explicar na nota o que fazer para o ligar', () => {
  for (const c of CONTROLOS_MESTRE.filter((x) => x.estado === 'nao-aplicado')) {
    assert.ok(c.nota.length > 60, `«${c.rotulo}»: a nota é curta demais para explicar porque não funciona.`)
    // «não faz nada» sem dizer o que faz em vez dele é meia informação.
    assert.match(
      c.nota,
      /Quem |quem |em vez|Ligar a sério|NULL|zero leitores|descartad|ZERO/,
      `«${c.rotulo}»: a nota tem de dizer quem faz o trabalho em vez dele (ou que ninguém faz).`,
    )
  }
})

teste('`protege()` só devolve true para o estado aplicado', () => {
  for (const c of CONTROLOS_MESTRE) assert.equal(protege(c), c.estado === 'aplicado')
})

teste('cada controlo pertence a um dos três grupos, e nenhum grupo fica vazio', () => {
  const ids = new Set(GRUPOS.map((g) => g.id))
  for (const c of CONTROLOS_MESTRE) assert.ok(ids.has(c.grupo), `${c.chave}: grupo «${c.grupo}» não existe`)
  for (const g of GRUPOS) assert.ok(controlosDoGrupo(g.id).length > 0, `o grupo «${g.nome}» não tem controlos`)
})

teste('as chaves não se repetem (o ecrã acha o controlo pela chave)', () => {
  const vistas = new Set<string>()
  for (const c of CONTROLOS_MESTRE) {
    assert.ok(!vistas.has(c.chave), `chave repetida: ${c.chave}`)
    vistas.add(c.chave)
  }
})

teste('o registo CONTINUA a admitir controlos não aplicados — não se apaga o que incomoda', () => {
  // Esta é a guarda contra a "correcção" mais tentadora: apagar as linhas vermelhas para o painel
  // ficar verde. As colunas continuam na base e continuam a aparecer no admin das estratégias;
  // esconder o estado delas era voltar ao defeito de 29/09 por outro caminho.
  const c = contarPorEstado()
  assert.ok(c['nao-aplicado'] > 0, 'se já não há controlos não aplicados, foram LIGADOS ou APAGADOS — confirmar qual.')
  assert.ok(c.aplicado > 0, 'sem nenhum controlo aplicado, este painel não protege nada.')
  console.log(`      aplicados ${c.aplicado} · sombra ${c['so-sombra']} · só ecrã ${c['so-ecra']} · NÃO aplicados ${c['nao-aplicado']}`)
})

teste('os controlos das travas apontam para quem as aplica de verdade', () => {
  for (const chave of ['janela', 'fimDeSemana', 'maxDdDiarioPct', 'margemLivreMinPct']) {
    const c = CONTROLOS_MESTRE.find((x) => x.chave === chave)
    assert.ok(c, `falta o controlo ${chave}`)
    assert.equal(c!.estado, 'aplicado', `${chave} devia estar aplicado`)
    assert.ok(
      c!.lidoPor.some((r) => r.includes('sinal-mestre')),
      `${chave}: tem de apontar para lib/mestres/servidor/sinal-mestre.ts, que é quem trava a abertura.`,
    )
  }
})

console.log(`\n${n} verificações ok\n`)

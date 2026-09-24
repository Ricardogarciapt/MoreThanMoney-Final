/**
 * OS FICHEIROS QUE EXISTEM IGUAIS NOS DOIS REPOSITÓRIOS — comparados A SÉRIO.
 *
 * O site e a app MTM Auto não partilham código: repositórios diferentes, sem remote em comum,
 * sem pacote publicado. Um punhado de ficheiros vive nos dois porque a REGRA tem de ser a mesma
 * (o cartão de uma estratégia, as opções do admin, os pedidos às mestres, o texto do Tap to copy,
 * as etiquetas de uma conta). Mudar um obriga a copiar para o outro.
 *
 * ── Porque esta guarda foi reescrita (24/09) ────────────────────────────────────────────────
 * A que existia — em `lib/estrategias-admin/__tests__/estrategias-partilhadas.check.ts` — só
 * verificava que o COMENTÁRIO «IGUAL nos dois repositórios» estava no ficheiro. Nunca comparou
 * conteúdo nenhum. Passou verde um dia inteiro com ~100 commits, e nesse dia a cópia de
 * `lib/mtmfunded/etiquetas.ts` no mtm-auto estava sem o tipo `Real` e sem a pausa: uma conta com
 * dinheiro do cliente aparecia na app etiquetada «F1», como um desafio simulado.
 *
 * Um aviso que ninguém verifica é um aviso que envelhece. Esta compara os corpos.
 *
 * ── O que compara ───────────────────────────────────────────────────────────────────────────
 * O CORPO, não o cabeçalho: cada repositório tem direito a explicar o seu contexto no comentário
 * de topo (o `t2t-copiar.ts` do mtm-auto fá-lo de propósito). Do primeiro `import`/`export` em
 * diante tem de ser igual, carácter a carácter.
 *
 * Em CI o repositório irmão não existe e o teste diz que saltou — em voz alta, para o salto não
 * se confundir com um verde.
 *
 *   npx tsx lib/__tests__/paridade-repositorios.check.ts
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..')
/**
 * Resolvido a partir da HOME e não da raiz deste repositório: isto trabalha-se em worktrees
 * (`/tmp/wt-…`) e um caminho relativo apontava para fora do disco, fazendo o teste saltar sempre.
 */
const MTM_AUTO = process.env.MTM_AUTO_DIR ?? join(homedir(), 'Projetos', 'mtm-auto')

/**
 * As cópias. `mesmoCaminho: false` quando o ficheiro vive noutro sítio do repositório irmão.
 */
const COPIAS: { site: string; auto: string; porque: string }[] = [
  {
    site: 'lib/mtmauto/cartao-estrategia.ts',
    auto: 'lib/mtmauto/cartao-estrategia.ts',
    porque: 'os dois ecrãs de Estratégias desenham o mesmo cartão',
  },
  {
    site: 'lib/mtmauto/desempenho-do-catalogo.ts',
    auto: 'lib/mtmauto/desempenho-do-catalogo.ts',
    porque: 'o histórico de uma estratégia conta-se da mesma maneira nos dois',
  },
  {
    site: 'lib/estrategias-admin/opcoes.ts',
    auto: 'lib/estrategias-admin/opcoes.ts',
    porque: 'os dois admins escrevem as mesmas opções na mesma tabela',
  },
  {
    site: 'lib/mestres/pedidos.ts',
    auto: 'lib/mestres/pedidos.ts',
    porque: 'os pedidos às contas mestre têm um formato só',
  },
  {
    site: 'lib/mtmcopy/t2t-copiar.ts',
    auto: 'lib/t2t-copiar.ts',
    porque: 'o texto do «Tap to copy» tem de dar os mesmos números pela mesma ordem',
  },
  {
    site: 'lib/mtmcopy/t2t-janela-regra.ts',
    auto: 'lib/t2t-janela-regra.ts',
    porque: 'a janela de aceitação decide o botão nos dois ecrãs — e com as mesmas palavras',
  },
  {
    site: 'lib/mtmcopy/rotulos-canais.ts',
    auto: 'lib/rotulos-canais.ts',
    porque: 'o nome de um canal é um só: o do admin, o do chat e o das duas apps',
  },
  {
    site: 'lib/mtmfunded/etiquetas.ts',
    auto: 'lib/mtmfunded/etiquetas.ts',
    porque: 'F1/F2/Funded/Torneio/Real e Active/Pause/… querem dizer o mesmo nos dois',
  },
]

/**
 * O corpo: tudo do primeiro `import`/`export`/`const`/`type` em diante.
 *
 * O cabeçalho fica de fora por ser onde cada repositório explica o seu lado da história — e
 * obrigá-lo a ser igual só ensinaria a copiar o comentário errado.
 */
function corpo(texto: string): string {
  const m = /^(?:import |export |const |type |function |interface |enum )/m.exec(texto)
  assert.ok(m, 'ficheiro sem código a seguir ao cabeçalho')
  return texto.slice(m!.index).trimEnd()
}

/** A primeira linha diferente, para a mensagem dizer ONDE e não só QUE difere. */
function primeiraDiferenca(a: string, b: string): string {
  const la = a.split('\n')
  const lb = b.split('\n')
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      return `  linha ${i + 1} do corpo\n    site: ${la[i] ?? '(acaba aqui)'}\n    auto: ${lb[i] ?? '(acaba aqui)'}`
    }
  }
  return '  (diferença só em espaços no fim)'
}

let falhas = 0
let saltados = 0

if (!existsSync(MTM_AUTO)) {
  console.log(`  ·   SALTADO: o repositório mtm-auto não está em ${MTM_AUTO}`)
  console.log('      (em CI é normal; numa máquina de trabalho aponta MTM_AUTO_DIR)')
  console.log(`\nparidade entre repositórios: ${COPIAS.length} cópias por verificar`)
  process.exit(0)
}

for (const c of COPIAS) {
  const pSite = join(RAIZ, c.site)
  const pAuto = join(MTM_AUTO, c.auto)
  if (!existsSync(pAuto)) {
    saltados++
    console.log(`  ·   ${c.site}\n      o par ${c.auto} não existe no mtm-auto — a cópia foi apagada ou mudou de sítio?`)
    continue
  }
  const a = corpo(readFileSync(pSite, 'utf8'))
  const b = corpo(readFileSync(pAuto, 'utf8'))
  if (a === b) {
    console.log(`  ok  ${c.site}  —  ${c.porque}`)
    continue
  }
  falhas++
  console.error(`  ✗   ${c.site}\n      diverge de ${c.auto} no repo mtm-auto (${c.porque})\n${primeiraDiferenca(a, b)}`)
}

/**
 * O aviso no cabeçalho continua a ser exigido — é o que trava quem abre o ficheiro para mudar
 * uma linha. Aceita-se qualquer das formas que os ficheiros já usam («IGUAL nos dois
 * repositórios», «vive nos dois repositórios», «é o espelho deste ficheiro»): o que interessa é
 * a pessoa ser avisada, não a frase ser a mesma. Quem compara o conteúdo é o bloco de cima.
 */
const AVISA = /nos dois repositórios|espelho/i
for (const c of COPIAS) {
  const t = readFileSync(join(RAIZ, c.site), 'utf8')
  if (!AVISA.test(t)) {
    falhas++
    console.error(`  ✗   ${c.site} não avisa no cabeçalho que existe igual no outro repositório`)
  }
}

if (falhas) {
  console.error(`\nparidade entre repositórios: ${falhas} divergência(s). Copia o ficheiro para o outro lado — não há pacote partilhado que o faça por ti.`)
  process.exit(1)
}
console.log(`\nparidade entre repositórios OK — ${COPIAS.length - saltados}/${COPIAS.length} cópias iguais no corpo`)

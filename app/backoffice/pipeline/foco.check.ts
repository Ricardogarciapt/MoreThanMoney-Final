/**
 * GUARDA do `?negocio=` do pipeline.
 *
 * O que se prova, e porquê cada coisa:
 *
 *  · o que não é um uuid não passa a foco. Este valor vem do endereço e acaba num atributo do ecrã
 *    e numa comparação com ids da base — é o sítio onde se escreve à mão o que se quiser;
 *  · um endereço com dois `negocio=` fica com um. Dois destaques não destacam nada;
 *  · «não há foco» e «há foco e não está nesta página» são resultados DIFERENTES: o segundo tem de
 *    fazer aparecer uma frase no ecrã, senão a pessoa conclui que perdeu o negócio.
 *
 *   npx tsx app/backoffice/pipeline/foco.check.ts
 */
import { lerFoco, situacaoDoFoco } from './foco'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

// ── O que entra do endereço ─────────────────────────────────────────────────
teste('um uuid passa a foco', lerFoco(A) === A)
teste('sem parâmetro não há foco', lerFoco(undefined) === null)
teste('vazio não é um foco', lerFoco('') === null)
teste('uma frase não passa a foco', lerFoco("' or true --") === null)
teste('um id truncado não passa a foco', lerFoco(A.slice(0, 20)) === null)
teste('dois negocio= ficam no primeiro', lerFoco([A, B]) === A)

// ── Onde está o negócio que se veio ver ─────────────────────────────────────
teste('sem foco, não se diz nada', situacaoDoFoco(null, [A, B]) === 'sem-foco')
teste('o negócio da tarefa está à vista', situacaoDoFoco(A, [A, B]) === 'na-pagina')
teste('o negócio da tarefa não está nesta página', situacaoDoFoco(A, [B]) === 'fora-da-pagina')
// Uma página vazia com foco é o caso do filtro apertado que ficou no endereço da visita anterior:
// tem de dizer «não está aqui», não tem de ficar calada.
teste('página vazia com foco avisa', situacaoDoFoco(A, []) === 'fora-da-pagina')

if (falhas.length > 0) {
  console.error('FALHOU:')
  for (const f of falhas) console.error(` · ${f}`)
  process.exit(1)
}
console.log('foco: ok')

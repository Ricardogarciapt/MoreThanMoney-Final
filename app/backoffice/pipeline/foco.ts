/**
 * O NEGÓCIO QUE SE VEIO VER — o `?negocio=<id>` do endereço.
 *
 * PORQUE É QUE ISTO EXISTE
 * «O teu dia» mandava as pessoas para `/backoffice/pipeline?negocio=<id>` e o pipeline lia
 * `estado`, `procura` e `pagina` — mais nada. O link abria a lista toda, no topo, e a pessoa ficava
 * a procurar à mão o negócio de que a tarefa falava. Não dava erro: dava uma página certa com a
 * resposta errada, que é a avaria que ninguém reporta porque não parece avaria.
 *
 * O FOCO NÃO É UM FILTRO, e isso é decisão e não limitação. Filtrar pelo id escondia os outros
 * negócios e tirava o contexto — a pessoa quer ver aquele negócio DENTRO do funil dela, não sozinho
 * num ecrã. Por isso o foco só destaca, e a ordem da lista (mexido há menos tempo primeiro) põe
 * quase sempre no topo o negócio que se acabou de trabalhar.
 *
 * E QUANDO ELE NÃO ESTÁ NESTA PÁGINA diz-se. Um destaque que não aparece em lado nenhum lê-se como
 * «não existe» ou «perdi o acesso» — quando o que se passa é que ele está na página 3, ou fora do
 * filtro que ficou no endereço da visita anterior.
 *
 * Puro de propósito: `npx tsx app/backoffice/pipeline/foco.check.ts`.
 */
import { ehUuid } from '@/lib/backoffice-negocios'

/**
 * O id que veio no endereço, ou nada.
 *
 * Passa por `ehUuid` antes de servir para o que quer que seja: este valor acaba numa comparação com
 * ids da base e num atributo do ecrã, e um endereço é a parte do sistema que qualquer pessoa
 * escreve à mão. Um array (`?negocio=a&negocio=b`) fica no primeiro — dois focos não são um foco.
 */
export function lerFoco(v: string | string[] | undefined): string | null {
  const bruto = Array.isArray(v) ? v[0] : v
  return ehUuid(bruto) ? bruto : null
}

export type SituacaoDoFoco = 'sem-foco' | 'na-pagina' | 'fora-da-pagina'

/**
 * O negócio que se veio ver está à vista?
 *
 * `fora-da-pagina` é o caso que obriga a escrever uma frase no ecrã, e é por isso que não se
 * responde com um booleano: `false` obrigava quem chama a distinguir «não há foco» de «há foco e
 * não está aqui», e essas duas coisas mostram-se de maneiras diferentes.
 */
export function situacaoDoFoco(foco: string | null, idsDaPagina: readonly string[]): SituacaoDoFoco {
  if (!foco) return 'sem-foco'
  return idsDaPagina.includes(foco) ? 'na-pagina' : 'fora-da-pagina'
}

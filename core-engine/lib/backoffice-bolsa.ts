import { PAPEL_DO_ESTADO } from '@/lib/backoffice-dia-regras'
import type { EstadoPipeline } from '@/lib/backoffice-vista'
import { ehEstadoPipeline } from '@/lib/backoffice-vista'
import type { Papel } from '@/lib/backoffice-papeis'

/**
 * A BOLSA DE LEADS — os negócios que não são de ninguém, e como alguém pega neles.
 *
 * O QUE ISTO VEIO RESOLVER
 * Medido a 26/09: 97 negócios no pipeline, ZERO com vendedor atribuído. Como o pipeline filtra por
 * participação, um afiliado ou um setter abria o backoffice e via uma lista vazia — com 91 leads
 * mesmo ali, invisíveis a toda a gente menos ao dono.
 *
 * E havia um impasse: para alguém se pôr como setter num lead, o lead tem de lhe aparecer na
 * lista; e só aparece a quem já lá está. Um negócio sem dono não aparecia a ninguém, logo ninguém
 * se podia atribuir a ele. Ficava invisível para sempre.
 *
 * O dono escolheu a bolsa: quem não tem dono fica à vista de quem trabalha o pipeline, e quem
 * quiser pega. É uma decisão sobre QUEM VÊ O QUÊ, tomada por ele e não por mim — e por isso está
 * escrita aqui, e não escondida num filtro qualquer.
 *
 * O QUE A BOLSA NÃO É
 * Não é a casa aberta. Um negócio que JÁ tem dono continua invisível a quem não participa nele —
 * a bolsa mostra só o que não é de ninguém. E pegar num lead não tira nada a ninguém: a escrita só
 * acontece quando a coluna está vazia.
 */

/** As cinco colunas que dizem quem participa num negócio. */
export const COLUNAS_DE_DONO = [
  'prospector_id',
  'setter_id',
  'closer_id',
  'team_leader_id',
  'afiliado_id',
] as const

export interface DonosDoNegocio {
  prospector_id?: string | null
  setter_id?: string | null
  closer_id?: string | null
  team_leader_id?: string | null
  afiliado_id?: string | null
}

/** Ninguém está inscrito neste negócio? */
export function estaSemDono(n: DonosDoNegocio): boolean {
  return COLUNAS_DE_DONO.every((c) => !n[c])
}

/**
 * O filtro do PostgREST para «não tem dono nenhum».
 *
 * Vai DENTRO do mesmo `or` da participação, e não num `or` à parte. A razão está escrita em
 * `negociosDoAmbito` e é séria: dois `or` no mesmo pedido juntam-se com E mas cada um perde o
 * parêntesis do outro, e o filtro de segurança deixa de ser garantido. Um `and(...)` aninhado
 * dentro do `or` mantém tudo num só.
 */
export const FILTRO_SEM_DONO = `and(${COLUNAS_DE_DONO.map((c) => `${c}.is.null`).join(',')})`

/**
 * QUE PAPEL É QUE ESTA PESSOA ASSUME AO PEGAR NESTE LEAD.
 *
 * Não é «o primeiro papel que ela tem»: é o papel que o MOMENTO do lead pede. Um lead cru precisa
 * de quem abra conversa (prospector); uma reunião marcada precisa de quem feche (closer). Deixar
 * um closer pegar num lead cru como closer enchia a coluna errada — e depois o motor do dia, que
 * decide por estado, atribuía a tarefa a outra pessoa e ficavam dois donos para o mesmo trabalho.
 *
 * Um team leader pega em qualquer coisa: é ele que tapa os buracos quando não há ninguém no papel.
 * É a mesma regra que o motor já usa quando ninguém desempenha o papel necessário.
 *
 * Devolve `null` quando a pessoa não tem papel para aquele momento — e aí não se pega. Recusar é
 * melhor do que inscrever alguém numa coluna que não lhe diz respeito: a coluna é o que manda nas
 * comissões.
 */
export function papelParaPegar(
  estado: string,
  papeisDaPessoa: readonly Papel[],
): Papel | null {
  if (!ehEstadoPipeline(estado)) return null
  const pedido = PAPEL_DO_ESTADO[estado as EstadoPipeline]
  if (!pedido) return null // ganho e perdido não se pegam
  if (papeisDaPessoa.includes(pedido)) return pedido
  if (papeisDaPessoa.includes('team_leader')) return 'team_leader'
  return null
}

/** A coluna onde esse papel se escreve. `afiliado` não é um papel de trabalho no pipeline. */
export const COLUNA_DO_PAPEL_BOLSA: Record<Papel, string | null> = {
  prospector: 'prospector_id',
  setter: 'setter_id',
  closer: 'closer_id',
  team_leader: 'team_leader_id',
  afiliado: null,
}

/**
 * Porque é que esta pessoa não pode pegar neste lead — em palavras que ela entende.
 *
 * Uma recusa sem razão é a forma mais rápida de alguém deixar de tentar. Se o sistema diz «não
 * podes», tem de dizer porquê e o que fazer a seguir.
 */
export function razaoParaNaoPegar(
  estado: string,
  papeisDaPessoa: readonly Papel[],
): string | null {
  if (papelParaPegar(estado, papeisDaPessoa)) return null
  if (!ehEstadoPipeline(estado)) return 'Este negócio está num estado que não se reconhece.'
  const pedido = PAPEL_DO_ESTADO[estado as EstadoPipeline]
  if (!pedido) return 'Este negócio já está fechado — não há nada para pegar.'
  if (!papeisDaPessoa.length) return 'Ainda não tens nenhum papel atribuído. Fala com o Ricardo.'
  return `Este lead está à espera de um ${pedido}, e esse papel não é teu.`
}

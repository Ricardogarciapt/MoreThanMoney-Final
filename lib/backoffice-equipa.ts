/**
 * QUEM LIDERA QUEM — e a razão de este ficheiro ser, hoje, uma lista vazia.
 *
 * O modelo de equipa (a ligação entre um team leader e os seus liderados) está a ser construído no
 * admin, noutra frente. Enquanto não existir, as páginas do backoffice TÊM de decidir o que fazem
 * com um team leader: ou lhe mostram a equipa que não sabem qual é, ou fecham no próprio.
 *
 * Fecham no próprio. E fecham AQUI, num sítio só, por três razões:
 *
 * 1. `ambitoDeLeitura` já foi escrito para isto: sem liderados, o âmbito é `[proprioId]`. A falha
 *    não mostra nada em vez de mostrar tudo. Se cada página adivinhasse a sua própria lista, a que
 *    se esquecesse do filtro abria o dinheiro dos colegas.
 * 2. Quando o modelo aterrar, muda-se UMA função. Nenhuma página precisa de saber que mudou.
 * 3. A pessoa tem de ser avisada. Um team leader que veja um extracto com uma linha só e ninguém
 *    lhe diga porquê conclui que a equipa dele não vendeu nada — que é o contrário da verdade.
 *    É `EQUIPA_POR_CONFIGURAR` que as páginas usam para o dizer com palavras.
 *
 * NÃO SE INVENTA A LIGAÇÃO. Havia dois atalhos à mão — a árvore binária do MLM (`mlm_tree`) e o
 * `team_leader_id` que cada negócio já traz — e os dois estão errados de maneiras diferentes:
 * o patrocinador de alguém na árvore não é o responsável de equipa dele (a colocação faz-se por
 * spillover, não por hierarquia de trabalho), e ler os liderados dos negócios faria a lista
 * depender de quem por acaso já apareceu num negócio — quem lidera alguém que ainda não vendeu
 * não existiria. Uma das duas leituras daria dinheiro de estranhos a ver.
 */
import type { ContextoBackoffice } from '@/lib/backoffice-sessao'

/**
 * Verdadeiro enquanto não houver modelo de equipa. As páginas leem isto para explicarem o vazio
 * em vez de o deixarem parecer um resultado.
 */
export const EQUIPA_POR_CONFIGURAR = true

/** A frase que se diz à pessoa. Uma só, para as quatro páginas dizerem o mesmo. */
export const AVISO_EQUIPA_POR_CONFIGURAR =
  'A composição das equipas ainda não está configurada no sistema, por isso ainda só vês o que é teu. ' +
  'Não quer dizer que a tua equipa não tenha resultados — quer dizer que o sistema ainda não sabe quem ela é.'

/**
 * Os liderados de uma pessoa. Hoje: nenhum, sempre — e de propósito (ver o topo do ficheiro).
 *
 * É `async` porque a versão verdadeira vai ler a base, e mudar a assinatura depois obrigava a
 * mexer em todas as chamadas. O `ctx` entra pela mesma razão.
 */
export async function lideradosDe(_ctx: ContextoBackoffice): Promise<string[]> {
  return []
}

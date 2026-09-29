/**
 * UM DESFECHO POR TRADE — e quem manda é o lado do PREÇO.
 *
 * `chat_messages.outcome` tinha TRÊS escritores e nenhum sabia dos outros:
 *
 *   • a conta-mestre (`mestres/servidor/publicar.ts`) — mede o fecho REAL de uma posição real;
 *   • o motor de preço (`signal-tracker.ts`) — mede entrada→stop/alvo na cotação;
 *   • o leitor de texto (`signal-outcomes.ts`) — copia o número que a fonte escreveu no
 *     seguimento («HIT TP3 ✅ +200PIPS»).
 *
 * Escreviam todos para o mesmo campo, por ordem de chegada, e o leitor de texto corre num cron
 * de 5 em 5 minutos sobre as últimas 48 horas: era quase sempre o ÚLTIMO a falar. Passava por
 * cima da medição do preço e deixava a linha de acompanhamento
 * (`mtmcopy_signal_tracking.result_pips`) a dizer outra coisa — dois números para a mesma trade,
 * e o que o cliente via era o que alguém tinha escrito, não o que o preço tinha feito.
 *
 * Medido na base a 2026-09-29: 289 sinais com os dois números, 276 a discordar. Cem deles
 * anunciados como GANHO (média +95,4 pips) em linhas que o preço registou como «Stop loss» sem
 * uma única parcial feita; outros 16 anunciados como ganho (+133,4) em ideias que nunca chegaram
 * a encher a entrada. E não é um problema dos canais da mestre — esses são só 17 dos 289. O grosso
 * está em `sinais-scanner-mtm` (179), `trade-ideas-setup` (50) e `premium-ideas` (43), onde o
 * texto simplesmente escrevia por cima do preço.
 *
 * Aqui há uma escada, e ninguém desce um degrau:
 *
 *   mestre  (3)  fecho real de uma posição real — não há prova melhor
 *   tracker (2)  a NOSSA cotação, medida entrada→saída
 *   texto   (1)  o que alguém escreveu no chat
 *
 * Um escritor de grau igual ou superior substitui; um de grau inferior cala-se. É isto que
 * impede o «+95 pips» de voltar a tapar um stop.
 *
 * O histórico anterior à escada não tem `origem` e vale ZERO: qualquer escritor o corrige, o que
 * faz o sistema curar-se sozinho à medida que os motores vão passando pelos sinais antigos.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/** Quem mediu o desfecho. Não confundir com `source`, que diz COMO o número foi obtido. */
export type OrigemDesfecho = 'mestre' | 'tracker' | 'texto'

/**
 * A escada. Os números não são arbitrários: crescem com a proximidade ao dinheiro real.
 * O texto é o degrau mais baixo porque é o único que pode estar simplesmente errado sem que
 * nada no mercado tenha acontecido.
 */
const GRAU: Record<OrigemDesfecho, number> = { mestre: 3, tracker: 2, texto: 1 }

/**
 * Grau do desfecho que já está gravado.
 *
 * Sem `origem` (ou com uma origem que não conhecemos) devolve 0 — é o histórico de antes desta
 * escada, e deixá-lo ser corrigido é de propósito.
 */
export function grauDoDesfecho(outcome: unknown): number {
  const o = outcome as { origem?: unknown } | null | undefined
  const nome = typeof o?.origem === 'string' ? o.origem : null
  return (nome && GRAU[nome as OrigemDesfecho]) || 0
}

/**
 * Pode `nova` escrever por cima do que lá está?
 *
 * Igual TAMBÉM pode: o mesmo motor a corrigir-se a si próprio é o caminho normal (uma parcial
 * hoje, o alvo final amanhã). O que não pode é um degrau abaixo.
 */
export function podeEscrever(nova: OrigemDesfecho, outcomeAtual: unknown): boolean {
  return GRAU[nova] >= grauDoDesfecho(outcomeAtual)
}

/** As origens que `nova` tem direito a substituir — usado no filtro da escrita condicional. */
function origensSubstituiveis(nova: OrigemDesfecho): OrigemDesfecho[] {
  return (Object.keys(GRAU) as OrigemDesfecho[]).filter((o) => GRAU[o] <= GRAU[nova])
}

/**
 * O MÍNIMO que se grava em `chat_messages.outcome` — é o que todas as superfícies lêem.
 *
 * Só se exigem estes três campos, mas os motores podem trazer mais (o leitor de texto traz
 * `unit`, `kind`, `closed_at`, `closed_by` e `source`) e esses são preservados: a gravação faz
 * um spread do objecto recebido, que copia tudo o que ele tiver. Não se declara aqui um índice
 * livre de propósito — obrigava cada motor a alargar o seu próprio tipo para caber neste.
 */
export interface DesfechoGravavel {
  label: string
  pips: number | null
  pct: number | null
}

/**
 * Grava o desfecho na mensagem de ENTRADA, respeitando a escada.
 *
 * A condição vai no PRÓPRIO update, não num select-e-depois-update: o tracker corre de 5 em 5
 * segundos e o cron do texto de 5 em 5 minutos, por isso as duas passagens sobrepõem-se. Ler
 * primeiro e escrever depois deixava a janela aberta para o texto ler «ainda não há nada»,
 * o tracker gravar, e o texto escrever por cima à mesma — exactamente o que se quer acabar.
 *
 * Devolve true quando escreveu. False = alguém de grau superior já lá tinha posto um número,
 * e isso é o sistema a funcionar, não um erro.
 */
export async function gravarDesfechoUnico(
  chatMessageId: string,
  origem: OrigemDesfecho,
  desfecho: DesfechoGravavel,
): Promise<boolean> {
  if (!chatMessageId) return false
  const lista = origensSubstituiveis(origem).join(',')
  const { data, error } = await getSupabaseAdmin()
    .from('chat_messages')
    .update({ outcome: { ...desfecho, origem } })
    .eq('id', chatMessageId)
    // Sem `origem` = histórico antigo (grau 0), substituível por qualquer um.
    .or(`outcome->>origem.is.null,outcome->>origem.in.(${lista})`)
    .select('id')
  if (error) {
    console.warn('[desfecho-unico] não gravou:', chatMessageId, origem, error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}

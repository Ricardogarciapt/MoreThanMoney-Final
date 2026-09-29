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

/** Última falha de escrita, para quem chama poder dizer que falhou em vez de contar zero. */
let ultimoErroDeEscrita: string | null = null
export function ultimoErroDesfecho(): string | null {
  return ultimoErroDeEscrita
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
 * A condição corre DENTRO de uma instrução SQL só (a função `gravar_desfecho_unico`, migração
 * 152), não num select-e-depois-update: o tracker corre de 5 em 5 segundos e o cron do texto de
 * 5 em 5 minutos, por isso as duas passagens sobrepõem-se. Ler primeiro e escrever depois
 * deixava a janela aberta para o texto ler «ainda não há nada», o tracker gravar, e o texto
 * escrever por cima à mesma — exactamente o que se quer acabar.
 *
 * ISTO JÁ FOI UM FILTRO DO POSTGREST e não escrevia nada. `outcome->>origem` dentro de um
 * `.or()` é aceite num GET mas num PATCH o PostgREST lê-o como o NOME de uma coluna e responde
 * «42703 · column chat_messages.outcome does not exist». Como o erro era tratado com um warn e
 * um `return false`, a reconstrução dizia «355 discordavam, 0 corrigidas» sem se queixar. Por
 * isso a condição mudou para SQL — e por isso o erro deixou de ser engolido.
 *
 * Devolve true quando escreveu. False = alguém de grau superior já lá tinha posto um número, e
 * isso é o sistema a funcionar. Se houve ERRO, fica registado em `ultimoErroDesfecho()` para
 * quem chama não poder confundir «recusado pela escada» com «falhou».
 */
export async function gravarDesfechoUnico(
  chatMessageId: string,
  origem: OrigemDesfecho,
  desfecho: DesfechoGravavel,
): Promise<boolean> {
  if (!chatMessageId) return false
  const { data, error } = await getSupabaseAdmin().rpc('gravar_desfecho_unico', {
    p_chat_message_id: chatMessageId,
    p_origem: origem,
    p_desfecho: { ...desfecho },
  })
  if (error) {
    ultimoErroDeEscrita = error.message
    console.warn('[desfecho-unico] não gravou:', chatMessageId, origem, error.message)
    return false
  }
  ultimoErroDeEscrita = null
  return data === true
}

/** O que a reconstrução encontrou (e, se lhe pedirem, corrigiu). */
export interface ResultadoReconciliacao {
  /** Linhas fechadas do acompanhamento que foram comparadas. */
  vistas: number
  /** Onde o número publicado discordava do que o preço mediu. */
  discordavam: number
  /** Escreveu mesmo (false em simulação). */
  aplicado: boolean
  corrigidas: number
  /**
   * Quantas escritas FALHARAM, e a última mensagem de erro.
   *
   * Existe por causa de 30/09: a gravação devolvia false por erro e a reconstrução reportava
   * «355 discordavam, 0 corrigidas» como se fosse um resultado. Um zero por erro e um zero por
   * não haver nada que corrigir não são a mesma coisa, e a diferença tem de aparecer.
   */
  falhadas: number
  erro: string | null
  /** Amostra do que muda, para se poder olhar antes de decidir. */
  exemplos: Array<{ canal: string; simbolo: string; publicado: number | null; preco: number | null; rotulo: string }>
}

/**
 * RECONSTRUÇÃO DO HISTÓRICO — põe o lado do preço a mandar nos sinais que já fecharam.
 *
 * A escada impede que o problema volte, mas não desfaz o que já está gravado: as 289 linhas
 * com dois números são anteriores a ela e não têm `origem`, por isso valem grau zero. E isso
 * torna-as um alvo fácil — o cron do texto passa nas últimas 48 horas de 5 em 5 minutos e seria
 * o primeiro a reclamá-las, o que fixava precisamente o número errado. O motor de preço não as
 * volta a tocar: já fechou essas linhas e não revisita nada fechado.
 *
 * Aqui copia-se para a mensagem de entrada o número que a linha de acompanhamento mediu, que é
 * o lado do preço, e marca-se `origem: 'tracker'` para ninguém de grau inferior lhe voltar a
 * tocar.
 *
 * `aplicar: false` (o que está por omissão) NÃO escreve nada — conta e mostra. É de propósito:
 * isto reescreve números de desempenho já publicados, e essa decisão é do dono, não do motor.
 */
export async function reconciliarHistorico(
  opcoes: { aplicar?: boolean; limite?: number } = {},
): Promise<ResultadoReconciliacao> {
  const aplicar = opcoes.aplicar === true
  const admin = getSupabaseAdmin()
  /**
   * PAGINAR. O PostgREST devolve no máximo MIL linhas por pedido, aconteça o que acontecer ao
   * `.limit()`: pedir 2000 devolvia 1000, e a reconstrução parava sempre nas mesmas, sem nunca
   * chegar às 1305 que existem. Era o mesmo defeito que já tinha travado o backfill do Premium
   * a meio (ver `atualizarDesfechosDoCanal`).
   */
  const PAGINA = 1000
  const tecto = opcoes.limite ?? 10_000
  const linhas: Record<string, unknown>[] = []
  for (let inicio = 0; inicio < tecto; inicio += PAGINA) {
    const { data, error } = await admin
      .from('mtmcopy_signal_tracking')
      .select('chat_message_id, channel_slug, symbol, result_pips, result_pct, outcome_label')
      .eq('status', 'closed')
      .not('outcome_label', 'is', null)
      .order('closed_at', { ascending: false })
      .range(inicio, Math.min(inicio + PAGINA, tecto) - 1)
    if (error || !data?.length) break
    linhas.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGINA) break
  }

  const out: ResultadoReconciliacao = {
    vistas: 0, discordavam: 0, aplicado: aplicar, corrigidas: 0, falhadas: 0, erro: null, exemplos: [],
  }
  for (const l of linhas) {
    const id = l.chat_message_id as string
    if (!id) continue
    const { data: msg } = await admin.from('chat_messages').select('outcome').eq('id', id).maybeSingle()
    out.vistas++
    const atual = msg?.outcome as { pips?: number | null } | null
    // Já está na escada e de grau igual ou superior: não é caso para reconstruir.
    if (grauDoDesfecho(atual) >= GRAU.tracker) continue
    const publicado = atual?.pips ?? null
    const preco = (l.result_pips as number | null) ?? null
    if (publicado === preco) continue
    out.discordavam++
    if (out.exemplos.length < 20) {
      out.exemplos.push({
        canal: l.channel_slug as string,
        simbolo: l.symbol as string,
        publicado,
        preco,
        rotulo: l.outcome_label as string,
      })
    }
    if (!aplicar) continue
    const ok = await gravarDesfechoUnico(id, 'tracker', {
      label: l.outcome_label as string,
      pips: preco,
      pct: (l.result_pct as number | null) ?? null,
    })
    if (ok) {
      out.corrigidas++
    } else {
      // Recusado pela escada não conta como falha; erro conta, e fica à vista.
      const erro = ultimoErroDesfecho()
      if (erro) {
        out.falhadas++
        out.erro = erro
      }
    }
  }
  return out
}

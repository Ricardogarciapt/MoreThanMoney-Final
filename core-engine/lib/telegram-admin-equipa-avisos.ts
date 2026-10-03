/**
 * OS AVISOS da equipa — o que se diz ao dono sem ele perguntar, e quantas vezes.
 *
 * Três coisas passam a bater-lhe à porta: uma comissão nova a nascer (alguém trabalhou e está à
 * espera de um sim), um negócio a apodrecer no pipeline, alguém a subir de rank. Nenhuma delas é
 * urgente ao minuto; todas elas são caras quando ficam semanas sem ninguém ver.
 *
 * ESTE FICHEIRO É PURO. Sem base de dados, sem rede. O que decide se um aviso sai, e o texto que
 * sai, prova-se num `npx tsx` de dois segundos — e prova-se sobretudo o que NÃO pode acontecer:
 *
 *  1. NÃO REPETIR. Cada aviso tem uma chave, e a chave é o aviso. Um vigia que corra de hora a hora
 *     e não se lembre do que disse treina a pessoa a ignorar avisos, e isso é pior do que não
 *     avisar — no dia em que o aviso importa, já não é lido. A memória vive em
 *     `bot_avisos_enviados` (migração 132).
 *
 *  2. NÃO GRITAR NA PRIMEIRA CORRIDA. Um vigia novo encontra sempre o mundo inteiro por avisar. Se
 *     mandasse tudo, a primeira coisa que o dono via era uma parede de mensagens sobre coisas
 *     antigas — e desligava-o. Por isso a primeira corrida de cada família SEMEIA em silêncio:
 *     marca o que existe como avisado e não diz nada. Ver `decidirAvisos`.
 *
 *  3. NÃO INUNDAR. Os avisos vão AGREGADOS: uma mensagem com o número, o total e alguns nomes, não
 *     uma mensagem por linha. O detalhe está a um toque de distância, no painel.
 *
 *  4. NÃO AGIR. Um aviso é uma frase. Não aprova, não paga, não mexe em nada — e é por isso que
 *     pode sair de um cron sem ninguém confirmar.
 *
 *   npx tsx lib/telegram-admin-equipa-avisos.check.ts
 */

/** As três famílias. O `tipo` é o que responde a «já vi isto alguma vez?» na hora de semear. */
export const TIPOS_DE_AVISO = ['comissao_nova', 'negocio_parado', 'rank_subiu'] as const
export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number]

/** Quantos nomes se metem numa mensagem antes de passar a «e mais N». */
export const NOMES_POR_AVISO = 5

export const chaveComissao = (id: string) => `comissao_nova:${id}`
/**
 * Uma chave por SEMANA de paragem.
 *
 * Um negócio esquecido há um mês tem de voltar a incomodar — se a chave fosse só o id, o aviso
 * saía uma vez e o negócio adormecia para sempre. De sete em sete dias incomoda; de hora a hora
 * ensina a ignorar.
 */
export const chaveNegocioParado = (id: string, semanas: number) => `negocio_parado:${id}:s${semanas}`
/** Uma chave por pessoa e por rank: subir duas vezes ao mesmo rank não é subir. */
export const chaveRank = (userId: string, rankId: number | string) => `rank_subiu:${userId}:${rankId}`

/** Quantas semanas inteiras um negócio está sem mexer. 0 = menos de uma semana. */
export function semanasParadas(atualizadoIso: string | null | undefined, agoraMs = Date.now()): number {
  if (!atualizadoIso) return 0
  const t = Date.parse(atualizadoIso)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((agoraMs - t) / (7 * 86_400_000)))
}

// ═══════════════════════════ A DECISÃO ═══════════════════════════

export interface Candidato {
  chave: string
  /** O que se escreve na mensagem para esta linha. */
  linha: string
  /** Só para as comissões: entra no total da mensagem. */
  valorCents?: number
}

export interface DecisaoDeAvisos {
  /** As chaves a marcar como avisadas — inclui as da semeadura, que não geram mensagem. */
  aMarcar: string[]
  /** Os candidatos que geram mensagem. Vazio quando foi semeadura. */
  aAvisar: Candidato[]
  /** Verdade quando esta família nunca tinha sido vista: marcou e calou-se. */
  semeou: boolean
}

/**
 * Pura: dado o que existe e o que já foi avisado, o que sai e o que se cala.
 *
 * `jaVistoAlgumaVez` é a diferença entre um vigia que arranca em silêncio e um que arranca a
 * gritar. Não se deduz da lista de chaves conhecidas (uma família pode ter zero chaves e já ter
 * corrido dez vezes): tem de vir de fora, de «há alguma linha deste tipo na tabela?».
 */
export function decidirAvisos(p: {
  candidatos: Candidato[]
  jaAvisadas: ReadonlySet<string>
  jaVistoAlgumaVez: boolean
}): DecisaoDeAvisos {
  const novos = p.candidatos.filter((c) => !p.jaAvisadas.has(c.chave))
  if (!p.jaVistoAlgumaVez) {
    return { aMarcar: novos.map((c) => c.chave), aAvisar: [], semeou: true }
  }
  return { aMarcar: novos.map((c) => c.chave), aAvisar: novos, semeou: false }
}

// ═══════════════════════════ OS TEXTOS ═══════════════════════════

const euros = (cents: number) => {
  const v = (Number(cents) || 0) / 100
  try {
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v)
  } catch {
    return `${v.toFixed(2)} EUR`
  }
}

/** Pura: as N primeiras linhas, e «e mais X» em vez de as despejar todas. */
function amostra(cs: Candidato[]): string[] {
  const linhas = cs.slice(0, NOMES_POR_AVISO).map((c) => `• ${c.linha}`)
  if (cs.length > NOMES_POR_AVISO) linhas.push(`<i>… e mais ${cs.length - NOMES_POR_AVISO}</i>`)
  return linhas
}

/**
 * Pura: o aviso das comissões novas.
 *
 * Diz o total, porque é o número que decide se ele para o que está a fazer. E diz, em voz alta, que
 * o bot não pagou nada — um aviso que anuncie dinheiro sem dizer que ninguém o mandou sair é um
 * aviso que se lê ao contrário.
 */
export function textoComissoesNovas(cs: Candidato[]): string {
  const total = cs.reduce((s, c) => s + (c.valorCents ?? 0), 0)
  return [
    `💸 <b>${cs.length} comissão(ões) nova(s)</b> — ${euros(total)} à espera de decisão.`,
    '',
    ...amostra(cs),
    '',
    'Aprova em <b>/admin → 👔 Equipa e MLM → 💸 Comissões</b>.',
    '<i>Ninguém pagou nada: nasceram pendentes e ficam assim até tu aprovares.</i>',
  ].join('\n')
}

/** Pura: o aviso dos negócios parados. */
export function textoNegociosParados(cs: Candidato[]): string {
  return [
    `🐌 <b>${cs.length} negócio(s) parado(s)</b> no pipeline.`,
    '',
    ...amostra(cs),
    '',
    'Vê em <b>/admin → 👔 Equipa e MLM → 📋 Pipeline</b>.',
  ].join('\n')
}

/** Pura: o aviso das subidas de rank. Isto é boa notícia — e boa notícia manda-se dizer. */
export function textoRanksSubidos(cs: Candidato[]): string {
  return [
    `🏆 <b>${cs.length} subida(s) de rank</b> no MLM.`,
    '',
    ...amostra(cs),
    '',
    'Vê em <b>/admin → 👔 Equipa e MLM → 🌳 Estado do MLM</b>.',
    '<i>A escada nova paga em percentagem, com diferencial — o residual muda com o rank.</i>',
  ].join('\n')
}

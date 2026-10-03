/**
 * FECHAR O QUE FICOU EM «PENDING» PARA SEMPRE — as execuções MTM Auto espelhadas numa conta MTM Funded.
 *
 * O QUE ACONTECEU (auditado a 29/09/2026):
 * quando um subscritor só tem contas `plataforma='mtmfunded'`, o executor do MTM Auto não abre nada
 * — quem move essas contas é o motor do MTM Funded, que espelha a conta-mestre da estratégia. Para
 * o histórico não dizer «não tens conta ligada», o executor grava a linha em
 * `mtmauto_executions` com `estado='pending'` e o motivo «Opening on your MTM Funded account — the
 * strategy engine mirrors it there.»
 *
 * Só que NINGUÉM volta a visitar essa linha. O ciclo que acompanha posições lê
 * `mtmauto_executions` com `estado='open'`, e o ciclo do motor salta as contas `mtmfunded` de
 * propósito. Uma linha `pending` de uma conta MTM Funded é, por construção, inalcançável: 24 delas
 * têm `created_at = updated_at` desde 16/09, e mostram na app 24 trades eternamente pendentes.
 *
 * O dinheiro nunca esteve em causa — as 24 têm todas a posição real correspondente em
 * `funded_positions`, e todas já fecharam. O que mente é o estado.
 *
 * O QUE ISTO FAZ: fecha a volta. Emparelha cada execução pendente com a posição que o espelho
 * abriu na conta MTM Funded (mesma conta, mesmo símbolo, mesma direcção, dentro da janela de
 * tempo) e escreve o desfecho REAL na execução. Quando a posição não aparece dentro do prazo de
 * cortesia, a execução fecha como `skipped` a dizer a verdade — nunca fica pendente para sempre.
 *
 * O emparelhamento é PURO (`emparelharEspelho`) para o teste o poder correr com linhas à mão.
 */

import { symbolMatchesCanonical } from '@/lib/mtmcopy/symbol-resolver'

/** Uma execução do MTM Auto à espera de espelho numa conta MTM Funded. */
export interface ExecucaoPendente {
  id: string
  /** A conta simulada (`mtm_trading_accounts.id`) por trás da linha `mtmauto_accounts`. */
  funded_account_id: string
  symbol: string
  direction: string
  created_at: string
}

/** A RAIZ de uma posição do espelho (as parciais são filhas e não entram aqui). */
export interface PosicaoEspelho {
  id: string
  account_id: string
  symbol: string
  direcao: string | null
  aberta_em: string | null
}

export interface ParEspelho {
  execId: string
  posicaoId: string
  /** Quantos candidatos igualmente válidos havia. >1 = desempatado pelo tempo. */
  candidatos: number
}

export interface Emparelhamento {
  pares: ParEspelho[]
  /** Execuções sem posição correspondente — cabe a quem chama decidir se já passou o prazo. */
  semPar: string[]
}

/** Janela em que a posição do espelho tem de aparecer para ser a mesma trade. */
export const JANELA_ANTES_MS = 10 * 60 * 1000
export const JANELA_DEPOIS_MS = 30 * 60 * 1000

/**
 * Prazo de cortesia antes de desistir de uma execução pendente.
 *
 * Generoso de propósito: o espelho pode atrasar-se (mercado fechado, motor a reiniciar), e fechar
 * cedo demais inventaria um «não abriu» para uma trade que abriu mesmo. Passadas 6 horas, se a
 * posição não existe, é porque não vai existir.
 */
export const PRAZO_CORTESIA_MS = 6 * 60 * 60 * 1000

const ms = (s: string | null | undefined): number | null => {
  const t = Date.parse(String(s ?? ''))
  return Number.isFinite(t) ? t : null
}

/**
 * Emparelha execuções pendentes com as posições que o espelho abriu.
 *
 * Cada posição só serve UMA execução: duas execuções do mesmo sinal na mesma conta seriam a mesma
 * trade contada duas vezes. As execuções são servidas pela ordem em que nasceram, e entre vários
 * candidatos ganha o que abriu mais perto no tempo — nunca «o primeiro da lista», que dependeria da
 * ordem com que a base devolveu as linhas.
 */
export function emparelharEspelho(
  execucoes: ExecucaoPendente[],
  posicoes: PosicaoEspelho[],
): Emparelhamento {
  const usadas = new Set<string>()
  const pares: ParEspelho[] = []
  const semPar: string[] = []

  const ordenadas = [...execucoes].sort((a, b) => (ms(a.created_at) ?? 0) - (ms(b.created_at) ?? 0))

  for (const e of ordenadas) {
    const quando = ms(e.created_at)
    if (quando == null) { semPar.push(e.id); continue }

    const candidatos = posicoes.filter((p) => {
      if (usadas.has(p.id)) return false
      if (String(p.account_id) !== String(e.funded_account_id)) return false
      if (String(p.direcao ?? '').toLowerCase() !== String(e.direction ?? '').toLowerCase()) return false
      // Sufixo da corretora à parte: o espelho grava XAUUSD, a conta pode dizer XAUUSD.r.
      if (!symbolMatchesCanonical(p.symbol, e.symbol)) return false
      const abriu = ms(p.aberta_em)
      if (abriu == null) return false
      return abriu >= quando - JANELA_ANTES_MS && abriu <= quando + JANELA_DEPOIS_MS
    })

    if (!candidatos.length) { semPar.push(e.id); continue }

    const melhor = candidatos.reduce((a, b) =>
      Math.abs((ms(b.aberta_em) ?? 0) - quando) < Math.abs((ms(a.aberta_em) ?? 0) - quando) ? b : a,
    )
    usadas.add(melhor.id)
    pares.push({ execId: e.id, posicaoId: melhor.id, candidatos: candidatos.length })
  }

  return { pares, semPar }
}

/**
 * Já passou o prazo de cortesia para desistir desta execução?
 * Separado para o teste poder fixar o «agora» sem mexer no relógio.
 */
export function passouOPrazo(criadaEm: string, agora: number): boolean {
  const t = ms(criadaEm)
  return t != null && agora - t >= PRAZO_CORTESIA_MS
}

/** O motivo que fica escrito quando o espelho nunca chegou a abrir nada. */
export const MOTIVO_ESPELHO_NAO_ABRIU =
  'A conta MTM Funded não chegou a abrir esta trade — o espelho da estratégia não a executou.'

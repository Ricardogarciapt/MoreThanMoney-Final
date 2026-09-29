/**
 * COTAÇÕES E SUFIXOS RESOLVIDOS SOZINHOS — e a recusa em adivinhar quando não dá.
 *
 * O problema: o mapa de símbolos de uma rota (`copia_rotas.mapa_simbolos`) é escrito à mão. Cada
 * corretora nova traz a sua grafia (`XAUUSD.r`, `XAUUSDm`, `XAUUSD_i`, `XAUUSD-VIP`, `GOLD`), e
 * enquanto ninguém escreve o mapa as cópias são recusadas com «XAUUSD não existe no destino» —
 * aconteceu 26 vezes entre 21 e 23/09.
 *
 * O que este ficheiro acrescenta ao ranking que já existia em `symbol-resolver.ts`:
 *
 *  1. UMA ORDEM DE MANDO EXPLÍCITA. O mapa manual manda sempre — é a decisão de uma pessoa e
 *     nenhuma heurística a revoga. Só onde não há mapa é que a resolução automática entra, e
 *     antes dela vem o que já foi resolvido antes (para a escolha não andar a mudar de ordem para
 *     ordem quando a corretora acrescenta um símbolo e as frequências de sufixo se mexem).
 *
 *  2. A RECUSA. `rankedBrokerSymbols(...)[0]` devolve sempre alguma coisa, mesmo quando os dois
 *     primeiros candidatos estão empatados em tudo o que o ranking sabe medir. Nessa altura
 *     escolher é atirar uma moeda com dinheiro de um cliente em cima. Aqui recusa-se, regista-se
 *     o empate, e alguém escreve o mapa — uma cópia que não abre custa muito menos do que uma
 *     cópia que abre no instrumento errado.
 *
 * O que NÃO é ambíguo, mesmo com vários candidatos:
 *  · há um match EXACTO (a corretora tem o símbolo com o nome canónico);
 *  · o primeiro candidato ganha em pelo menos um critério (sufixo nativo mais frequente, grafia
 *    mais próxima, match forte contra match de família).
 *
 * Puro. Quem fala com a base é `mapearSimbolo` em `lib/copia-contas/calculo.ts` e o cron.
 */

import { rankedBrokerSymbolsComChave, type CandidatoSimbolo } from './symbol-resolver'

export type ViaResolucao = 'mapa' | 'guardado' | 'automatico' | 'ambiguo' | 'nenhum'

export interface Resolucao {
  via: ViaResolucao
  /** O símbolo a usar no destino. `null` em `ambiguo` e em `nenhum` — de propósito. */
  simbolo: string | null
  /** Em `ambiguo`: os candidatos empatados, para ficarem escritos no motivo. */
  empatados?: string[]
  /** Frase pronta para o registo/erro. Só em `ambiguo` e `nenhum`. */
  motivo?: string
  /** `true` quando vale a pena guardar esta resolução para não voltar a decidir. */
  guardar?: boolean
}

export interface EntradaResolucao {
  /** O mapa escrito à mão na rota. Manda sempre. */
  mapaManual?: Record<string, string> | null
  /** O que a resolução automática já decidiu antes para esta conta de destino. */
  guardadas?: Record<string, string> | null
  /** O catálogo que a conta de destino expõe. */
  simbolosDestino: string[]
}

const cima = (s: string | null | undefined) => String(s ?? '').toUpperCase().trim()

/**
 * Os dois primeiros candidatos estão empatados em TUDO o que o ranking sabe medir?
 *
 * Um match exacto nunca empata: se a corretora tem o nome canónico tal e qual, é esse.
 */
export function empateIndecidivel(ranked: CandidatoSimbolo[]): boolean {
  if (ranked.length < 2) return false
  const [a, b] = ranked as [CandidatoSimbolo, CandidatoSimbolo]
  if (a.exact) return false
  return a.exact === b.exact && a.fuzzy === b.fuzzy && a.suffix === b.suffix && a.score === b.score
}

/**
 * O símbolo do destino para este canónico — ou a recusa fundamentada.
 *
 * Ordem: mapa manual → resolução já guardada (se ainda existir no catálogo) → automática.
 */
export function resolverSimboloDestino(canonico: string, entrada: EntradaResolucao): Resolucao {
  const alvo = cima(canonico)
  if (!alvo) return { via: 'nenhum', simbolo: null, motivo: 'símbolo de origem vazio' }

  // 1) O mapa da pessoa. Nem se olha para o catálogo: se ela escreveu, é porque sabe.
  const manual = Object.entries(entrada.mapaManual ?? {}).find(([k]) => cima(k) === alvo)
  if (manual && String(manual[1]).trim()) return { via: 'mapa', simbolo: String(manual[1]).trim() }

  const catalogo = entrada.simbolosDestino ?? []
  if (!catalogo.length) {
    // Sem catálogo NÃO se decide. Uma lista vazia é a ausência de resposta, não «não existe» —
    // é a mesma regra de `decidirSimboloDestino`, e quem chama trata isso como «repetir».
    return { via: 'nenhum', simbolo: null, motivo: `${alvo}: a conta de destino ainda não deu a lista de símbolos` }
  }

  // 2) O que já foi resolvido antes — só vale enquanto o símbolo continuar a existir na conta.
  const guardada = Object.entries(entrada.guardadas ?? {}).find(([k]) => cima(k) === alvo)?.[1]
  if (guardada) {
    const vivo = catalogo.find((s) => cima(s) === cima(guardada))
    if (vivo) return { via: 'guardado', simbolo: vivo }
    // Deixou de existir (a corretora mudou de grafia): esquece-se e resolve-se de novo.
  }

  // 3) A resolução automática.
  const ranked = rankedBrokerSymbolsComChave(alvo, catalogo)
  if (!ranked.length) return { via: 'nenhum', simbolo: null, motivo: `${alvo} não existe no destino` }

  if (empateIndecidivel(ranked)) {
    const empatados = ranked
      .filter((r) => r.exact === ranked[0]!.exact && r.fuzzy === ranked[0]!.fuzzy && r.suffix === ranked[0]!.suffix && r.score === ranked[0]!.score)
      .map((r) => r.sym)
    return {
      via: 'ambiguo',
      simbolo: null,
      empatados,
      motivo: `${alvo}: ${empatados.length} candidatos igualmente prováveis no destino (${empatados.join(', ')}) — escreve o mapa de símbolos da rota`,
    }
  }

  return { via: 'automatico', simbolo: ranked[0]!.sym, guardar: true }
}

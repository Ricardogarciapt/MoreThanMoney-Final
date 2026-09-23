/**
 * A ORDEM DAS CONTAS NO SELETOR — arrastada pelo dono (pedido do dono, 23/09).
 *
 * Quem tem seis contas (desafio, torneio, a real, duas ligadas à corretora) recebia-as pela ordem
 * em que a base as devolve: as MTM Funded por data de criação, as reais a seguir. A conta que a
 * pessoa usa todos os dias podia ficar em quinto lugar, e não havia nada a fazer quanto a isso.
 *
 * Agora há: arrasta-se a linha no seletor e a ordem fica gravada NA CONTA da pessoa (não no
 * dispositivo), por isso segue para o telemóvel e para a app. A lista guardada é só uma lista de
 * `id` — as mesmas referências que o seletor já usa (`<uuid>` das MTM Funded, `mt5:site:<uuid>`,
 * `tradelocker:auto:<uuid>`…), o que faz a ordem funcionar através das três famílias de contas sem
 * mexer em nenhuma das quatro tabelas onde elas vivem.
 *
 * Regras que isto tem de respeitar, e que os testes prendem:
 *  · uma conta NOVA (ainda sem lugar na lista) não desaparece nem se põe à frente: entra no fim,
 *    pela ordem natural;
 *  · um `id` que já não existe (conta apagada, sessão fechada) é ignorado, e limpa-se da lista
 *    quando a ordem voltar a ser gravada;
 *  · a FAVORITA (migração 122) manda: fica sempre em primeiro, mesmo que a lista diga outra coisa —
 *    é o que «marca esta como favorita» quer dizer para quem a marca.
 *
 * Puro: sem React, sem browser, sem base. Testado em lib/webtrader/__tests__/ordem-contas.check.ts.
 */

/** O mínimo que esta lógica precisa de saber de uma entrada do seletor. */
export interface EntradaOrdenavel {
  id: string
  favorita?: boolean | null
}

/** Quantos ids se guardam (uma pessoa com mais contas do que isto tem outro problema). */
export const MAX_ORDEM = 60

/** Uma lista de ids vinda da base/do dispositivo, limpa: texto, sem repetidos, sem vazios, com tecto. */
export function normalizarOrdem(bruta: unknown): string[] {
  if (!Array.isArray(bruta)) return []
  const vistos = new Set<string>()
  const out: string[] = []
  for (const x of bruta) {
    if (typeof x !== 'string') continue
    const id = x.trim()
    if (!id || id.length > 200 || vistos.has(id)) continue
    vistos.add(id)
    out.push(id)
    if (out.length >= MAX_ORDEM) break
  }
  return out
}

/**
 * As entradas pela ordem do dono: primeiro a favorita, depois as que ele arrumou (na ordem em que
 * as arrumou), depois as que ainda não têm lugar, pela ordem natural. Nunca perde nem inventa uma
 * entrada — o resultado tem exactamente as mesmas que entraram.
 */
export function ordenarEntradas<T extends EntradaOrdenavel>(entradas: T[], ordem: string[]): T[] {
  const posicao = new Map<string, number>()
  normalizarOrdem(ordem).forEach((id, i) => posicao.set(id, i))
  const peso = (e: T, natural: number) => {
    if (e.favorita) return -1
    const p = posicao.get(e.id)
    return p == null ? MAX_ORDEM + natural : p
  }
  return entradas
    .map((e, natural) => ({ e, natural, peso: peso(e, natural) }))
    .sort((a, b) => a.peso - b.peso || a.natural - b.natural)
    .map((x) => x.e)
}

/**
 * Arrastou-se `id` para o lugar de `alvo` — a lista de ids que fica gravada.
 *
 * Recebe as entradas JÁ ORDENADAS (é sobre o que a pessoa está a ver que ela arrasta), o que torna
 * isto independente de a lista guardada estar completa, meia ou vazia: o que sai é sempre a ordem
 * inteira do que está no ecrã, já sem ids mortos. Arrastar para cima deixa a linha ANTES do alvo;
 * para baixo, DEPOIS — o que o dedo faz é o que fica.
 */
export function moverConta<T extends EntradaOrdenavel>(visiveis: T[], id: string, alvoId: string): string[] {
  const ids = visiveis.map((e) => e.id)
  const de = ids.indexOf(id)
  const para = ids.indexOf(alvoId)
  if (de < 0 || para < 0 || de === para) return ids
  ids.splice(de, 1)
  ids.splice(para, 0, id)
  return ids
}

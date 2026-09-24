/**
 * OCULTAR CONTAS NO SELETOR DO WEBTRADER — o modo organizar (pedido do dono, 24/09).
 *
 * Arrumar a ordem já se fazia (ordem-contas.ts) e separar as mestres das próprias também
 * (filtro-contas.ts). Faltava o resto do problema: contas que a pessoa TEM mas não quer ver —
 * o desafio que já falhou, a demo que só serve para experimentar, a conta de um torneio que
 * acabou. Não se apagam (são dela), mas não têm de estar no caminho todos os dias.
 *
 * A lista das ocultas é uma lista de `id` do seletor, exactamente como a ordem — as mesmas
 * referências (`<uuid>` das MTM Funded, `mt5:site:<uuid>`, `tradelocker:auto:<uuid>`…), gravadas
 * na CONTA da pessoa (`profile_data.webtrader.contas_ocultas`, pela rota /api/contas/ordem), por
 * isso seguem para o telemóvel e para a app como a ordem e a favorita.
 *
 * Três regras que isto tem de respeitar, e que os testes prendem:
 *
 *  · **Nunca se perde uma conta.** No MODO ORGANIZAR aparecem todas, as ocultas assinaladas, para
 *    se poderem repor — ocultar não é apagar, e quem não consegue voltar atrás não experimenta.
 *  · **A conta ABERTA nunca se esconde.** É a mesma regra do filtro (`filtrarEntradas`): quem não
 *    vê em que conta está não sabe onde vai abrir a ordem. Nem se deixa ocultá-la (`alternarOculta`
 *    não a esconde), nem ela sai da lista se já estivesse oculta antes de ser aberta.
 *  · **O seletor nunca fica vazio.** Se a lista guardada esconder tudo o que há (ocultou-se tudo
 *    e não há conta aberta, ou as contas mudaram desde que a lista foi gravada), a ocultação é
 *    IGNORADA e mostram-se todas. É preferível um seletor cheio de mais a um seletor vazio, de
 *    onde só se sai por um botão que a pessoa nem sabe que existe. A lista guardada fica como
 *    está: assim que houver outra vez o que mostrar, ela volta a valer.
 *
 * Ocultar e filtrar COMPÕEM, e nesta ordem: esconde-se primeiro, filtra-se depois. Uma conta
 * escondida à mão continua escondida com o filtro em «Todas» — «Todas» quer dizer «as minhas e as
 * mestres», não «também as que eu mandei desaparecer».
 *
 * Puro: sem React, sem browser, sem base. Testado em lib/webtrader/__tests__/ocultar-contas.check.ts.
 */
import { normalizarOrdem } from './ordem-contas'

/** O mínimo que esta lógica precisa de saber de uma entrada do seletor. */
export interface EntradaOcultavel {
  id: string
}

/**
 * Limpa a lista vinda da base/do corpo de um pedido: texto, sem repetidos, sem vazios, com tecto.
 * É a mesma limpeza da ordem (mesma natureza: uma lista de ids do seletor) — um sítio só a decidir
 * o que é um id aceitável evita que as duas listas aceitem coisas diferentes.
 */
export function normalizarOcultas(bruta: unknown): string[] {
  return normalizarOrdem(bruta)
}

/** Está esta conta na lista das ocultas? (Diz o que está GRAVADO, não o que está no ecrã.) */
export function estaOculta(ocultas: string[], id: string): boolean {
  return ocultas.includes(id)
}

/**
 * O olho de uma linha: esconde a conta, ou repõe-na. Devolve a lista nova para gravar.
 *
 * A conta ABERTA não se esconde — o olho dela está desligado no ecrã, e aqui é recusado outra vez
 * para que nenhuma outra porta (um teclado, um pedido à mão) consiga pô-la lá. REPOR é sempre
 * permitido, inclusive à conta aberta: é assim que se limpa uma conta que ficou oculta antes de
 * ser aberta.
 */
export function alternarOculta(ocultas: string[], id: string, escolhida?: string | null): string[] {
  const limpa = normalizarOcultas(ocultas)
  const ref = String(id ?? '').trim()
  if (!ref) return limpa
  if (limpa.includes(ref)) return limpa.filter((x) => x !== ref)
  if (ref === escolhida) return limpa
  return normalizarOcultas([...limpa, ref])
}

/**
 * A lista que fica no ecrã depois de tirar as ocultas.
 *
 * @param organizar  true = modo organizar: mostram-se TODAS (as ocultas desenham-se esbatidas,
 *                   com o olho fechado, e é por aí que se repõem).
 * @param escolhida  a conta aberta — nunca sai da lista.
 */
export function aplicarOcultas<T extends EntradaOcultavel>(
  entradas: T[],
  ocultas: string[],
  escolhida?: string | null,
  organizar = false,
): T[] {
  if (organizar) return entradas
  const esconder = new Set(normalizarOcultas(ocultas))
  if (esconder.size === 0) return entradas
  const ficam = entradas.filter((e) => !esconder.has(e.id) || e.id === escolhida)
  // Esconder tudo deixaria o seletor vazio: nesse caso não se esconde nada (ver o cabeçalho).
  return ficam.length > 0 ? ficam : entradas
}

/** Quantas das contas que existem estão ocultas — o número que o botão «Organizar» mostra. */
export function contarOcultas<T extends EntradaOcultavel>(entradas: T[], ocultas: string[]): number {
  const esconder = new Set(normalizarOcultas(ocultas))
  return entradas.filter((e) => esconder.has(e.id)).length
}

/**
 * ONDE É QUE O TAP TO TRADE ABRE — a escolha da pessoa, a regra num só sítio.
 *
 * COMO ERA (decisão anterior, lib/mtmcopy/alvo-t2t): aceitar um sinal abria em TODAS as contas
 * com o T2T ligado, cada uma dimensionada pela SUA equidade. Com uma ou duas contas isso era
 * conveniência. Com doze — o caso do dono, 2026-09-24 — passou a ser uma surpresa cara: um toque,
 * doze posições.
 *
 * COMO FICA: o leque continua possível, mas passa a ser uma ESCOLHA. Quem tem mais do que uma
 * conta elegível marca onde quer abrir; quem só tem uma não vê pergunta nenhuma (não se
 * acrescenta um toque a quem não tem decisão para tomar). A escolha fica guardada e volta
 * pré-marcada da próxima vez.
 *
 * ESTE FICHEIRO NÃO TOCA NO RISCO. Não decide lote, não decide percentagem, não mexe no sizing:
 * decide só QUAIS as contas que entram na lista que já existia. O que sobra depois do filtro
 * segue exactamente o caminho de sempre.
 *
 * ONDE VIVE: `profiles.profile_data.t2t.contas` — ao lado do que o WebTrader já guarda em
 * `profile_data.webtrader` (ordem, favorita, filtro). Na CONTA da pessoa e não no dispositivo:
 * escolher no computador e ser outra vez interrogado no telemóvel era o que fazia isto parecer
 * partido. É uma preferência de apresentação: não dá acesso a nada, não tira acesso a nada, e um
 * id que já não exista é simplesmente ignorado na hora de abrir.
 *
 * AS REFERÊNCIAS são de duas famílias, numa lista só:
 *   · `<uuid>`      → ligação real (mtmcopy_connections): MT5 pela MetaApi ou TradeLocker
 *   · `sim:<uuid>`  → conta simulada MTM Funded (mtm_trading_accounts, motor='sim')
 */

/** Tecto defensivo: uma lista de escolhas não é um sítio para guardar dados a peso. */
const MAX_CONTAS = 50
const MAX_REF = 120

export const PREFIXO_SIMULADA = 'sim:'

export function refSimulada(id: string): string {
  return `${PREFIXO_SIMULADA}${id}`
}

/**
 * Limpa uma lista vinda do cliente (ou da base): strings, sem espaços, sem vazios, sem repetidos,
 * com tecto. Devolve sempre um array — nunca `null` — para quem chama não ter de o testar.
 */
export function normalizarEscolha(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  const vistos = new Set<string>()
  for (const v of valor) {
    if (typeof v !== 'string') continue
    const ref = v.trim()
    if (!ref || ref.length > MAX_REF) continue
    vistos.add(ref)
    if (vistos.size >= MAX_CONTAS) break
  }
  return [...vistos]
}

/** A escolha guardada no perfil (lista vazia = nunca escolheu → o leque de sempre). */
export function escolhaGuardada(profileData: unknown): string[] {
  const dados = (profileData ?? {}) as Record<string, unknown>
  const t2t = (dados.t2t ?? {}) as Record<string, unknown>
  return normalizarEscolha(t2t.contas)
}

/** Separa a escolha nas duas famílias, já normalizada. */
export function separarEscolha(refs: string[]): { reais: string[]; simuladas: string[] } {
  const reais: string[] = []
  const simuladas: string[] = []
  for (const ref of refs) {
    if (ref.startsWith(PREFIXO_SIMULADA)) simuladas.push(ref.slice(PREFIXO_SIMULADA.length))
    else reais.push(ref)
  }
  return { reais, simuladas }
}

/**
 * APLICA A ESCOLHA a uma lista de contas elegíveis.
 *
 * Regras, por esta ordem:
 *   1. Sem escolha (lista vazia) → nada muda: devolve tudo. É o que faz com que quem chama a
 *      rota sem escolha nenhuma — a app iOS antiga, a MTM Auto, um cliente que não foi
 *      actualizado — continue a funcionar exactamente como antes.
 *   2. Com escolha → só as contas escolhidas.
 *   3. A escolha só existe DENTRO do que já era elegível: escolher uma conta que não recebe T2T,
 *      que está em pausa ou que é de outra pessoa não a acrescenta a lado nenhum. Isto é um
 *      filtro, nunca uma porta.
 *   4. Se a escolha não casar com NENHUMA conta elegível (contas apagadas ou desligadas
 *      entretanto) devolve a lista VAZIA, com `desatualizada: true`. Não se cai de volta no
 *      leque: quem escreveu «só nesta» não pode acabar com doze posições porque a conta que
 *      escolheu deixou de servir. Quem chama diz-lhe o que se passou e ela escolhe outra vez.
 */
export function aplicarEscolha<T>(
  elegiveis: T[],
  refDaConta: (c: T) => string,
  escolha: string[],
): { contas: T[]; escolhida: boolean; desatualizada: boolean } {
  if (!escolha.length) return { contas: elegiveis, escolhida: false, desatualizada: false }
  const querido = new Set(escolha)
  const filtradas = elegiveis.filter((c) => querido.has(refDaConta(c)))
  return { contas: filtradas, escolhida: true, desatualizada: !filtradas.length }
}
